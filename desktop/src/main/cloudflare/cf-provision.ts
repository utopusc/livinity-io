/**
 * src/main/cloudflare/cf-provision.ts
 *
 * The write orchestrator — the phase's ONE place that mutates external Cloudflare
 * state. `provisionTunnelAndDns` is the single idempotent function that:
 *
 *   1. reuses-or-creates the remotely-managed tunnel BY NAME (deterministic, so a
 *      double-run converges on one tunnel instead of a duplicate — CF-05 / D-14 /
 *      success criterion 5);
 *   2. fetches the connector token into the DPAPI vault (never returned/logged, D-16);
 *   3. read-modify-write pushes the apex ingress under a PER-TUNNEL lock so a reused
 *      tunnel's existing per-app rules survive (D-15 / T-03-07), with a
 *      verify-and-repair re-push if a reused-but-locally-managed tunnel drops the
 *      config (T-03-14);
 *   4. creates the ONE apex proxied CNAME behind the D-08 collision gate (apex-only,
 *      D-13), with the sole destructive delete gated on an explicit take-over;
 *   5. records the non-secret facts to the state store and returns the Screen-5
 *      summary.
 *
 * The chosen zone's accountId (and zoneId/zoneName/subLabel) are read from the
 * state store, persisted by 03-05 selectDomainProbe — NOT re-resolved here (no
 * account id crosses IPC). Compose shape mirrors Phase-2's authGetKeyAction
 * (auth.ipc.ts:161-205): a guard-before-mutate short-circuit runs BEFORE the first
 * account-scoped write. A provisioning-time 403 maps back to the precise per-scope
 * step (tunnel / ingress / dns) rather than a generic failure (D-04 write-proof).
 *
 * SECRET DISCIPLINE (T-03-01): the CF token flows token->client (Authorization
 * header) only; the connector token flows getTunnelToken->vaultSet('tunnelToken')
 * only. Neither is ever logged, echoed, or returned across IPC — CfProvisionResult
 * carries only display strings. Every logSafe here carries scalars only.
 *
 * Zero imports from ipc/ or tray/ — a main-process orchestration primitive.
 */

import {
  listTunnels,
  createTunnel,
  getTunnelToken,
  getIngress,
  putIngress,
  listDnsByName,
  createDnsCname,
  deleteDnsRecord,
} from './cf-client';
import { CfApiError } from './cf-http';
import { mergeIngress } from './merge-ingress';
import { deriveTunnelName } from './derive-tunnel-name';
import { validateSubLabel } from './validate-sub-label';
import { vaultGet, vaultSet } from '../storage/secrets-vault';
// The state store exposes readState/patchState (its real API). They are imported
// here under the intent-revealing aliases getState/setState the plan's steps +
// acceptance greps name — the same drift-reconciliation cf-verify shipped at 03-05
// (`patchState as setState`), no wrapper invented.
import { readState as getState, patchState as setState } from '../storage/state-store';
import { logSafe } from '../log';
import type {
  CfProvisionResult,
  CfProvisionUpdate,
  CfScopeRow,
} from '../../../shared/ipc-contract';

/**
 * Verbatim Cloudflare permission names (exactly as the dashboard spells them) for
 * the write-403 per-scope screen (D-04). A tunnel/ingress write needs the Account
 * Tunnel scope; a DNS write needs the Zone DNS scope.
 */
const SCOPE_LABELS = {
  tunnel: 'Account · Cloudflare Tunnel · Edit',
  dns: 'Zone · DNS · Edit',
} as const;

/**
 * The 3 per-scope rows for a WRITE-level 403, keyed by which write step failed.
 * The tunnel-create + ingress-push writes both fail on the Tunnel scope; the DNS
 * writes fail on the DNS scope. Zone-Read already passed at verify.
 */
function scopeMissingRows(step: 'tunnel' | 'ingress' | 'dns'): CfScopeRow[] {
  const failed: 'tunnel' | 'dns' = step === 'dns' ? 'dns' : 'tunnel';
  return [
    failed === 'tunnel'
      ? { scope: 'tunnel', ok: false, missingLabel: SCOPE_LABELS.tunnel }
      : { scope: 'tunnel', ok: true },
    failed === 'dns'
      ? { scope: 'dns', ok: false, missingLabel: SCOPE_LABELS.dns }
      : { scope: 'dns', ok: true },
    { scope: 'zone', ok: true },
  ];
}

/**
 * Classify a write-path error into a CfProvisionResult. A status-0 CfApiError is a
 * transport failure ("couldn't reach Cloudflare"); a resolved 403 maps back to the
 * precise per-scope step (never a generic failure, D-04); any other resolved
 * non-2xx is a plain one-line error. The token is never part of a CfApiError, so
 * nothing secret can leak into `reason`.
 */
function classifyWriteError(err: unknown, step: 'tunnel' | 'ingress' | 'dns'): CfProvisionResult {
  if (err instanceof CfApiError) {
    if (err.status === 0) return { kind: 'network' };
    if (err.status === 403) return { kind: 'scope-missing', step, rows: scopeMissingRows(step) };
    return { kind: 'error', reason: `Cloudflare rejected the request (HTTP ${err.status})` };
  }
  return { kind: 'error', reason: 'Provisioning failed unexpectedly' };
}

/**
 * Per-tunnel ingress serialization (port of cf-local.ts:289-299). Two overlapping
 * read-modify-write cycles on the SAME tunnel would otherwise interleave and the
 * second full-replace could erase the first's ingress (the "installed but 404s"
 * lost-update bug, T-03-07). Each tunnel id gets its own promise chain; different
 * tunnels proceed in parallel. Mirrors the state-store/secrets-vault withStateLock
 * idiom, keyed by tunnel id.
 */
const ingressLocks = new Map<string, Promise<unknown>>();

async function withTunnelIngressLock<T>(tunnelId: string, fn: () => Promise<T>): Promise<T> {
  const prev = ingressLocks.get(tunnelId) ?? Promise.resolve();
  const result = prev.then(fn, fn);
  ingressLocks.set(
    tunnelId,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}

/**
 * The idempotent write orchestrator. Reuses-or-creates the tunnel by name, fetches
 * the connector token into the vault, RMW-pushes the apex ingress without clobbering
 * per-app rules, creates the collision-gated apex CNAME, and persists the non-secret
 * facts. `takeOver` is honored ONLY on the DNS collision branch (D-08).
 */
export async function provisionTunnelAndDns(
  input: { username: string | null; takeOver?: boolean },
  onUpdate?: (u: CfProvisionUpdate) => void
): Promise<CfProvisionResult> {
  try {
    // Guard: the verified CF token must be in the vault (03-05 verifyAndProbe).
    const token = await vaultGet('cfToken');
    if (!token) return { kind: 'network' };

    // accountId guard FIRST: the chosen-zone facts must have been persisted by
    // 03-05 selectDomainProbe. Every CF field in StateSchema is optional, so a
    // missing selection short-circuits to the network screen BEFORE the first
    // account-scoped listTunnels call — never a call with an undefined account id.
    const st = await getState();
    if (!st) return { kind: 'network' };
    const { zoneId, zoneName, subLabel, accountId } = st;
    if (!zoneId || !zoneName || !subLabel || !accountId) return { kind: 'network' };

    // Re-assert the authoritative sub-label gate (T-03-06) on the value provision
    // ACTUALLY uses, immediately after reading state — do NOT trust that the value
    // 03-05 selectDomainProbe gated is still the one persisted. The state store's
    // subLabel is renderer-mutable between the two calls: window.api.setState({...})
    // validates against StateSchema.partial(), where subLabel is z.string().optional()
    // (any string passes, no single-label check), so a compromised renderer can
    // overwrite just the label ('a.b.evil') while keeping the validated account
    // facts. Re-run validateSubLabel here BEFORE the value forms a hostname or is
    // persisted as the D-16 LIVOS_DOMAIN install fact. Apex-only per D-13: a
    // catch-everything wildcard host is never constructed anywhere in this module.
    if (!validateSubLabel(subLabel).ok) return { kind: 'network' };
    const apexHost = `${subLabel}.${zoneName}`;
    const name = deriveTunnelName({ username: input.username, subLabel });

    let step: 'tunnel' | 'ingress' | 'dns' = 'tunnel';
    try {
      // (1) reuse-or-create the remotely-managed tunnel by its deterministic name.
      //     listTunnels is already is_deleted=false-filtered in cf-client, so a
      //     name match is a LIVE tunnel to reuse; otherwise create one
      //     (config_src:'cloudflare' is set inside cf-client.createTunnel, T-03-14).
      onUpdate?.({ phase: 'tunnel' });
      const tunnels = await listTunnels(token, accountId);
      let tunnelId = tunnels.find((t) => t.name === name)?.id;
      if (!tunnelId) tunnelId = (await createTunnel(token, accountId, name)).tunnelId;

      // (2) connector token -> DPAPI vault (never returned across IPC, never logged).
      const connectorToken = await getTunnelToken(token, accountId, tunnelId);
      await vaultSet('tunnelToken', connectorToken);

      // (3) apex ingress = read-modify-write under the per-tunnel lock, then
      //     verify-and-repair: mergeIngress preserves every existing per-app rule
      //     (D-15) and re-appends the single trailing catch-all; two concurrent
      //     full-replaces cannot erase each other (T-03-07). Re-GET up to 2x and
      //     re-push if the apex host did not take (a reused-but-locally-managed
      //     tunnel silently drops the config, T-03-14).
      step = 'ingress';
      onUpdate?.({ phase: 'ingress' });
      const id = tunnelId;
      await withTunnelIngressLock(id, async () => {
        const pushOnce = async () => {
          const cur = await getIngress(token, accountId, id);
          await putIngress(token, accountId, id, mergeIngress(cur, apexHost));
        };
        await pushOnce();
        for (let i = 0; i < 2; i++) {
          const after = await getIngress(token, accountId, id);
          if (after.some((x) => x.hostname === apexHost)) break;
          await pushOnce();
        }
      });

      // (4) DNS — the ONE apex proxied CNAME behind the D-08 collision gate.
      //     `target` is THIS tunnel's cfargotunnel address; only the exact apex
      //     host is queried (apex-only, D-13 — no catch-everything host is ever
      //     built). A record already pointing at this tunnel resumes silently; a
      //     FOREIGN record is a collision that is deleted ONLY on an explicit
      //     take-over (the sole destructive external write in the phase, T-03-05).
      step = 'dns';
      onUpdate?.({ phase: 'dns' });
      const target = `${id}.cfargotunnel.com`;
      const existing = await listDnsByName(token, zoneId, apexHost);
      if (existing.length && existing.every((r) => r.content === target)) {
        // resume: already ours — no create, no destructive write.
      } else if (existing.length) {
        if (!input.takeOver) return { kind: 'collision' }; // gated behind the Collision screen (03-09)
        for (const r of existing) await deleteDnsRecord(token, zoneId, r.id);
        await createDnsCname(token, zoneId, apexHost, id);
      } else {
        await createDnsCname(token, zoneId, apexHost, id);
      }

      // (5) persist the non-secret facts (D-16) and return the Screen-5 summary.
      await setState({ tunnelId: id, accountId, zoneId, zoneName, subLabel });
      logSafe('cf.provision', { ok: true });
      return {
        kind: 'ready',
        summary: { address: apexHost, tunnelName: name, recordsLabel: '1 DNS record + tunnel route' },
      };
    } catch (err) {
      return classifyWriteError(err, step);
    }
  } catch {
    // A thrown vault/state read must not escape as a rejected IPC promise — the
    // renderer shows the "couldn't reach Cloudflare" screen instead.
    logSafe('cf.provision', { exception: true });
    return { kind: 'network' };
  }
}
