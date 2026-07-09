/**
 * src/main/cloudflare/decide-scope-verdict.ts
 *
 * Pure, zero-IO scope-verdict taxonomy (CF-01). This is the one place the phase
 * is most likely to mis-diagnose a support case, so it is isolated as an
 * exhaustively-tested pure function (03-RESEARCH.md Pattern 2).
 *
 * THE LOAD-BEARING RULE: the verdict is decided by WHICH staged probe failed
 * after the token-alive gate — never by the Cloudflare error identifier. That
 * catch-all identifier is overloaded (one value spans invalid-token,
 * missing-permission, IP-restricted, and max-auth-failures), so it can never
 * disambiguate a scope (03-RESEARCH.md Pitfall 1 / Anti-Patterns). The inputs
 * to this function are ALREADY-classified probe outcomes: it reads no CF status
 * field and has no branch keyed on one.
 *
 * Staged origin of the inputs (D-04 / 03-RESEARCH.md Pattern 2 table):
 *   stage 0  GET /user/tokens/verify           -> tokenAlive (the gate)
 *   stage 1  GET /zones                         -> zoneProbe  (Zone · Zone · Read)
 *   stage 2  GET /accounts/{acct}/cfd_tunnel    -> tunnelProbe (Cloudflare Tunnel · Edit)
 *   stage 3  GET /zones/{chosen}/dns_records    -> proved LATER at selectDomain, so the
 *                                                  dns row is ok:true-pending here.
 *
 * Zero runtime imports — no IO, no Node built-ins, no electron surface; imports
 * only the result type from the shared contract (mirrors decide-key-action.ts).
 */

import type { CfVerifyResult, CfScopeRow } from '../../../shared/ipc-contract';

/** Exact, verbatim CF permission-group display names for the per-scope fail rows (D-03). */
const LABELS = {
  tunnel: 'Account · Cloudflare Tunnel · Edit',
  dns: 'Zone · DNS · Edit',
  zone: 'Zone · Zone · Read',
} as const;

/**
 * The already-classified staged probe outcomes. `tunnelProbe: 'skipped'` means the
 * tunnel probe never ran because the zone probe failed first — a pending row, not a
 * confirmed-missing scope.
 */
export interface ProbeOutcomes {
  tokenAlive: boolean;
  zoneProbe: 'ok' | 'forbidden' | 'network';
  tunnelProbe: 'ok' | 'forbidden' | 'network' | 'skipped';
}

export function decideScopeVerdict(p: ProbeOutcomes): CfVerifyResult {
  // Stage 0 — token-alive gate FIRST. A dead token short-circuits to
  // token-invalid WITHOUT attributing any scope (a 401 / overloaded catch-all
  // here means "token invalid entirely", never "scope X missing").
  if (!p.tokenAlive) return { kind: 'token-invalid' };

  // A transport failure on ANY staged probe (after alive) is its own verdict —
  // "couldn't reach Cloudflare", never conflated with a resolved 403. This is
  // classified upstream from the HTTP layer; nothing here reads an error field.
  if (p.zoneProbe === 'network' || p.tunnelProbe === 'network') return { kind: 'network' };

  // Build the 3 per-scope rows in the fixed [tunnel, dns, zone] render order.
  // The verdict follows WHICH probe was forbidden — not any CF error field.
  const tunnelRow: CfScopeRow =
    p.tunnelProbe === 'ok'
      ? { scope: 'tunnel', ok: true }
      : p.tunnelProbe === 'forbidden'
        ? { scope: 'tunnel', ok: false, missingLabel: LABELS.tunnel }
        : { scope: 'tunnel', ok: false }; // 'skipped' — zone failed first; pending, not confirmed-missing

  // DNS scope is proved LATER at selectDomain (D-04 stage 3, GET /zones/{z}/dns_records);
  // its probe has not run here, so it is represented optimistically as ok:true-pending.
  // A selectDomain / provisioning 403 later routes back through this same rows shape and
  // sets missingLabel LABELS.dns there — this module never marks dns missing.
  const dnsRow: CfScopeRow = { scope: 'dns', ok: true };

  const zoneRow: CfScopeRow =
    p.zoneProbe === 'ok'
      ? { scope: 'zone', ok: true }
      : { scope: 'zone', ok: false, missingLabel: LABELS.zone }; // 'forbidden'

  const rows: CfScopeRow[] = [tunnelRow, dnsRow, zoneRow];

  // scope-missing if any required (probed-here) row failed; else verified.
  const scopeMissing = tunnelRow.ok === false || zoneRow.ok === false;
  return scopeMissing ? { kind: 'scope-missing', rows } : { kind: 'verified', rows };
}
