/**
 * src/main/orchestrator/connected-probe.ts
 *
 * The INSTALL-04 impure probe orchestrator. Two exports:
 *
 * - `isInstalledAndHealthy` (D-03 fast-path): the bounded, locale-safe
 *   `systemctl is-active livos.service && curl ... 127.0.0.1:8080/` poll
 *   (RESEARCH.md Pattern 3, copied verbatim) that decides whether a re-launch
 *   can skip straight to the live-success screen instead of re-walking
 *   resource/download/install. Reused as-is for probe 1 of the D-05 verdict
 *   below -- the two are the SAME check (RESEARCH Architecture diagram).
 * - `runConnectedProbe` (D-05, three-probe "connected" verdict): cheap-first
 *   -- probe 1 (local health) runs FIRST; a failed probe 1 returns
 *   still-confirming WITHOUT ever attempting probe 2 (the injected `fetch`
 *   mock's call count stays 0 in that case). Probe 2 is a bounded-retry
 *   public-URL `fetch` against the derived address. Per the D-05 HARD RULE
 *   (no usable platform endpoint exists, RESEARCH Open Question 5), probe
 *   2's 200-through-the-Cloudflare-edge IS probe 3's presence evidence --
 *   there is no separate probe-3 call in this module.
 *
 * Every collaborator call in this file is wrapped so a glitch degrades to
 * the HONEST still-confirming verdict -- never a false 'connected', never a
 * thrown exception, never a hung/rejected promise (disk-probe.ts precedent:
 * "never false-block on a probe glitch").
 *
 * DI discipline (mirrors distro-install.ts's ProvisionDistroDeps): every
 * collaborator (execWsl, fetch, readState, vaultGet, getMe) plus the probe
 * timing windows are injectable via `deps: Partial<...> = {}`, defaulting to
 * the real implementations. logSafe carries scalar breadcrumbs only.
 */

import https from 'node:https';
import { execWsl as realExecWsl, type ExecResult } from '../wsl/wsl-exec';
import { readState as realReadState } from '../storage/state-store';
import { vaultGet as realVaultGet } from '../storage/secrets-vault';
import { getMe as realGetMe } from '../platform/auth-client';
import { logSafe } from '../log';
import type { ConnectedProbeResult } from '../../../shared/ipc-contract';

type ExecWslFn = (args: string[], opts?: { timeoutMs?: number }) => Promise<ExecResult>;
type FetchOkFn = (url: string) => Promise<boolean>;

// D-03: tighter than install.sh's own 30s fresh-boot wait -- this is a
// repeat-launch fast-path check, not a fresh-boot wait (A4 timing caveat:
// keep the window generous, treat as a tunable constant).
const HEALTH_MAX_WAIT_MS = 15_000;
const HEALTH_POLL_MS = 2_000;

// D-05 probe 2 bounded retry window (Claude's Discretion, RESEARCH Open
// Question 4): generous enough to absorb tunnel warm-up after install exit,
// never blocking "Open your Livinity" past the window -- an honest
// still-confirming fallback instead.
const REACH_MAX_WAIT_MS = 20_000;
const REACH_POLL_MS = 3_000;
const REACH_FETCH_TIMEOUT_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main-process fetch guard (Pitfall 5): use global `fetch` when available
 * (Electron's Node-based main process, Node 18+), falling back to
 * `node:https` when it is not. Any failure -- network error, timeout, a
 * non-200 status -- resolves `false`; this NEVER throws and NEVER hangs past
 * `REACH_FETCH_TIMEOUT_MS`.
 */
function defaultFetchOk(url: string): Promise<boolean> {
  if (typeof fetch === 'function') {
    return fetch(url)
      .then((res) => res.status === 200)
      .catch(() => false);
  }
  return new Promise<boolean>((resolve) => {
    const req = https
      .get(url, { timeout: REACH_FETCH_TIMEOUT_MS }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      })
      .on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Injectable collaborators for `isInstalledAndHealthy` -- production defaults, fully fakeable. */
export interface HealthProbeDeps {
  execWsl: ExecWslFn;
  /** Test-only timing override -- production uses HEALTH_MAX_WAIT_MS. */
  maxWaitMs: number;
  /** Test-only timing override -- production uses HEALTH_POLL_MS. */
  pollMs: number;
}

/**
 * D-03 fast-path probe (RESEARCH Pattern 3, copied verbatim): polls
 * `systemctl is-active --quiet livos.service && curl ... 127.0.0.1:8080/`
 * bounded by `maxWaitMs`/`pollMs`. Returns `true` the moment the probe exits
 * 0; returns `false` once the deadline passes without ever exiting 0 --
 * bounded, never hangs. A thrown/rejected `execWsl` call degrades to a
 * negative poll (never throws past this function, never false-blocks a
 * doomed repeat-launch check).
 */
export async function isInstalledAndHealthy(deps: Partial<HealthProbeDeps> = {}): Promise<boolean> {
  const execWslFn = deps.execWsl ?? realExecWsl;
  const maxWaitMs = deps.maxWaitMs ?? HEALTH_MAX_WAIT_MS;
  const pollMs = deps.pollMs ?? HEALTH_POLL_MS;
  const deadline = Date.now() + maxWaitMs;

  for (;;) {
    const ok = await execWslFn([
      '-d',
      'livinity',
      '-u',
      'root',
      '--',
      'bash',
      '-lc',
      'systemctl is-active --quiet livos.service && ' +
        'curl -fsS -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:8080/ | grep -qE "^[234]"',
    ])
      .then((r) => r.code === 0)
      .catch(() => false);
    if (ok) return true;
    if (Date.now() >= deadline) return false;
    await sleep(pollMs);
  }
}

/** Injectable collaborators for `deriveAddress` -- production defaults, fully fakeable. */
export interface AddressDeps {
  readState: typeof realReadState;
  vaultGet: typeof realVaultGet;
  getMe: typeof realGetMe;
}

/**
 * Address derivation (main-side, mirrors install-invoke.ts's domain-build
 * logic): BYOD/free = `${subLabel}.${zoneName}` when both are already
 * persisted (03-05's selectDomainProbe); otherwise Pro/legacy =
 * `${username}.livinity.io`, reading the username via the SAME
 * `vaultGet('session')` + `getMe` main-side reader `cf.ipc.ts`'s cf:provision
 * handler already uses -- never re-implemented, never a renderer-supplied
 * value. A missing/failed session or state read degrades to `null` (a
 * non-secret display string only; `runConnectedProbe`/`decideResumePoint`
 * both accept a null address and still yield a valid verdict/route).
 */
export async function deriveAddress(deps: Partial<AddressDeps> = {}): Promise<string | null> {
  const readStateFn = deps.readState ?? realReadState;
  const vaultGetFn = deps.vaultGet ?? realVaultGet;
  const getMeFn = deps.getMe ?? realGetMe;
  try {
    const st = await readStateFn();
    if (st?.subLabel && st?.zoneName) {
      return `${st.subLabel}.${st.zoneName}`;
    }
    const sessionValue = await vaultGetFn('session');
    if (!sessionValue) return null;
    const me = await getMeFn(sessionValue);
    const username = me.ok ? me.user.username : null;
    return username ? `${username}.livinity.io` : null;
  } catch {
    return null;
  }
}

/** Injectable collaborators for `runConnectedProbe` -- production defaults, fully fakeable. */
export interface ConnectedProbeDeps extends HealthProbeDeps, AddressDeps {
  fetch: FetchOkFn;
  /** Test-only timing override -- production uses REACH_MAX_WAIT_MS. */
  reachMaxWaitMs: number;
  /** Test-only timing override -- production uses REACH_POLL_MS. */
  reachPollMs: number;
}

/**
 * D-05 three-probe "connected" verdict, cheap-first. Probe 1 (local
 * livinityd health -- `isInstalledAndHealthy`) runs first; if it never
 * passes within its own bounded window, this returns still-confirming
 * WITHOUT ever calling `deps.fetch` (probe 2) -- the cheap-first ordering
 * the plan's must_haves require. Probe 2 is a bounded-retry public-URL GET
 * against the derived address; per the D-05 HARD RULE, probe 2's
 * 200-through-the-Cloudflare-edge IS probe 3's presence evidence (no usable
 * platform endpoint exists, RESEARCH Open Question 5) -- there is no
 * separate probe-3 call here. Never throws; a probe glitch anywhere in this
 * chain degrades to the honest still-confirming verdict.
 */
export async function runConnectedProbe(deps: Partial<ConnectedProbeDeps> = {}): Promise<ConnectedProbeResult> {
  const healthy = await isInstalledAndHealthy(deps).catch(() => false);
  const address = await deriveAddress(deps).catch(() => null);

  if (!healthy) {
    logSafe('flow.connectedProbe', { probe1: false });
    return { kind: 'still-confirming', address };
  }

  if (!address) {
    // Nothing to probe reachability against -- honest fallback, never a
    // false 'connected'.
    logSafe('flow.connectedProbe', { probe1: true, noAddress: true });
    return { kind: 'still-confirming', address };
  }

  const fetchFn = deps.fetch ?? defaultFetchOk;
  const reachMaxWaitMs = deps.reachMaxWaitMs ?? REACH_MAX_WAIT_MS;
  const reachPollMs = deps.reachPollMs ?? REACH_POLL_MS;
  const url = `https://${address}/`;
  const deadline = Date.now() + reachMaxWaitMs;

  for (;;) {
    const reachable = await fetchFn(url).catch(() => false);
    if (reachable) {
      logSafe('flow.connectedProbe', { probe1: true, probe2: true });
      return { kind: 'connected', address };
    }
    if (Date.now() >= deadline) break;
    await sleep(reachPollMs);
  }

  logSafe('flow.connectedProbe', { probe1: true, probe2: false });
  return { kind: 'still-confirming', address };
}
