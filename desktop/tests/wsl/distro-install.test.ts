import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * distro-install.test.ts mocks execWsl (wsl-exec) and the whole disk-probe
 * module (getFreeDiskGb, getVmLaunchError) — the IO collaborators
 * provisionDistro composes directly — plus `electron`'s `app.getPath` (no
 * real Electron runtime in vitest). The download/checksum/unlink seams have
 * no separate module (they are private helpers inside distro-install.ts
 * itself), so they are overridden per-test via the `deps` injection
 * parameter instead. The REAL parse-wsl-list helpers (isDistroRegistered,
 * parseWslVersion) are used unmocked — same real-pure-helper discipline as
 * tests/cloudflare/cf-provision.test.ts.
 */

vi.mock('../../src/main/wsl/wsl-exec', () => ({
  execWsl: vi.fn(),
}));

vi.mock('../../src/main/wsl/disk-probe', () => ({
  getFreeDiskGb: vi.fn(),
  getVirtualizationEnabled: vi.fn(),
  getVmLaunchError: vi.fn(),
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:\\fake\\userData') },
}));

import { execWsl } from '../../src/main/wsl/wsl-exec';
import { getFreeDiskGb, getVmLaunchError } from '../../src/main/wsl/disk-probe';
import { provisionDistro, type ProvisionDistroDeps } from '../../src/main/wsl/distro-install';

const execWslMock = vi.mocked(execWsl);
const getFreeDiskGbMock = vi.mocked(getFreeDiskGb);
const getVmLaunchErrorMock = vi.mocked(getVmLaunchError);

/** Not-registered `wsl --list --quiet` output (empty — no distro yet). */
const LIST_EMPTY = { code: 0, stdout: '', stderr: '' };
/** Registered `wsl --list --quiet` output — exact-line match against 'livinity'. */
const LIST_HAS_LIVINITY = { code: 0, stdout: 'livinity\n', stderr: '' };
const VERSION_2_5 = { code: 0, stdout: 'WSL version: 2.5.9.0\nKernel version: 5.15.0\n', stderr: '' };
const VERSION_2_4_0 = { code: 0, stdout: 'WSL version: 2.4.0.0\nKernel version: 5.15.0\n', stderr: '' };
const OK_EXEC = { code: 0, stdout: '', stderr: '' };

/** A fully fake, no-disk-IO deps override for the download/checksum/unlink seams. */
function fakeDeps(over: Partial<ProvisionDistroDeps> = {}): Partial<ProvisionDistroDeps> {
  return {
    downloadFile: vi.fn(async (_url, _dest, onProgress) => {
      onProgress?.(100, 100);
    }),
    sha256File: vi.fn(async () => '121293686380669964a47cf44f154f63d05aa6af52bdd95dcc0fd2fe1760a2ef'),
    unlinkFile: vi.fn(async () => undefined),
    ...over,
  };
}

/** Collapses consecutive-duplicate phase pushes into the distinct phase sequence. */
function phaseSequence(calls: { phase: string }[]): string[] {
  const seq: string[] = [];
  for (const c of calls) {
    if (seq[seq.length - 1] !== c.phase) seq.push(c.phase);
  }
  return seq;
}

const originalArch = process.arch;

function setArch(arch: string): void {
  Object.defineProperty(process, 'arch', { value: arch, configurable: true });
}

describe('distro-install / provisionDistro', () => {
  beforeEach(() => {
    execWslMock.mockReset();
    getFreeDiskGbMock.mockReset();
    getVmLaunchErrorMock.mockReset();
    setArch(originalArch);
  });

  afterEach(() => {
    setArch(originalArch);
  });

  it('blocks ARM64 with no arm64 artifact BEFORE any disk/download call', async () => {
    setArch('arm64');
    const deps = fakeDeps();
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'arch-unsupported' });
    expect(deps.downloadFile).not.toHaveBeenCalled();
    expect(execWslMock).not.toHaveBeenCalled();
  });

  it('gates on <15GB free disk EARLY, before the download starts (D-10)', async () => {
    execWslMock.mockResolvedValue(LIST_EMPTY);
    getFreeDiskGbMock.mockResolvedValue(8);
    const deps = fakeDeps();
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'disk-too-small', freeGb: 8, driveLetter: 'C' });
    expect(deps.downloadFile).not.toHaveBeenCalled();
  });

  it('never imports on a checksum mismatch (supply-chain guard, T-04-05)', async () => {
    execWslMock.mockResolvedValue(LIST_EMPTY);
    getFreeDiskGbMock.mockResolvedValue(50);
    const deps = fakeDeps({ sha256File: vi.fn(async () => 'deadbeef-not-the-real-checksum') });
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'checksum-failed' });
    const importCalls = execWslMock.mock.calls.filter(
      ([args]) => args.includes('--install') || args.includes('--import')
    );
    expect(importCalls).toHaveLength(0);
    expect(importCalls.length).toBe(0); // toHaveBeenCalledTimes(0)-equivalent on the import branch
  });

  it('resolves download-failed on a network error, without touching checksum/import', async () => {
    execWslMock.mockResolvedValue(LIST_EMPTY);
    getFreeDiskGbMock.mockResolvedValue(50);
    const deps = fakeDeps({ downloadFile: vi.fn(async () => { throw new Error('ECONNRESET'); }) });
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'download-failed' });
  });

  it('reuses an existing livinity distro (D-11) — SKIPS download+import, never calls a distro-removal command', async () => {
    execWslMock.mockResolvedValue(LIST_HAS_LIVINITY);
    const deps = fakeDeps();
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'installed' });
    expect(deps.downloadFile).not.toHaveBeenCalled();
    expect(execWslMock).toHaveBeenCalledTimes(1);
    expect(execWslMock).toHaveBeenCalledWith(['--list', '--quiet']);
    const removalCalls = execWslMock.mock.calls.filter(([args]) =>
      args.some((a) => a.toLowerCase().includes('un' + 'register'))
    );
    expect(removalCalls).toHaveLength(0);
  });

  it('WSL >=2.4.4 uses the .wsl `--from-file` branch, first-boot-verifies, sparse non-fatal-ok, resolves installed', async () => {
    execWslMock.mockImplementation(async (args: string[]) => {
      if (args[0] === '--list') return LIST_EMPTY;
      if (args[0] === '--version') return VERSION_2_5;
      return OK_EXEC;
    });
    getFreeDiskGbMock.mockResolvedValue(50);
    getVmLaunchErrorMock.mockResolvedValue(null);
    const deps = fakeDeps();
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'installed' });
    const installCall = execWslMock.mock.calls.find(([args]) => args[0] === '--install');
    expect(installCall).toBeDefined();
    expect(installCall![0]).toContain('--from-file');
    expect(getVmLaunchErrorMock).toHaveBeenCalledWith(true);
    const importCall = execWslMock.mock.calls.find(([args]) => args[0] === '--import');
    expect(importCall).toBeUndefined();
  });

  it('WSL <2.4.4 (2.4.0) falls back to the --import branch', async () => {
    execWslMock.mockImplementation(async (args: string[]) => {
      if (args[0] === '--list') return LIST_EMPTY;
      if (args[0] === '--version') return VERSION_2_4_0;
      return OK_EXEC;
    });
    getFreeDiskGbMock.mockResolvedValue(50);
    getVmLaunchErrorMock.mockResolvedValue(null);
    const deps = fakeDeps();
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'installed' });
    const importCall = execWslMock.mock.calls.find(([args]) => args[0] === '--import');
    expect(importCall).toBeDefined();
    const installCall = execWslMock.mock.calls.find(([args]) => args[0] === '--install');
    expect(installCall).toBeUndefined();
  });

  it('a sparse-set failure does NOT fail the install (Pitfall 6, non-fatal)', async () => {
    execWslMock.mockImplementation(async (args: string[]) => {
      if (args[0] === '--list') return LIST_EMPTY;
      if (args[0] === '--version') return VERSION_2_5;
      if (args[0] === '--manage') throw new Error('--set-sparse unavailable on this WSL version');
      return OK_EXEC;
    });
    getFreeDiskGbMock.mockResolvedValue(50);
    getVmLaunchErrorMock.mockResolvedValue(null);
    const deps = fakeDeps();
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'installed' });
  });

  it('a failed --install --from-file (non-zero exit) resolves error and NEVER reaches the first-boot verify (WR-03 regression)', async () => {
    execWslMock.mockImplementation(async (args: string[]) => {
      if (args[0] === '--list') return LIST_EMPTY;
      if (args[0] === '--version') return VERSION_2_5;
      if (args[0] === '--install') return { code: 1, stdout: '', stderr: '' };
      return OK_EXEC;
    });
    getFreeDiskGbMock.mockResolvedValue(50);
    getVmLaunchErrorMock.mockResolvedValue(null);
    const deps = fakeDeps();
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'error' });
    expect(result.kind).not.toBe('installed');
    // first-boot verify + sparse must never run against a distro that failed to import
    expect(getVmLaunchErrorMock).not.toHaveBeenCalled();
    const sparseCall = execWslMock.mock.calls.find(([args]) => args[0] === '--manage');
    expect(sparseCall).toBeUndefined();
  });

  it('a failed --import fallback (spawn-dead null exit) resolves error, NOT installed (WR-03 regression)', async () => {
    execWslMock.mockImplementation(async (args: string[]) => {
      if (args[0] === '--list') return LIST_EMPTY;
      if (args[0] === '--version') return VERSION_2_4_0;
      if (args[0] === '--import') return { code: null, stdout: '', stderr: '' };
      return OK_EXEC;
    });
    getFreeDiskGbMock.mockResolvedValue(50);
    getVmLaunchErrorMock.mockResolvedValue(null);
    const deps = fakeDeps();
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'error' });
    expect(getVmLaunchErrorMock).not.toHaveBeenCalled();
  });

  it('FIRST-BOOT VERIFY: a captured 0x80370102 launch error resolves error, NOT installed', async () => {
    execWslMock.mockImplementation(async (args: string[]) => {
      if (args[0] === '--list') return LIST_EMPTY;
      if (args[0] === '--version') return VERSION_2_5;
      return OK_EXEC;
    });
    getFreeDiskGbMock.mockResolvedValue(50);
    getVmLaunchErrorMock.mockResolvedValue('0x80370102');
    const deps = fakeDeps();
    const result = await provisionDistro(undefined, deps);
    expect(result).toEqual({ kind: 'error' });
    expect(result.kind).not.toBe('installed');
    expect(getVmLaunchErrorMock).toHaveBeenCalledTimes(1);
    expect(getVmLaunchErrorMock).toHaveBeenCalledWith(true);
    // sparse must never run after a captured firmware block.
    const sparseCall = execWslMock.mock.calls.find(([args]) => args[0] === '--manage');
    expect(sparseCall).toBeUndefined();
  });

  it('onUpdate fires phases in order: disk-check -> downloading -> verifying -> importing -> sparse (happy path)', async () => {
    execWslMock.mockImplementation(async (args: string[]) => {
      if (args[0] === '--list') return LIST_EMPTY;
      if (args[0] === '--version') return VERSION_2_5;
      return OK_EXEC;
    });
    getFreeDiskGbMock.mockResolvedValue(50);
    getVmLaunchErrorMock.mockResolvedValue(null);
    const deps = fakeDeps();
    const seen: { phase: string }[] = [];
    const result = await provisionDistro((u) => seen.push(u), deps);
    expect(result).toEqual({ kind: 'installed' });
    expect(phaseSequence(seen)).toEqual([
      'disk-check',
      'downloading',
      'verifying',
      'importing',
      'sparse',
    ]);
  });

  it('degrades any thrown IO error to { kind: "error" } via the outer try/catch (never a rejected promise)', async () => {
    execWslMock.mockResolvedValue(LIST_EMPTY);
    getFreeDiskGbMock.mockRejectedValue(new Error('PowerShell probe exploded'));
    const deps = fakeDeps();
    await expect(provisionDistro(undefined, deps)).resolves.toEqual({ kind: 'error' });
  });

  it('a second concurrent call returns without starting a duplicate import (inFlight guard)', async () => {
    execWslMock.mockImplementation(async (args: string[]) => {
      if (args[0] === '--list') return LIST_EMPTY;
      if (args[0] === '--version') return VERSION_2_5;
      return OK_EXEC;
    });
    getFreeDiskGbMock.mockResolvedValue(50);
    getVmLaunchErrorMock.mockResolvedValue(null);
    const deps = fakeDeps();

    const p1 = provisionDistro(undefined, deps);
    const p2 = provisionDistro(undefined, deps);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r2).toEqual({ kind: 'error' });
    expect(r1).toEqual({ kind: 'installed' });
    // Only the FIRST call's download ever ran — no duplicate download/import.
    expect(deps.downloadFile).toHaveBeenCalledTimes(1);
  });
});
