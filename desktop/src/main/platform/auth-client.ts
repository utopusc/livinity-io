/**
 * src/main/platform/auth-client.ts
 *
 * One function per platform auth verb (login, getMe, getDashboard). Every
 * response is safeParse'd against the Plan 01 schemas (./schemas.ts) before
 * being trusted — never `.parse()` (throws) at this trust boundary. Every
 * result is a discriminated union: expected HTTP errors (400/401/...) are
 * VALUES, never thrown — only a genuine network-level failure produces
 * `{ networkError: true }` (safeFetch, ./http-client.ts).
 *
 * Zero imports from ipc/ or tray/ — pure, unit-testable main-process
 * primitive. NEVER log the Cookie header, password, or a returned liv_k_
 * value — use logSafe(event, { status }) only.
 */

import { PLATFORM_URL, authedGet, authedPost, apiKeyGet, safeFetch, extractSessionCookie } from './http-client';
import {
  LoginResponseSchema,
  MeResponseSchema,
  DashboardResponseSchema,
  ChooseFreeResponseSchema,
  MintKeyResponseSchema,
  ProfileProbeResponseSchema,
} from './schemas';
import { logSafe } from '../log';

export type LoginResult =
  | {
      ok: true;
      sessionValue: string | null;
      user: { id: string; username: string | null; email: string; emailVerified: boolean };
    }
  | { ok: false; status: number; error: string }
  | { ok: false; networkError: true };

/** `POST /api/auth/login` — unauthenticated call (no session cookie exists yet). */
export async function login(email: string, password: string): Promise<LoginResult> {
  const outcome = await safeFetch(() =>
    fetch(`${PLATFORM_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  );
  if (!outcome.ok) {
    logSafe('auth.login', { networkError: true });
    return { ok: false, networkError: true };
  }

  const { res } = outcome;
  const body: unknown = await res.json();

  if (!res.ok) {
    const errorBody = body as { error?: string };
    logSafe('auth.login', { status: res.status });
    return { ok: false, status: res.status, error: errorBody.error ?? 'Unknown error' };
  }

  const parsed = LoginResponseSchema.safeParse(body);
  if (!parsed.success) {
    logSafe('auth.login', { status: res.status, parseError: true });
    return { ok: false, status: res.status, error: 'Unexpected response shape' };
  }

  const sessionValue = extractSessionCookie(res.headers.getSetCookie());
  logSafe('auth.login', { status: res.status });
  return { ok: true, sessionValue, user: parsed.data.user };
}

export type GetMeResult =
  | {
      ok: true;
      user: {
        userId: string;
        username: string | null;
        email: string;
        emailVerified: boolean;
        is_admin: boolean;
        free_byod: boolean;
      };
    }
  | { ok: false; status: number }
  | { ok: false; networkError: true };

/** `GET /api/auth/me` — session-cookie validation + tier flag. */
export async function getMe(sessionValue: string): Promise<GetMeResult> {
  const outcome = await safeFetch(() => authedGet('/api/auth/me', sessionValue));
  if (!outcome.ok) {
    logSafe('auth.me', { networkError: true });
    return { ok: false, networkError: true };
  }

  const { res } = outcome;
  const body: unknown = await res.json();

  if (!res.ok) {
    logSafe('auth.me', { status: res.status });
    return { ok: false, status: res.status };
  }

  const parsed = MeResponseSchema.safeParse(body);
  if (!parsed.success || !parsed.data.user) {
    logSafe('auth.me', { status: res.status, parseError: true });
    return { ok: false, status: res.status };
  }

  logSafe('auth.me', { status: res.status });
  return { ok: true, user: parsed.data.user };
}

export type GetDashboardResult =
  | {
      ok: true;
      billing: {
        active: boolean;
        plan: string;
        status: string | null;
        legacyFree: boolean;
        reason: string | null;
      };
      apiKey: { hasKey: boolean; prefix: string | null };
      server: { online: boolean; url: string; provisioned: boolean };
    }
  | { ok: false; status: number }
  | { ok: false; networkError: true };

/** `GET /api/dashboard` — tier + key + server status. */
export async function getDashboard(sessionValue: string): Promise<GetDashboardResult> {
  const outcome = await safeFetch(() => authedGet('/api/dashboard', sessionValue));
  if (!outcome.ok) {
    logSafe('auth.dashboard', { networkError: true });
    return { ok: false, networkError: true };
  }

  const { res } = outcome;
  const body: unknown = await res.json();

  if (!res.ok) {
    logSafe('auth.dashboard', { status: res.status });
    return { ok: false, status: res.status };
  }

  const parsed = DashboardResponseSchema.safeParse(body);
  if (!parsed.success) {
    logSafe('auth.dashboard', { status: res.status, parseError: true });
    return { ok: false, status: res.status };
  }

  logSafe('auth.dashboard', { status: res.status });
  return {
    ok: true,
    billing: parsed.data.billing,
    apiKey: parsed.data.apiKey,
    server: parsed.data.server,
  };
}

export type ChooseFreeResult =
  | { ok: true; free_byod: boolean }
  | { ok: false; reason: 'has_paid_plan' | 'not_signed_in' | 'unavailable' }
  | { ok: false; networkError: true };

/** `POST /api/me/choose-free` — activates the free tier, guarded server-side against downgrading a payer. */
export async function chooseFree(sessionValue: string): Promise<ChooseFreeResult> {
  const outcome = await safeFetch(() => authedPost('/api/me/choose-free', sessionValue, {}));
  if (!outcome.ok) {
    logSafe('auth.chooseFree', { networkError: true });
    return { ok: false, networkError: true };
  }

  const { res } = outcome;

  if (res.status === 401) {
    logSafe('auth.chooseFree', { status: res.status });
    return { ok: false, reason: 'not_signed_in' };
  }
  if (res.status === 503) {
    logSafe('auth.chooseFree', { status: res.status });
    return { ok: false, reason: 'unavailable' };
  }

  const body: unknown = await res.json();
  const parsed = ChooseFreeResponseSchema.safeParse(body);
  if (!parsed.success) {
    logSafe('auth.chooseFree', { status: res.status, parseError: true });
    return { ok: false, reason: 'unavailable' };
  }

  if (parsed.data.ok) {
    logSafe('auth.chooseFree', { status: res.status });
    return { ok: true, free_byod: Boolean(parsed.data.free_byod) };
  }
  logSafe('auth.chooseFree', { status: res.status });
  return { ok: false, reason: 'has_paid_plan' };
}

/**
 * The only two legal action strings for the destructive key-mint endpoint.
 * `generate-key` and `regenerate-key` hit an IDENTICAL server-side
 * `DELETE FROM api_keys ...` before inserting (02-RESEARCH.md Pitfall 1) — a
 * wrong literal must never reach the platform. Enforced both at compile time
 * (the parameter's literal-union type) and at runtime below, as defense in
 * depth for the phase's single most dangerous call.
 */
const VALID_MINT_ACTIONS = new Set<MintKeyAction>(['generate-key', 'regenerate-key']);
export type MintKeyAction = 'generate-key' | 'regenerate-key';

export type MintKeyResult =
  | { ok: true; apiKey: string; prefix: string }
  | { ok: false; reason: 'email_unverified' | 'subscription_required' | 'unauthorized' }
  | { ok: false; networkError: true };

/** `POST /api/dashboard` `{action}` — mints or replaces the liv_k_ install key. */
export async function mintKey(sessionValue: string, action: MintKeyAction): Promise<MintKeyResult> {
  if (!VALID_MINT_ACTIONS.has(action)) {
    logSafe('auth.mintKey', { rejectedInvalidAction: true });
    return { ok: false, reason: 'unauthorized' };
  }

  const outcome = await safeFetch(() => authedPost('/api/dashboard', sessionValue, { action }));
  if (!outcome.ok) {
    logSafe('auth.mintKey', { action, networkError: true });
    return { ok: false, networkError: true };
  }

  const { res } = outcome;
  const body: unknown = await res.json();

  if (res.status === 401) {
    logSafe('auth.mintKey', { action, status: res.status });
    return { ok: false, reason: 'unauthorized' };
  }
  if (res.status === 403) {
    const errorBody = body as { error?: string };
    const isEmailUnverified =
      typeof errorBody.error === 'string' && errorBody.error.includes('verify your email');
    const reason = isEmailUnverified ? ('email_unverified' as const) : ('subscription_required' as const);
    logSafe('auth.mintKey', { action, status: res.status, reason });
    return { ok: false, reason };
  }

  const parsed = MintKeyResponseSchema.safeParse(body);
  if (!parsed.success) {
    logSafe('auth.mintKey', { action, status: res.status, parseError: true });
    return { ok: false, reason: 'unauthorized' };
  }

  logSafe('auth.mintKey', { action, status: res.status });
  return { ok: true, apiKey: parsed.data.apiKey, prefix: parsed.data.prefix };
}

export type ProbeKeyResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'inactive' | 'not_found' | 'network' };

/**
 * `GET /api/me/profile` (X-Api-Key auth) — the D-14 live-validation probe for
 * a pasted install key. Returns only `{ ok:true }` on success — never the
 * username/email the platform sent back (schema-level leak-guard boundary).
 * A 402 (valid key, inactive account) is treated as a rejection (Open
 * Question 2 default).
 */
export async function probeKey(key: string): Promise<ProbeKeyResult> {
  const outcome = await safeFetch(() => apiKeyGet('/api/me/profile', key));
  if (!outcome.ok) {
    logSafe('auth.probeKey', { networkError: true });
    return { ok: false, reason: 'network' };
  }

  const { res } = outcome;

  if (res.status === 401) {
    logSafe('auth.probeKey', { status: res.status });
    return { ok: false, reason: 'invalid' };
  }
  if (res.status === 402) {
    logSafe('auth.probeKey', { status: res.status });
    return { ok: false, reason: 'inactive' };
  }
  if (res.status === 404) {
    logSafe('auth.probeKey', { status: res.status });
    return { ok: false, reason: 'not_found' };
  }

  const body: unknown = await res.json();
  const parsed = ProfileProbeResponseSchema.safeParse(body);
  if (!parsed.success) {
    logSafe('auth.probeKey', { status: res.status, parseError: true });
    return { ok: false, reason: 'invalid' };
  }

  logSafe('auth.probeKey', { status: res.status });
  return { ok: true };
}
