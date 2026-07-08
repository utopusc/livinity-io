/**
 * src/main/storage/atomic-write.ts
 *
 * Shared atomic tmp-file-then-rename primitive used by BOTH state-store.ts
 * (non-secret wizard state) and secrets-vault.ts (DPAPI-encrypted secrets) —
 * a crash mid-write must leave either the old valid file or the new valid
 * file, never a torn file, for either store. Extracted so the higher-value
 * secret data gets the exact same crash-safety guarantee as state.json
 * instead of a duplicated (or weaker) copy of the same logic.
 *
 * Zero imports from ipc/ or tray/ — pure, unit-testable main-process
 * primitive (ARCHITECTURE.md hard isolation rule).
 */

import { promises as fs } from 'node:fs';

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
export async function renameWithRetry(from: string, to: string, attempts = 3): Promise<void> {
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
 * Writes `contents` to `target` via a `.tmp` sibling file + atomic rename —
 * a crash mid-write leaves either the old valid file or the new valid file,
 * never a torn file.
 */
export async function atomicWriteFile(target: string, contents: string): Promise<void> {
  const tmp = target + '.tmp';
  await fs.writeFile(tmp, contents, 'utf8');
  await renameWithRetry(tmp, target);
}
