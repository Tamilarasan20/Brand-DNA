'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Zap, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

const PLAN_CREDITS: Record<string, number> = {
  SOLO: 100, PRO: 500, AGENCY: 1200, ENTERPRISE: 2500,
};

interface VerifyResult {
  success: boolean;
  plan:    string;
  credits: number;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const sessionId    = searchParams.get('session_id');

  const [state,  setState]  = useState<'loading' | 'success' | 'error'>('loading');
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (!sessionId) { setState('error'); return; }

    fetch(`/api/billing/checkout?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data: VerifyResult) => {
        if (data.success) { setResult(data); setState('success'); }
        else setState('error');
      })
      .catch(() => setState('error'));
  }, [sessionId]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-violet-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Confirming your upgrade…</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-sm text-slate-400 mb-6">
            We couldn&apos;t verify your payment. If you were charged, your plan will update
            automatically within a few minutes.
          </p>
          <button
            onClick={() => router.push('/pricing')}
            className="w-full py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 transition"
          >
            Back to pricing
          </button>
        </div>
      </div>
    );
  }

  const planName = result?.plan ?? 'Pro';
  const credits  = result?.credits ?? PLAN_CREDITS[planName] ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900/80 border border-violet-500/30 rounded-2xl shadow-2xl shadow-violet-500/10 p-8 max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          You&apos;re on {planName}!
        </h1>
        <p className="text-slate-400 text-sm mb-6">
          Your plan is now active. Let&apos;s build something amazing.
        </p>

        {/* Credits callout */}
        <div className="bg-violet-600/20 border border-violet-500/30 rounded-xl p-4 mb-6 flex items-center gap-3 text-left">
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-violet-200">{credits} AI credits ready</div>
            <div className="text-xs text-violet-400">Resets on the 1st of each month</div>
          </div>
        </div>

        {/* Agents list */}
        <div className="text-left mb-6 space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            All 9 AI helpers unlocked
          </div>
          {[
            'Sam — market research & competitor analysis',
            'Clara — copywriting & content creation',
            'Steve — AI image & carousel generation',
            'Sarah — smart content calendar planning',
            'Lora — AI marketing orchestration',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-slate-300">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>

        <button
          onClick={() => router.push('/')}
          className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-500 flex items-center justify-center gap-2 transition-colors"
        >
          Start using Loraloop <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => router.push('/pricing')}
          className="w-full py-2 mt-2 text-sm text-slate-500 hover:text-slate-300 transition"
        >
          View all plans
        </button>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
