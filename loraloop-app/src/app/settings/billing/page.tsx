'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Zap, ArrowUpRight, CreditCard, AlertCircle, LogOut } from 'lucide-react';

interface Subscription {
  email:               string;
  plan:                string;
  subscription_status: string;
  credits:             { used: number; limit: number; remaining: number };
  renews_at:           string | null;
  trial_ends_at:       string | null;
}

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Free', SOLO: 'Solo', PRO: 'Pro', AGENCY: 'Agency', ENTERPRISE: 'Enterprise',
};

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-green-500/20 text-green-400 border-green-500/30',
  trialing:  'bg-blue-500/20  text-blue-400  border-blue-500/30',
  past_due:  'bg-red-500/20   text-red-400   border-red-500/30',
  canceled:  'bg-slate-500/20 text-slate-400 border-slate-500/30',
  inactive:  'bg-slate-500/20 text-slate-400 border-slate-500/30',
  paused:    'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export default function BillingSettingsPage() {
  const [sub,        setSub]        = useState<Subscription | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then((r) => r.json())
      .then((data) => setSub(data))
      .catch(() => setError('Could not load subscription'))
      .finally(() => setLoading(false));
  }, []);

  async function openPortal() {
    setPortalBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Portal failed');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open portal');
      setPortalBusy(false);
    }
  }

  async function signOut() {
    const res = await fetch('/auth/logout', { method: 'POST' });
    window.location.href = res.redirected ? res.url : '/login';
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </main>
    );
  }

  if (!sub) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <p>Could not load subscription details.</p>
      </main>
    );
  }

  const pct = sub.credits.limit > 0
    ? Math.min(100, Math.round((sub.credits.used / sub.credits.limit) * 100))
    : 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-violet-950 text-white py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold">Billing</h1>
            <p className="text-slate-400 text-sm mt-1">{sub.email}</p>
          </div>
          <button
            onClick={signOut}
            className="text-sm text-slate-400 hover:text-white flex items-center gap-2 transition"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>

        {sub.subscription_status === 'past_due' && (
          <div className="mb-8 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-200 mb-1">Payment failed</h3>
              <p className="text-sm text-red-300/80">
                Your last payment was declined. Update your payment method to keep using Loraloop.
              </p>
            </div>
            <button
              onClick={openPortal}
              disabled={portalBusy}
              className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-semibold whitespace-nowrap disabled:opacity-60"
            >
              Update card
            </button>
          </div>
        )}

        {/* Current plan card */}
        <div className="bg-slate-900/70 border border-slate-700/60 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
                Current plan
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold">{PLAN_LABELS[sub.plan] ?? sub.plan}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[sub.subscription_status] ?? STATUS_STYLES.inactive}`}>
                  {sub.subscription_status}
                </span>
              </div>
              {sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date() && (
                <p className="text-xs text-blue-400 mt-2">
                  Free trial until {new Date(sub.trial_ends_at).toLocaleDateString()}
                </p>
              )}
              {sub.renews_at && (
                <p className="text-xs text-slate-500 mt-1">
                  {sub.subscription_status === 'canceled' ? 'Ends' : 'Renews'} on{' '}
                  {new Date(sub.renews_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition"
            >
              Change plan <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Credit usage bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium">AI Credits</span>
              </div>
              <span className="text-sm text-slate-400">
                <span className="text-white font-semibold">{sub.credits.used}</span> / {sub.credits.limit}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-violet-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {sub.credits.remaining} credits remaining · resets on the 1st of each month
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={openPortal}
            disabled={portalBusy || !sub.plan || sub.plan === 'FREE'}
            className="flex items-center gap-3 bg-slate-900/70 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-4 text-left transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-5 h-5 text-violet-400" />
            <div>
              <div className="text-sm font-semibold">Manage subscription</div>
              <div className="text-xs text-slate-400">
                {portalBusy ? 'Opening Stripe…' : 'Update card · cancel · invoices'}
              </div>
            </div>
          </button>

          <Link
            href="/pricing"
            className="flex items-center gap-3 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 rounded-xl p-4 transition"
          >
            <Zap className="w-5 h-5 text-violet-400" />
            <div>
              <div className="text-sm font-semibold text-violet-200">Upgrade plan</div>
              <div className="text-xs text-violet-400/80">Get more AI credits and seats</div>
            </div>
          </Link>
        </div>

        {error && <p className="text-red-400 text-sm mt-6">{error}</p>}
      </div>
    </main>
  );
}
