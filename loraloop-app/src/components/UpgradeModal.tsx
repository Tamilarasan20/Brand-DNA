'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { Zap, X, CheckCircle } from 'lucide-react';
import Link from 'next/link';

type UpgradeReason = 'credits_exhausted' | 'feature_locked' | 'manual';

interface ModalState {
  open:    boolean;
  reason?: UpgradeReason;
  plan?:   string;
}

interface Ctx { showUpgrade: (reason?: UpgradeReason, currentPlan?: string) => void; }

const UpgradeModalContext = createContext<Ctx>({ showUpgrade: () => {} });
export const useUpgradeModal = () => useContext(UpgradeModalContext);

const NEXT_PLAN: Record<string, { name: string; credits: number; price: string; perks: string[] }> = {
  FREE: {
    name: 'Solo', credits: 100, price: '$9/mo',
    perks: ['100 monthly AI credits', '2 Seats', '1 Workspace'],
  },
  SOLO: {
    name: 'Pro', credits: 500, price: '$29/mo',
    perks: ['500 monthly AI credits', '5 Seats', '3 Workspaces', '24/7 support'],
  },
  PRO: {
    name: 'Agency', credits: 1200, price: '$69/mo',
    perks: ['1,200 monthly AI credits', '25 Seats', '10 Workspaces', '24/7 support'],
  },
  AGENCY: {
    name: 'Enterprise', credits: 2500, price: '$169/mo',
    perks: ['2,500 monthly AI credits', 'Unlimited Seats', 'Unlimited Workspaces', 'Priority 24/7'],
  },
};

function Modal({ state, onClose }: { state: ModalState; onClose: () => void }) {
  const currentPlan = state.plan ?? 'FREE';
  const next        = NEXT_PLAN[currentPlan];
  if (!state.open || !next) return null;

  const title = state.reason === 'credits_exhausted'
    ? 'You’ve run out of credits'
    : state.reason === 'feature_locked'
      ? 'This feature requires an upgrade'
      : 'Upgrade your plan';

  const subtitle = state.reason === 'credits_exhausted'
    ? `Your ${currentPlan} plan credits are used up for this month.`
    : 'Unlock more AI power for your marketing team.';

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 p-6 text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
            <Zap className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold mb-1">{title}</h2>
          <p className="text-sm text-white/80">{subtitle}</p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-slate-500 mb-0.5 uppercase tracking-wide">Upgrade to</div>
              <div className="text-lg font-bold text-white">{next.name}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-violet-400">{next.price}</div>
              <div className="text-xs text-slate-500">cancel anytime</div>
            </div>
          </div>

          <ul className="space-y-2.5 mb-6">
            {next.perks.map((perk) => (
              <li key={perk} className="flex items-center gap-2.5 text-sm text-slate-300">
                <CheckCircle className="w-4 h-4 text-violet-400 flex-shrink-0" />
                {perk}
              </li>
            ))}
          </ul>

          <Link
            href="/pricing"
            onClick={onClose}
            className="block w-full py-3 rounded-xl bg-violet-600 text-white text-center font-semibold hover:bg-violet-500 transition"
          >
            View plans
          </Link>
          <button
            onClick={onClose}
            className="w-full py-2 mt-2 text-sm text-slate-500 hover:text-slate-300 transition"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

export function UpgradeModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ModalState>({ open: false });

  const showUpgrade = useCallback(
    (reason?: UpgradeReason, currentPlan?: string) =>
      setState({ open: true, reason, plan: currentPlan ?? 'FREE' }),
    [],
  );

  return (
    <UpgradeModalContext.Provider value={{ showUpgrade }}>
      {children}
      <Modal state={state} onClose={() => setState({ open: false })} />
    </UpgradeModalContext.Provider>
  );
}
