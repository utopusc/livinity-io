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

const vaultPath = () => path.join(app.getPath('userData'), 'vault.bin');

/** Whether OS-backed encryption (DPAPI on Windows) is available in this session. */
export function isVaultAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * Encrypts `value` with safeStorage (DPAPI) and persists ONLY the resulting
 * base64 ciphertext. Throws `VAULT_UNAVAILABLE` when OS encryption isn't
 * available — never falls back to writing plaintext.
 */
export async function vaultSet(key: VaultKey, value: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('VAULT_UNAVAILABLE');
  }
  const existing = await vaultReadAll();
  existing[key] = safeStorage.encryptString(value).toString('base64');
  await fs.writeFile(vaultPath(), JSON.stringify(existing), 'utf8');
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
