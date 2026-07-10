import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

/**
 * elevate.test.ts mocks node:child_process (the outer elevating spawn),
 * node:fs (the temp-file relay), and node:crypto (randomUUID, pinned to a
 * fixed value so the temp-file path is assertable) — no real UAC prompt or
 * filesystem write ever happens in this suite.
 */

const spawnMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const unlinkMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('node:fs', () => ({
  promises: {
    readFile: readFileMock,
    unlink: unlinkMock,
  },
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'fixed-uuid-1234',
}));

import { runElevatedWslInstall, buildInnerScript } from '../../src/main/wsl/elevate';

class FakeChild extends EventEmitter {}

const instantSleep = () => Promise.resolve();

describe('elevate', () => {
  let fakeChild: FakeChild;

  beforeEach(() => {
    fakeChild = new FakeChild();
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => fakeChild.emit('close', 0));
      return fakeChild;
    });
    readFileMock.mockReset();
    unlinkMock.mockReset();
    unlinkMock.mockResolvedValue(undefined);
  });

  it('resolves {ok:true, exitCode:0} when the temp file contains {"exitCode":0}', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ exitCode: 0 }));
    const result = await runElevatedWslInstall({ sleep: instantSleep });
    expect(result).toEqual({ ok: true, exitCode: 0 });
    expect(unlinkMock).toHaveBeenCalled();
  });

  it('resolves {ok:true, exitCode:0} when the temp file is UTF-8-BOM-prefixed (PS 5.1 Set-Content -Encoding utf8 always writes a BOM) — WR-01 regression', async () => {
    readFileMock.mockResolvedValue('\uFEFF' + JSON.stringify({ exitCode: 0 }));
    const result = await runElevatedWslInstall({ sleep: instantSleep });
    expect(result).toEqual({ ok: true, exitCode: 0 });
  });

  it('a BOM-prefixed non-zero exit code still parses (never misreported as declined -1) — WR-01 regression', async () => {
    readFileMock.mockResolvedValue('\uFEFF' + JSON.stringify({ exitCode: 14107 }));
    const result = await runElevatedWslInstall({ sleep: instantSleep });
    expect(result).toEqual({ ok: false, exitCode: 14107 });
  });

  it('resolves {ok:false, exitCode:14107} (feature-enablement failure, routed onward as needs-enable — NOT bios-blocked) when the temp file contains {"exitCode":14107}', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ exitCode: 14107 }));
    const result = await runElevatedWslInstall({ sleep: instantSleep });
    expect(result).toEqual({ ok: false, exitCode: 14107 });
  });

  it('resolves {ok:false, exitCode:-1} WITHOUT throwing when NO temp file is present (UAC declined/dismissed)', async () => {
    readFileMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(runElevatedWslInstall({ sleep: instantSleep })).resolves.toEqual({
      ok: false,
      exitCode: -1,
    });
  });

  it('the temp-file path is generated via crypto.randomUUID() (main-side) — readFile/unlink target that path', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ exitCode: 0 }));
    await runElevatedWslInstall({ sleep: instantSleep });
    const [readPath] = readFileMock.mock.calls[0];
    const [unlinkPath] = unlinkMock.mock.calls[0];
    expect(readPath).toContain('fixed-uuid-1234');
    expect(unlinkPath).toContain('fixed-uuid-1234');
  });

  it('spawns the OUTER elevating call windowsHide:true, with a -Verb RunAs single-UAC shape', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ exitCode: 0 }));
    await runElevatedWslInstall({ sleep: instantSleep });

    expect(spawnMock).toHaveBeenCalledWith(
      'powershell.exe',
      expect.any(Array),
      expect.objectContaining({ windowsHide: true })
    );
    const [, args] = spawnMock.mock.calls[0] as [string, string[], unknown];
    const joined = args.join(' ');
    expect(joined).toContain('RunAs');
  });

  it('the elevated script body is a FIXED literal template — only the randomUUID resultFile path varies (T-04-01)', () => {
    const scriptA = buildInnerScript('C:\\temp\\livinity-wsl-enable-aaaa.json');
    const scriptB = buildInnerScript('C:\\temp\\livinity-wsl-enable-bbbb.json');
    expect(scriptA.split('C:\\temp\\livinity-wsl-enable-aaaa.json').join('X')).toBe(
      scriptB.split('C:\\temp\\livinity-wsl-enable-bbbb.json').join('X')
    );
    expect(scriptA).toContain('--install');
    expect(scriptA).toContain('--no-distribution');
  });
});
