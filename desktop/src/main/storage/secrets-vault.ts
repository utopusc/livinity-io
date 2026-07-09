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
import { logSafe } from '../log';

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

/**
 * Removes `key` from the vault (no-op if absent), via the same
 * withVaultLock + atomicWriteFile shape as `vaultSet` — additive primitive
 * for sign-out (D-07) and stale-key eviction (AUTH-06 decideKeyAction
 * 'stale-reprompt'). Never touches any other key stored alongside it.
 */
export async function vaultDelete(key: VaultKey): Promise<void> {
  return withVaultLock(async () => {
    const existing = await vaultReadAll();
    delete existing[key];
    await atomicWriteFile(vaultPath(), JSON.stringify(existing));
  });
}

async function vaultReadAll(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(vaultPath(), 'utf8'));
  } catch (e) {
    // IN-02: distinguish the expected "no vault.bin yet" case (ENOENT, e.g.
    // first run, or after a legitimate vaultDelete of every key) from a
    // genuine read failure (corrupt JSON from a torn write, AV quarantine,
    // roaming-profile mismatch, permission error) — the latter is otherwise
    // indistinguishable from "no vault yet" and the very next vaultSet/
    // vaultDelete would silently persist an empty object over it, discarding
    // every previously stored secret with zero diagnostic trail. No secret
    // VALUE is ever in `e.message` here — only a read/parse failure reason.
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      logSafe('vault.read.corrupt', { message: String(e instanceof Error ? e.message : e) });
    }
    return {};
  }
}
