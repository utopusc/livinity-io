/**
 * src/main/supervision/login-item.ts
 *
 * The SOLE `app.setLoginItemSettings` call site in the entire app (RESEARCH
 * Pattern 4 / Pitfall 1, T-06-02). Reconciles the persistent `startAtLogin`
 * user preference (TRAY-01, Settings-editable) with a transient pending-
 * reboot need: a Phase-4 `wsl:enable`/`wsl:restartNow` run always forces the
 * login item on for exactly one relaunch (survives the mandatory reboot),
 * but once WSL is healthy again the item's steady state falls back to the
 * user's real preference — NEVER hardcoded false. This closes the WR-02-class
 * landmine `wsl.ipc.ts`'s three former direct call sites created: the first
 * post-reboot healthy `wsl:detect` would otherwise silently disarm a user's
 * real start-at-login preference with zero Settings-screen feedback.
 *
 * `WSL_RESTART_STEP` is intentionally re-declared as a local literal (not
 * imported from wsl.ipc.ts) — src/main/{wsl,orchestrator,supervision}/ never
 * import from ipc/ (install-invoke.ts's own header states this isolation
 * rule; importing a route/controller module from a service module here would
 * also create a circular import once wsl.ipc.ts imports `syncLoginItem`).
 * The two literals are proven identical: wsl.ipc.test.ts's own assertions
 * pin the same `'wsl-restart'` string this module reads via `patchState`.
 */

import { app } from 'electron';
import { readState, patchState } from '../storage/state-store';

const WSL_RESTART_STEP = 'wsl-restart';

/**
 * Reads current state, composes the real `startAtLogin` preference with any
 * pending reboot-resume need, and writes the OS setting. Call this (never
 * `app.setLoginItemSettings` directly) after any change that could affect
 * either input — the persisted preference or the `wslStep` ledger.
 */
export async function syncLoginItem(): Promise<void> {
  const st = await readState();
  const startAtLogin = st?.startAtLogin ?? true; // D-05 default: on
  const pendingReboot = st?.wslStep === WSL_RESTART_STEP;
  app.setLoginItemSettings({
    openAtLogin: startAtLogin || pendingReboot,
    args: ['--hidden'],
  });
}

/**
 * Settings' Startup-card checkbox calls this — persists the real preference
 * THEN re-syncs the OS setting from it (order matters: syncLoginItem reads
 * state after the patch lands).
 */
export async function setStartAtLogin(enabled: boolean): Promise<void> {
  await patchState({ startAtLogin: enabled });
  await syncLoginItem();
}

/** Reads the persisted preference, defaulting to true (D-05) when unset. */
export async function getStartAtLogin(): Promise<boolean> {
  const st = await readState();
  return st?.startAtLogin ?? true;
}
