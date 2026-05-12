import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { PRICE_TO_PLAN } from '@/lib/billing';
import { getServiceSupabase } from '@/lib/supabase';
import type Stripe from 'stripe';

// Tell Next.js NOT to parse the body — Stripe needs the raw bytes to verify the signature
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

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(db, sub);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .from('billing_users')
        .update({ plan: 'FREE', subscription_status: 'canceled' })
        .eq('stripe_customer_id', sub.customer as string);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await db
        .from('billing_users')
        .update({ subscription_status: 'past_due' })
        .eq('stripe_customer_id', invoice.customer as string);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      if ((invoice as Stripe.Invoice & { subscription?: string }).subscription) {
        await db
          .from('billing_users')
          .update({ subscription_status: 'active' })
          .eq('stripe_customer_id', invoice.customer as string);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function syncSubscription(
  db: ReturnType<typeof getServiceSupabase>,
  sub: Stripe.Subscription,
) {
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

  const periodEnd = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  const expiresAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

  await db
    .from('billing_users')
    .update({
      plan,
      subscription_status: subscriptionStatus,
      ...(expiresAt ? { plan_expires_at: expiresAt } : {}),
    })
    .eq('stripe_customer_id', sub.customer as string);
}
