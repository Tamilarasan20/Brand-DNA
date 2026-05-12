import { createBrowserClient } from '@supabase/ssr';

// Client-side Supabase client for use in 'use client' components.
// Reads/writes auth cookies so server-side getCurrentUser() can find the session.
export function getBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
