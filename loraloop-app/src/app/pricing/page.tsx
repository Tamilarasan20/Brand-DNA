'use client';

import { useState } from 'react';
import { Check, Zap } from 'lucide-react';

type Interval = 'monthly' | 'quarterly' | 'annual';

const PLANS = [
  {
    key: 'SOLO',
    name: 'Solo',
    popular: false,
    price: { monthly: 9, quarterly: 8, annual: 6 },
    credits: 100,
    seats: 2,
    workspaces: 1,
    support: 'Working hours',
    priceIds: {
      monthly:   process.env.NEXT_PUBLIC_STRIPE_PRICE_SOLO_MONTHLY   ?? 'price_solo_monthly',
      quarterly: process.env.NEXT_PUBLIC_STRIPE_PRICE_SOLO_QUARTERLY ?? 'price_solo_quarterly',
      annual:    process.env.NEXT_PUBLIC_STRIPE_PRICE_SOLO_ANNUAL    ?? 'price_solo_annual',
    },
  },
  {
    key: 'PRO',
    name: 'Pro',
    popular: true,
    price: { monthly: 29, quarterly: 25, annual: 20 },
    credits: 500,
    seats: 5,
    workspaces: 3,
    support: '24/7',
    priceIds: {
      monthly:   process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY   ?? 'price_pro_monthly',
      quarterly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_QUARTERLY ?? 'price_pro_quarterly',
      annual:    process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL    ?? 'price_pro_annual',
    },
  },
  {
    key: 'AGENCY',
    name: 'Agency',
    popular: false,
    price: { monthly: 69, quarterly: 59, annual: 48 },
    credits: 1200,
    seats: 25,
    workspaces: 10,
    support: '24/7',
    priceIds: {
      monthly:   process.env.NEXT_PUBLIC_STRIPE_PRICE_AGENCY_MONTHLY   ?? 'price_agency_monthly',
      quarterly: process.env.NEXT_PUBLIC_STRIPE_PRICE_AGENCY_QUARTERLY ?? 'price_agency_quarterly',
      annual:    process.env.NEXT_PUBLIC_STRIPE_PRICE_AGENCY_ANNUAL    ?? 'price_agency_annual',
    },
  },
  {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    popular: false,
    price: { monthly: 169, quarterly: 144, annual: 118 },
    credits: 2500,
    seats: -1,
    workspaces: -1,
    support: 'Priority 24/7',
    priceIds: {
      monthly:   process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_MONTHLY   ?? 'price_enterprise_monthly',
      quarterly: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_QUARTERLY ?? 'price_enterprise_quarterly',
      annual:    process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_ANNUAL    ?? 'price_enterprise_annual',
    },
  },
] as const;

const PERKS_SHARED = [
  'All 9 AI helpers',
  'Brand DNA extraction',
  'AI content generation',
  'Smart content calendar',
  'Social media scheduling',
];

const PLAN_PERKS: Record<string, string[]> = {
  SOLO:       ['100 monthly AI credits', '2 Seats', '1 Workspace', 'Working hours support'],
  PRO:        ['500 monthly AI credits', '5 Seats', '3 Workspaces', '24/7 support'],
  AGENCY:     ['1,200 monthly AI credits', '25 Seats', '10 Workspaces', '24/7 support'],
  ENTERPRISE: ['2,500 monthly AI credits', 'Unlimited Seats', 'Unlimited Workspaces', 'Priority 24/7 support'],
};

const INTERVAL_LABELS: Record<Interval, string> = {
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  annual:    'Annual',
};

const INTERVAL_SAVINGS: Record<Interval, string | null> = {
  monthly:   null,
  quarterly: 'Save 15%',
  annual:    'Save 30%',
};

export default function PricingPage() {
  const [interval, setInterval] = useState<Interval>('monthly');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(plan: typeof PLANS[number]) {
    setError(null);
    setLoading(plan.key);
    try {
      const res = await fetch('/api/billing/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId:   plan.priceIds[interval],
          returnUrl: window.location.href,
        }),
      });

      if (res.status === 401) {
        // Not logged in — bounce to /login then back here
        window.location.href = `/login?next=${encodeURIComponent('/pricing')}`;
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.url) window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 text-white py-20 px-4">
      {/* Header */}
      <div className="max-w-4xl mx-auto text-center mb-14">
        <div className="inline-flex items-center gap-2 bg-violet-500/20 border border-violet-500/30 rounded-full px-4 py-1.5 text-sm text-violet-300 mb-6">
          <Zap className="w-3.5 h-3.5" />
          AI-Powered Marketing for Growing Brands
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
          Simple, transparent pricing
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto">
          Start free, upgrade when you need more AI credits and seats. No hidden fees.
        </p>
      </div>

      {/* Billing interval toggle */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex bg-slate-800/60 border border-slate-700/50 rounded-xl p-1 gap-1">
          {(Object.keys(INTERVAL_LABELS) as Interval[]).map((key) => (
            <button
              key={key}
              onClick={() => setInterval(key)}
              className={`relative px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                interval === key
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {INTERVAL_LABELS[key]}
              {INTERVAL_SAVINGS[key] && (
                <span className="absolute -top-2.5 -right-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-tight">
                  {INTERVAL_SAVINGS[key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="max-w-sm mx-auto mb-6">
          <p className="text-red-400 text-xs text-center">{error}</p>
        </div>
      )}

      {/* Plan cards */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.key}
            className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
              plan.popular
                ? 'bg-violet-600/20 border-violet-500/60 shadow-2xl shadow-violet-500/20 scale-[1.02]'
                : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600/70'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                Most popular
              </div>
            )}

            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
                {plan.name}
              </div>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-bold text-white">
                  ${plan.price[interval]}
                </span>
                <span className="text-slate-400 text-sm pb-1">/mo</span>
              </div>
              {interval !== 'monthly' && (
                <div className="text-xs text-slate-500 mt-0.5">
                  billed {interval === 'quarterly' ? 'every 3 months' : 'annually'}
                </div>
              )}
            </div>

            <button
              onClick={() => handleCheckout(plan)}
              disabled={loading === plan.key}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all mb-6 ${
                plan.popular
                  ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 disabled:opacity-60'
                  : 'bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-60'
              }`}
            >
              {loading === plan.key ? 'Opening checkout…' : `Get ${plan.name}`}
            </button>

            <ul className="space-y-2.5 text-sm text-slate-300 flex-1">
              {PERKS_SHARED.map((perk) => (
                <li key={perk} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                  {perk}
                </li>
              ))}
              {PLAN_PERKS[plan.key]?.map((perk) => (
                <li key={perk} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="font-medium text-white">{perk}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-center text-slate-500 text-sm mt-14">
        All plans include a 14-day free trial. Cancel anytime. No credit card required to start.
      </p>
    </main>
  );
}
