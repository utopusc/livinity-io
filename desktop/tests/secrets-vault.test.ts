import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let currentVaultDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => currentVaultDir },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('ENC:' + s)),
    decryptString: vi.fn((b: Buffer) => {
      const str = b.toString();
      if (!str.startsWith('ENC:')) throw new Error('bad ciphertext');
      return str.slice('ENC:'.length);
    }),
  },
}));

import { safeStorage } from 'electron';
import { vaultSet, vaultGet, vaultHas } from '../src/main/storage/secrets-vault';

describe('secrets-vault', () => {
  beforeEach(async () => {
    currentVaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'liv-vault-'));
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
    vi.mocked(safeStorage.encryptString).mockImplementation((s: string) =>
      Buffer.from('ENC:' + s)
    );
    vi.mocked(safeStorage.decryptString).mockImplementation((b: Buffer) => {
      const str = b.toString();
      if (!str.startsWith('ENC:')) throw new Error('bad ciphertext');
      return str.slice('ENC:'.length);
    });
  });

  afterEach(async () => {
    await fs.rm(currentVaultDir, { recursive: true, force: true });
  });

  it('round-trips a value through set then get', async () => {
    await vaultSet('session', 'secret-abc');
    expect(await vaultGet('session')).toBe('secret-abc');
  });

  it('never writes the plaintext value to vault.bin — only base64 ciphertext', async () => {
    await vaultSet('session', 'secret-abc');
    const raw = await fs.readFile(path.join(currentVaultDir, 'vault.bin'), 'utf8');
    expect(raw).not.toContain('secret-abc');
  });

  it('returns null when decryptString throws (corrupt blob / roaming-profile failure)', async () => {
    await vaultSet('session', 'secret-abc');
    vi.mocked(safeStorage.decryptString).mockImplementation(() => {
      throw new Error('decrypt failed');
    });
    expect(await vaultGet('session')).toBe(null);
  });

  it('returns null for a key that was never set', async () => {
    expect(await vaultGet('apiKey')).toBe(null);
  });

  it('throws VAULT_UNAVAILABLE and writes no plaintext when encryption is unavailable', async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
    await expect(vaultSet('session', 'x')).rejects.toThrow('VAULT_UNAVAILABLE');
    const vaultFile = path.join(currentVaultDir, 'vault.bin');
    const exists = await fs
      .access(vaultFile)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      const raw = await fs.readFile(vaultFile, 'utf8');
      expect(raw).not.toContain('x');
    }
  });

  it('vaultHas returns true after set, false for a missing key, and never calls decryptString', async () => {
    await vaultSet('session', 'secret-abc');
    vi.mocked(safeStorage.decryptString).mockClear();
    expect(await vaultHas('session')).toBe(true);
    expect(await vaultHas('cfToken')).toBe(false);
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
  });
});
