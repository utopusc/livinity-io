import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * usage-probe.test.ts mocks the two IO collaborators usage-probe.ts imports
 * directly (state-store/wsl-exec) — mirrors engine.test.ts's mocking
 * discipline. Zero real wsl.exe is ever invoked. `parseUsageOutput` is the
 * pure inner parser, table-tested directly (no mocks needed for those rows).
 */

const readStateMock = vi.hoisted(() => vi.fn());
const execWslMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/main/storage/state-store', () => ({
  readState: readStateMock,
}));

vi.mock('../../src/main/wsl/wsl-exec', () => ({
  execWsl: execWslMock,
}));

import { getUsage, parseUsageOutput } from '../../src/main/supervision/usage-probe';

/** A realistic combined `cat /proc/meminfo /proc/loadavg && nproc && df -k /` transcript. */
const REALISTIC_STDOUT = `MemTotal:       16384000 kB
MemFree:          987654 kB
MemAvailable:    8192000 kB
Buffers:          123456 kB
Cached:           654321 kB
SwapTotal:             0 kB
SwapFree:              0 kB
0.52 0.58 0.59 1/213 12345
8
Filesystem     1K-blocks    Used Available Use% Mounted on
overlay         41943040  876543  39943040   3% /
`;

function resetMocks(): void {
  readStateMock.mockReset().mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
  execWslMock.mockReset().mockResolvedValue({ code: 0, stdout: REALISTIC_STDOUT, stderr: '' });
}

describe('parseUsageOutput (pure)', () => {
  it('parses a realistic combined transcript into numeric facts', () => {
    const result = parseUsageOutput(REALISTIC_STDOUT);
    expect(result).toEqual({
      memUsedKb: 16384000 - 8192000,
      memTotalKb: 16384000,
      load1: 0.52,
      cpuCount: 8,
      diskUsedKb: 876543,
      diskTotalKb: 41943040,
    });
  });

  it('falls back to MemFree when MemAvailable is absent (older kernel)', () => {
    const stdout = REALISTIC_STDOUT.replace(/^MemAvailable:.*\n/m, '');
    const result = parseUsageOutput(stdout);
    expect(result?.memUsedKb).toBe(16384000 - 987654);
  });

  it('returns null when MemTotal is missing', () => {
    const stdout = REALISTIC_STDOUT.replace(/^MemTotal:.*\n/m, '');
    expect(parseUsageOutput(stdout)).toBeNull();
  });

  it('returns null when the loadavg line is missing', () => {
    const stdout = REALISTIC_STDOUT.replace(/^0\.52 0\.58 0\.59 1\/213 12345\n/m, '');
    expect(parseUsageOutput(stdout)).toBeNull();
  });

  it('returns null when the nproc line is missing', () => {
    const stdout = REALISTIC_STDOUT.replace(/^8\n/m, '');
    expect(parseUsageOutput(stdout)).toBeNull();
  });

  it('returns null when the df data line is missing', () => {
    const stdout = REALISTIC_STDOUT.replace(/^overlay.*\/\s*\n/m, '');
    expect(parseUsageOutput(stdout)).toBeNull();
  });

  it('returns null for garbage/empty stdout', () => {
    expect(parseUsageOutput('')).toBeNull();
    expect(parseUsageOutput('not even close to the real format')).toBeNull();
  });
});

describe('getUsage', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('PASSIVE: engineDesiredState !== "running" -> {ok:false, reason:"engine-stopped"} WITHOUT calling execWsl at all', async () => {
    readStateMock.mockResolvedValueOnce({ version: 1, currentStep: 'x', engineDesiredState: 'stopped' });
    const result = await getUsage();
    expect(result).toEqual({ ok: false, reason: 'engine-stopped' });
    expect(execWslMock).not.toHaveBeenCalled();
  });

  it('PASSIVE: a never-persisted (null) state -> {ok:false, reason:"engine-stopped"} WITHOUT calling execWsl', async () => {
    readStateMock.mockResolvedValueOnce(null);
    const result = await getUsage();
    expect(result).toEqual({ ok: false, reason: 'engine-stopped' });
    expect(execWslMock).not.toHaveBeenCalled();
  });

  it('running: calls execWsl with the exact single-shot argv (-d livinity -- sh -c "...")', async () => {
    await getUsage();
    expect(execWslMock).toHaveBeenCalledTimes(1);
    expect(execWslMock).toHaveBeenCalledWith([
      '-d',
      'livinity',
      '--',
      'sh',
      '-c',
      'cat /proc/meminfo /proc/loadavg && nproc && df -k /',
    ]);
  });

  it('running + healthy exec + parseable stdout -> {ok:true, ...numeric facts}', async () => {
    const result = await getUsage();
    expect(result).toEqual({
      ok: true,
      memUsedKb: 16384000 - 8192000,
      memTotalKb: 16384000,
      load1: 0.52,
      cpuCount: 8,
      diskUsedKb: 876543,
      diskTotalKb: 41943040,
    });
  });

  it('running + non-zero exit code -> {ok:false, reason:"probe-failed"}', async () => {
    execWslMock.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'boom' });
    const result = await getUsage();
    expect(result).toEqual({ ok: false, reason: 'probe-failed' });
  });

  it('running + exit 0 but unparseable stdout -> {ok:false, reason:"probe-failed"}', async () => {
    execWslMock.mockResolvedValueOnce({ code: 0, stdout: 'garbage', stderr: '' });
    const result = await getUsage();
    expect(result).toEqual({ ok: false, reason: 'probe-failed' });
  });

  it('a throwing readState degrades to {ok:false, reason:"probe-failed"}, never rejects', async () => {
    readStateMock.mockRejectedValueOnce(new Error('boom'));
    await expect(getUsage()).resolves.toEqual({ ok: false, reason: 'probe-failed' });
  });

  it('a throwing execWsl degrades to {ok:false, reason:"probe-failed"}, never rejects', async () => {
    execWslMock.mockRejectedValueOnce(new Error('boom'));
    await expect(getUsage()).resolves.toEqual({ ok: false, reason: 'probe-failed' });
  });

  it('deps are injectable (readState/execWsl overridable per call)', async () => {
    const fakeReadState = vi.fn().mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'running' });
    const fakeExecWsl = vi.fn().mockResolvedValue({ code: 0, stdout: REALISTIC_STDOUT, stderr: '' });
    const result = await getUsage({ readState: fakeReadState, execWsl: fakeExecWsl });
    expect(fakeReadState).toHaveBeenCalled();
    expect(fakeExecWsl).toHaveBeenCalled();
    expect(readStateMock).not.toHaveBeenCalled();
    expect(execWslMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});
