/**
 * src/main/dashboard/dashboard-window.ts
 *
 * The DASH-01 sandboxed dashboard `BrowserWindow`: a SECOND window whose
 * `webPreferences` OMITS the `preload` key entirely (D-09/T-06-05 -- zero
 * IPC/secret reach by construction, not merely an empty preload file), a
 * main-side navigation allow-list (`isAllowedNavigation`/`decideDashboardOpen`,
 * 06-04's `decide-dashboard-nav.ts`, never re-implemented inline) that routes
 * every non-local-origin URL to the system browser, and a probe-then-open
 * sequence (`isInstalledAndHealthy`, `connected-probe.ts`, reused verbatim):
 * healthy -> `loadURL` the real address directly (no interstitial flash);
 * unhealthy -> `loadFile` the static interstitial, then poll in the
 * background and `loadURL`-swap once a later probe passes (RESEARCH
 * Pattern 6).
 *
 * Every collaborator -- the `BrowserWindow` factory itself, the health
 * probe, `shell.openExternal`, and the poll timing -- is injected via
 * `Partial<DashboardDeps>`, so this module's actual decision logic
 * (`wireNavigationGuard`/`probeThenOpen`) is unit-testable against a fake
 * `DashboardWinLike` with ZERO real `BrowserWindow` ever instantiated in
 * tests (mirrors `src/main/platform/oauth-window.ts`'s `OAuthWinLike`
 * discipline).
 *
 * D-17 (06-SECURITY NEW-02, T-07-13): the window's `webPreferences` also
 * carries `partition: DASH_PARTITION` (`'persist:dashboard'`), and that
 * partition's session gets a deny-all `setPermissionRequestHandler`
 * registered before the window is created -- a compromised box UI can never
 * obtain camera/mic/geolocation. The app's default (unnamed) session is
 * never referenced anywhere in this file, so the renderer's existing
 * clipboard-sanitized-write keeps working unchanged.
 */

import { BrowserWindow, app, shell, session } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { isInstalledAndHealthy as realIsInstalledAndHealthy } from '../orchestrator/connected-probe';
import { isAllowedNavigation, decideDashboardOpen, ALLOWED_ORIGIN } from './decide-dashboard-nav';

/** D-17: the dashboard window's OWN session partition -- distinct from the default
 * session, so a deny-all permission handler here never affects any other window. */
export const DASH_PARTITION = 'persist:dashboard';

/**
 * The minimal BrowserWindow surface this module needs -- kept as an
 * interface so tests can drive a fake window/webContents without a real
 * Electron BrowserWindow (never instantiated in CI).
 */
export interface DashboardWinLike {
  webContents: {
    on(
      event: 'will-navigate' | 'will-redirect',
      cb: (event: { preventDefault(): void }, url: string) => void
    ): void;
    on(
      event: 'will-frame-navigate',
      cb: (details: { url: string; isMainFrame: boolean; preventDefault(): void }) => void
    ): void;
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' | 'allow' }): void;
  };
  loadURL(url: string): Promise<void>;
  loadFile(filePath: string): Promise<void>;
  isDestroyed(): boolean;
  close(): void;
  focus(): void;
}

export interface DashboardDeps {
  createWindow: (options: BrowserWindowConstructorOptions) => DashboardWinLike;
  isInstalledAndHealthy: () => Promise<boolean>;
  openExternal: (url: string) => Promise<void> | void;
  sleep: (ms: number) => Promise<void>;
  pollIntervalMs: number;
  interstitialPath: string;
}

/** Background poll cadence once the interstitial is showing (Pattern 6). */
const DEFAULT_POLL_INTERVAL_MS = 2_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The interstitial's BUILT path (WR-04 `app.getAppPath()` discipline,
 * matching every other main-side static-asset resolution in this app).
 * `vite.config.ts`'s multi-page `rollupOptions.input` emits
 * `dashboard-loading.html` to exactly this location alongside `index.html`.
 */
function defaultInterstitialPath(): string {
  return path.join(app.getAppPath(), 'dist', 'renderer', 'dashboard-loading.html');
}

function resolveDeps(deps: Partial<DashboardDeps>): DashboardDeps {
  return {
    createWindow:
      deps.createWindow ?? ((options) => new BrowserWindow(options) as unknown as DashboardWinLike),
    isInstalledAndHealthy: deps.isInstalledAndHealthy ?? (() => realIsInstalledAndHealthy()),
    openExternal: deps.openExternal ?? ((url) => shell.openExternal(url)),
    sleep: deps.sleep ?? defaultSleep,
    pollIntervalMs: deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    interstitialPath: deps.interstitialPath ?? defaultInterstitialPath(),
  };
}

/**
 * Wires the navigation allow-list (T-06-06) onto a (real or fake) dashboard
 * window: a `will-navigate` to a non-allowed origin is prevented and routed
 * to the system browser; `setWindowOpenHandler` ALWAYS denies in-window
 * popups, routing non-allowed URLs externally too. Pure wiring -- the
 * actual allow/deny decision is `decide-dashboard-nav.ts`'s
 * `isAllowedNavigation`, never re-implemented here.
 *
 * WR-06 (D-09/T-06-06 completeness): `will-navigate` does NOT fire for
 * server-side redirects -- a compromised livinityd answering
 * `302 Location: https://evil.example/` would render attacker content inside
 * the trusted app-chrome window; `will-redirect` closes that door. Likewise
 * `will-navigate` covers main-frame navigations only -- `will-frame-navigate`
 * blocks an injected `<iframe src="...">` from loading a foreign origin
 * inside the window (subframes are blocked silently, never opened
 * externally; the main-frame case is already handled above).
 */
export function wireNavigationGuard(win: DashboardWinLike, openExternal: DashboardDeps['openExternal']): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      void openExternal(url);
    }
  });
  win.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      void openExternal(url);
    }
  });
  win.webContents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame && !isAllowedNavigation(details.url)) {
      details.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedNavigation(url)) {
      void openExternal(url);
    }
    return { action: 'deny' };
  });
}

/**
 * The bounded-in-cadence (unbounded-in-duration) background poll: once the
 * interstitial is showing, keep probing until either the engine becomes
 * healthy (swap to the real address) or the window is closed out from under
 * it (bail silently) -- UI-SPEC Screen 2: "the window stays open and keeps
 * polling" past any single wait window, never a hard give-up.
 */
async function pollAndSwap(win: DashboardWinLike, deps: DashboardDeps): Promise<void> {
  for (;;) {
    if (win.isDestroyed()) return;
    await deps.sleep(deps.pollIntervalMs);
    if (win.isDestroyed()) return;
    const healthy = await deps.isInstalledAndHealthy();
    if (healthy) {
      await win.loadURL(`${ALLOWED_ORIGIN}/`);
      return;
    }
  }
}

/**
 * The probe-then-open sequence (Pattern 6): `decideDashboardOpen` decides
 * whether to `loadURL` the real address directly or `loadFile` the
 * interstitial first, then (unhealthy branch only) polls
 * `isInstalledAndHealthy` in the background and `loadURL`-swaps once a
 * later probe passes. Resolves once the FIRST load call (direct or
 * interstitial) settles -- the background poll is fire-and-forget, matching
 * "the window opens immediately ... polls in the background" (UI-SPEC
 * Screen 2).
 */
export async function probeThenOpen(win: DashboardWinLike, deps: DashboardDeps): Promise<void> {
  const healthy = await deps.isInstalledAndHealthy();
  const mode = decideDashboardOpen(healthy);

  if (mode.mode === 'direct') {
    await win.loadURL(`${ALLOWED_ORIGIN}/`);
    return;
  }

  await win.loadFile(deps.interstitialPath);
  void pollAndSwap(win, deps);
}

let dashboardWindow: DashboardWinLike | null = null;

/** Returns the current dashboard window instance, or null if none is open. */
export function getDashboardWindow(): DashboardWinLike | null {
  return dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : null;
}

/** Closes the dashboard window if one is open; a safe no-op otherwise. */
export function closeDashboardWindow(): void {
  const win = getDashboardWindow();
  if (win) win.close();
  dashboardWindow = null;
}

/** Test-only reset of the module-level window reference between test cases. */
export function __resetDashboardWindowForTests(): void {
  dashboardWindow = null;
}

/**
 * D-17: registers a deny-all permission handler on the dashboard's OWN
 * `DASH_PARTITION` session, before the window is created. Idempotent --
 * `session.fromPartition` returns the SAME `Session` object for a given
 * partition string, so re-registering the (structurally identical) handler
 * on a later call is harmless. The default session is never referenced here.
 */
function denyAllDashboardPermissions(): void {
  session.fromPartition(DASH_PARTITION).setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
}

/**
 * Opens the sandboxed dashboard window (D-09: `webPreferences` has NO
 * `preload` key at all, plus `sandbox:true`/`contextIsolation:true`/
 * `nodeIntegration:false`, and D-17's own `persist:dashboard` partition),
 * wires the navigation allow-list, and runs the probe-then-open sequence.
 * Focuses the existing window instead of spawning a duplicate if one is
 * already open (module-level single reference).
 */
export async function openDashboardWindow(depsIn: Partial<DashboardDeps> = {}): Promise<void> {
  const existing = getDashboardWindow();
  if (existing) {
    existing.focus();
    return;
  }

  const deps = resolveDeps(depsIn);

  denyAllDashboardPermissions();

  const win = deps.createWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: true,
    backgroundColor: '#050507',
    show: true,
    center: true,
    title: 'Livinity',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: DASH_PARTITION,
      // NO `preload` key at all -- the literal mechanism giving this window
      // zero IPC/secret reach (D-09, T-06-05).
    },
  });
  dashboardWindow = win;

  wireNavigationGuard(win, deps.openExternal);
  await probeThenOpen(win, deps);
}
