'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface Subscription {
  subscription_status: string;
}

export default function PaymentFailedBanner() {
  const [pastDue,    setPastDue]    = useState(false);
  const [dismissed,  setDismissed]  = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Subscription | null) => {
        if (data?.subscription_status === 'past_due') setPastDue(true);
      })
      .catch(() => {});
  }, []);

  async function openPortal() {
    setPortalBusy(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalBusy(false);
    }
  }

  if (!pastDue || dismissed) return null;

  return (
    <div className="bg-red-500/95 text-white px-4 py-3 flex items-center gap-3 justify-center text-sm relative">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span className="font-medium">
        Your last payment failed. Update your payment method to keep using Loraloop.
      </span>
      <button
        onClick={openPortal}
        disabled={portalBusy}
        className="px-3 py-1 rounded-md bg-white text-red-600 text-xs font-bold hover:bg-red-50 disabled:opacity-60"
      >
        {portalBusy ? 'Opening…' : 'Update card'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
