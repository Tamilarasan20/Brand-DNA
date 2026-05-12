import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const { email, returnUrl } = await req.json() as { email: string; returnUrl: string };

  if (!email || !returnUrl) {
    return NextResponse.json({ error: 'email and returnUrl are required' }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { data: user } = await db
    .from('billing_users')
    .select('stripe_customer_id')
    .eq('email', email)
    .maybeSingle();

  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found for this email' }, { status: 404 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   user.stripe_customer_id,
    return_url: returnUrl,
  });

  return NextResponse.json({ url: portalSession.url });
}
