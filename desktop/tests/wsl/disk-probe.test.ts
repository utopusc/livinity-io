import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * disk-probe.test.ts mocks the two wsl-exec.ts collaborators
 * (execPowerShellJson, execWsl) — never a real PowerShell/wsl.exe spawn.
 */

vi.mock('../../src/main/wsl/wsl-exec', () => ({
  execPowerShellJson: vi.fn(),
  execWsl: vi.fn(),
}));

import { execPowerShellJson, execWsl } from '../../src/main/wsl/wsl-exec';
import {
  getFreeDiskGb,
  getVirtualizationEnabled,
  getVmLaunchError,
} from '../../src/main/wsl/disk-probe';

const execPowerShellJsonMock = vi.mocked(execPowerShellJson);
const execWslMock = vi.mocked(execWsl);

describe('disk-probe', () => {
  beforeEach(() => {
    execPowerShellJsonMock.mockReset();
    execWslMock.mockReset();
  });

  describe('getFreeDiskGb', () => {
    it('parses a raw JSON number and converts bytes to whole GB', async () => {
      execPowerShellJsonMock.mockResolvedValue({ code: 0, stdout: '32212254720' });
      const result = await getFreeDiskGb('C');
      expect(result).toBe(30);
      expect(execPowerShellJsonMock).toHaveBeenCalledTimes(1);
      const [script] = execPowerShellJsonMock.mock.calls[0];
      expect(script).toContain('ConvertTo-Json');
    });

    it('returns 0 on malformed/empty stdout (never false-blocks on a probe glitch)', async () => {
      execPowerShellJsonMock.mockResolvedValue({ code: 0, stdout: '' });
      const result = await getFreeDiskGb('C');
      expect(result).toBe(0);
    });

    it('never string-matches a localized label — a non-numeric JSON string also degrades to 0', async () => {
      execPowerShellJsonMock.mockResolvedValue({ code: 0, stdout: '"garbled-ünicode"' });
      const result = await getFreeDiskGb('C');
      expect(result).toBe(0);
    });
  });

  describe('getVirtualizationEnabled', () => {
    it('returns true when both VirtualizationFirmwareEnabled and VMMonitorModeExtensions are true', async () => {
      execPowerShellJsonMock.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ VirtualizationFirmwareEnabled: true, VMMonitorModeExtensions: true }),
      });
      const result = await getVirtualizationEnabled();
      expect(result).toBe(true);
    });

    it('returns false when VirtualizationFirmwareEnabled is false (proactive hint only, not the authoritative gate)', async () => {
      execPowerShellJsonMock.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ VirtualizationFirmwareEnabled: false, VMMonitorModeExtensions: true }),
      });
      const result = await getVirtualizationEnabled();
      expect(result).toBe(false);
    });

    it('returns true (safe default) on malformed stdout — a probe glitch must never false-block', async () => {
      execPowerShellJsonMock.mockResolvedValue({ code: 0, stdout: 'not json' });
      const result = await getVirtualizationEnabled();
      expect(result).toBe(true);
    });
  });

  describe('getVmLaunchError', () => {
    it('returns "0x80370102" when the stable hex token appears in stderr (registered distro, reactive authoritative capture)', async () => {
      execWslMock.mockResolvedValue({ code: 1, stdout: '', stderr: 'Error: 0x80370102 something' });
      const result = await getVmLaunchError(true);
      expect(result).toBe('0x80370102');
      expect(execWslMock).toHaveBeenCalledWith(['-d', 'livinity', '-u', 'root', '--', 'true']);
    });

    it('returns null when the distro boots cleanly (no hex token in stdout/stderr)', async () => {
      execWslMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
      const result = await getVmLaunchError(true);
      expect(result).toBeNull();
    });

    it('returns null WITHOUT spawning when distroRegistered is false (no VM to boot yet)', async () => {
      const result = await getVmLaunchError(false);
      expect(result).toBeNull();
      expect(execWslMock).not.toHaveBeenCalled();
    });

    it('returns null (never throws) when the underlying spawn call rejects', async () => {
      execWslMock.mockRejectedValue(new Error('spawn failure'));
      const result = await getVmLaunchError(true);
      expect(result).toBeNull();
    });
  });
});
