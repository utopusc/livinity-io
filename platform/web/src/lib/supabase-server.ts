/**
 * Supabase clients for SERVER-SIDE use only.
 *
 * - `supabaseService`: full-access client using SERVICE_ROLE_KEY. Used by
 *   /api/dashboard to query Realtime presence state on behalf of any user.
 *   NEVER expose this to the browser.
 * - `mintRealtimeJwt(userId)`: HS256 JWT signed with SUPABASE_JWT_SECRET,
 *   subject=userId, role='authenticated'. Used by /api/me/realtime-token
 *   to hand livinityd a token it can use to connect Realtime as that user.
 *
 * Phase 146 — sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f.
 */
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`[supabase-server] Missing required env var: ${name}`);
  }
  return value;
}

export const supabaseService = createClient(
  requireEnv('SUPABASE_URL', SUPABASE_URL),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export function getSupabasePublicUrl(): string {
  return requireEnv('SUPABASE_URL', SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  return requireEnv('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
}

export function mintRealtimeJwt(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      role: 'authenticated',
      aud: 'authenticated',
      userId,
    },
    requireEnv('SUPABASE_JWT_SECRET', SUPABASE_JWT_SECRET),
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

export const REALTIME_PRESENCE_CHANNEL_PREFIX = 'tunnel:';

export function presenceChannelName(userId: string): string {
  return `${REALTIME_PRESENCE_CHANNEL_PREFIX}${userId}`;
}
