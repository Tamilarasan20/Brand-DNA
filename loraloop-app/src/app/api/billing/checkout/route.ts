import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { PRICE_TO_PLAN, CREDIT_LIMITS } from '@/lib/billing';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const { email, priceId, returnUrl } = await req.json() as {
    email: string;
    priceId: string;
    returnUrl: string;
  };

  if (!email || !priceId || !returnUrl) {
    return NextResponse.json({ error: 'email, priceId, and returnUrl are required' }, { status: 400 });
  }

  if (!PRICE_TO_PLAN[priceId]) {
    return NextResponse.json({ error: 'Invalid priceId' }, { status: 400 });
  }

  const db = getServiceSupabase();

  // Upsert billing_user by email
  let { data: user, error: fetchErr } = await db
    .from('billing_users')
    .select('id, stripe_customer_id')
    .eq('email', email)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!user) {
    const { data: newUser, error: insertErr } = await db
      .from('billing_users')
      .insert({ email })
      .select('id, stripe_customer_id')
      .single();

    if (insertErr || !newUser) {
      return NextResponse.json({ error: 'Could not create user' }, { status: 500 });
    }
    user = newUser;
  }

  // Create Stripe customer if needed
  let customerId = user.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { loraloop_user_id: user.id },
    });
    customerId = customer.id;

    await db
      .from('billing_users')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  const baseUrl     = returnUrl.replace(/\/billing\/success.*$/, '');
  const successUrl  = `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  returnUrl,
    metadata: { loraloop_user_id: user.id },
  });

  return NextResponse.json({ url: session.url });
}

// Verify a completed checkout session (called from success page)
export async function GET(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ success: false, plan: 'FREE', credits: 0 });
  }

  // Look up user by customer ID
  const db = getServiceSupabase();
  const { data: user } = await db
    .from('billing_users')
    .select('plan')
    .eq('stripe_customer_id', session.customer as string)
    .maybeSingle();

  const plan    = (user?.plan as string) ?? 'FREE';
  const credits = CREDIT_LIMITS[plan as keyof typeof CREDIT_LIMITS] ?? 0;

  return NextResponse.json({ success: true, plan, credits });
}
