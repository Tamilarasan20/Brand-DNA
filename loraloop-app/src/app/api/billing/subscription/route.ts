import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { CREDIT_LIMITS } from '@/lib/billing';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param is required' }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { data: user, error } = await db
    .from('billing_users')
    .select('plan, subscription_status, plan_expires_at, credits_used_this_month, credits_reset_at')
    .eq('email', email)
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
    });
  }

  const plan      = (user.plan as string) ?? 'FREE';
  const limit     = CREDIT_LIMITS[plan as keyof typeof CREDIT_LIMITS] ?? 0;
  const used      = (user.credits_used_this_month as number) ?? 0;
  const remaining = Math.max(0, limit - used);

  // Next reset = 1st of next month
  const now       = new Date();
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return NextResponse.json({
    plan,
    subscription_status: user.subscription_status,
    credits: { used, limit, remaining },
    renews_at:           user.plan_expires_at ?? nextReset,
    credits_reset_at:    user.credits_reset_at,
  });
}
