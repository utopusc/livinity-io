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
 */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createTray, updateTrayStatus } from './tray/tray-controller';
import { registerShellIpc } from './ipc/shell.ipc';
import { registerAuthIpc } from './ipc/auth.ipc';
import { registerCfIpc } from './ipc/cf.ipc';
import { logSafe, redactSecretLike } from './log';
import { CHANNELS, type Status } from '../../shared/ipc-contract';

let mainWindow: BrowserWindow | null = null;
let tray: ReturnType<typeof createTray> | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development';

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 420,
    minHeight: 500,
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
    // __dirname-relative dot-dot chain -- the compiled output depth
    // (dist/main/src/main/, per tsconfig.main.json's rootDir: ".") makes a
    // literal relative chain fragile to get right, exactly as
    // writeSpikeMainPid's own comment below already warns against for this
    // same reason.
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
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

    tray = createTray({
      onOpen: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
      onQuit: handleQuit,
    });

    registerShellIpc({
      getMainWindow,
      setStatus: (status: Status) => {
        if (tray) {
          updateTrayStatus(
            tray,
            status,
            () => {
              mainWindow?.show();
              mainWindow?.focus();
            },
            handleQuit
          );
        }
        mainWindow?.webContents.send(CHANNELS.statusChanged, status);
      },
      onQuit: handleQuit,
    });

    registerAuthIpc({ getMainWindow });

    // CF (Free/BYOD) wizard IPC (Phase 3). getMainWindow is passed so the
    // cf:provision handler can forward cf:provisionUpdate progress pushes to the
    // renderer (mirrors registerAuthIpc's device-login push). The 6 cf:* invoke
    // handlers are inert until the byod-wizard sub-router calls them.
    registerCfIpc({ getMainWindow });

    logSafe('app.ready', {});
  });

  // TODO(phase-6): auto-start-at-login attaches here (app.setLoginItemSettings)
}
