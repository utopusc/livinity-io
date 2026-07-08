/**
 * src/main/platform/decide-route.ts
 *
 * Pure, zero-IO tier-routing decision (AUTH-04). Mirrors the platform's own
 * `decideSubscriptionAccess()` precedence order exactly: legacyFree is
 * checked BEFORE free_byod (02-RESEARCH.md Pattern 3). Never emits
 * `{ kind: 'login' }` — that case is owned by session-manager (Plan 04).
 *
 * Zero imports from the electron module, the Node fs/http built-ins, or
 * anything with IO — fully unit-testable with plain objects in, plain
 * objects out.
 */

import type { RouteResult } from '../../../shared/ipc-contract';

export function decideRoute(
  me: { free_byod: boolean } | null,
  dashboard: { billing: { active: boolean; legacyFree: boolean } } | null
): RouteResult {
  if (!me || !dashboard) return { kind: 'error', reason: 'network' };
  if (!dashboard.billing.active) return { kind: 'no-entitlement' };
  if (dashboard.billing.legacyFree) return { kind: 'legacy-free-wizard' };
  if (me.free_byod) return { kind: 'byod-wizard' };
  return { kind: 'pro-wizard' };
}
