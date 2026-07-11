/**
 * src/main/index.ts
 *
 * Electron main-process entrypoint. Owns:
 *  - single-instance lock + focus-existing-window on a second launch (SHELL-01)
 *  - sandboxed window creation (contextIsolation + sandbox + nodeIntegration:false)
 *  - close-to-tray gated by an explicit `isQuitting` flag (SHELL-03) — NOT the
 *    business-state connection guard agent-app uses
 *  - the dev-only spike/electron-main.pid write that Plan 04's run-spike.ps1
 *    reads to taskkill the exact Electron main process
 *  - Phase 6 (06-11): auto-start-at-login (syncLoginItem), the powerMonitor
 *    resume/unlock self-heal (wirePowerEvents -> runHealthPass), the live
 *    `engine:*` IPC boundary (registerEngineIpc), the extended 9-row tray
 *    (TrayViewState driven off getEngineStatus/getStartAtLogin), the periodic
 *    supervision timer (startSupervision), and engine auto-bring-up on launch
 *    honoring the persisted `engineDesiredState` (TRAY-01..06/DASH-01..03).
 *    NO will-quit/process-exit holder cleanup is added anywhere in this file
 *    (D-04) — the detached holder outlives app.quit(); only the in-process
 *    supervision interval stops when the process itself exits.
 */

import { app, BrowserWindow, shell, Notification, powerMonitor } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {
  createTray,
  updateTray,
  statusToLabel,
  type TrayCallbacks,
  type TrayViewState,
} from './tray/tray-controller';
import { registerShellIpc } from './ipc/shell.ipc';
import { registerAuthIpc } from './ipc/auth.ipc';
import { registerCfIpc } from './ipc/cf.ipc';
import { registerWslIpc } from './ipc/wsl.ipc';
import { registerFlowIpc } from './ipc/flow.ipc';
import { registerEngineIpc } from './ipc/engine.ipc';
import { registerUpdateIpc } from './ipc/update.ipc';
import { registerSupportIpc } from './ipc/support.ipc';
import {
  startEngine,
  stopEngine,
  restartEngine,
  getEngineStatus,
  openDashboardGated,
  openInBrowserGated,
  runHealthPass,
  startSupervision,
  requestRestartToUpdate,
  type EngineDeps,
} from './supervision/engine';
import { syncLoginItem, setStartAtLogin, getStartAtLogin } from './supervision/login-item';
import { decideAutoBringUp } from './supervision/decide-supervision';
import { wirePowerEvents } from './supervision/power-events';
import { openDashboardWindow, closeDashboardWindow } from './dashboard/dashboard-window';
import { readState, patchState } from './storage/state-store';
import { initUpdater, getUpdateState, restartToUpdate } from './update/updater';
import { isInstallInFlight } from './wsl/install-invoke';
import { logSafe, redactSecretLike } from './log';
import { CHANNELS, ENGINE_TRANSITION_LABELS, type Status } from '../../shared/ipc-contract';

let mainWindow: BrowserWindow | null = null;
let tray: ReturnType<typeof createTray> | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development';

// D-04 (hidden auto-resume): a login-triggered `openAtLogin --hidden` launch
// (armed by wsl:enable/wsl:restartNow, 04-09) must stay in the tray until the
// WSL sub-router explicitly needs focus for a user-facing step -- never
// showing the window on this path is what makes the resume feel invisible
// rather than a surprise window popping up mid-boot.
const startHidden = process.argv.includes('--hidden');

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    // D-18 (setup canvas): grown from the 480x680 tray window to the roomier
    // 900x720 setup canvas (min 720x600) that hosts the whole login/CF/WSL
    // wizard -- a BrowserWindow options-object edit only, per PATTERNS.md
    // Section H. Everything else in this options object (frame,
    // backgroundColor, show, webPreferences) is unchanged from Phase 1.
    width: 900,
    height: 720,
    minWidth: 720,
    minHeight: 600,
    center: true,
    frame: false,
    backgroundColor: '#050507',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/shell-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // DIAGNOSTICS (hardening): a preload script that throws an unhandled
  // exception aborts silently from the user's perspective — the renderer
  // loads, window.api is never exposed, and React throws on its first
  // window.api.* call, producing a blank/white window with no visible error.
  // Wiring these two webContents events to logSafe makes that failure mode
  // diagnosable from userData/logs/main.log instead of a mystery white
  // screen (this is exactly how the zod-in-sandboxed-preload bug below was
  // confirmed).
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    logSafe('preload.error', { preloadPath, message: String(error?.message ?? error) });
  });

  mainWindow.webContents.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 'warning') {
      // WR-03: `details.message` is an arbitrary renderer-supplied string --
      // it passes logSafe's scalar-only type guard but its CONTENT is not
      // scrutinized. Scrub it through redactSecretLike before it ever reaches
      // disk, so a future `console.error(token)` doesn't write a secret to
      // userData/logs/main.log in plaintext.
      logSafe('renderer.console', {
        level: details.level,
        message: redactSecretLike(details.message),
        sourceId: details.sourceId,
        lineNumber: details.lineNumber,
      });
    }
  });

  // WR-05: if the renderer's Chromium process crashes or hangs, mainWindow
  // was previously left dead/blank with no self-healing path short of the
  // user manually quitting from the tray and relaunching. `reload()` recovers
  // a crashed renderer in place; capped at 3 attempts so a genuine crash loop
  // logs and gives up instead of spinning forever. 'clean-exit' is a normal
  // exit (not a crash), so it is logged but never triggers a reload.
  let rendererCrashCount = 0;
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logSafe('renderer.crashed', { reason: details.reason });
    if (details.reason === 'clean-exit') return;
    rendererCrashCount += 1;
    if (rendererCrashCount <= 3) {
      mainWindow?.reload();
    } else {
      logSafe('renderer.crashed.give-up', { count: rendererCrashCount });
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    logSafe('renderer.unresponsive', {});
  });

  mainWindow.webContents.on('responsive', () => {
    logSafe('renderer.responsive', {});
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // WR-04: use app.getAppPath() (the project/app root) rather than a
    // __dirname-relative dot-dot chain — the compiled output depth
    // (dist/main/src/main/, per tsconfig.main.json's rootDir: ".") makes a
    // literal relative chain fragile to get right, exactly as
    // writeSpikeMainPid's own comment below already warns against for this
    // same reason.
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    // D-04: a --hidden resume (post-reboot auto-launch) stays in the tray --
    // the WSL sub-router requests focus itself (via the tray's existing
    // onOpen / getMainWindow) only when a user-facing step is actually due.
    if (!startHidden) {
      mainWindow?.show();
    }
  });

  // CLOSE-TO-TRAY (SHELL-03, corrected vs. agent-app's business-state connection
  // guard): hide instead of closing, unless a real quit was requested.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * DEV-ONLY (!app.isPackaged): writes the main process PID to
 * spike/electron-main.pid so Plan 04's run-spike.ps1 can taskkill the exact
 * Electron main process. Uses `app.getAppPath()` (the project root in dev)
 * rather than a `__dirname`-relative dot-dot chain, since the actual compiled
 * output depth (dist/main/src/main/, per Plan 01's `rootDir: "."` decision)
 * makes a literal relative chain fragile to get right. Never runs in a
 * packaged build — spike/ is also excluded from the packaged files list
 * (electron-builder.yml's spike exclusion glob), and this write is gated
 * regardless.
 */
function writeSpikeMainPid(): void {
  if (app.isPackaged) return;
  try {
    const spikeDir = path.join(app.getAppPath(), 'spike');
    fs.mkdirSync(spikeDir, { recursive: true });
    fs.writeFileSync(path.join(spikeDir, 'electron-main.pid'), String(process.pid));
    logSafe('spike.main-pid.written', { pid: process.pid });
  } catch (e) {
    logSafe('spike.main-pid.write-failed', { err: String(e) });
  }
}

function handleQuit(): void {
  isQuitting = true;
  app.quit();
}

// ---------------------------------------------------------------------------
// Phase 6 (06-11): tray view-model + engine wiring
// ---------------------------------------------------------------------------

function focusMainWindow(): void {
  mainWindow?.show();
  mainWindow?.focus();
}

/** main -> renderer push (mirrors engine.ipc.ts's own navigateToSettings helper) --
 * the tray "Settings" row below does its own show()+focus()+send (per plan interface),
 * this minimal variant is what the D-10 stopped-gate (openDashboardGated/
 * openInBrowserGated, engine.ts) drives after it has already focused the window. */
function navigateToSettings(): void {
  mainWindow?.webContents.send(CHANNELS.engineNavigate, { screen: 'settings' });
}

let lastStatus: Status = 'stopped';
let engineTransition: 'starting' | 'stopping' | 'restarting' | null = null;

function setStatus(status: Status): void {
  lastStatus = status;
  void refreshTrayView(status);
  mainWindow?.webContents.send(CHANNELS.statusChanged, status);
}

// The 6 collaborators engine.ts's own defaultDeps has NO real production
// default for (mirrors engine.ipc.ts's identical construction, 06-10) --
// every other EngineDeps field (state-store/wsl-exec/connected-probe/
// holder.ts/Notification) already resolves to its genuine default inside
// engine.ts, so this file never re-wires them.
const engineDeps: Partial<EngineDeps> = {
  setStatus,
  getMainWindow,
  navigateToSettings,
  openDashboardWindow,
  closeDashboard: closeDashboardWindow,
  openExternal: (url: string) => shell.openExternal(url),
};

/** Pure-ish D-07 view-model builder: current icon Status + a live getEngineStatus()/
 * getStartAtLogin() read. Any in-flight transition label comes from the SAME
 * ENGINE_TRANSITION_LABELS const settings-flow.ts (06-04) imports -- the tray and
 * Settings screen can never drift (INFO-4). UPD-01 (07-11): updateReadyVersion/
 * updateBlocked are read LIVE from getUpdateState() on every build -- never a
 * stale cached value, matching W2's live-installBlocked discipline. */
async function buildTrayView(status: Status): Promise<TrayViewState> {
  const [engineStatus, startAtLoginChecked] = await Promise.all([
    getEngineStatus(engineDeps),
    getStartAtLogin(),
  ]);
  const updateState = getUpdateState();
  return {
    status,
    statusText: engineTransition ? ENGINE_TRANSITION_LABELS[engineTransition] : statusToLabel(status),
    engineRunning: engineStatus.desiredState === 'running',
    startAtLoginChecked,
    actionsDisabled: engineTransition !== null,
    updateReadyVersion: updateState.state === 'ready' ? updateState.readyVersion : null,
    updateBlocked: updateState.installBlocked,
  };
}

async function refreshTrayView(status: Status): Promise<void> {
  if (!tray) return;
  const view = await buildTrayView(status);
  updateTray(tray, view, trayCallbacks);
}

/** Sets the in-flight transition BEFORE the action runs (so the tray shows
 * "Starting…"/"Stopping…"/"Restarting…" immediately), runs the SAME engine.ts
 * function the IPC handlers call, then clears the transition and refreshes
 * again regardless of outcome. */
async function runEngineTransition(
  kind: 'starting' | 'stopping' | 'restarting',
  action: () => Promise<void>
): Promise<void> {
  engineTransition = kind;
  await refreshTrayView(lastStatus);
  try {
    await action();
  } finally {
    engineTransition = null;
    await refreshTrayView(lastStatus);
  }
}

async function handleToggleEngine(): Promise<void> {
  const st = await getEngineStatus(engineDeps);
  if (st.desiredState === 'running') {
    await runEngineTransition('stopping', () => stopEngine(engineDeps));
  } else {
    await runEngineTransition('starting', () => startEngine(engineDeps));
  }
}

async function handleRestart(): Promise<void> {
  await runEngineTransition('restarting', () => restartEngine(engineDeps));
}

async function handleToggleStartAtLogin(): Promise<void> {
  const enabled = await getStartAtLogin();
  await setStartAtLogin(!enabled);
  await refreshTrayView(lastStatus);
}

/** TRAY-01 engine auto-bring-up: runs on EVERY launch (incl. --hidden). A
 * persisted `engineDesiredState: 'stopped'` does NOTHING (honors the user's own
 * STOP -- never silently starts an engine they explicitly stopped). WR-08: on a
 * machine with NO install evidence (fresh state: desiredState never persisted
 * AND no post-install flowStep) it also does nothing -- a first launch must not
 * paint a red "Error" tray, persist 'running' pre-install, or churn a doomed
 * holder respawn every 45s through the login/CF/WSL wizard. The decision lives
 * in the pure `decideAutoBringUp` (decide-supervision.ts), never inline here. */
async function bringUpEngineOnLaunch(): Promise<void> {
  const st = await readState();
  const decision = decideAutoBringUp({
    engineDesiredState: st?.engineDesiredState,
    flowStep: st?.flowStep,
  });
  if (decision !== 'start') {
    logSafe('engine.autoBringUp', { skipped: true, decision });
    return;
  }
  await startEngine(engineDeps);
}

const trayCallbacks: TrayCallbacks = {
  onOpen: focusMainWindow,
  onOpenDashboard: () => void openDashboardGated(engineDeps),
  onOpenInBrowser: () => void openInBrowserGated(engineDeps),
  onToggleEngine: () => void handleToggleEngine(),
  onRestart: () => void handleRestart(),
  onToggleStartAtLogin: () => void handleToggleStartAtLogin(),
  onOpenSettings: () => {
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.send(CHANNELS.engineNavigate, { screen: 'settings' });
  },
  // UPD-01 (07-11): the tray's conditional "Restart to update" row calls the
  // SAME requestRestartToUpdate the Settings CTA reaches via
  // update:restartToInstall (update.ipc.ts) -- one action, two triggers.
  // quitAndInstall is explicitly updater.ts's restartToUpdate (Q1.3: always
  // quitAndInstall(true, true)), mirroring update.ipc.ts's own explicit call.
  onRestartToUpdate: () => {
    void requestRestartToUpdate({ quitAndInstall: restartToUpdate });
  },
  onQuit: handleQuit,
};

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  // SINGLE-INSTANCE FOCUS (SHELL-01): a second launch focuses this window
  // instead of spawning a second privileged process with its own vault handles.
  app.on('second-instance', () => {
    const w = getMainWindow();
    if (w) {
      if (w.isMinimized()) w.restore();
      if (!w.isVisible()) w.show();
      w.focus();
    }
  });

  // Fires for every quit path (tray Quit, app.quit() elsewhere,
  // electron-updater's quitAndInstall(), OS session end) — the close handler
  // above must never fight a legitimate quit triggered from a different path.
  app.on('before-quit', () => {
    isQuitting = true;
  });

  // Tray app: intentionally do NOT quit on Windows when all windows close.
  app.on('window-all-closed', () => {
    // no-op by design
  });

  app.whenReady().then(() => {
    createWindow();
    writeSpikeMainPid();

    // Pitfall 6: unconditional, idempotent -- required for Windows Action
    // Center notifications (engine.ts's `notify`) to be attributed to this
    // app rather than a generic Electron identity.
    app.setAppUserModelId('io.livinity.desktop');

    tray = createTray(trayCallbacks);

    // IN-05: seed the tray's row set once immediately after creation -- the
    // row set (including any conditional Restart-to-update row) is truthful
    // from the very first menu open, not just after the first status/update
    // event arrives.
    void refreshTrayView(lastStatus);

    registerShellIpc({
      getMainWindow,
      setStatus,
      onQuit: handleQuit,
    });

    registerAuthIpc({ getMainWindow });

    // CF (Free/BYOD) wizard IPC (Phase 3). getMainWindow is passed so the
    // cf:provision handler can forward cf:provisionUpdate progress pushes to the
    // renderer (mirrors registerAuthIpc's device-login push). The 6 cf:* invoke
    // handlers are inert until the byod-wizard sub-router calls them.
    registerCfIpc({ getMainWindow });

    // WSL2 provisioning IPC (Phase 4). getMainWindow lets wsl:distroInstall/
    // wsl:installInvoke forward progress pushes; inert until the App WSL
    // sub-router calls them.
    registerWslIpc({ getMainWindow });

    // Install orchestration IPC (Phase 5). No deps -- there is no flow:*Update
    // push channel (05-08); window.api.flow* is now LIVE, reachable from the
    // App-level seams wired in 05-09.
    registerFlowIpc();

    // Tray supervision + embedded dashboard IPC (Phase 6, 06-10). The SAME
    // getMainWindow/setStatus closures registerShellIpc already uses --
    // window.api.engine* is now LIVE end-to-end.
    registerEngineIpc({ getMainWindow, setStatus });

    // UPD-01/SUP-01/SUP-02 (07-11): update.ipc.ts/support.ipc.ts wiring.
    // registerUpdateIpc is called FIRST so its returned pushUpdateStatus is
    // available to inject as initUpdater's pushStatus dep (I5) -- this is the
    // ONE place CHANNELS.updateStatus is ever sent; index.ts itself never
    // raw-sends it.
    const { pushUpdateStatus } = registerUpdateIpc({ getMainWindow });

    // initUpdater is isPackaged-gated INSIDE the function (Pitfall 5) -- an
    // unpackaged dev run never touches the real autoUpdater singleton, so
    // this call is always safe to make unconditionally here.
    initUpdater({
      isPackaged: () => app.isPackaged,
      isInstallInFlight, // W2: feeds UpdateUiState.installBlocked live
      readState,
      patchState,
      getVersion: () => app.getVersion(),
      // D-05: one notification per version, fired when the download is
      // READY. Clicking it focuses the main window and navigates to
      // Settings' ABOUT & UPDATES card (mirrors onOpenSettings' shape).
      notify: (version: string) => {
        if (!Notification.isSupported()) return;
        const n = new Notification({
          title: 'Update ready',
          body: `Update ready — restart Livinity Desktop when convenient. (v${version})`,
        });
        n.on('click', () => {
          mainWindow?.show();
          mainWindow?.focus();
          mainWindow?.webContents.send(CHANNELS.engineNavigate, { screen: 'settings' });
        });
        n.show();
      },
      pushStatus: pushUpdateStatus, // I5 -- the ipc helper, never a raw webContents.send here
      refreshTray: () => void refreshTrayView(lastStatus),
      scheduleChecks: (check: () => void) => {
        setTimeout(check, 3 * 60_000);
        setInterval(check, 6 * 60 * 60_000);
      },
      // Pitfall 3: disarm autoInstallOnAppQuit on Windows session-end (Windows
      // sign-out/shutdown fires the app 'quit' event too -- spawning the NSIS
      // installer mid-session-teardown corrupts installs). Belt-and-braces:
      // both the main window's 'session-end' and powerMonitor's 'shutdown'
      // wire the same disarm callback; a no-op registration on either is
      // harmless (RESEARCH Open Question 3).
      onSessionEnd: (disarm: () => void) => {
        mainWindow?.on('session-end', disarm);
        powerMonitor.on('shutdown', disarm);
      },
    });

    registerSupportIpc({ getMainWindow });

    // TRAY-01: reconciles the persisted startAtLogin preference with any
    // pending-reboot need (login-item.ts is the SOLE setLoginItemSettings
    // owner). Fire-and-forget -- app startup never blocks on this.
    void syncLoginItem();

    // TRAY-03: one debounced health pass per real resume/unlock-screen wake
    // event, driving the SAME runHealthPass (06-07) the supervision tick's
    // 'heal' outcome uses.
    wirePowerEvents(() => void runHealthPass(engineDeps));

    // TRAY-02: the periodic supervision timer. Intentionally never stopped
    // anywhere in this file (D-04) -- the interval simply stops existing when
    // the process itself exits; no will-quit/process.on('exit') cleanup is
    // ever added here.
    startSupervision(engineDeps, { intervalMs: 45_000 });

    // Engine auto-bring-up: honors the persisted desiredState (incl. a
    // --hidden login launch) -- a desired-stopped engine stays stopped.
    void bringUpEngineOnLaunch();

    logSafe('app.ready', {});
  });
}
