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
import { atomicWriteFile } from './atomic-write';

const statePath = () => path.join(app.getPath('userData'), 'state.json');

const DEFAULT_STATE: State = { version: 1, currentStep: 'start' };

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
