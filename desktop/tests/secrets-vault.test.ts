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

  it('writes via a .tmp file + atomic rename, never a direct write to vault.bin (CR-01)', async () => {
    const writeFileSpy = vi.spyOn(fs, 'writeFile');
    const renameSpy = vi.spyOn(fs, 'rename');

    await vaultSet('session', 'secret-abc');

    expect(writeFileSpy).toHaveBeenCalledWith(
      path.join(currentVaultDir, 'vault.bin.tmp'),
      expect.any(String),
      'utf8'
    );
    expect(renameSpy).toHaveBeenCalledWith(
      path.join(currentVaultDir, 'vault.bin.tmp'),
      path.join(currentVaultDir, 'vault.bin')
    );

    writeFileSpy.mockRestore();
    renameSpy.mockRestore();
  });

  it('retries fs.rename once on a transient EPERM then succeeds (atomic rename survives a transient lock)', async () => {
    const realRename = fs.rename.bind(fs);
    let calls = 0;
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (from: any, to: any) => {
      calls++;
      if (calls === 1) {
        const err: any = new Error('EPERM: operation not permitted, rename');
        err.code = 'EPERM';
        throw err;
      }
      return realRename(from, to);
    });

    await vaultSet('session', 'secret-after-retry');
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(await vaultGet('session')).toBe('secret-after-retry');

    renameSpy.mockRestore();
  });

  it('serializes concurrent vaultSet calls (read,write,read,write — never interleaved reads) so neither update is lost (WR-01)', async () => {
    const events: string[] = [];
    const realReadFile = fs.readFile.bind(fs);
    const realWriteFile = fs.writeFile.bind(fs);

    const readSpy = vi
      .spyOn(fs, 'readFile')
      .mockImplementation(async (...args: Parameters<typeof fs.readFile>) => {
        events.push('read');
        return (realReadFile as any)(...args);
      });
    const writeSpy = vi
      .spyOn(fs, 'writeFile')
      .mockImplementation(async (...args: Parameters<typeof fs.writeFile>) => {
        events.push('write');
        return (realWriteFile as any)(...args);
      });

    await Promise.all([vaultSet('session', 'value-1'), vaultSet('apiKey', 'value-2')]);

    readSpy.mockRestore();
    writeSpy.mockRestore();

    // Without withVaultLock, both calls' reads happen back-to-back before
    // either write lands (['read','read',...]) and the second write clobbers
    // the first's update. With the lock, each call's full read-modify-write
    // cycle completes before the next one starts.
    expect(events).toEqual(['read', 'write', 'read', 'write']);
    expect(await vaultGet('session')).toBe('value-1');
    expect(await vaultGet('apiKey')).toBe('value-2');
  });

  it('removes the orphaned .tmp file when the rename ultimately fails (IN-03)', async () => {
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async () => {
      const err: any = new Error('EACCES: permission denied, rename');
      err.code = 'EACCES'; // non-retryable — fails on the first attempt
      throw err;
    });

    await expect(vaultSet('session', 'will-fail')).rejects.toThrow('EACCES');

    const tmpExists = await fs
      .access(path.join(currentVaultDir, 'vault.bin.tmp'))
      .then(() => true)
      .catch(() => false);
    expect(tmpExists).toBe(false);

    renameSpy.mockRestore();
  });
});
