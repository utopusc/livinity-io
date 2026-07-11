/**
 * src/main/dashboard/decide-dashboard-nav.ts
 *
 * Pure, zero-IO navigation-allow-list + probe-then-open branch decider for
 * the sandboxed dashboard BrowserWindow (DASH-01, D-09/D-10, RESEARCH
 * Pattern 6 / threat T-06-06). This module owns the security-shaped decision
 * only -- the impure `will-navigate`/`setWindowOpenHandler` wiring and the
 * actual `BrowserWindow` (no `preload` key at all, T-06-05) live in 06-08's
 * dashboard-window.ts, which must call these two functions verbatim rather
 * than re-implementing the origin check inline.
 *
 * isAllowedNavigation compares the EXACT origin (`new URL(url).origin`)
 * against ALLOWED_ORIGIN -- never a bare `startsWith` on the raw string.
 * This is deliberately spoof-proof: a lookalike host such as
 * 'http://localhost:8080.evil.com/' fails to parse as a valid URL (its
 * authority component is not a legal `host[:port]` -- the WHATWG URL parser
 * rejects a non-numeric port), and even if some URL implementation parsed it
 * leniently, `.origin` would still carry the full evil suffix and could
 * never equal the bare 'http://localhost:8080' string exactly. Any
 * malformed/unparseable url, or any origin other than the allowed http
 * localhost origin (including `file:`), denies by default (fail-closed --
 * `isAllowedNavigation` never throws).
 *
 * Zero runtime imports -- no IO, no Node built-ins, no electron surface.
 */

/** WSL2's default localhost port-forwarding target, matching livinityd's in-distro bind. */
export const ALLOWED_ORIGIN = 'http://localhost:8080';

export function isAllowedNavigation(url: string): boolean {
  try {
    return new URL(url).origin === ALLOWED_ORIGIN;
  } catch {
    return false;
  }
}

export type DashboardOpenMode = { mode: 'direct' } | { mode: 'interstitial' };

/**
 * The probe-then-open branch (Pattern 6): a healthy live probe loads the real
 * URL directly (no interstitial flash -- the common case for a long-running
 * engine); an unhealthy probe opens the static interstitial first, then the
 * impure caller polls in the background and swaps to the real URL once ready.
 */
export function decideDashboardOpen(healthy: boolean): DashboardOpenMode {
  return healthy ? { mode: 'direct' } : { mode: 'interstitial' };
}
