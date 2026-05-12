import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { PRICE_TO_PLAN, CREDIT_LIMITS } from '@/lib/billing';
import { getServiceSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const authUser = await getCurrentUser();
  if (!authUser?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { priceId, returnUrl } = await req.json() as {
    priceId: string;
    returnUrl: string;
  };

  if (!priceId || !returnUrl) {
    return NextResponse.json({ error: 'priceId and returnUrl are required' }, { status: 400 });
  }

  if (!PRICE_TO_PLAN[priceId]) {
    return NextResponse.json({ error: 'Invalid priceId' }, { status: 400 });
  }

  const db = getServiceSupabase();

  // Find billing row (auto-created by handle_new_user trigger)
  let { data: user } = await db
    .from('billing_users')
    .select('id, stripe_customer_id')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  // Fallback: create row if trigger didn't fire (e.g. existing user before trigger was added)
  if (!user) {
    const { data: created, error: insertErr } = await db
      .from('billing_users')
      .insert({ auth_user_id: authUser.id, email: authUser.email })
      .select('id, stripe_customer_id')
      .single();

    if (insertErr || !created) {
      return NextResponse.json({ error: 'Could not create billing account' }, { status: 500 });
    }
    user = created;
  }

  // Create Stripe customer if needed
  let customerId = user.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    authUser.email,
      metadata: { loraloop_user_id: user.id, auth_user_id: authUser.id },
    });
    customerId = customer.id;

    await db.from('billing_users')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  const baseUrl    = returnUrl.replace(/\/billing\/success.*$/, '');
  const successUrl = `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;

  const session = await stripe.checkout.sessions.create({
    customer:    customerId,
    mode:        'subscription',
    line_items:  [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  returnUrl,
    metadata:    { loraloop_user_id: user.id, auth_user_id: authUser.id },
    subscription_data: {
      trial_period_days: 14,
      metadata:          { loraloop_user_id: user.id, auth_user_id: authUser.id },
    },
    allow_promotion_codes: true,
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

  // For trial subscriptions payment_status is 'no_payment_required' — still a success
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (!paid) {
    return NextResponse.json({ success: false, plan: 'FREE', credits: 0 });
  }

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
