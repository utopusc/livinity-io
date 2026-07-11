/**
 * src/main/ipc/update.ipc.ts
 *
 * The renderer<->main IPC boundary for the electron-updater surface (UPD-01) —
 * the three zod-validated update:* invoke handlers plus the update:status
 * main -> renderer push. Mirrors src/main/ipc/engine.ipc.ts VERBATIM: every
 * renderer-supplied payload is safeParse'd before it touches an orchestrator,
 * every handler body is wrapped in try/catch so no exception ever crosses the
 * boundary as a rejected IPC promise (a safe result union is returned
 * instead), and every logSafe carries scalar metadata only — never a secret.
 *
 * SECRET DISCIPLINE: no handler here ever returns a token/secret.
 * `UpdateUiState` (07-01) is state/version/gate-flag only.
 *
 * I5 (single update:status sender): `registerUpdateIpc` RETURNS
 * `{ pushUpdateStatus }` instead of sending `update:status` itself anywhere
 * else in this file. 07-11's `index.ts` injects the returned `pushUpdateStatus`
 * as `initUpdater`'s `pushStatus` dep (07-04) — this is the ONE place
 * `CHANNELS.updateStatus` is ever sent; nothing else in the app raw-sends it.
 *
 * update:restartToInstall routes through `requestRestartToUpdate` (07-04,
 * `supervision/engine.ts`) so the D-06 install-admission gate runs inside the
 * SAME `serialized()` lifecycle mutex as every other engine transition —
 * `quitAndInstall` is explicitly injected as `updater.ts`'s own
 * `restartToUpdate` export (Q1.3's always-`quitAndInstall(true, true)`
 * discipline), even though it is already `requestRestartToUpdate`'s own
 * production default (07-04) — explicit here for this file's own testability
 * (a test can spy on `updater.ts`'s export directly without reaching through
 * `engine.ts`'s internal default chain).
 *
 * Zero imports from tray/ or index.ts. `registerUpdateIpc` has no call site
 * yet — inert until 07-11 wires it into `app.whenReady`.
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { CHANNELS, type UpdateUiState } from '../../../shared/ipc-contract';
import { getUpdateState, checkForUpdates, restartToUpdate } from '../update/updater';
import { requestRestartToUpdate } from '../supervision/engine';
import { logSafe } from '../log';

// NoPayload = z.undefined() still runs on every no-arg handler as defense in
// depth (mirrors engine.ipc.ts/cf.ipc.ts) — a hostile renderer's stray
// payload is BRANCHED on, never silently discarded.
const NoPayload = z.undefined();

/** Schema-valid, secret-free safe default for a malformed payload or a
 * thrown getUpdateState — matches UpdateUiStateSchema. */
const SAFE_UPDATE_STATE_DEFAULT: UpdateUiState = {
  state: 'failed',
  readyVersion: null,
  currentVersion: '',
  installBlocked: false,
};

const SAFE_RESTART_DEFAULT = { ok: false as const, blocked: false as const };

export interface UpdateIpcDeps {
  /** update:status push target (I5's ONE sender, returned below). */
  getMainWindow: () => BrowserWindow | null;
}

export interface UpdateIpcHandles {
  /** The single `update:status` sender — 07-11 injects this as `initUpdater`'s
   * `pushStatus` dep. Nothing else in the app ever raw-sends this channel. */
  pushUpdateStatus: (s: UpdateUiState) => void;
}

export function registerUpdateIpc(deps: UpdateIpcDeps): UpdateIpcHandles {
  const pushUpdateStatus = (s: UpdateUiState): void => {
    deps.getMainWindow()?.webContents.send(CHANNELS.updateStatus, s);
  };

  ipcMain.handle(CHANNELS.updateGetState, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return SAFE_UPDATE_STATE_DEFAULT;
    try {
      return getUpdateState();
    } catch {
      logSafe('update.getState', { exception: true });
      return SAFE_UPDATE_STATE_DEFAULT;
    }
  });

  // update:check — background-style trigger; the resulting state transitions
  // arrive via the update:status push, never this handler's own return value.
  ipcMain.handle(CHANNELS.updateCheck, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return;
    try {
      checkForUpdates();
    } catch {
      logSafe('update.check', { exception: true });
    }
  });

  // update:restartToInstall — the D-06 install-gate runs inside
  // requestRestartToUpdate's serialized() mutex (engine.ts, 07-04);
  // quitAndInstall is explicitly updater.ts's restartToUpdate (Q1.3: always
  // quitAndInstall(true, true), never the bare zero-arg call).
  ipcMain.handle(CHANNELS.updateRestartToInstall, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return SAFE_RESTART_DEFAULT;
    try {
      return await requestRestartToUpdate({ quitAndInstall: restartToUpdate });
    } catch {
      logSafe('update.restartToInstall', { exception: true });
      return SAFE_RESTART_DEFAULT;
    }
  });

  return { pushUpdateStatus };
}
