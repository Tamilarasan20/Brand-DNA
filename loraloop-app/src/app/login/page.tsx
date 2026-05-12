'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, Loader2, CheckCircle, Zap } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase-browser';

function LoginContent() {
  const params = useSearchParams();
  const next   = params.get('next') ?? '/';

  const [email,   setEmail]   = useState('');
  const [state,   setState]   = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    setMessage(null);

    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setState('error');
      setMessage(error.message);
    } else {
      setState('sent');
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-600/30">
            <Zap className="w-6 h-6 text-white" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold mb-1 text-center">Welcome to Loraloop</h1>
          <p className="text-sm text-slate-400 text-center mb-8">
            Sign in with your email — no password needed.
          </p>

          {state === 'sent' ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Check your inbox</h2>
              <p className="text-sm text-slate-400">
                We sent a magic link to <span className="text-white font-medium">{email}</span>.
                Click it to sign in.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-slate-800/70 border border-slate-600/60 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition"
                  />
                </div>
              </div>

              {state === 'error' && message && (
                <p className="text-red-400 text-xs">{message}</p>
              )}

              <button
                type="submit"
                disabled={state === 'loading'}
                className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-500 disabled:opacity-60 transition flex items-center justify-center gap-2"
              >
                {state === 'loading' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                ) : (
                  'Send magic link'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          By signing in you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
