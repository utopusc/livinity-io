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
import type { MenuItemConstructorOptions } from 'electron';
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

/**
 * `onOpen`/`onQuit` are the two original Phase-1 callbacks and stay required
 * (the legacy `updateTrayStatus` shim below and its sole caller,
 * `src/main/index.ts`, only ever supply these two). The 6 D-07 callbacks
 * added in Phase 6 are optional — `createTray`'s real wiring (index.ts,
 * landing in 06-11) will always supply all 8, but keeping them optional here
 * means this additive change never breaks the still-untouched Phase-1 call
 * site's object-literal shape (that rewiring is explicitly 06-11's job, not
 * this plan's — see the module docstring / 06-05-PLAN.md).
 */
export interface TrayCallbacks {
  onOpen: () => void;
  onOpenDashboard?: () => void;
  onOpenInBrowser?: () => void;
  onToggleEngine?: () => void; // start OR stop; label is computed from TrayViewState.engineRunning
  onRestart?: () => void;
  onToggleStartAtLogin?: () => void;
  onOpenSettings?: () => void;
  /** UPD-01 (07-04) — the conditional "Restart to update" row's click handler. */
  onRestartToUpdate?: () => void;
  onQuit: () => void;
}

/** Single source-of-truth view-model driving both the icon and the D-07 9-row menu. */
export interface TrayViewState {
  status: Status; // drives icon color/tooltip (existing 4-value enum)
  statusText: string; // action-specific row/tooltip text ('Running'/'Starting…'/etc.)
  engineRunning: boolean; // 'Start engine' vs 'Stop engine' row label
  startAtLoginChecked: boolean;
  actionsDisabled: boolean; // true while any transition is in flight (disables toggle+restart)
  /** UPD-01 (07-04, additive) — non-null only once a download is ready; drives
   * the conditional "Restart to update (vX.Y.Z)" row (07-UI-SPEC.md §2). */
  updateReadyVersion?: string | null;
  /** D-06 install-gate mirror (UpdateUiState.installBlocked) — disables the row
   * without hiding it while install.sh is in flight. */
  updateBlocked?: boolean;
}

const NOOP = () => {};

/**
 * Pure D-07 9-row template builder (06-UI-SPEC "Tray menu (TRAY-04)" table):
 * Open Livinity / Open dashboard / Open in browser / (sep) / Status: {text}
 * (disabled) / (sep) / Start|Stop engine / Restart engine / (sep) / Start at
 * login (checkbox) / Settings / (sep) / Quit.
 *
 * UPD-01 (07-04, additive, 07-UI-SPEC.md §2): when `view.updateReadyVersion`
 * is non-null, a conditional "Restart to update (vX.Y.Z)" row is inserted in
 * the FINAL group, directly above Quit (reusing the existing separator — no
 * new one is added): `… / Settings / (sep) / Restart to update (vX.Y.Z) /
 * Quit`. `enabled: !view.updateBlocked` mirrors the D-06 install-gate without
 * hiding the row while install.sh is in flight.
 */
function buildContextMenu(view: TrayViewState, cbs: TrayCallbacks) {
  const template: MenuItemConstructorOptions[] = [
    { label: 'Open Livinity', click: cbs.onOpen },
    { label: 'Open dashboard', click: cbs.onOpenDashboard ?? NOOP },
    { label: 'Open in browser', click: cbs.onOpenInBrowser ?? NOOP },
    { type: 'separator' },
    { label: `Status: ${view.statusText}`, id: 'status', enabled: false },
    { type: 'separator' },
    {
      label: view.engineRunning ? 'Stop engine' : 'Start engine',
      click: cbs.onToggleEngine ?? NOOP,
      enabled: !view.actionsDisabled,
    },
    {
      label: 'Restart engine',
      click: cbs.onRestart ?? NOOP,
      enabled: !view.actionsDisabled,
    },
    { type: 'separator' },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: view.startAtLoginChecked,
      click: cbs.onToggleStartAtLogin ?? NOOP,
    },
    { label: 'Settings', click: cbs.onOpenSettings ?? NOOP },
    { type: 'separator' },
  ];
  if (view.updateReadyVersion != null) {
    template.push({
      label: `Restart to update (v${view.updateReadyVersion})`,
      enabled: !view.updateBlocked,
      click: cbs.onRestartToUpdate ?? NOOP,
    });
  }
  template.push({ label: 'Quit', click: cbs.onQuit });
  return Menu.buildFromTemplate(template);
}

/**
 * Builds the Tray with an initial 'stopped' view-model icon/tooltip/menu.
 * `onOpen`/`onQuit` are delegated to `opts` — index.ts owns the isQuitting
 * flag, this module only invokes the callback it was given.
 */
export function createTray(opts: TrayCallbacks): Tray {
  const initialView: TrayViewState = {
    status: 'stopped',
    statusText: statusToLabel('stopped'),
    engineRunning: false,
    startAtLoginChecked: false,
    actionsDisabled: false,
  };
  const icon = nativeImage.createFromBuffer(createTrayIcon(statusToColor(initialView.status)), {
    width: 16,
    height: 16,
  });
  const tray = new Tray(icon);
  tray.on('double-click', opts.onOpen);
  updateTray(tray, initialView, opts);
  return tray;
}

/** Swaps the tray icon color/tooltip/menu to reflect the new TrayViewState. */
export function updateTray(tray: Tray, view: TrayViewState, cbs: TrayCallbacks): void {
  tray.setImage(
    nativeImage.createFromBuffer(createTrayIcon(statusToColor(view.status)), { width: 16, height: 16 })
  );
  tray.setToolTip(`Livinity Desktop – ${view.statusText}`);
  tray.setContextMenu(buildContextMenu(view, cbs));
}

/**
 * @deprecated Thin legacy shim for `src/main/index.ts`'s Phase-1
 * `registerShellIpc.setStatus` call site (until 06-11 rewires it onto the
 * real `TrayViewState`) — builds a minimal default view from just `status`
 * and delegates to `updateTray`. Not removed here per 06-05-PLAN.md (avoids
 * a Wave-2/Wave-5 coupling with 06-11's index.ts rewrite).
 */
export function updateTrayStatus(
  tray: Tray,
  status: Status,
  onOpen: () => void,
  onQuit: () => void
): void {
  updateTray(
    tray,
    {
      status,
      statusText: statusToLabel(status),
      engineRunning: status === 'running',
      startAtLoginChecked: false,
      actionsDisabled: false,
    },
    { onOpen, onQuit }
  );
}
