/**
 * src/main/supervision/engine.ts
 *
 * TRAY-02/TRAY-03/TRAY-05/TRAY-06: the phase's load-bearing orchestrator —
 * desired-state persistence, the start/stop/restart lifecycle, the periodic
 * supervision timer, and the resume/unlock self-heal. Composes the pure
 * deciders (`decideSupervisionAction`/`decideNotification`, 06-02), the
 * holder lifecycle (`holder.ts`, 06-06), and the reused-verbatim Phase-5
 * health probe (`connected-probe.ts`).
 *
 * Three CRITICAL correctness invariants live here:
 *
 * 1. RESEARCH Pattern 3 (respawn-gate ordering): `stopEngine` persists
 *    `engineDesiredState: 'stopped'` to the state store BEFORE killing the
 *    holder / running `wsl --terminate` — the very next supervision tick,
 *    even one that races the terminate call, always reads 'stopped' before
 *    it ever asks "is the holder alive?", so it can never fight the user's
 *    own STOP by respawning a holder they just asked to stop.
 * 2. IN-06 (install-gate): `supervisionTick`'s `isInstallInFlight()` check is
 *    the LITERAL FIRST statement — a live 15-20min `install.sh` run must
 *    never be interleaved with a self-heal/respawn probe.
 * 3. Pitfall 3 (`--terminate`, never the whole-VM teardown flag): every STOP/
 *    RESTART path scopes its wsl.exe call to `['--terminate', 'livinity']` —
 *    the whole-VM flag would tear down the user's other WSL distros too. A
 *    source-scan test (engine.test.ts) asserts that flag's literal spelling
 *    never appears in this file.
 *
 * Every collaborator is injected via `Partial<EngineDeps>` (mirrors
 * `flow.ts`'s `FlowDeps`); `resolveDeps` merges the caller's overrides over
 * `defaultDeps`, which wires the ALREADY-real collaborators (state-store,
 * wsl-exec, connected-probe, install-invoke, holder.ts, electron
 * `Notification`) plus safe no-op defaults for the collaborators that do not
 * exist yet in this Wave (the dashboard window is 06-08; the tray/status
 * rail and the `BrowserWindow`/navigate wiring are composed by 06-11's
 * `index.ts`, which always supplies real implementations). This file makes
 * NO import edge into `dashboard/dashboard-window.ts` or `index.ts` — every
 * one of those collaborators is ALWAYS injected, never imported directly
 * (keeps this a Wave-3 file with no forward dependency on 06-08/06-11).
 *
 * Every exported lifecycle function wraps its body in a single outer
 * try/catch (mirrors `flow.ts`'s single-outer-try discipline) — a thrown
 * collaborator degrades to a safe, logged no-op rather than crashing the
 * supervision loop or the IPC handler that calls into it. `logSafe` carries
 * scalar breadcrumbs only.
 *
 * `app.setAppUserModelId` is deliberately NOT called here — that is
 * `index.ts`'s job (06-11, Pitfall 6); this module only guards each
 * `Notification` construction with `Notification.isSupported()`.
 *
 * Drives the EXISTING `setStatus` rail (tray color + `status:changed`) via
 * `deps.setStatus` — never a second status-push channel (Don't Hand-Roll).
 */

import { Notification } from 'electron';
import { readState as realReadState, patchState as realPatchState } from '../storage/state-store';
import { execWsl as realExecWsl, type ExecResult } from '../wsl/wsl-exec';
import {
  isInstalledAndHealthy as realIsInstalledAndHealthy,
  deriveAddress as realDeriveAddress,
} from '../orchestrator/connected-probe';
import { isInstallInFlight as realIsInstallInFlight } from '../wsl/install-invoke';
import {
  adoptOrSpawnHolder as realAdoptOrSpawnHolder,
  killHolder as realKillHolder,
  readHolderRecord as realReadHolderRecord,
  isPidAliveAsWsl as realIsPidAliveAsWsl,
} from './holder';
import { decideSupervisionAction } from './decide-supervision';
import { decideNotification, type NotifyKind } from './notify-edges';
import { logSafe } from '../log';
import type { EngineStatusResult, Status } from '../../../shared/ipc-contract';

type ExecWslFn = (args: string[], opts?: { timeoutMs?: number }) => Promise<ExecResult>;

/** D-06 self-heal command — exit-code only, locale-safe, idempotent, a fixed literal argv
 * (T-06-14: no shell-string interpolation of untrusted data). */
const SELF_HEAL_ARGS = ['-d', 'livinity', '-u', 'root', '--', 'systemctl', 'restart', 'livos.service', 'cloudflared'];

/** ~30-60s range (06-11-PLAN.md, Claude's discretion) — used only when the caller omits
 * `intervalMs`; production wiring (06-11) always passes an explicit value. */
const DEFAULT_TICK_INTERVAL_MS = 45_000;

const NOTIFY_COPY: Record<NotifyKind, { title: string; body: string }> = {
  offline: { title: 'Livinity is offline', body: "Your box stopped responding — we'll keep checking." },
  'back-online': { title: 'Livinity is back online', body: 'Your box reconnected on its own.' },
  recovered: { title: 'Livinity recovered automatically', body: 'We restarted a stalled service for you.' },
};

/**
 * Injectable collaborators — mirrors `FlowDeps` (flow.ts). The dashboard-window
 * collaborators (`openDashboardWindow`/`closeDashboard`/`getMainWindow`/
 * `navigateToSettings`/`openExternal`) and `setStatus` have NO real production
 * default in THIS module — 06-11's `index.ts` always supplies them; a caller
 * that omits one gets a safe no-op default instead (never a crash).
 */
export interface EngineDeps {
  readState: typeof realReadState;
  patchState: typeof realPatchState;
  execWsl: ExecWslFn;
  isInstalledAndHealthy: () => Promise<boolean>;
  isInstallInFlight: () => boolean;
  deriveAddress: () => Promise<string | null>;
  /** Boots the holder — production default ADOPTS a live holder across an app restart
   * rather than risk spawning a second one (mirrors holder.ts's own adopt-or-spawn intent). */
  spawnHolder: () => Promise<number>;
  killHolder: () => Promise<void>;
  holderAlive: () => Promise<boolean>;
  /** The EXISTING setStatus rail (tray color + status:changed) — never a second channel. */
  setStatus: (status: Status) => void;
  /** Fires an Electron Notification, guarded by Notification.isSupported() (D-08). */
  notify: (kind: NotifyKind) => void;
  openDashboardWindow: () => Promise<void>;
  closeDashboard: () => void;
  getMainWindow: () => { focus: () => void } | null;
  navigateToSettings: () => void;
  openExternal: (url: string) => Promise<void>;
}

/** PID-reuse-safe holder liveness, wrapping holder.ts's own pidfile-read + tasklist check. */
async function defaultHolderAlive(): Promise<boolean> {
  const record = await realReadHolderRecord();
  if (!record) return false;
  return realIsPidAliveAsWsl(record.pid);
}

/** Guards every Notification construction with isSupported() — graceful no-op if
 * unavailable (D-08), never throws. */
function defaultNotify(kind: NotifyKind): void {
  if (!Notification.isSupported()) return;
  const { title, body } = NOTIFY_COPY[kind];
  new Notification({ title, body }).show();
}

const NOOP = (): void => {};
const ASYNC_NOOP = async (): Promise<void> => {};

/** Full, type-safe default EngineDeps — the "already real" collaborators get their
 * genuine implementation; the "doesn't exist yet this Wave" collaborators get a safe
 * no-op so a caller that forgets one degrades silently instead of throwing. */
const defaultDeps: EngineDeps = {
  readState: realReadState,
  patchState: realPatchState,
  execWsl: realExecWsl,
  isInstalledAndHealthy: () => realIsInstalledAndHealthy(),
  isInstallInFlight: realIsInstallInFlight,
  deriveAddress: () => realDeriveAddress(),
  spawnHolder: () => realAdoptOrSpawnHolder(),
  killHolder: () => realKillHolder(),
  holderAlive: defaultHolderAlive,
  setStatus: NOOP,
  notify: defaultNotify,
  openDashboardWindow: ASYNC_NOOP,
  closeDashboard: NOOP,
  getMainWindow: () => null,
  navigateToSettings: NOOP,
  openExternal: async () => {},
};

function resolveDeps(deps: Partial<EngineDeps>): EngineDeps {
  return { ...defaultDeps, ...deps };
}

// ---------------------------------------------------------------------------
// Desired-state lifecycle — start / stop / restart / getEngineStatus
// ---------------------------------------------------------------------------

/** Scoped livinity-only teardown — killHolder is best-effort; the scoped `--terminate`
 * call (never the whole-VM teardown flag, Pitfall 3) tears down the in-distro session
 * regardless of whether the holder kill succeeded. */
async function terminateLivinity(d: EngineDeps): Promise<void> {
  await d.killHolder();
  await d.execWsl(['--terminate', 'livinity']);
}

/** Boots the holder, runs the A2 self-heal safety net unconditionally (so a fresh boot
 * never leaves livinityd down waiting for the next heal cycle), then health-verifies. */
async function bootAndVerify(d: EngineDeps): Promise<boolean> {
  await d.spawnHolder();
  await d.execWsl(SELF_HEAL_ARGS);
  return d.isInstalledAndHealthy();
}

/**
 * STOP (D-03/TRAY-06). RESEARCH Pattern 3 ordering, copied verbatim: persist
 * `engineDesiredState: 'stopped'` FIRST — before any kill — so the very next
 * supervision tick (even one racing this call) sees 'stopped' before it ever
 * asks "is the holder alive?".
 */
export async function stopEngine(deps: Partial<EngineDeps> = {}): Promise<void> {
  const d = resolveDeps(deps);
  try {
    await d.patchState({ engineDesiredState: 'stopped' });
    await terminateLivinity(d);
    d.setStatus('stopped');
    d.closeDashboard();
  } catch {
    logSafe('engine.stop', { exception: true });
  }
}

/** START (D-03/TRAY-06). Persists 'running' FIRST, boots+verifies, then drives the
 * existing status rail — 'running' on success, 'error' if health never verifies. */
export async function startEngine(deps: Partial<EngineDeps> = {}): Promise<void> {
  const d = resolveDeps(deps);
  try {
    await d.patchState({ engineDesiredState: 'running' });
    const healthy = await bootAndVerify(d);
    d.setStatus(healthy ? 'running' : 'error');
  } catch {
    logSafe('engine.start', { exception: true });
  }
}

/** RESTART — stop-then-start MECHANICS scoped to livinity, WITHOUT flipping
 * `engineDesiredState` to 'stopped' at any point (stays 'running'; restart is only
 * reachable while the engine is already desired-running). */
export async function restartEngine(deps: Partial<EngineDeps> = {}): Promise<void> {
  const d = resolveDeps(deps);
  try {
    await terminateLivinity(d);
    const healthy = await bootAndVerify(d);
    d.setStatus(healthy ? 'running' : 'error');
  } catch {
    logSafe('engine.restart', { exception: true });
  }
}

/** `engine:getStatus` — secret-free by construction: {state, address, lastCheckedAt,
 * desiredState} only, matching EngineStatusResultSchema. `address` is deriveAddress's
 * non-secret public hostname. */
export async function getEngineStatus(deps: Partial<EngineDeps> = {}): Promise<EngineStatusResult> {
  const d = resolveDeps(deps);
  try {
    const st = await d.readState();
    const desiredState: 'running' | 'stopped' = st?.engineDesiredState ?? 'stopped';
    const [healthy, address] = await Promise.all([d.isInstalledAndHealthy(), d.deriveAddress()]);
    const state: Status = healthy ? 'running' : desiredState === 'stopped' ? 'stopped' : 'error';
    return { state, address, lastCheckedAt: Date.now(), desiredState };
  } catch {
    logSafe('engine.getStatus', { exception: true });
    return { state: 'error', address: null, lastCheckedAt: null, desiredState: 'stopped' };
  }
}

// ---------------------------------------------------------------------------
// Notifications — D-08 one-per-edge
// ---------------------------------------------------------------------------

/** Cross-call D-08 edge memory — per notify-edges.ts's own docstring, the pure decider
 * does not own this; the supervision loop (this module) is the single owner across ticks.
 * Optimistic default (assume healthy until an observation says otherwise) so a normal app
 * start/attach never fires a spurious first-tick notification. */
let prevHealthy = true;

/** Test-only reset — production (startSupervision) never resets this; the whole point is
 * that it persists for the app's lifetime so a genuine edge is only ever reported once. */
export function __resetHealthMemoryForTests(): void {
  prevHealthy = true;
}

/** Decides + fires (if non-null) via `decideNotification`, then advances the memory to
 * `nowHealthy` regardless of whether a notification fired. */
function applyNotifyDecision(d: EngineDeps, prevHealthyArg: boolean, nowHealthy: boolean, repaired: boolean): void {
  const kind = decideNotification(prevHealthyArg, nowHealthy, repaired);
  prevHealthy = nowHealthy;
  if (!kind) return;
  try {
    d.notify(kind);
  } catch {
    // Notification unsupported / a throwing collaborator — graceful no-op (D-08).
  }
}

function concludeNotify(d: EngineDeps, nowHealthy: boolean, repaired: boolean): void {
  applyNotifyDecision(d, prevHealthy, nowHealthy, repaired);
}

// ---------------------------------------------------------------------------
// runHealthPass — D-06 self-heal, shared by supervisionTick's 'heal' outcome AND the
// resume/unlock onWake handler (ONE health pass per real wake event).
// ---------------------------------------------------------------------------

export async function runHealthPass(deps: Partial<EngineDeps> = {}): Promise<void> {
  const d = resolveDeps(deps);
  try {
    // CR-01: the SAME two first-line gates supervisionTick enforces. This
    // function has a SECOND production entry point (the resume/unlock onWake
    // handler, index.ts) that must never restart a deliberately-STOPPED
    // engine on laptop wake (D-03: stopped stays stopped -- the probe itself
    // BOOTS a terminated distro) nor interleave a systemctl restart with a
    // live install.sh run (IN-06). Harmlessly redundant when the tick's
    // 'heal' branch calls in (its gates already passed an instant ago).
    if (d.isInstallInFlight()) return;
    const st = await d.readState();
    if (st?.engineDesiredState !== 'running') return;
    let healthy = await d.isInstalledAndHealthy();
    let repaired = false;
    if (!healthy) {
      await d.execWsl(SELF_HEAL_ARGS); // D-06 — idempotent, non-destructive
      repaired = true;
      healthy = await d.isInstalledAndHealthy(); // re-probe
    }
    concludeNotify(d, healthy, repaired);
  } catch {
    logSafe('engine.healthPass', { exception: true });
  }
}

// ---------------------------------------------------------------------------
// supervisionTick — RESEARCH Pattern 3 respawn-gate + IN-06 install-gate
// ---------------------------------------------------------------------------

export async function supervisionTick(deps: Partial<EngineDeps> = {}): Promise<void> {
  const d = resolveDeps(deps);
  // IN-06 — literal first statement: never probe, never respawn, never heal while
  // install.sh is running. Zero further collaborator calls happen past this line.
  if (d.isInstallInFlight()) return;

  try {
    const st = await d.readState();
    const holderAlive = await d.holderAlive();
    // Cheap-first (mirrors connected-probe.ts's own discipline): only run the real
    // health probe when the holder is alive at all.
    const healthy = holderAlive ? await d.isInstalledAndHealthy() : false;
    const action = decideSupervisionAction({
      installInFlight: false,
      desiredState: st?.engineDesiredState,
      holderAlive,
      healthy,
    });

    switch (action) {
      case 'skip':
      case 'noop':
        return;
      case 'respawn': {
        await d.spawnHolder();
        const postHealthy = await d.isInstalledAndHealthy().catch(() => false);
        // A dead holder is direct, certain evidence the engine was NOT healthy an
        // instant ago — feed that certainty rather than possibly-stale cross-tick
        // memory. A respawn IS an active repair (notify-edges.ts's own "respawn/
        // self-heal" definition of `repaired`).
        applyNotifyDecision(d, false, postHealthy, true);
        return;
      }
      case 'heal':
        await runHealthPass(d);
        return;
      case 'ok':
        concludeNotify(d, true, false);
        return;
    }
  } catch {
    logSafe('engine.tick', { exception: true });
  }
}

// ---------------------------------------------------------------------------
// startSupervision — the periodic timer, never overlapping ticks
// ---------------------------------------------------------------------------

let tickInFlight = false;

/** Starts the periodic supervision timer; returns a `stop()` that clears the interval.
 * A re-entrancy guard (mirrors flow.ts's module-level `inFlight`) ensures a slow tick can
 * never overlap the next interval firing. */
export function startSupervision(
  deps: Partial<EngineDeps> = {},
  opts: { intervalMs?: number } = {}
): { stop: () => void } {
  const intervalMs = opts.intervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  const timer = setInterval(() => {
    if (tickInFlight) return;
    tickInFlight = true;
    void supervisionTick(deps).finally(() => {
      tickInFlight = false;
    });
  }, intervalMs);
  return {
    stop: () => clearInterval(timer),
  };
}

// ---------------------------------------------------------------------------
// openDashboardGated / openInBrowserGated — D-10 stopped-gate
// ---------------------------------------------------------------------------

/** D-10: while the engine is not desired-running, focus the main window + navigate to
 * Settings rather than open a doomed connection (no dead localhost:8080 tab/window). */
async function focusSettingsInstead(d: EngineDeps): Promise<void> {
  d.getMainWindow()?.focus();
  d.navigateToSettings();
}

/** Tray/Settings/LiveSuccess "Open dashboard" — gated on desiredState; opening the real
 * sandboxed BrowserWindow (probe-then-open) is 06-08's job, injected here as
 * `openDashboardWindow`. */
export async function openDashboardGated(deps: Partial<EngineDeps> = {}): Promise<void> {
  const d = resolveDeps(deps);
  try {
    const st = await d.readState();
    const desiredState = st?.engineDesiredState ?? 'stopped';
    if (desiredState !== 'running') {
      await focusSettingsInstead(d);
      return;
    }
    await d.openDashboardWindow();
  } catch {
    logSafe('engine.openDashboard', { exception: true });
  }
}

/** Tray/Settings/LiveSuccess "Open in browser" (D-10) — same stopped-gate, then derives
 * the address MAIN-SIDE (never a renderer-supplied URL) and opens it in the system
 * browser (mirrors flow.ts's flowOpenBox pattern). */
export async function openInBrowserGated(deps: Partial<EngineDeps> = {}): Promise<void> {
  const d = resolveDeps(deps);
  try {
    const st = await d.readState();
    const desiredState = st?.engineDesiredState ?? 'stopped';
    if (desiredState !== 'running') {
      await focusSettingsInstead(d);
      return;
    }
    const address = await d.deriveAddress();
    if (!address) return;
    await d.openExternal(`https://${address}/`);
  } catch {
    logSafe('engine.openInBrowser', { exception: true });
  }
}
