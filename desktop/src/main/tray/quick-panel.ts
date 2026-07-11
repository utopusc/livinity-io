/**
 * src/main/tray/quick-panel.ts
 *
 * The tray's LEFT-CLICK compact management popover (tray-panel addendum,
 * post-Phase-7): a singleton frameless, always-on-top BrowserWindow
 * (~340x420) anchored bottom-right of the PRIMARY display's work area
 * (`screen.getPrimaryDisplay().workArea`, 12px margins) -- deliberately NOT
 * `tray.getBounds()` (flaky on Win11). Mirrors
 * `dashboard/dashboard-window.ts`'s deps-injected fake-window test pattern:
 * every collaborator (the `BrowserWindow` factory, the work-area getter,
 * dev/prod URL resolution) is injected via `Partial<QuickPanelDeps>`, so
 * `toggleQuickPanel`'s decision logic is unit-testable against a fake
 * `QuickPanelWinLike` with ZERO real `BrowserWindow` ever instantiated in
 * tests.
 *
 * `webPreferences` is IDENTICAL to the main window's own
 * (`src/main/index.ts`'s `createWindow`): same preload, `contextIsolation:
 * true`, `sandbox: true`, `nodeIntegration: false` -- this window is a full
 * `window.api`-reachable renderer surface (unlike the embedded dashboard
 * window, 06-08, which deliberately omits `preload` entirely for zero IPC
 * reach). Loads the SAME renderer entry as the main window with a
 * `#quick-panel` hash (dev: `${devUrl}/#quick-panel`; prod:
 * `loadFile(indexPath, { hash: 'quick-panel' })`) -- App.tsx's early hash
 * branch renders ONLY `QuickPanel.tsx` on that route.
 *
 * `toggleQuickPanel()`: visible -> `hide()`; hidden/none -> create-or-show +
 * reposition + focus. Hides (never closes) on the window's own `'blur'`
 * event, so re-opening is a fast `show()` rather than a full reload.
 */

import { BrowserWindow, app, screen } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';

/**
 * The minimal BrowserWindow surface this module needs -- kept as an
 * interface so tests can drive a fake window without a real Electron
 * BrowserWindow (never instantiated in CI, mirrors DashboardWinLike).
 */
export interface QuickPanelWinLike {
  loadURL(url: string): Promise<void>;
  loadFile(filePath: string, options?: { hash?: string }): Promise<void>;
  isDestroyed(): boolean;
  isVisible(): boolean;
  show(): void;
  hide(): void;
  focus(): void;
  close(): void;
  setPosition(x: number, y: number): void;
  on(event: 'blur' | 'closed', cb: () => void): void;
}

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuickPanelDeps {
  createWindow: (options: BrowserWindowConstructorOptions) => QuickPanelWinLike;
  isDev: boolean;
  devUrl: string;
  indexPath: string;
  preloadPath: string;
  getWorkArea: () => WorkArea;
}

export const PANEL_WIDTH = 340;
export const PANEL_HEIGHT = 420;
const MARGIN = 12;
const DEFAULT_DEV_URL = 'http://localhost:5173';

function defaultIndexPath(): string {
  return path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');
}

/**
 * WR-04 discipline (`dashboard-window.ts`'s `defaultInterstitialPath`
 * precedent): `app.getAppPath()`-based, never a `__dirname`-relative
 * dot-dot chain -- this module lives one directory deeper than `index.ts`
 * (`src/main/tray/` vs. `src/main/`), so a literal `'../preload/...'` chain
 * copied verbatim from `index.ts` would resolve to the WRONG depth.
 */
function defaultPreloadPath(): string {
  return path.join(app.getAppPath(), 'dist', 'main', 'src', 'preload', 'shell-preload.js');
}

function resolveDeps(deps: Partial<QuickPanelDeps>): QuickPanelDeps {
  return {
    createWindow:
      deps.createWindow ?? ((options) => new BrowserWindow(options) as unknown as QuickPanelWinLike),
    isDev: deps.isDev ?? process.env.NODE_ENV === 'development',
    devUrl: deps.devUrl ?? DEFAULT_DEV_URL,
    indexPath: deps.indexPath ?? defaultIndexPath(),
    preloadPath: deps.preloadPath ?? defaultPreloadPath(),
    getWorkArea: deps.getWorkArea ?? (() => screen.getPrimaryDisplay().workArea),
  };
}

/** Bottom-right of the given work area, 12px margins (NOT tray.getBounds() -- flaky on Win11). */
export function computePanelPosition(workArea: WorkArea): { x: number; y: number } {
  return {
    x: Math.round(workArea.x + workArea.width - PANEL_WIDTH - MARGIN),
    y: Math.round(workArea.y + workArea.height - PANEL_HEIGHT - MARGIN),
  };
}

let panelWindow: QuickPanelWinLike | null = null;

/** Returns the current quick-panel window instance, or null if none is open. */
export function getQuickPanelWindow(): QuickPanelWinLike | null {
  return panelWindow && !panelWindow.isDestroyed() ? panelWindow : null;
}

/** Test-only reset of the module-level window reference between test cases. */
export function __resetQuickPanelForTests(): void {
  panelWindow = null;
}

async function createPanelWindow(deps: QuickPanelDeps): Promise<QuickPanelWinLike> {
  const { x, y } = computePanelPosition(deps.getWorkArea());

  const win = deps.createWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    x,
    y,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    frame: false,
    backgroundColor: '#050507',
    webPreferences: {
      preload: deps.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.on('blur', () => {
    if (!win.isDestroyed() && win.isVisible()) win.hide();
  });
  win.on('closed', () => {
    if (panelWindow === win) panelWindow = null;
  });

  if (deps.isDev) {
    await win.loadURL(`${deps.devUrl}/#quick-panel`);
  } else {
    await win.loadFile(deps.indexPath, { hash: 'quick-panel' });
  }

  return win;
}

/**
 * The tray's left-click handler. visible -> `hide()`; hidden -> reposition
 * (the work area may have changed, e.g. multi-monitor/DPI) + `show()` +
 * `focus()`; no window yet -> create it, then `show()` + `focus()`.
 */
export async function toggleQuickPanel(depsIn: Partial<QuickPanelDeps> = {}): Promise<void> {
  const deps = resolveDeps(depsIn);
  const existing = getQuickPanelWindow();

  if (existing) {
    if (existing.isVisible()) {
      existing.hide();
      return;
    }
    const { x, y } = computePanelPosition(deps.getWorkArea());
    existing.setPosition(x, y);
    existing.show();
    existing.focus();
    return;
  }

  const win = await createPanelWindow(deps);
  panelWindow = win;
  win.show();
  win.focus();
}
