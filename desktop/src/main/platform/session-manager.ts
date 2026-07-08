/**
 * src/main/platform/session-manager.ts
 *
 * Startup session validation + routing (AUTH-03/AUTH-04) and sign-out
 * (D-07). Composes the vault (secrets-vault.ts), the platform HTTP client
 * (auth-client.ts), and the pure routing decision (decide-route.ts).
 *
 * D-06/D-12 (critical): ONLY an explicit HTTP 401 from getMe/getDashboard
 * clears the vault session. A network/5xx failure returns
 * `{ kind: 'error', reason: 'network' }` and NEVER touches the vault —
 * confusing "no session" with "can't reach the platform" would otherwise log
 * a user out on a transient blip (02-RESEARCH.md Pitfall 3).
 *
 * POST-PIVOT (D-16/D-18): the embedded Google-sign-in child window built in
 * an earlier plan is DEAD. This module imports nothing from that plan and
 * nothing from Electron's `session` module — signOut is vault-only, there is
 * no Chromium cookie jar or isolated browsing partition to clear. The
 * device-flow channels that replace embedded sign-in land in Plan 02-09.
 *
 * Zero imports from ipc/ or tray/ — pure, unit-testable main-process
 * primitive (ARCHITECTURE.md hard isolation rule).
 */

import type { RouteResult } from '../../../shared/ipc-contract';
import { vaultGet, vaultDelete } from '../storage/secrets-vault';
import { getMe, getDashboard } from './auth-client';
import { decideRoute } from './decide-route';
import { logSafe } from '../log';

/**
 * Startup routing: reads the vault session, validates it against the
 * platform (`GET /api/auth/me` then `GET /api/dashboard`), and computes the
 * tier-routing decision. Only a 401 from either call clears the vault
 * session — a network/5xx failure is returned as a retryable error and the
 * vault is left exactly as it was.
 */
export async function validateSession(): Promise<RouteResult> {
  const sessionValue = await vaultGet('session');
  if (!sessionValue) {
    logSafe('session.validate', { result: 'login' });
    return { kind: 'login' };
  }

  const me = await getMe(sessionValue);
  if (!me.ok && 'status' in me && me.status === 401) {
    await vaultDelete('session');
    logSafe('session.validate', { result: 'login-expired' });
    return { kind: 'login', expired: true };
  }
  if (!me.ok) {
    // Network error, 5xx, or unexpected-shape response — D-12: never guess.
    logSafe('session.validate', { result: 'error-network' });
    return { kind: 'error', reason: 'network' };
  }

  const dash = await getDashboard(sessionValue);
  if (!dash.ok && 'status' in dash && dash.status === 401) {
    await vaultDelete('session');
    logSafe('session.validate', { result: 'login-expired' });
    return { kind: 'login', expired: true };
  }
  if (!dash.ok) {
    logSafe('session.validate', { result: 'error-network' });
    return { kind: 'error', reason: 'network' };
  }

  const route = decideRoute(
    { free_byod: me.user.free_byod },
    { billing: { active: dash.billing.active, legacyFree: dash.billing.legacyFree } }
  );
  logSafe('session.validate', { result: route.kind });
  return route;
}

/**
 * Sign-out (D-07, post-pivot): clears the vault `session` key only. There is
 * no embedded-OAuth partition to clear anymore — the device flow (Plan 09)
 * never creates an Electron-owned cookie jar in the first place.
 */
export async function signOut(): Promise<void> {
  await vaultDelete('session');
  logSafe('session.signout', {});
}
