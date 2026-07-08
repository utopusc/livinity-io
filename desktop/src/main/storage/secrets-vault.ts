/**
 * src/main/storage/secrets-vault.ts
 *
 * Stores DPAPI ciphertext only. Plaintext never written to disk, never returned
 * across IPC (vaultGet is main-internal; IPC uses vaultHas). NEVER log a
 * value — use logSafe(event, { key }).
 *
 * Zero imports from ipc/ or tray/ — this module is a pure, unit-testable
 * main-process primitive (ARCHITECTURE.md hard isolation rule).
 */

import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { VaultKey } from '../../../shared/ipc-contract';
import { atomicWriteFile } from './atomic-write';

const vaultPath = () => path.join(app.getPath('userData'), 'vault.bin');

/** Whether OS-backed encryption (DPAPI on Windows) is available in this session. */
export function isVaultAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

// Serializes vaultSet's read-modify-write cycle: ipcMain.handle does not
// serialize concurrent invocations of the same channel, so two overlapping
// `vault:set` calls could otherwise race (second call's read happening before
// the first call's write lands) and silently lose one of the two updates
// (WR-01). A simple in-process promise-chain mutex is enough for this
// single-process app.
let vaultWriteQueue: Promise<unknown> = Promise.resolve();
function withVaultLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = vaultWriteQueue.then(fn, fn);
  vaultWriteQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/**
 * Encrypts `value` with safeStorage (DPAPI) and persists ONLY the resulting
 * base64 ciphertext, via the shared atomic tmp-write + rename-with-retry
 * helper (atomic-write.ts) — a crash mid-write leaves either the old valid
 * vault.bin or the new valid vault.bin, never a torn file that silently wipes
 * every previously stored secret. The whole read-modify-write cycle is
 * serialized per-process (`withVaultLock`) so two overlapping calls can never
 * race and drop one of the writes. Throws `VAULT_UNAVAILABLE` when OS
 * encryption isn't available — never falls back to writing plaintext.
 */
export async function vaultSet(key: VaultKey, value: string): Promise<void> {
  return withVaultLock(async () => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('VAULT_UNAVAILABLE');
    }
    const existing = await vaultReadAll();
    existing[key] = safeStorage.encryptString(value).toString('base64');
    await atomicWriteFile(vaultPath(), JSON.stringify(existing));
  });
}

/**
 * Decrypts and returns the plaintext for `key`, or `null` when absent or when
 * decryption fails (corrupt blob, roaming-profile DPAPI mismatch, etc.).
 *
 * MAIN-PROCESS INTERNAL ONLY. The IPC layer must call `vaultHas` instead —
 * this function's return value must never cross the IPC boundary.
 */
export async function vaultGet(key: VaultKey): Promise<string | null> {
  const existing = await vaultReadAll();
  const b64 = existing[key];
  if (!b64) return null;
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'));
  } catch {
    return null;
  }
}

/**
 * Existence check only — does NOT decrypt. This is the IPC-facing getter;
 * `vaultGet` (plaintext) must never be reachable from the IPC layer.
 */
export async function vaultHas(key: VaultKey): Promise<boolean> {
  const existing = await vaultReadAll();
  return typeof existing[key] === 'string';
}

async function vaultReadAll(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(vaultPath(), 'utf8'));
  } catch {
    return {};
  }
}
