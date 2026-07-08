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
import { logSafe } from './log';
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
    backgroundColor: '#f8f9fc',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/shell-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../../renderer/index.html'));
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

    logSafe('app.ready', {});
  });

  // TODO(phase-6): auto-start-at-login attaches here (app.setLoginItemSettings)
}
