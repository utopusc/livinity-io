/**
 * src/main/ipc/shell.ipc.ts
 *
 * Zod-validated IPC handlers wiring the renderer to Plan 02's storage
 * (secrets-vault.ts, state-store.ts). Every renderer-supplied payload is
 * safeParse'd against shared/ipc-contract.ts before it touches vault/state —
 * a malformed or unknown-key payload is rejected, never passed through
 * (RESEARCH.md V5 Input Validation).
 *
 * The vault getter exposed here is `vaultHas` (existence-only). `vaultGet`
 * (plaintext) is never imported into this file — a compromised renderer has
 * no IPC path to read a decrypted secret (SHELL-04).
 */

import { ipcMain, app, type BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod';
import {
  CHANNELS,
  VaultKeySchema,
  StatusSchema,
  StateSchema,
  type Status,
} from '../../../shared/ipc-contract';
import { vaultSet, vaultHas } from '../storage/secrets-vault';
import { readState, patchState } from '../storage/state-store';
import { logSafe } from '../log';

const VaultSetPayloadSchema = z.object({ key: VaultKeySchema, value: z.string().min(1) });
const VaultHasPayloadSchema = z.object({ key: VaultKeySchema });
const StatePatchSchema = StateSchema.partial();

const DEFAULT_STATE = { version: 1 as const, currentStep: 'start' };

export interface ShellIpcDeps {
  getMainWindow: () => BrowserWindow | null;
  setStatus: (status: Status) => void;
  onQuit: () => void;
}

export function registerShellIpc(deps: ShellIpcDeps): void {
  ipcMain.handle(CHANNELS.vaultSet, async (_event, raw: unknown) => {
    const parsed = VaultSetPayloadSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'ENCRYPT_FAILED' as const };
    try {
      await vaultSet(parsed.data.key, parsed.data.value);
      logSafe('vault.set', { key: parsed.data.key });
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: 'VAULT_UNAVAILABLE' as const };
    }
  });

  // Existence-only getter — NEVER calls vaultGet, never returns plaintext.
  ipcMain.handle(CHANNELS.vaultHas, async (_event, raw: unknown) => {
    const parsed = VaultHasPayloadSchema.safeParse(raw);
    if (!parsed.success) return { exists: false };
    const exists = await vaultHas(parsed.data.key);
    logSafe('vault.has', { key: parsed.data.key });
    return { exists };
  });

  ipcMain.handle(CHANNELS.stateGet, async () => {
    return (await readState()) ?? DEFAULT_STATE;
  });

  ipcMain.handle(CHANNELS.stateSet, async (_event, raw: unknown) => {
    const parsed = StatePatchSchema.safeParse(raw);
    if (!parsed.success) return (await readState()) ?? DEFAULT_STATE;
    return patchState(parsed.data);
  });

  ipcMain.handle(CHANNELS.statusSimulate, async (_event, raw: unknown) => {
    const parsed = StatusSchema.safeParse(raw);
    if (!parsed.success) return;
    deps.setStatus(parsed.data);
  });

  ipcMain.handle(CHANNELS.windowMinimize, () => {
    deps.getMainWindow()?.minimize();
  });

  ipcMain.handle(CHANNELS.windowHide, () => {
    deps.getMainWindow()?.hide();
  });

  ipcMain.handle(CHANNELS.appQuit, () => {
    deps.onQuit();
  });

  // DEV-ONLY (!app.isPackaged): exists solely to let Plan 04's spike trigger
  // Candidate A from inside Electron's Job Object tree (spawning from a
  // standalone terminal would invalidate that test). Never registered in a
  // packaged build. These channel names are literals (NOT part of the
  // production CHANNELS object) — dev-only surface, typed separately as
  // DevSpikeApi (shared/ipc-contract.ts) and exposed via the preload because
  // the sandboxed renderer has no other reachable path to them (no `require`
  // in the DevTools console under sandbox:true). Takes no renderer-supplied
  // payload — spawns a fixed local script path only.
  if (!app.isPackaged) {
    ipcMain.handle('dev:spawnHolderA', async () => {
      const holder = path.join(app.getAppPath(), 'spike', 'holder-candidate-a.js');
      // ELECTRON_RUN_AS_NODE=1 is REQUIRED for spike fidelity: process.execPath
      // here is electron.exe, and without the flag both this holder script AND
      // the detached placeholder it spawns (which inherits this env) boot as
      // full Electron/Chromium apps — the intermediate never exits and Chromium
      // manages its own Job Objects, which would contaminate the survival
      // observation with Electron-specific behavior that does not generalize
      // to the real future holder (a plain wsl.exe/node process). With the
      // flag, both run as pure Node processes while still being CreateProcess'd
      // from inside Electron's Job Object tree — the exact condition under test.
      spawn(process.execPath, [holder], {
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      logSafe('spike.dev-spawn-holder-a', {});
      return { ok: true };
    });

    // DEV-ONLY (!app.isPackaged): Plan 04 spike Test B — update-cycle
    // simulation. `app.relaunch(); app.exit(0)` reproduces quitAndInstall()'s
    // process semantics (main process dies and is replaced) minus running an
    // installer binary — the documented fallback per the plan/RESEARCH.md Open
    // Question 2 (no real GitHub Release exists yet to feed a faithful
    // quitAndInstall). SPIKE-VERDICT.md records this as the Test-B method.
    // Takes no renderer-supplied payload.
    ipcMain.handle('dev:updateSim', async () => {
      logSafe('spike.dev-update-sim', { method: 'app.relaunch+app.exit(0)' });
      app.relaunch();
      app.exit(0);
    });
  }
}
