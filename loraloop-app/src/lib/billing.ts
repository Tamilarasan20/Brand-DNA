export const PLANS = {
  FREE: {
    name: 'Free',
    price: { monthly: 0, quarterly: 0, annual: 0 },
    credits: 0,
    seats: 1,
    workspaces: 1,
    support: 'Community',
    priceIds: { monthly: null, quarterly: null, annual: null },
  },
  SOLO: {
    name: 'Solo',
    price: { monthly: 9, quarterly: 24, annual: 86 },
    credits: 100,
    seats: 2,
    workspaces: 1,
    support: 'Working hours',
    priceIds: {
      monthly:   process.env.STRIPE_PRICE_SOLO_MONTHLY   ?? 'price_solo_monthly',
      quarterly: process.env.STRIPE_PRICE_SOLO_QUARTERLY ?? 'price_solo_quarterly',
      annual:    process.env.STRIPE_PRICE_SOLO_ANNUAL    ?? 'price_solo_annual',
    },
  },
  PRO: {
    name: 'Pro',
    price: { monthly: 29, quarterly: 78, annual: 278 },
    credits: 500,
    seats: 5,
    workspaces: 3,
    support: '24/7',
    priceIds: {
      monthly:   process.env.STRIPE_PRICE_PRO_MONTHLY   ?? 'price_pro_monthly',
      quarterly: process.env.STRIPE_PRICE_PRO_QUARTERLY ?? 'price_pro_quarterly',
      annual:    process.env.STRIPE_PRICE_PRO_ANNUAL    ?? 'price_pro_annual',
    },
  },
  AGENCY: {
    name: 'Agency',
    price: { monthly: 69, quarterly: 186, annual: 662 },
    credits: 1200,
    seats: 25,
    workspaces: 10,
    support: '24/7',
    priceIds: {
      monthly:   process.env.STRIPE_PRICE_AGENCY_MONTHLY   ?? 'price_agency_monthly',
      quarterly: process.env.STRIPE_PRICE_AGENCY_QUARTERLY ?? 'price_agency_quarterly',
      annual:    process.env.STRIPE_PRICE_AGENCY_ANNUAL    ?? 'price_agency_annual',
    },
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: { monthly: 169, quarterly: 456, annual: 1622 },
    credits: 2500,
    seats: -1,
    workspaces: -1,
    support: 'Priority 24/7',
    priceIds: {
      monthly:   process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY   ?? 'price_enterprise_monthly',
      quarterly: process.env.STRIPE_PRICE_ENTERPRISE_QUARTERLY ?? 'price_enterprise_quarterly',
      annual:    process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL    ?? 'price_enterprise_annual',
    },
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type BillingInterval = 'monthly' | 'quarterly' | 'annual';

// Reverse map: priceId → plan key
export const PRICE_TO_PLAN: Record<string, PlanKey> = Object.fromEntries(
  Object.entries(PLANS).flatMap(([planKey, plan]) =>
    Object.values(plan.priceIds)
      .filter(Boolean)
      .map((pid) => [pid as string, planKey as PlanKey]),
  ),
);

export const CREDIT_LIMITS: Record<PlanKey, number> = {
  FREE:       0,
  SOLO:       100,
  PRO:        500,
  AGENCY:     1200,
  ENTERPRISE: 2500,
};
