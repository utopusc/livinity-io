import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  spawnHolder,
  adoptOrSpawnHolder,
  killHolder,
  isPidAliveAsWsl,
  readHolderRecord,
} from '../../src/main/supervision/holder';

/**
 * holder.test.ts injects EVERY IO collaborator (spawn/execFile/fs/kill/
 * getUserDataPath) via holder.ts's `deps` seam -- zero real process is ever
 * spawned or killed, mirroring install-invoke.test.ts's FakeChild style.
 * The load-bearing assertions: adoption avoids a second spawn, liveness is
 * PID-reuse-safe (image-name match), and the holder argv is a fixed literal
 * that never contains a secret (T-06-04 source-scan).
 */

class FakeChild extends EventEmitter {
  pid = 4242;
  unref = vi.fn();
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const fakeChild = new FakeChild();
  const spawnMock = vi.fn(() => fakeChild);
  const execFileMock = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
  const readFileMock = vi.fn().mockRejectedValue(new Error('ENOENT'));
  const writeFileMock = vi.fn().mockResolvedValue(undefined);
  const unlinkMock = vi.fn().mockResolvedValue(undefined);
  const killMock = vi.fn();
  const getUserDataPathMock = vi.fn(() => 'C:\\fake\\userData');
  return {
    fakeChild,
    spawn: spawnMock,
    execFile: execFileMock,
    readFile: readFileMock,
    writeFile: writeFileMock,
    unlink: unlinkMock,
    kill: killMock,
    getUserDataPath: getUserDataPathMock,
    ...overrides,
  };
}

describe('holder', () => {
  describe('spawnHolder', () => {
    it('spawns wsl.exe with the fixed literal argv, detached+unref+windowsHide, and writes a {pid,spawnedAt} pidfile', async () => {
      const deps = makeDeps();

      const pid = await spawnHolder(deps as never);

      expect(deps.spawn).toHaveBeenCalledWith(
        'wsl.exe',
        ['-d', 'livinity', '--exec', 'sleep', 'infinity'],
        { detached: true, stdio: 'ignore', windowsHide: true }
      );
      expect(deps.fakeChild.unref).toHaveBeenCalled();
      expect(pid).toBe(4242);

      expect(deps.writeFile).toHaveBeenCalledTimes(1);
      const [writtenPath, writtenData] = deps.writeFile.mock.calls[0] as [string, string];
      expect(writtenPath).toContain('holder.json');
      const parsed = JSON.parse(writtenData) as { pid: number; spawnedAt: string };
      expect(parsed.pid).toBe(4242);
      expect(typeof parsed.spawnedAt).toBe('string');
    });

    it('the holder argv never contains a secret-like value (T-06-04 source-scan)', async () => {
      const deps = makeDeps();
      const secretLikeNames = ['apiKey', 'cfToken', 'tunnelToken', 'liv_k_', 'vault'];

      await spawnHolder(deps as never);

      const args = deps.spawn.mock.calls[0][1] as string[];
      for (const secretName of secretLikeNames) {
        expect(args.some((a) => a.toLowerCase().includes(secretName.toLowerCase()))).toBe(false);
      }
    });
  });

  describe('isPidAliveAsWsl', () => {
    it('true when tasklist stdout has a matching wsl.exe row', async () => {
      const deps = makeDeps({
        execFile: vi.fn().mockResolvedValue({
          stdout: '"wsl.exe","4242","Console","1","12,345 K"',
          stderr: '',
        }),
      });

      expect(await isPidAliveAsWsl(4242, deps as never)).toBe(true);
      expect(deps.execFile).toHaveBeenCalledWith(
        'tasklist',
        ['/FI', 'PID eq 4242', '/FI', 'IMAGENAME eq wsl.exe', '/NH'],
        { windowsHide: true }
      );
    });

    it('false when tasklist stdout is empty (no matching row)', async () => {
      const deps = makeDeps({ execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }) });

      expect(await isPidAliveAsWsl(4242, deps as never)).toBe(false);
    });

    it("false when tasklist stdout is the locale-safe 'no tasks' fallback line", async () => {
      const deps = makeDeps({
        execFile: vi.fn().mockResolvedValue({
          stdout: 'INFO: No tasks are running which match the specified criteria.',
          stderr: '',
        }),
      });

      expect(await isPidAliveAsWsl(4242, deps as never)).toBe(false);
    });

    it('false (never throws) when execFile rejects', async () => {
      const deps = makeDeps({ execFile: vi.fn().mockRejectedValue(new Error('boom')) });

      await expect(isPidAliveAsWsl(4242, deps as never)).resolves.toBe(false);
    });
  });

  describe('readHolderRecord', () => {
    it('returns null when the pidfile is absent', async () => {
      const deps = makeDeps({ readFile: vi.fn().mockRejectedValue(new Error('ENOENT')) });

      expect(await readHolderRecord(deps as never)).toBeNull();
    });

    it('returns null when the pidfile contains malformed JSON', async () => {
      const deps = makeDeps({ readFile: vi.fn().mockResolvedValue('not json{{') });

      expect(await readHolderRecord(deps as never)).toBeNull();
    });

    it('returns null when the pidfile JSON is missing required fields', async () => {
      const deps = makeDeps({ readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 'not-a-number' })) });

      expect(await readHolderRecord(deps as never)).toBeNull();
    });

    it('returns the parsed record on a valid pidfile', async () => {
      const deps = makeDeps({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 999, spawnedAt: '2026-07-11T00:00:00.000Z' })),
      });

      expect(await readHolderRecord(deps as never)).toEqual({ pid: 999, spawnedAt: '2026-07-11T00:00:00.000Z' });
    });
  });

  describe('adoptOrSpawnHolder', () => {
    it('adopts a live holder (pidfile present + isPidAliveAsWsl=true) -- spawn NOT called', async () => {
      const deps = makeDeps({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 555, spawnedAt: '2026-07-11T00:00:00.000Z' })),
        execFile: vi.fn().mockResolvedValue({ stdout: '"wsl.exe","555","Console","1","1 K"', stderr: '' }),
      });

      const pid = await adoptOrSpawnHolder(deps as never);

      expect(pid).toBe(555);
      expect(deps.spawn).not.toHaveBeenCalled();
    });

    it('spawns when the pidfile is absent', async () => {
      const deps = makeDeps({ readFile: vi.fn().mockRejectedValue(new Error('ENOENT')) });

      const pid = await adoptOrSpawnHolder(deps as never);

      expect(pid).toBe(4242);
      expect(deps.spawn).toHaveBeenCalledTimes(1);
    });

    it('spawns when the recorded pid is dead', async () => {
      const deps = makeDeps({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 555, spawnedAt: '2026-07-11T00:00:00.000Z' })),
        execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      });

      const pid = await adoptOrSpawnHolder(deps as never);

      expect(pid).toBe(4242);
      expect(deps.spawn).toHaveBeenCalledTimes(1);
    });

    it('spawns when the recorded pid is alive but NOT running as wsl.exe (PID reuse guard)', async () => {
      const deps = makeDeps({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 555, spawnedAt: '2026-07-11T00:00:00.000Z' })),
        // tasklist filtered on IMAGENAME eq wsl.exe returns nothing -- the PID
        // is alive but now belongs to an unrelated process (reuse case).
        execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      });

      const pid = await adoptOrSpawnHolder(deps as never);

      expect(pid).toBe(4242);
      expect(deps.spawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('killHolder', () => {
    it('reads the pidfile, verifies the PID still runs as wsl.exe, best-effort kills it, and clears the pidfile', async () => {
      const deps = makeDeps({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 777, spawnedAt: '2026-07-11T00:00:00.000Z' })),
        execFile: vi.fn().mockResolvedValue({ stdout: '"wsl.exe","777","Console","1","1 K"', stderr: '' }),
      });

      await killHolder(deps as never);

      expect(deps.execFile).toHaveBeenCalledWith(
        'tasklist',
        ['/FI', 'PID eq 777', '/FI', 'IMAGENAME eq wsl.exe', '/NH'],
        { windowsHide: true }
      );
      expect(deps.kill).toHaveBeenCalledWith(777);
      expect(deps.unlink).toHaveBeenCalledTimes(1);
    });

    it('WR-01 regression: stale pidfile whose PID is NOT running as wsl.exe (reboot/PID-reuse) => kill is NEVER called, pidfile still unlinked', async () => {
      const deps = makeDeps({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 777, spawnedAt: '2026-07-11T00:00:00.000Z' })),
        // tasklist filtered on IMAGENAME eq wsl.exe returns nothing -- the PID
        // is dead, or alive but reused by an unrelated innocent process.
        execFile: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      });

      await killHolder(deps as never);

      expect(deps.kill).not.toHaveBeenCalled();
      expect(deps.unlink).toHaveBeenCalledTimes(1);
    });

    it('WR-01 regression: tasklist itself failing (execFile rejects) degrades to NOT killing (never a blind pidfile kill)', async () => {
      const deps = makeDeps({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 777, spawnedAt: '2026-07-11T00:00:00.000Z' })),
        execFile: vi.fn().mockRejectedValue(new Error('access denied')),
      });

      await expect(killHolder(deps as never)).resolves.toBeUndefined();
      expect(deps.kill).not.toHaveBeenCalled();
      expect(deps.unlink).toHaveBeenCalledTimes(1);
    });

    it('resolves without throwing when the pidfile is missing', async () => {
      const deps = makeDeps({ readFile: vi.fn().mockRejectedValue(new Error('ENOENT')) });

      await expect(killHolder(deps as never)).resolves.toBeUndefined();
      expect(deps.kill).not.toHaveBeenCalled();
    });

    it('resolves without throwing when kill() itself throws (races an exit after the liveness check)', async () => {
      const deps = makeDeps({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 777, spawnedAt: '2026-07-11T00:00:00.000Z' })),
        execFile: vi.fn().mockResolvedValue({ stdout: '"wsl.exe","777","Console","1","1 K"', stderr: '' }),
        kill: vi.fn(() => {
          throw new Error('ESRCH');
        }),
      });

      await expect(killHolder(deps as never)).resolves.toBeUndefined();
    });

    it('resolves without throwing when unlink() itself rejects (pidfile already gone)', async () => {
      const deps = makeDeps({
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ pid: 777, spawnedAt: '2026-07-11T00:00:00.000Z' })),
        execFile: vi.fn().mockResolvedValue({ stdout: '"wsl.exe","777","Console","1","1 K"', stderr: '' }),
        unlink: vi.fn().mockRejectedValue(new Error('ENOENT')),
      });

      await expect(killHolder(deps as never)).resolves.toBeUndefined();
    });
  });
});
