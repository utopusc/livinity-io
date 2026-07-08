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

import { PLATFORM_URL, authedGet, safeFetch, extractSessionCookie } from './http-client';
import { LoginResponseSchema, MeResponseSchema, DashboardResponseSchema } from './schemas';
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
