/**
 * src/main/storage/state-store.ts
 *
 * State store holds NON-SECRET wizard progress only. NEVER write a
 * token/session/key here — secrets go through secrets-vault.ts (RESEARCH.md
 * Anti-Pattern: no secrets in state.json).
 *
 * Zero imports from ipc/ or tray/ — this module is a pure, unit-testable
 * main-process primitive (ARCHITECTURE.md hard isolation rule).
 */

import { app } from 'electron';
import path from 'node:path';
import { StateSchema, type State } from '../../../shared/ipc-contract';
import { atomicWriteFile, readFileWithRetry } from './atomic-write';

const statePath = () => path.join(app.getPath('userData'), 'state.json');

/**
 * The single source of truth for the initial/absent wizard state. Exported so
 * shell.ipc.ts imports this instead of independently redeclaring an identical
 * constant that could silently drift out of sync (IN-02).
 */
export const DEFAULT_STATE: State = { version: 1, currentStep: 'start' };

/**
 * Validates `state` against the shared schema, then persists it via the
 * shared atomic tmp-write + rename-with-retry helper (atomic-write.ts) — a
 * crash mid-write leaves either the old valid file or the new valid file,
 * never a torn file.
 */
export async function writeState(state: State): Promise<void> {
  const validated = StateSchema.parse(state);
  await atomicWriteFile(statePath(), JSON.stringify(validated, null, 2));
}

/**
 * Reads and validates state.json. Returns `null` when the file is absent,
 * contains malformed JSON, or fails `StateSchema.safeParse` (tampered/corrupt)
 * — degrades to "absent" rather than throwing or acting on untrusted data.
 *
 * The read itself goes through `readFileWithRetry` (atomic-write.ts), which
 * retries a transient Windows EPERM/EBUSY (e.g. an AV scanner momentarily
 * holding a read handle) instead of treating it identically to "file
 * genuinely doesn't exist yet" on the first failure (WR-02) — `patchState`
 * merges over `DEFAULT_STATE` on a `null` return, so without this retry a
 * transient lock could silently discard legitimate in-progress state.
 * Corrupted-file semantics are unchanged: malformed JSON or a schema
 * validation failure still degrades to `null` immediately, not retried.
 */
export async function readState(): Promise<State | null> {
  let raw: string;
  try {
    raw = await readFileWithRetry(statePath());
  } catch {
    // ENOENT (legitimately absent) or a non-retryable/exhausted-retry error
    // — both degrade to "absent", same as before this fix.
    return null;
  }
  try {
    const parsed = StateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Serializes patchState's read-modify-write cycle: ipcMain.handle does not
// serialize concurrent invocations of the same channel, so two overlapping
// `state:set` calls could otherwise race (second call's read happening before
// the first call's write lands) and silently lose one of the two updates
// (WR-01). A simple in-process promise-chain mutex is enough for this
// single-process app.
let stateWriteQueue: Promise<unknown> = Promise.resolve();
function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = stateWriteQueue.then(fn, fn);
  stateWriteQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/**
 * Reads the current state (or `DEFAULT_STATE` if absent/corrupt), merges
 * `patch` over it, persists the result, and returns the merged state. This is
 * what the IPC `state:set` handler calls (Plan 03) — it never touches the
 * file I/O directly. The whole read-modify-write cycle is serialized
 * per-process (`withStateLock`) so two overlapping calls can never race and
 * drop one of the writes.
 */
export async function patchState(patch: Partial<State>): Promise<State> {
  return withStateLock(async () => {
    const current = (await readState()) ?? DEFAULT_STATE;
    const merged = { ...current, ...patch } as State;
    await writeState(merged);
    return merged;
  });
}
