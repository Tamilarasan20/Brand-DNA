import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { PRICE_TO_PLAN } from '@/lib/billing';
import { getServiceSupabase } from '@/lib/supabase';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
  }

  const sig     = req.headers.get('stripe-signature') ?? '';
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const db = getServiceSupabase();

  // Idempotency — Stripe retries failed deliveries, so the same event may
  // arrive multiple times. The PK conflict on event.id makes this a no-op.
  const { error: dupeErr } = await db
    .from('stripe_events')
    .insert({ id: event.id, type: event.type });

  if (dupeErr) {
    // Duplicate event — already processed. Return 200 so Stripe stops retrying.
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(db, event);
  } catch (err) {
    // Roll back the idempotency marker so retries can re-process this event.
    await db.from('stripe_events').delete().eq('id', event.id);
    console.error('[stripe-webhook] handler error:', err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

type Db = ReturnType<typeof getServiceSupabase>;

async function handleEvent(db: Db, event: Stripe.Event) {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      await syncSubscription(db, event.data.object as Stripe.Subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await db.from('billing_users')
        .update({ plan: 'FREE', subscription_status: 'canceled' })
        .eq('stripe_customer_id', sub.customer as string);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await db.from('billing_users')
        .update({ subscription_status: 'past_due' })
        .eq('stripe_customer_id', invoice.customer as string);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      if ((invoice as Stripe.Invoice & { subscription?: string }).subscription) {
        await db.from('billing_users')
          .update({ subscription_status: 'active' })
          .eq('stripe_customer_id', invoice.customer as string);
      }
      break;
    }
  }
}

async function syncSubscription(db: Db, sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price.id ?? '';
  const plan    = PRICE_TO_PLAN[priceId] ?? 'FREE';

  const statusMap: Record<string, string> = {
    active:   'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid:   'past_due',
    paused:   'paused',
  };
  const subscriptionStatus = statusMap[sub.status] ?? 'active';

  // Stripe sometimes types these as part of expandable parents — cast for safety
  const periodEnd = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  const trialEnd  = (sub as Stripe.Subscription & { trial_end?: number | null }).trial_end;

  await db.from('billing_users')
    .update({
      plan,
      subscription_status: subscriptionStatus,
      ...(periodEnd ? { plan_expires_at: new Date(periodEnd * 1000).toISOString() } : {}),
      trial_ends_at: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
    })
    .eq('stripe_customer_id', sub.customer as string);
}
