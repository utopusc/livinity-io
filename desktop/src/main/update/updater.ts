/**
 * src/main/update/updater.ts
 *
 * The impure `electron-updater` wrapper (UPD-01, D-04/D-05/D-06). Every
 * collaborator — including the `autoUpdater` surface itself — is injected via
 * `Partial<UpdaterDeps>`, so `tests/update/updater.test.ts` never loads the
 * real `electron-updater` package: `deps.updater` is a `MinimalUpdater` fake
 * emitter, and the real `autoUpdater` (the ONE real import in this file) is
 * cast to that same narrow interface at the injection boundary — assigning
 * the real, richly-typed `AppUpdater` instance directly to `MinimalUpdater`
 * would fight its generic `TypedEmitter` overloads; the boundary cast is the
 * deliberate narrowing point (mirrors `holder.ts`'s injectable-collaborator
 * discipline, applied to a third-party emitter instead of `child_process`).
 *
 * All BRANCHING lives in the pure `decide-update.ts` (07-02) — `nextStatus`
 * reduces every electron-updater event into `UpdateUiState`, `shouldNotify`
 * decides the D-05 once-per-version toast. This file only wires events to
 * those deciders and performs the actual IO (state read/write, notify, push,
 * tray refresh, quitAndInstall).
 *
 * Three CRITICAL correctness invariants live here:
 *
 * 1. Pitfall 5 (`isPackaged` gate, source-order enforced): `initUpdater`
 *    checks `!d.isPackaged()` as its FIRST branch and returns immediately —
 *    an unpackaged/dev run never touches the injected updater (no `.on`/
 *    config calls, no `scheduleChecks`/`onSessionEnd` registration).
 *    electron-updater throws on a dev build's absent feed config.
 * 2. Q1.3 (explicit silent + force-run args, never the no-arg call): the
 *    zero-argument invocation defaults to a non-silent run, which flashes
 *    the one-click installer UI and drops force-run semantics —
 *    `restartToUpdate` ALWAYS passes both explicit `true` args. A source-scan
 *    test (updater.test.ts) asserts the two-arg literal call and the absence
 *    of a zero-arg call.
 * 3. Q1.4 (never set the Authenticode publisher/signature-verification config
 *    keys): this file never touches those config keys — doing so while
 *    unsigned would fail every update with an invalid-signature error.
 *    `logger` is explicitly set to `null`; our own `logSafe` carries
 *    breadcrumbs instead.
 *
 * `notify`/`pushStatus`/`refreshTray`/`scheduleChecks`/`onSessionEnd` have NO
 * real production default in THIS module (mirrors `engine.ts`'s
 * `openDashboardWindow`/`getMainWindow`/etc. discipline) — 07-11's `index.ts`
 * always supplies the real webContents push, tray refresh, +3min/6h timers,
 * and the real Windows session-end event; a caller that omits one gets a
 * safe no-op default instead of a crash. `readState`/`patchState`/
 * `isInstallInFlight`/`isPackaged`/`getVersion` are already-real collaborators
 * (state-store.ts / install-invoke.ts / electron `app`), wired here directly.
 */

import { app } from 'electron';
import { autoUpdater as realAutoUpdater } from 'electron-updater';
import { readState as realReadState, patchState as realPatchState } from '../storage/state-store';
import { isInstallInFlight as realIsInstallInFlight } from '../wsl/install-invoke';
import { nextStatus, shouldNotify, type UpdaterEvent } from './decide-update';
import { logSafe } from '../log';
import type { UpdateUiState } from '../../../shared/ipc-contract';

/**
 * The minimal shape this module needs from `electron-updater`'s `autoUpdater`
 * (or a test-injected fake). Deliberately narrower than `AppUpdater`'s real
 * (generic, overloaded) typing — the real singleton is cast to this shape at
 * the ONE point it is read (`initUpdater`), never elsewhere.
 */
export interface MinimalUpdater {
  on(event: string, listener: (...args: unknown[]) => void): void;
  checkForUpdates(): unknown;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  logger: unknown;
}

export interface UpdaterDeps {
  isPackaged: () => boolean;
  /** W2/D-06: the source for `UpdateUiState.installBlocked` — read live on
   * every `getUpdateState()` call, never cached (a stale phantom "blocked"
   * note would be a lie to the user). */
  isInstallInFlight: () => boolean;
  readState: typeof realReadState;
  patchState: typeof realPatchState;
  getVersion: () => string;
  /** D-05 toast (+ eventual `.on('click')` focus/navigate wiring) — 07-11
   * supplies the fully-wired version; the default here is a safe no-op. */
  notify: (version: string) => void;
  /** `update:status` push — 07-07 wires the real `webContents.send`. */
  pushStatus: (s: UpdateUiState) => void;
  refreshTray: () => void;
  /** index.ts (07-11) supplies the +3min-after-ready then 6h cadence timers. */
  scheduleChecks: (check: () => void) => void;
  /** index.ts (07-11) wires the real Windows session-end event (Pitfall 3). */
  onSessionEnd: (disarm: () => void) => void;
  /** Injected fake in tests; defaults to the real `autoUpdater` (boundary-cast). */
  updater?: MinimalUpdater;
}

const NOOP = (): void => {};
const NOOP_NOTIFY = (_version: string): void => {};
const NOOP_PUSH_STATUS = (_s: UpdateUiState): void => {};
const NOOP_SCHEDULE = (_check: () => void): void => {};
const NOOP_SESSION_END = (_disarm: () => void): void => {};

const defaultDeps: Omit<UpdaterDeps, 'updater'> = {
  isPackaged: () => app.isPackaged,
  isInstallInFlight: realIsInstallInFlight,
  readState: realReadState,
  patchState: realPatchState,
  getVersion: () => app.getVersion(),
  notify: NOOP_NOTIFY,
  pushStatus: NOOP_PUSH_STATUS,
  refreshTray: NOOP,
  scheduleChecks: NOOP_SCHEDULE,
  onSessionEnd: NOOP_SESSION_END,
};

function resolveDeps(deps: Partial<UpdaterDeps>): UpdaterDeps {
  return { ...defaultDeps, ...deps };
}

const IDLE_STATE: UpdateUiState = {
  state: 'idle',
  readyVersion: null,
  currentVersion: '',
  installBlocked: false,
};

let resolvedDeps: UpdaterDeps | null = null;
let activeUpdater: MinimalUpdater | undefined;
let currentState: UpdateUiState = IDLE_STATE;

/** Reduces one electron-updater event through the pure `nextStatus` ladder,
 * then pushes the resulting (W2-live) state to the caller-supplied sink. */
function applyEvent(event: UpdaterEvent, d: UpdaterDeps): void {
  currentState = nextStatus(event, currentState);
  d.pushStatus(getUpdateState());
}

/** D-05 once-per-version notify-then-persist, followed by the same
 * nextStatus/pushStatus/refreshTray sequence every other event drives. */
async function handleDownloaded(version: string, d: UpdaterDeps): Promise<void> {
  currentState = nextStatus({ kind: 'downloaded', version }, currentState);
  try {
    const st = await d.readState();
    if (shouldNotify(version, st?.lastUpdateNotifiedVersion)) {
      d.notify(version);
      await d.patchState({ lastUpdateNotifiedVersion: version });
    }
  } catch {
    logSafe('update.downloaded', { exception: true });
  }
  d.refreshTray();
  d.pushStatus(getUpdateState());
}

/**
 * `isPackaged` gate FIRST (Pitfall 5), then D-04 config + event wiring.
 * Every subsequent call in this module (`checkForUpdates`/`restartToUpdate`/
 * `getUpdateState`) reads the deps/updater captured here — this is the one
 * entry point that establishes them.
 */
export function initUpdater(deps: Partial<UpdaterDeps> = {}): void {
  const d = resolveDeps(deps);
  resolvedDeps = d;
  currentState = {
    state: 'idle',
    readyVersion: null,
    currentVersion: d.getVersion(),
    installBlocked: d.isInstallInFlight(),
  };

  if (!d.isPackaged()) {
    // Pitfall 5 -- inert while unpackaged; the injected updater is never
    // touched (no .on/config calls), so a dev run can never throw on
    // electron-updater's absent feed config.
    currentState = { ...currentState, state: 'dev' };
    return;
  }

  const u = d.updater ?? (realAutoUpdater as unknown as MinimalUpdater);
  activeUpdater = u;

  // D-04 cadence/behavior. NEVER set the Authenticode publisher/signature-
  // verification config keys while unsigned (Q1.4) -- would fail every
  // update with an invalid-signature error. logger=null -- our own logSafe
  // carries breadcrumbs instead.
  u.autoDownload = true;
  u.autoInstallOnAppQuit = true;
  u.allowDowngrade = false;
  u.logger = null;

  u.on('checking-for-update', () => applyEvent({ kind: 'checking' }, d));
  u.on('update-available', () => applyEvent({ kind: 'available' }, d));
  u.on('download-progress', () => applyEvent({ kind: 'progress' }, d));
  u.on('update-not-available', () => applyEvent({ kind: 'up-to-date' }, d));
  u.on('error', () => applyEvent({ kind: 'error' }, d));
  u.on('update-downloaded', (info: unknown) =>
    handleDownloaded((info as { version: string }).version, d)
  );

  // Pitfall 3 -- disarm autoInstallOnAppQuit on Windows session-end (sign-out/
  // shutdown fires the app `quit` event too; spawning the NSIS installer
  // mid-session-teardown corrupts installs, electron-builder #7807).
  d.onSessionEnd(() => {
    u.autoInstallOnAppQuit = false;
  });

  d.scheduleChecks(() => checkForUpdates());
}

/** `update:getState` + `buildTrayView` source. `installBlocked` is ALWAYS
 * computed live from `isInstallInFlight()` (W2) -- never a cached/stale
 * value, so the install-gate CTA note is never a phantom field. */
export function getUpdateState(): UpdateUiState {
  const d = resolvedDeps ?? resolveDeps({});
  return { ...currentState, installBlocked: d.isInstallInFlight() };
}

/** Manual "Check for updates" trigger (and the target of `scheduleChecks`'
 * cadence timer). A no-op before `initUpdater` runs or while unpackaged.
 *
 * WR-01: electron-updater 6.8.9's `AppUpdater.checkForUpdates()` REJECTS its
 * returned promise on every failed check (it emits 'error' AND rethrows,
 * AppUpdater.js:269-273) — the 'error' event already drives the status rail
 * via the listener wired in `initUpdater`, but the rethrown rejection must be
 * consumed here or every offline poll (+3min, each 6h tick) produces an
 * UnhandledPromiseRejection in main. `Promise.resolve(...)` normalizes the
 * `unknown`-typed return so a fake/sync updater is equally safe. */
export function checkForUpdates(): void {
  if (!activeUpdater || currentState.state === 'dev') return;
  try {
    Promise.resolve(activeUpdater.checkForUpdates()).catch(() => {
      logSafe('update.check', { rejected: true });
    });
  } catch {
    logSafe('update.check', { exception: true });
  }
}

/** ALWAYS `quitAndInstall(true, true)` (Q1.3) -- NEVER the bare defaults. */
export function restartToUpdate(): void {
  if (!activeUpdater) return;
  activeUpdater.quitAndInstall(true, true);
}

/** Test-only module-state reset (holder.ts/engine.ts precedent). */
export function __resetUpdaterForTests(): void {
  resolvedDeps = null;
  activeUpdater = undefined;
  currentState = IDLE_STATE;
}
