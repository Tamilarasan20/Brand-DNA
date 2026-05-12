import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/supabase-server';
import { CREDIT_LIMITS } from '@/lib/billing';

export async function GET() {
  const authUser = await getCurrentUser();
  if (!authUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = getServiceSupabase();
  const { data: user, error } = await db
    .from('billing_users')
    .select('plan, subscription_status, plan_expires_at, trial_ends_at, credits_used_this_month, credits_reset_at')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({
      plan: 'FREE',
      subscription_status: 'inactive',
      credits: { used: 0, limit: 0, remaining: 0 },
      renews_at: null,
      trial_ends_at: null,
    });
  }

  const plan      = (user.plan as string) ?? 'FREE';
  const limit     = CREDIT_LIMITS[plan as keyof typeof CREDIT_LIMITS] ?? 0;
  const used      = (user.credits_used_this_month as number) ?? 0;
  const remaining = Math.max(0, limit - used);

  const now       = new Date();
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return NextResponse.json({
    email:               authUser.email,
    plan,
    subscription_status: user.subscription_status,
    credits: { used, limit, remaining },
    renews_at:           user.plan_expires_at ?? nextReset,
    trial_ends_at:       user.trial_ends_at,
    credits_reset_at:    user.credits_reset_at,
  });
}
