import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getServiceSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const authUser = await getCurrentUser();
  if (!authUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { returnUrl } = await req.json() as { returnUrl: string };
  if (!returnUrl) {
    return NextResponse.json({ error: 'returnUrl is required' }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { data: user } = await db
    .from('billing_users')
    .select('stripe_customer_id')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 404 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   user.stripe_customer_id,
    return_url: returnUrl,
  });

  return NextResponse.json({ url: portalSession.url });
}
