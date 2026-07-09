/**
 * src/main/cloudflare/cf-verify.ts
 *
 * The read/verify orchestrators — the main-process "brain" that composes the
 * pure verdict logic (decide-scope-verdict, 03-03), the CF client (cf-client,
 * 03-04), the sub-label validator (validate-sub-label, 03-02), the DPAPI vault,
 * and the state store into the flows the CF wizard drives:
 *
 *   verifyAndProbe(token)      -> staged read probes -> per-scope verdict; stores
 *                                 the token to the vault ONLY on an all-scope pass.
 *   getZonesFromVault()        -> secret-free zone list for the dropdown (zero
 *                                 zones is a guided path, never a dead end, D-09).
 *   selectDomainProbe(zone,..) -> main-side sub-label gate (T-03-06) + DNS-scope
 *                                 proof + D-08 collision read; persists the chosen
 *                                 zone's account.id + facts for provision (D-16).
 *   recheckZone(zoneId)        -> active vs pending + live name_servers (CF-04).
 *
 * Compose shape mirrors Phase-2's authGetKeyAction (auth.ipc.ts:161-205):
 * guard-before-mutate — a failing read short-circuits BEFORE any vault write.
 *
 * READ-LEVEL PROBES ONLY (D-04): this module issues NO side-effecting write
 * (no POST/PUT canary). Provisioning-time writes live in cf-provision (03-06).
 *
 * SECRET DISCIPLINE (T-03-01): the CF token flows token->client (Authorization
 * header) and token->vaultSet('cfToken') only; it is NEVER logged, echoed, or
 * returned across IPC. Every logSafe here carries scalars only.
 *
 * Zero imports from ipc/ or tray/ — a main-process orchestration primitive.
 */

import { verifyToken, getZones, listTunnels } from './cf-client';
import { CfApiError } from './cf-http';
import { decideScopeVerdict, type ProbeOutcomes } from './decide-scope-verdict';
import { vaultGet, vaultSet } from '../storage/secrets-vault';
import { logSafe } from '../log';
import type { CfVerifyResult, CfGetZonesResult } from '../../../shared/ipc-contract';
import type { ZoneList } from './cf-schemas';

/**
 * The verified zone list, cached in-process by verifyAndProbe. It retains the
 * FULL Zone objects (including `account.id`, which never crosses IPC) so
 * selectDomainProbe (03-05 Task 2) can resolve the chosen zone's account id
 * for provision WITHOUT a re-fetch or an account id crossing the boundary.
 * Populated only on an all-scope pass (mirrors the vault-write-after-verify
 * rule); getZonesFromVault re-fetches with the vault token if it is empty.
 */
let cachedZones: ZoneList = [];

/** TEST-ONLY: clears the in-process zone cache between unit tests. Never called in production. */
export function __resetVerifyCache(): void {
  cachedZones = [];
}

/**
 * Classify a probe error AFTER the token-alive gate has already passed. A
 * status-0 CfApiError is a transport failure ("couldn't reach Cloudflare");
 * every resolved non-2xx (403/401/404) means the scope is forbidden/absent —
 * never conflate the two (they route to different screens). The verdict is
 * decided by WHICH probe failed, never by the overloaded CF error code.
 */
function classifyProbeError(err: unknown): 'forbidden' | 'network' {
  if (err instanceof CfApiError && err.status === 0) return 'network';
  return 'forbidden';
}

/**
 * Staged read probes (D-04 / 03-RESEARCH Pattern 2):
 *   stage 0  GET /user/tokens/verify           -> token-alive gate
 *   stage 1  GET /zones                         -> Zone·Zone·Read + dropdown source
 *   stage 2  GET /accounts/{firstZone.acct}/... -> Cloudflare Tunnel scope (best-effort)
 *
 * A dead token short-circuits to `token-invalid` with NO vault write and NO
 * scope probes. The token is stored to the vault (and the zone list cached)
 * ONLY when decideScopeVerdict returns `verified` (D-05). A transport failure
 * anywhere returns `network` ("couldn't reach Cloudflare"), never a false
 * "token invalid".
 */
export async function verifyAndProbe(token: string): Promise<CfVerifyResult> {
  try {
    // Stage 0 — token-alive gate. verifyToken maps a terminal auth failure to
    // { alive:false } but RE-THROWS a network/server failure, so a dead token
    // and an unreachable Cloudflare are distinct outcomes.
    const { alive } = await verifyToken(token);
    if (!alive) return { kind: 'token-invalid' }; // NO vault write, NO scope probes

    // Stage 1 — zone probe (Zone·Read + the dropdown source).
    let zones: ZoneList = [];
    let zoneProbe: ProbeOutcomes['zoneProbe'];
    try {
      zones = await getZones(token);
      zoneProbe = 'ok';
    } catch (err) {
      zoneProbe = classifyProbeError(err);
    }

    // Stage 2 — tunnel probe (best-effort, against the FIRST visible zone's
    // account id — 03-RESEARCH Pitfall 7; re-validated against the SELECTED
    // zone's account at provision). Skipped when the zone probe never yielded
    // a zone to derive an account id from.
    let tunnelProbe: ProbeOutcomes['tunnelProbe'];
    if (zoneProbe === 'ok' && zones.length > 0) {
      try {
        await listTunnels(token, zones[0].account.id);
        tunnelProbe = 'ok';
      } catch (err) {
        tunnelProbe = classifyProbeError(err);
      }
    } else {
      tunnelProbe = 'skipped';
    }

    const verdict = decideScopeVerdict({ tokenAlive: true, zoneProbe, tunnelProbe });

    if (verdict.kind === 'verified') {
      // vault-write-only-on-verified (D-05): the token lands in the DPAPI vault
      // ONLY here, and the full zone list (account.id included) is cached for
      // selectDomainProbe. The token is never logged.
      await vaultSet('cfToken', token);
      cachedZones = zones;
      logSafe('cf.verify', { ok: true });
    }

    return verdict;
  } catch {
    // A thrown vault/transport error must not escape — the renderer shows the
    // "couldn't reach Cloudflare" screen rather than a rejected IPC promise.
    logSafe('cf.verify', { exception: true });
    return { kind: 'network' };
  }
}

/**
 * The secret-free zone list for the dropdown (CF-03). Reads the in-process
 * cache populated by verifyAndProbe; if it is empty, re-fetches with the vault
 * token. Maps each zone to `{ id, name, status }` — the `account.id` never
 * crosses IPC. Zero zones is `{ ok:true, zones:[] }` (D-09: the renderer shows
 * the guidance card, never a dead end), NOT an error.
 */
export async function getZonesFromVault(): Promise<CfGetZonesResult> {
  try {
    let zones = cachedZones;
    if (zones.length === 0) {
      const token = await vaultGet('cfToken');
      if (!token) return { ok: false, reason: 'unauthorized' };
      zones = await getZones(token);
      cachedZones = zones;
    }
    const summaries = zones.map((z) => ({ id: z.id, name: z.name, status: z.status }));
    logSafe('cf.getZones.fromVault', { count: summaries.length });
    return { ok: true, zones: summaries };
  } catch (err) {
    if (err instanceof CfApiError && (err.status === 401 || err.status === 403)) {
      return { ok: false, reason: 'unauthorized' };
    }
    return { ok: false, reason: 'network' };
  }
}
