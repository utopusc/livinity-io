/**
 * src/main/ipc/engine.ipc.ts
 *
 * The renderer<->main IPC boundary for tray supervision + the embedded
 * dashboard — the eight zod-validated engine:* invoke handlers plus the
 * engine:navigate main -> renderer push. Mirrors src/main/ipc/cf.ipc.ts /
 * wsl.ipc.ts VERBATIM: every renderer-supplied payload is safeParse'd before
 * it touches an orchestrator (T-06-07), every handler body is wrapped in
 * try/catch so no exception ever crosses the boundary as a rejected IPC
 * promise (a safe result union is returned instead), and every logSafe
 * carries scalar metadata only — never a secret.
 *
 * SECRET DISCIPLINE (T-06-09): no handler here ever returns a token/secret.
 * `EngineStatusResult` is address+state only (03-01-class secret-free-by-
 * construction schema); `engineOpenInBrowser` returns void — the address is
 * derived MAIN-SIDE by openInBrowserGated (06-07) and never crosses IPC in
 * either direction.
 *
 * NO RENDERER-SUPPLIED COMMAND/ARG REACHES execWsl (T-06-07): start/stop/
 * restart/getStatus/openDashboard/openInBrowser/openLogsFolder all take NO
 * payload — only fixed orchestrator calls run. `engineSetStartAtLogin` is
 * the only argument-bearing handler ({ enabled: boolean }); a malformed
 * value never reaches `setStartAtLogin` (IN-04).
 *
 * FIXED-PATH / MAIN-SIDE-DERIVED OPENS (T-06-08): `engineOpenLogsFolder`
 * calls `shell.openPath` with a FIXED `app.getPath('logs')` — no renderer
 * payload is ever read. `engineOpenDashboard`/`engineOpenInBrowser` delegate
 * to the D-10 stopped-gated `openDashboardGated`/`openInBrowserGated`
 * (06-07): while the engine is not desired-running, both focus the main
 * window and push `engine:navigate` instead of opening a doomed connection
 * (no dead localhost:8080 tab/window, D-10); while running, `openInBrowserGated`
 * derives the address MAIN-SIDE (`deriveAddress`) and opens it via the
 * injected `openExternal` — structurally impossible for a compromised
 * renderer to supply its own path/URL. `engineOpenInBrowser` is the
 * stopped-gated replacement for the ungated `flowOpenBox` the renderer
 * surfaces (LiveSuccess/ConnectedCheck, Phase 5) used to call.
 *
 * `engine:navigate` is a main -> renderer PUSH (mirrors `cf:provisionUpdate`/
 * `authDeviceLoginUpdate`), NOT an invoke handler — the tray "Settings"
 * callback (06-11) and the D-10 gate above both call `navigateToSettings`
 * to fire it.
 *
 * registerEngineIpc constructs the real `EngineDeps` (`supervision/engine.ts`,
 * 06-07) by injecting only the collaborators that have NO real production
 * default inside `engine.ts` itself (`setStatus`/`getMainWindow` come from
 * `EngineIpcDeps`, mirroring `registerShellIpc`'s `ShellIpcDeps` shape;
 * `openDashboardWindow`/`closeDashboard` wire 06-08's dashboard window;
 * `openExternal` wires `shell.openExternal`; `navigateToSettings` sends
 * `engine:navigate`) — every other collaborator (state-store/wsl-exec/
 * connected-probe/holder.ts/Notification) already has a genuine default
 * inside `engine.ts`'s own `resolveDeps`, so this file never re-wires them.
 *
 * Zero imports from tray/ or index.ts. `registerEngineIpc` has no call site
 * yet — inert until 06-11 wires it into `app.whenReady`.
 */

import { ipcMain, shell, app, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { CHANNELS, type Status, type EngineStatusResult } from '../../../shared/ipc-contract';
import {
  startEngine,
  stopEngine,
  restartEngine,
  getEngineStatus,
  openDashboardGated,
  openInBrowserGated,
  type EngineDeps,
} from '../supervision/engine';
import { setStartAtLogin, getStartAtLogin } from '../supervision/login-item';
import { openDashboardWindow, closeDashboardWindow } from '../dashboard/dashboard-window';
import { logSafe } from '../log';

// Per-handler payload schemas (mirror cf.ipc.ts/wsl.ipc.ts). NoPayload =
// z.undefined() still runs on every no-arg handler as defense in depth
// (IN-04) — a hostile renderer's stray payload is BRANCHED on, never
// silently discarded.
const NoPayload = z.undefined();
const SetStartAtLoginPayload = z.object({ enabled: z.boolean() });

/** Schema-valid, secret-free safe default for a malformed payload or a thrown
 * getEngineStatus — matches EngineStatusResultSchema. */
const SAFE_STATUS_DEFAULT: EngineStatusResult = {
  state: 'error',
  address: null,
  lastCheckedAt: null,
  desiredState: 'stopped',
};

export interface EngineIpcDeps {
  /** Used by engine:openDashboard/openInBrowser's D-10 stopped-gate (focus) and by
   * navigateToSettings (engine:navigate push target). */
  getMainWindow: () => BrowserWindow | null;
  /** The EXISTING setStatus rail (tray color + status:changed) — the same closure
   * index.ts passes to registerShellIpc; never a second status channel. */
  setStatus: (status: Status) => void;
}

export function registerEngineIpc(deps: EngineIpcDeps): void {
  // main -> renderer push (mirrors cf:provisionUpdate) — NOT an invoke handler.
  // Fired by the D-10 stopped-gate below and by the tray "Settings" callback (06-11).
  const navigateToSettings = (): void => {
    deps.getMainWindow()?.webContents.send(CHANNELS.engineNavigate, { screen: 'settings' });
  };

  // The collaborators engine.ts's own defaultDeps has NO real implementation
  // for (setStatus/openDashboardWindow/closeDashboard/getMainWindow/
  // navigateToSettings/openExternal) — every other EngineDeps field
  // (state-store/wsl-exec/connected-probe/holder.ts/Notification) already
  // resolves to its genuine default inside engine.ts, so it is never
  // re-wired here.
  const engineDeps: Partial<EngineDeps> = {
    setStatus: deps.setStatus,
    getMainWindow: deps.getMainWindow,
    navigateToSettings,
    openDashboardWindow,
    closeDashboard: closeDashboardWindow,
    openExternal: (url: string) => shell.openExternal(url),
  };

  ipcMain.handle(CHANNELS.engineStart, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return { ok: false as const };
    try {
      await startEngine(engineDeps);
      return { ok: true as const };
    } catch {
      logSafe('engine.start', { exception: true });
      return { ok: false as const };
    }
  });

  ipcMain.handle(CHANNELS.engineStop, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return { ok: false as const };
    try {
      await stopEngine(engineDeps);
      return { ok: true as const };
    } catch {
      logSafe('engine.stop', { exception: true });
      return { ok: false as const };
    }
  });

  ipcMain.handle(CHANNELS.engineRestart, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return { ok: false as const };
    try {
      await restartEngine(engineDeps);
      return { ok: true as const };
    } catch {
      logSafe('engine.restart', { exception: true });
      return { ok: false as const };
    }
  });

  ipcMain.handle(CHANNELS.engineGetStatus, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return SAFE_STATUS_DEFAULT;
    try {
      return await getEngineStatus(engineDeps);
    } catch {
      logSafe('engine.getStatus', { exception: true });
      return SAFE_STATUS_DEFAULT;
    }
  });

  // engine:setStartAtLogin — a malformed (non-boolean) payload never reaches
  // setStartAtLogin (IN-04); the safe default reads the CURRENT persisted
  // value via getStartAtLogin rather than guessing, so a rejected write never
  // desyncs the renderer's toggle state from the real OS setting.
  ipcMain.handle(CHANNELS.engineSetStartAtLogin, async (_event, raw: unknown) => {
    const parsed = SetStartAtLoginPayload.safeParse(raw);
    if (!parsed.success) {
      const current = await getStartAtLogin().catch(() => true);
      return { ok: false as const, startAtLogin: current };
    }
    try {
      await setStartAtLogin(parsed.data.enabled);
      logSafe('engine.setStartAtLogin', { enabled: parsed.data.enabled });
      return { ok: true as const, startAtLogin: parsed.data.enabled };
    } catch {
      logSafe('engine.setStartAtLogin', { exception: true });
      const current = await getStartAtLogin().catch(() => true);
      return { ok: false as const, startAtLogin: current };
    }
  });

  // engine:openDashboard — delegates to openDashboardGated (06-07, D-10):
  // stopped -> focus main + push engine:navigate (no window opened); running
  // -> the real sandboxed dashboard window (openDashboardWindow, 06-08).
  ipcMain.handle(CHANNELS.engineOpenDashboard, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return;
    try {
      await openDashboardGated(engineDeps);
    } catch {
      logSafe('engine.openDashboard', { exception: true });
    }
  });

  // engine:openInBrowser — the D-10 stopped-gated replacement for the
  // ungated flowOpenBox. Takes NO renderer payload; delegates to
  // openInBrowserGated (06-07), which derives the address MAIN-SIDE and
  // opens it via the injected openExternal — a raw renderer-supplied URL can
  // NEVER reach shell.openExternal through this channel (no dead 1033).
  ipcMain.handle(CHANNELS.engineOpenInBrowser, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return;
    try {
      await openInBrowserGated(engineDeps);
    } catch {
      logSafe('engine.openInBrowser', { exception: true });
    }
  });

  // engine:openLogsFolder — NO renderer payload is ever read; the path is a
  // FIXED app.getPath('logs') (T-06-08), never renderer-derived.
  ipcMain.handle(CHANNELS.engineOpenLogsFolder, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return;
    try {
      await shell.openPath(app.getPath('logs'));
    } catch {
      logSafe('engine.openLogsFolder', { exception: true });
    }
  });
}
