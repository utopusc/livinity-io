import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

/**
 * wsl-exec.test.ts establishes the repo's FIRST node:child_process mock seam
 * (04-PATTERNS.md "No Analog Found" row). A minimal fake child is an
 * EventEmitter with EventEmitter-shaped stdout/stderr sub-streams, an `on`
 * (inherited), and a `kill` spy — enough to drive spawn's data/close/error
 * event contract without a real OS process.
 */

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

import { logSafe } from '../../src/main/log';
import { execWsl, execPowerShellJson } from '../../src/main/wsl/wsl-exec';

const logSafeMock = vi.mocked(logSafe);

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

describe('wsl-exec', () => {
  let fakeChild: FakeChild;

  beforeEach(() => {
    fakeChild = new FakeChild();
    spawnMock.mockReset();
    spawnMock.mockReturnValue(fakeChild);
    logSafeMock.mockClear();
  });

  it('execWsl spawns wsl.exe with windowsHide:true and env.WSL_UTF8===1', () => {
    void execWsl(['--status']);
    expect(spawnMock).toHaveBeenCalledWith(
      'wsl.exe',
      ['--status'],
      expect.objectContaining({
        windowsHide: true,
        env: expect.objectContaining({ WSL_UTF8: '1' }),
      })
    );
  });

  it('resolves {code,stdout,stderr} by draining stdout/stderr then firing close', async () => {
    const promise = execWsl(['--status']);
    fakeChild.stdout.emit('data', Buffer.from('hello '));
    fakeChild.stdout.emit('data', Buffer.from('world'));
    fakeChild.stderr.emit('data', Buffer.from('warn'));
    fakeChild.emit('close', 0);
    const result = await promise;
    expect(result).toEqual({ code: 0, stdout: 'hello world', stderr: 'warn' });
  });

  it('decodes stdout as utf8 — a fixture buffer round-trips with no NUL bytes', async () => {
    const promise = execWsl(['-l', '-v', '--quiet']);
    const fixture = Buffer.from('Ubuntu\nlivinity\n', 'utf8');
    fakeChild.stdout.emit('data', fixture);
    fakeChild.emit('close', 0);
    const result = await promise;
    expect(result.stdout).toBe('Ubuntu\nlivinity\n');
    expect(result.stdout).not.toContain('\u0000');
  });

  it('execPowerShellJson spawns powershell.exe with -NoProfile/-NonInteractive/-Command + windowsHide:true', () => {
    void execPowerShellJson('Get-Date | ConvertTo-Json');
    expect(spawnMock).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-Date | ConvertTo-Json'],
      expect.objectContaining({ windowsHide: true })
    );
  });

  it('a spawn error event (ENOENT) resolves {code:null,...} rather than rejecting', async () => {
    const promise = execWsl(['--status']);
    fakeChild.emit('error', new Error('spawn wsl.exe ENOENT'));
    const result = await promise;
    expect(result.code).toBeNull();
    expect(result.stdout).toBe('');
  });

  it('a timeout kills the child and resolves {code:null,...} — never hangs forever', async () => {
    const promise = execWsl(['--status'], { timeoutMs: 5 });
    // Deliberately never emit 'close' — only the timeout should settle this.
    const result = await promise;
    expect(result.code).toBeNull();
    expect(fakeChild.kill).toHaveBeenCalled();
  });

  it('logSafe receives scalar-only metadata and NEVER the raw env (secrets)', async () => {
    const promise = execWsl(['--status']);
    fakeChild.emit('close', 0);
    await promise;

    expect(logSafeMock).toHaveBeenCalled();
    for (const call of logSafeMock.mock.calls) {
      const meta = call[1] as Record<string, unknown> | undefined;
      expect(meta).not.toHaveProperty('env');
      if (meta) {
        for (const value of Object.values(meta)) {
          expect(['string', 'number', 'boolean']).toContain(typeof value);
        }
      }
    }
  });
});
