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

import { verifyToken, getZones, getZone, listTunnels, listDnsByName } from './cf-client';
import { CfApiError } from './cf-http';
import { decideScopeVerdict, type ProbeOutcomes } from './decide-scope-verdict';
import { validateSubLabel } from './validate-sub-label';
import { vaultGet, vaultSet } from '../storage/secrets-vault';
// The state store's read-modify-write persister is named `patchState`; it is
// imported here under the intent-revealing alias `setState` — this is the
// authoritative persistence of the chosen-zone facts (zoneId/zoneName/subLabel/
// accountId) that provision (03-06) reads back on both the ready and take-over
// paths (D-16 / SHELL-05).
import { patchState as setState } from '../storage/state-store';
import { logSafe } from '../log';
import type {
  CfVerifyResult,
  CfGetZonesResult,
  CfSelectDomainResult,
  CfRecheckZoneResult,
  CfScopeRow,
} from '../../../shared/ipc-contract';
import type { ZoneList } from './cf-schemas';

/** The tunnel target suffix a proxied apex CNAME points at when it is already ours (D-08). */
const CFARGOTUNNEL_SUFFIX = '.cfargotunnel.com';

/** Verbatim CF permission name for the DNS-scope fail row surfaced post-pick (D-03/D-04 stage 3). */
const DNS_SCOPE_LABEL = 'Zone · DNS · Edit';

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

/** The 3 per-scope rows for a DNS-scope 403 on the chosen zone (D-04 stage 3). Tunnel + Zone already passed verify. */
function dnsScopeMissingRows(): CfScopeRow[] {
  return [
    { scope: 'tunnel', ok: true },
    { scope: 'dns', ok: false, missingLabel: DNS_SCOPE_LABEL },
    { scope: 'zone', ok: true },
  ];
}

/**
 * DNS-scope proof + collision read on the CHOSEN zone (CF-03 / D-08).
 *
 * STEP 0 is the MAIN-SIDE AUTHORITATIVE sub-label gate (T-03-06): `validateSubLabel`
 * runs BEFORE the vault is read, before `${subLabel}.${zoneName}` is ever built,
 * and before any CF call — so a payload that bypasses the renderer's UX validation
 * (a dotted or otherwise illegal sub-label) can NEVER form a malformed hostname on
 * the user's zone. The renderer (03-07) validates for feedback; THIS is the gate.
 *
 * Then: read the vault token; resolve the chosen zone (name + account.id) from the
 * in-process cache; probe the DNS scope on that zone; persist the chosen-zone facts
 * (after the DNS proof, before the collision branch, so provision has account.id on
 * BOTH the ready and take-over paths); and read the D-08 collision state — a record
 * pointing elsewhere is a `collision` (renderer gates take-over), a record already
 * pointing at our tunnel resumes silently, no record is a clean `ready`.
 */
export async function selectDomainProbe(zoneId: string, subLabel: string): Promise<CfSelectDomainResult> {
  // STEP 0 — authoritative main-side gate (T-03-06), BEFORE any vault read /
  // hostname build / CF call. A dotted or illegal sub-label is rejected here.
  const v = validateSubLabel(subLabel);
  if (!v.ok) return { kind: 'network' };

  try {
    const token = await vaultGet('cfToken');
    if (!token) return { kind: 'network' };

    // Resolve the chosen zone (name + account.id) from the cache verifyAndProbe
    // populated. account.id never crosses IPC — it is read here and persisted to
    // the state store for provision (D-16). No cache entry -> defensive network.
    const chosen = cachedZones.find((z) => z.id === zoneId);
    if (!chosen) return { kind: 'network' };
    const zoneName = chosen.name;
    const accountId = chosen.account.id;
    const apexHost = `${subLabel}.${zoneName}`;

    // DNS-scope probe on the CHOSEN zone (D-04 stage 3). A resolved 403 -> the
    // DNS row is the missing scope; a transport failure -> the network screen.
    let records;
    try {
      records = await listDnsByName(token, zoneId, apexHost);
    } catch (err) {
      if (err instanceof CfApiError && err.status === 0) return { kind: 'network' };
      return { kind: 'scope-missing', rows: dnsScopeMissingRows() };
    }

    // Persist the chosen-zone facts AFTER the DNS proof but BEFORE the collision
    // branch, so provision (03-06) reads accountId/zoneId/zoneName/subLabel from
    // the state store on BOTH the ready path and the collision -> take-over path.
    await setState({ zoneId, zoneName, subLabel, accountId });
    logSafe('cf.selectDomain', { records: records.length });

    // D-08 collision read (side-effect-free — no canary write). A record whose
    // content is NOT one of our `<tunnel_id>.cfargotunnel.com` targets is a
    // foreign collision; records already pointing at a cfargotunnel target (or
    // none at all) are a clean/idempotent resume.
    if (records.length === 0) return { kind: 'ready' };
    const pointsElsewhere = records.some((r) => !r.content.endsWith(CFARGOTUNNEL_SUFFIX));
    return pointsElsewhere ? { kind: 'collision' } : { kind: 'ready' };
  } catch {
    logSafe('cf.selectDomain', { exception: true });
    return { kind: 'network' };
  }
}

/**
 * Re-fetch a zone's status + live name_servers for the CF-04 nameserver screen
 * re-check (D-10/D-12). `active` proceeds; anything else stays on the NS screen
 * with the live `name_servers[]` (the free-plan-safe field, never the paid-plan-
 * only custom variant — cf-client.getZone reads name_servers). Transport fail -> network.
 */
export async function recheckZone(zoneId: string): Promise<CfRecheckZoneResult> {
  try {
    const token = await vaultGet('cfToken');
    if (!token) return { kind: 'network' };
    const { status, nameServers } = await getZone(token, zoneId);
    if (status === 'active') return { kind: 'active' };
    return { kind: 'pending', nameServers };
  } catch {
    logSafe('cf.recheckZone', { exception: true });
    return { kind: 'network' };
  }
}
