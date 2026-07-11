import { describe, it, expect, vi } from 'vitest';
import { zipStagingFolder, psQuote, buildCompressCommand } from '../../src/main/support/zip';

/**
 * zip.test.ts injects EVERY IO collaborator (execFile/stat/openPath) directly
 * via zip.ts's `deps` seam (holder.test.ts precedent) -- no real
 * powershell.exe ever spawns, no real filesystem is ever touched, and
 * `node:child_process`/`electron` are never mocked because they are never
 * invoked (all default-dep closures referencing them are overridden here).
 */

function makeDeps(overrides: Record<string, unknown> = {}) {
  const execFileMock = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
  const statMock = vi.fn().mockResolvedValue({ isFile: () => true });
  const openPathMock = vi.fn().mockResolvedValue('');
  return {
    execFile: execFileMock,
    stat: statMock,
    openPath: openPathMock,
    ...overrides,
  };
}

describe('zip', () => {
  describe('psQuote', () => {
    it('wraps a plain string in single quotes', () => {
      expect(psQuote('C:\\staging')).toBe("'C:\\staging'");
    });

    it('doubles an embedded single quote (PowerShell escape) instead of breaking out of the quote', () => {
      expect(psQuote("C:\\it's\\staging")).toBe("'C:\\it''s\\staging'");
    });
  });

  describe('buildCompressCommand', () => {
    it('contains $ErrorActionPreference=\'Stop\', Compress-Archive, and the psQuote-escaped paths', () => {
      const cmd = buildCompressCommand('C:\\staging', 'C:\\out.zip');
      expect(cmd).toContain("$ErrorActionPreference='Stop'");
      expect(cmd).toContain('Compress-Archive');
      expect(cmd).toContain(psQuote('C:\\staging' + '\\*'));
      expect(cmd).toContain(psQuote('C:\\out.zip'));
    });

    it('a stagingDir containing a single quote is doubled, never breaks the command shape', () => {
      const cmd = buildCompressCommand("C:\\it's\\staging", 'C:\\out.zip');
      expect(cmd).toContain("''s");
    });
  });

  describe('zipStagingFolder', () => {
    it('exit 0 + a present zip file => {ok:true}', async () => {
      const deps = makeDeps();
      const result = await zipStagingFolder('C:\\staging', 'C:\\out.zip', deps);
      expect(result).toEqual({ ok: true });
      expect(deps.openPath).not.toHaveBeenCalled();
    });

    it('spawns powershell.exe with -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command and the fixed-literal command shape', async () => {
      const deps = makeDeps();
      await zipStagingFolder('C:\\staging', 'C:\\out.zip', deps);

      expect(deps.execFile).toHaveBeenCalledWith(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', expect.any(String)],
        expect.objectContaining({ windowsHide: true })
      );
      const [, args] = deps.execFile.mock.calls[0] as [string, string[]];
      const cmd = args[5];
      expect(cmd).toContain("$ErrorActionPreference='Stop'");
      expect(cmd).toContain('Compress-Archive');
      expect(cmd).toContain(psQuote('C:\\staging\\*'));
      expect(cmd).toContain(psQuote('C:\\out.zip'));
    });

    it('execFile rejecting (non-zero exit / timeout) => openPath(stagingDir) fallback => {ok:false, folderOpened:true}', async () => {
      const deps = makeDeps({ execFile: vi.fn().mockRejectedValue(new Error('non-zero exit')) });
      const result = await zipStagingFolder('C:\\staging', 'C:\\out.zip', deps);
      expect(result).toEqual({ ok: false, folderOpened: true });
      expect(deps.openPath).toHaveBeenCalledWith('C:\\staging');
    });

    it('execFile resolves exit 0 but fs.stat FAILS (missing zip, Pitfall 8) => folder fallback', async () => {
      const deps = makeDeps({ stat: vi.fn().mockRejectedValue(new Error('ENOENT')) });
      const result = await zipStagingFolder('C:\\staging', 'C:\\out.zip', deps);
      expect(result).toEqual({ ok: false, folderOpened: true });
      expect(deps.openPath).toHaveBeenCalledWith('C:\\staging');
    });

    it('openPath resolving a non-empty error message (Electron real contract) => folderOpened:false', async () => {
      const deps = makeDeps({
        execFile: vi.fn().mockRejectedValue(new Error('non-zero exit')),
        openPath: vi.fn().mockResolvedValue('Could not find the item'),
      });
      const result = await zipStagingFolder('C:\\staging', 'C:\\out.zip', deps);
      expect(result).toEqual({ ok: false, folderOpened: false });
    });

    it('openPath itself throwing never propagates => {ok:false, folderOpened:false}', async () => {
      const deps = makeDeps({
        execFile: vi.fn().mockRejectedValue(new Error('non-zero exit')),
        openPath: vi.fn().mockRejectedValue(new Error('shell unavailable')),
      });
      await expect(zipStagingFolder('C:\\staging', 'C:\\out.zip', deps)).resolves.toEqual({
        ok: false,
        folderOpened: false,
      });
    });

    it('never parses stdout/stderr for the success verdict (locale-safe, exit-code+stat only)', async () => {
      const deps = makeDeps({ execFile: vi.fn().mockResolvedValue({ stdout: 'not a real success marker', stderr: '' }) });
      const result = await zipStagingFolder('C:\\staging', 'C:\\out.zip', deps);
      expect(result).toEqual({ ok: true });
    });
  });
});
