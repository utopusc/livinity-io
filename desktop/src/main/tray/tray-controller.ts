/**
 * src/main/tray/tray-controller.ts
 *
 * 4-state color-swapping tray icon (installing/running/stopped/error) for
 * Phase 1's simulated status. `statusToColor`/`statusToLabel` are pure
 * functions so tests/tray-icon.test.ts unit-tests them without a running
 * Electron app; `createTrayIcon` is the pure PNG-buffer generator reused
 * verbatim from agent-app/src/main/index.ts (lines 92-118).
 *
 * Quit is delegated to the caller-provided `onQuit` callback — this module
 * never calls the app-quit API itself, keeping isQuitting-flag ownership
 * solely in src/main/index.ts (corrected vs. agent-app's bare quit call
 * inside its own Quit menu handler).
 */

import { Tray, Menu, nativeImage } from 'electron';
import type { Status } from '../../../shared/ipc-contract';

const COLORS: Record<Status, string> = {
  installing: '#eab308',
  running: '#22c55e',
  stopped: '#94a3b8',
  error: '#ef4444',
};

const LABELS: Record<Status, string> = {
  installing: 'Installing',
  running: 'Running',
  stopped: 'Stopped',
  error: 'Error',
};

export function statusToColor(status: Status): string {
  return COLORS[status];
}

export function statusToLabel(status: Status): string {
  return LABELS[status];
}

/**
 * Reused verbatim from agent-app/src/main/index.ts (lines 92-118) — a pure,
 * platform-agnostic radial-circle PNG buffer generator. Kept as a pure
 * function of `color` so it needs no Electron app context beyond
 * `nativeImage`, which is available in the main process at any time.
 */
export function createTrayIcon(color: string): Buffer {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const pixels = Buffer.alloc(16 * 16 * 4, 0);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * 16 + x) * 4;
      if (dist < 6) {
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = dist < 5 ? 255 : Math.round(255 * (6 - dist));
      }
    }
  }
  return nativeImage.createFromBuffer(
    nativeImage.createFromBitmap(pixels, { width: 16, height: 16 }).toPNG(),
    { width: 16, height: 16 }
  ).toPNG();
}

export interface TrayCallbacks {
  onOpen: () => void;
  onQuit: () => void;
}

function buildContextMenu(status: Status, cbs: TrayCallbacks) {
  return Menu.buildFromTemplate([
    { label: 'Open', click: cbs.onOpen },
    { type: 'separator' },
    { label: `Status: ${statusToLabel(status)}`, id: 'status', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: cbs.onQuit },
  ]);
}

/**
 * Builds the Tray with an initial 'stopped' icon, tooltip, and context menu.
 * `Open`/`Quit` are delegated to `opts` — index.ts owns the isQuitting flag,
 * this module only invokes the callback it was given.
 */
export function createTray(opts: TrayCallbacks): Tray {
  const initialStatus: Status = 'stopped';
  const icon = nativeImage.createFromBuffer(createTrayIcon(statusToColor(initialStatus)), {
    width: 16,
    height: 16,
  });
  const tray = new Tray(icon);
  tray.setToolTip('Livinity Desktop');
  tray.setContextMenu(buildContextMenu(initialStatus, opts));
  tray.on('double-click', opts.onOpen);
  return tray;
}

/** Swaps the tray icon color/tooltip/menu-label to reflect the new status. */
export function updateTrayStatus(
  tray: Tray,
  status: Status,
  onOpen: () => void,
  onQuit: () => void
): void {
  tray.setImage(
    nativeImage.createFromBuffer(createTrayIcon(statusToColor(status)), { width: 16, height: 16 })
  );
  tray.setToolTip(`Livinity Desktop - ${statusToLabel(status)}`);
  tray.setContextMenu(buildContextMenu(status, { onOpen, onQuit }));
}
