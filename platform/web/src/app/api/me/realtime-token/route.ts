/**
 * POST /api/me/realtime-token — Phase 146
 *
 * Mints a Supabase Realtime JWT for the api-key holder AND ships the
 * Supabase project URL + anon key in the response body so livinityd
 * can self-bootstrap with NO local env-var seeding.
 *
 * livinityd boot path:
 *   1. POST /api/me/realtime-token with X-API-Key
 *   2. Receive { token, supabaseUrl, supabaseAnonKey, userId, channel, expiresIn }
 *   3. createClient(supabaseUrl, supabaseAnonKey) + realtime.setAuth(token)
 *   4. channel('tunnel:<userId>').subscribe() + track({...})
 *
 * The JWT is HS256-signed with SUPABASE_JWT_SECRET (same secret Supabase's
 * own gotrue uses) so Realtime accepts it as a first-class auth token.
 * 1h TTL — livinityd re-mints before expiry (50min interval per
 * tunnel-presence.ts).
 *
 * The anon key is PUBLIC-SAFE — it's the same key Supabase ships to
 * browser SDKs. RLS protects channel topics. Exposing it in this
 * response body is the documented Supabase pattern for self-bootstrap.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import {
  mintRealtimeJwt,
  getSupabasePublicUrl,
  getSupabaseAnonKey,
} from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  let supabaseUrl: string;
  let supabaseAnonKey: string;
  try {
    supabaseUrl = getSupabasePublicUrl();
    supabaseAnonKey = getSupabaseAnonKey();
  } catch (e) {
    return NextResponse.json(
      { error: `server misconfigured: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 },
    );
  }

  const token = mintRealtimeJwt(auth.userId);
  return NextResponse.json(
    {
      token,
      supabaseUrl,
      supabaseAnonKey,
      userId: auth.userId,
      expiresIn: 3600,
      channel: `tunnel:${auth.userId}`,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(req: NextRequest) {
  return POST(req);
}
