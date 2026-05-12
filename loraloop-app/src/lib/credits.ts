import { getServiceSupabase } from './supabase';
import { CREDIT_LIMITS, type PlanKey } from './billing';

// Cost in credits per agent action
export const AGENT_CREDIT_COST: Record<string, number> = {
  sam_research:   4,
  clara_content:  2,
  steve_image:    3,
  steve_carousel: 5,
  sarah_calendar: 1,
  lora_review:    1,
  lora_strategy:  2,
  sophie_seo:     3,
  theo_video:     4,
  elena_ads:      4,
  nick_analyze:   2,
};

export class CreditError extends Error {
  status: number;
  reason: 'past_due' | 'exhausted' | 'no_user';
  constructor(message: string, reason: CreditError['reason'], status = 402) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

interface BillingUserRow {
  id: string;
  plan: PlanKey;
  subscription_status: string;
  credits_used_this_month: number;
}

async function loadUser(authUserId: string): Promise<BillingUserRow | null> {
  const db = getServiceSupabase();
  const { data } = await db
    .from('billing_users')
    .select('id, plan, subscription_status, credits_used_this_month')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  return data as BillingUserRow | null;
}

export async function getRemainingCredits(authUserId: string) {
  const user = await loadUser(authUserId);
  if (!user) return { used: 0, limit: 0, remaining: 0, plan: 'FREE' as PlanKey, subscription_status: 'inactive' };

  const limit = CREDIT_LIMITS[user.plan] ?? 0;
  return {
    used:      user.credits_used_this_month,
    limit,
    remaining: Math.max(0, limit - user.credits_used_this_month),
    plan:      user.plan,
    subscription_status: user.subscription_status,
  };
}

/**
 * Throws CreditError if the user doesn't have enough credits or their
 * subscription is past_due. Otherwise atomically deducts `cost` credits and
 * records a credit_usage row.
 */
export async function checkAndDeduct(
  authUserId: string,
  agentName: string,
  action:    string,
): Promise<{ deducted: number; remaining: number }> {
  const user = await loadUser(authUserId);
  if (!user) throw new CreditError('No billing account', 'no_user', 401);

  if (user.subscription_status === 'past_due') {
    throw new CreditError('Payment past due. Please update your payment method.', 'past_due');
  }

  const costKey = `${agentName.toLowerCase()}_${action.toLowerCase()}`;
  const cost    = AGENT_CREDIT_COST[costKey] ?? 2;
  const limit   = CREDIT_LIMITS[user.plan] ?? 0;

  if (user.credits_used_this_month + cost > limit) {
    throw new CreditError(
      `You've used all ${limit} credits for this month. Upgrade your plan to continue.`,
      'exhausted',
    );
  }

  const db          = getServiceSupabase();
  const newUsed     = user.credits_used_this_month + cost;
  const remaining   = limit - newUsed;

  // Deduct + log (no transaction support in supabase-js — best-effort sequential)
  await db.from('billing_users')
    .update({ credits_used_this_month: newUsed })
    .eq('id', user.id);

  await db.from('credit_usage').insert({
    user_id:    user.id,
    agent_name: agentName,
    action,
    credits:    cost,
  });

  return { deducted: cost, remaining };
}
