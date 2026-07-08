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
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StateSchema, type State } from '../../../shared/ipc-contract';

const statePath = () => path.join(app.getPath('userData'), 'state.json');

const DEFAULT_STATE: State = { version: 1, currentStep: 'start' };

/** True for the Windows-specific transient rename failures worth retrying. */
function isRetryableRenameError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'EBUSY';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Renames `from` to `to`, retrying on a transient Windows EPERM/EBUSY (e.g. an
 * AV scanner or a second process momentarily holding a handle on the target).
 * Non-retryable errors, and the final attempt's error, are rethrown.
 */
async function renameWithRetry(from: string, to: string, attempts = 3): Promise<void> {
  const backoffMs = [50, 100];
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const isLastAttempt = attempt === attempts - 1;
      if (isLastAttempt || !isRetryableRenameError(err)) throw err;
      await delay(backoffMs[attempt] ?? 100);
    }
  }
}

/**
 * Validates `state` against the shared schema, writes it to a `.tmp` file,
 * then atomically renames it into place — a crash mid-write leaves either the
 * old valid file or the new valid file, never a torn file.
 */
export async function writeState(state: State): Promise<void> {
  const validated = StateSchema.parse(state);
  const target = statePath();
  const tmp = target + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(validated, null, 2), 'utf8');
  await renameWithRetry(tmp, target);
}

/**
 * Reads and validates state.json. Returns `null` when the file is absent,
 * contains malformed JSON, or fails `StateSchema.safeParse` (tampered/corrupt)
 * — degrades to "absent" rather than throwing or acting on untrusted data.
 */
export async function readState(): Promise<State | null> {
  try {
    const raw = await fs.readFile(statePath(), 'utf8');
    const parsed = StateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Reads the current state (or `DEFAULT_STATE` if absent/corrupt), merges
 * `patch` over it, persists the result, and returns the merged state. This is
 * what the IPC `state:set` handler calls (Plan 03) — it never touches the
 * file I/O directly.
 */
export async function patchState(patch: Partial<State>): Promise<State> {
  const current = (await readState()) ?? DEFAULT_STATE;
  const merged = { ...current, ...patch } as State;
  await writeState(merged);
  return merged;
}
