/**
 * src/main/cloudflare/merge-ingress.ts
 *
 * Pure, zero-IO read-modify-write ingress merge (CF-06 / D-15). Port of the
 * cf-local RMW step (cf-local.ts:319-333): the middle of a
 * GET .../configurations -> merge -> PUT .../configurations round-trip.
 *
 * THE LOAD-BEARING RULE (D-15): this MUST NOT clobber the per-app ingress rules
 * a prior box install already pushed onto a reused tunnel. It only ADDS the
 * apex host and guarantees the terminal `http_status:404` catch-all is present
 * exactly once and last (Cloudflare rejects an ingress config without a trailing
 * catch-all). Two concurrent full-replaces silently erase each other's ingress —
 * the documented "installed but 404s" lost-update bug; this additive merge is
 * the pure half of the fix (the per-tunnel serialization lock lives in 03-06).
 *
 * Apex-only (D-13): the single host added is the exact `<sub>.<zone>` label — a
 * catch-everything wildcard host is never constructed here; per-app hosts stay
 * box-side via cf-local.
 *
 * Zero runtime imports — imports only the IngressEntry type (mirrors the pure
 * decision modules; decide-key-action.ts precedent).
 */

import type { IngressEntry } from './cf-schemas';

export function mergeIngress(current: IngressEntry[], apexHost: string): IngressEntry[] {
  // 1. Strip any catch-all (the terminal `{service:'http_status:404'}` with no
  //    hostname) from ANYWHERE in the input so we can re-append a single one at
  //    the tail — it is never left mid-array.
  const withoutCatchAll = current.filter((i) => !(i.service === 'http_status:404' && !i.hostname));
  // 2. Dedup the apex host so a re-run does not duplicate it (idempotent).
  //    Every OTHER (per-app) rule is preserved verbatim — the no-clobber guarantee.
  const dedup = withoutCatchAll.filter((i) => i.hostname !== apexHost);
  // 3. Append the apex rule, then re-append the single terminal catch-all last.
  return [
    ...dedup,
    { hostname: apexHost, service: 'http://localhost:80' },
    { service: 'http_status:404' },
  ];
}
