/**
 * GET /api/public-config — public, browser-safe runtime config.
 *
 * The live auth UI is static HTML (public/auth.html, public/oauth-callback.html)
 * with no build-time env injection, so it fetches the Supabase project URL +
 * anon key from here at runtime. Both values are PUBLIC by design (the anon key
 * is RLS-gated) — this endpoint exposes nothing secret. Sourcing them from env
 * (not hardcoded in HTML) keeps a single source of truth and survives key
 * rotation without an HTML edit.
 */
import { NextResponse } from 'next/server';
import { getSupabasePublicUrl, getSupabaseAnonKey } from '@/lib/supabase-server';

export async function GET() {
  try {
    return NextResponse.json({
      supabaseUrl: getSupabasePublicUrl(),
      supabaseAnonKey: getSupabaseAnonKey(),
    });
  } catch (err) {
    console.error('[public-config] missing env:', err);
    return NextResponse.json({ error: 'config_unavailable' }, { status: 503 });
  }
}
