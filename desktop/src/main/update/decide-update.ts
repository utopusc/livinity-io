/**
 * src/main/update/decide-update.ts
 *
 * Pure, zero-IO decision cores for the auto-update experience (UPD-01, D-04/D-05/D-06).
 * Four ordered ladders:
 *
 * - `shouldCheck` -- check cadence. `packaged` is the FIRST predicate (Pitfall 5): an
 *   unpackaged/dev run must never schedule a check (electron-updater throws on a dev
 *   build's absent feed config, and a dev-run check error must never pollute persisted
 *   update state). Only once packaged is confirmed does the +3min-after-ready-delay /
 *   6h-cadence-thereafter timing apply.
 * - `admitQuitAndInstall` -- the D-06 restart-to-update admission gate. `installInFlight`
 *   is checked FIRST, ahead of any engine transition: an update apply must never
 *   interleave with a live install.sh run (a 15-20min provisioning script killed
 *   mid-flight is a WSL-05-class destruction risk), so even when both gates would block,
 *   the install-gate reason is the one reported.
 * - `shouldNotify` -- D-05 once-per-version. The decider does NOT own the
 *   `lastUpdateNotifiedVersion` memory -- the caller (StateSchema-backed) does; this is a
 *   pure string-inequality check against whatever the caller passes in.
 * - `nextStatus` -- the monotonic update-state machine driving `UpdateUiState` (07-01).
 *   A background re-check or a check-error can never regress an already-'ready' state:
 *   the user has a verified, installable download sitting on disk, and a later routine
 *   check hiccup or a stale-triggered re-check must not hide that from them.
 *
 * Zero runtime imports -- no IO, no Node built-ins, no electron surface (mirrors
 * decide-supervision.ts / notify-edges.ts). Only a type-only import of `UpdateUiState`
 * from the shared IPC contract (07-01) -- erased at compile time, no runtime coupling.
 */

import type { UpdateUiState } from '../../../shared/ipc-contract';

export interface ShouldCheckSignals {
  packaged: boolean;
  now: number;
  /** null = no check has ever run this session/ever. */
  lastCheckAt: number | null;
  /** Delay after app-ready before the FIRST check (ms) -- +3min per D-04. */
  readyDelayMs: number;
  /** Cadence between subsequent checks (ms) -- 6h per D-04. */
  intervalMs: number;
}

export function shouldCheck(s: ShouldCheckSignals): boolean {
  // Rule 1 -- unpackaged/dev run. FIRST predicate, source-order enforced (Pitfall 5):
  // never schedule a check regardless of any timing field.
  if (!s.packaged) return false;

  // Rule 2 -- no check has ever run. Wait out the post-ready settle delay.
  if (s.lastCheckAt === null) return s.now >= s.readyDelayMs;

  // Rule 3 -- subsequent checks follow the fixed cadence.
  return s.now - s.lastCheckAt >= s.intervalMs;
}

export interface AdmitQuitAndInstallSignals {
  installInFlight: boolean;
  transitionInFlight: boolean;
}

export type AdmitQuitAndInstallResult =
  | { ok: true }
  | { ok: false; reason: 'install-in-flight' | 'transition-in-flight' };

export function admitQuitAndInstall(s: AdmitQuitAndInstallSignals): AdmitQuitAndInstallResult {
  // Rule 1 -- a live install.sh run. FIRST branch, source-order enforced (D-06): an
  // update apply must never interleave with provisioning, even if an engine transition
  // is ALSO in flight -- this is the reason reported in that overlap case.
  if (s.installInFlight) return { ok: false, reason: 'install-in-flight' };

  // Rule 2 -- an engine start/stop/restart transition is mid-flight. The restart is
  // queued behind the serialized() mutex rather than admitted immediately.
  if (s.transitionInFlight) return { ok: false, reason: 'transition-in-flight' };

  // Rule 3 -- nothing blocking. The restart-to-update is admitted.
  return { ok: true };
}

/**
 * D-05 once-per-version. The decider does not own `lastNotified` -- the caller reads it
 * from persisted state and, after a true notification fires, is responsible for
 * persisting `readyVersion` back into that same field.
 */
export function shouldNotify(readyVersion: string, lastNotified: string | undefined): boolean {
  return readyVersion !== lastNotified;
}

/** The electron-updater event shapes `nextStatus` reduces over. */
export type UpdaterEvent =
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'progress' }
  | { kind: 'downloaded'; version: string }
  | { kind: 'up-to-date' }
  | { kind: 'error' };

/**
 * The monotonic update-state reducer. `currentVersion`/`installBlocked` always pass
 * through unchanged from `prev` -- neither field is ever derived from an updater event.
 *
 * Precedence (checked in this exact order):
 * 1. `prev.state === 'ready'` -- MONOTONIC TRAP. A 'checking' (background re-check) or
 *    'error' (check hiccup) event while a verified download already sits ready must
 *    never regress the UI back to 'checking'/'failed' -- the ready download is real and
 *    still installable regardless of what a later check attempt does.
 * 2. Otherwise, the event maps directly to its corresponding state.
 */
export function nextStatus(event: UpdaterEvent, prev: UpdateUiState): UpdateUiState {
  const pass = { currentVersion: prev.currentVersion, installBlocked: prev.installBlocked };

  // Rule 1 -- monotonic-ready trap. Once ready, only a fresh 'downloaded' (a newer
  // version) can move the state again; 'checking'/'error' from a stale re-check are
  // absorbed with no change.
  if (prev.state === 'ready') {
    if (event.kind === 'downloaded') {
      return { state: 'ready', readyVersion: event.version, ...pass };
    }
    return prev;
  }

  switch (event.kind) {
    case 'checking':
      return { state: 'checking', readyVersion: null, ...pass };
    case 'available':
      return { state: 'downloading', readyVersion: null, ...pass };
    case 'progress':
      return { state: 'downloading', readyVersion: null, ...pass };
    case 'downloaded':
      return { state: 'ready', readyVersion: event.version, ...pass };
    case 'up-to-date':
      return { state: 'up-to-date', readyVersion: null, ...pass };
    case 'error':
      return { state: 'failed', readyVersion: null, ...pass };
  }
}
