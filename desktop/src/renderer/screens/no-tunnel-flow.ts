/**
 * src/renderer/screens/no-tunnel-flow.ts
 *
 * Pure, React-free routing helper for NoTunnel410.tsx's "Check again"
 * (WR-02) -- extracted so the resolved/still-unresolved decision is
 * unit-testable in the node vitest environment, mirroring
 * screens/wsl/wsl-flow.ts's template.
 *
 * WHY the allowlist is this narrow: by the time a 410 install failure has
 * landed the user on NoTunnel410, the ledger necessarily holds a concrete
 * flowStep (persisted by the flowEnter that entered the wizard), so
 * flow:resume ALWAYS returns a concrete route -- typically
 * `{ kind:'wsl-detect', resume:true }` -- whether or not the account has
 * been fixed platform-side. Treating "any non-null, non-cf-reconnect route"
 * as resolved therefore made EVERY click re-run the whole multi-minute
 * install pipeline straight back into the same 410. Only routes that
 * POSITIVELY indicate the box has progressed past install ('live-success',
 * 'connected-check') count as resolved; everything else -- null, wsl-detect,
 * installing, cf-wizard, cf-reconnect -- honestly reports "still not set up".
 */

import type { FlowRoute } from '../../../shared/ipc-contract';

/** True only when the recomputed route positively proves progress past the failed install. */
export function isTunnel410Resolved(route: FlowRoute | null): boolean {
  return route !== null && (route.kind === 'live-success' || route.kind === 'connected-check');
}
