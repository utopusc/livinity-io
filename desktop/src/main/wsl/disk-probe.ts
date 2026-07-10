/**
 * src/main/wsl/disk-probe.ts
 *
 * D-01: Windows-side signals come through PowerShell `ConvertTo-Json` (enum
 * names + JSON numbers are culture-invariant) OR a stable hex HRESULT token —
 * never free text (RESEARCH.md Pattern 2 / Pitfall 3).
 *
 * Three probes:
 * - getFreeDiskGb / getVirtualizationEnabled — PROACTIVE PowerShell-JSON
 *   probes. getVirtualizationEnabled is a fast HINT only (a Microsoft Q&A
 *   thread documents false-negatives on some UEFI/BIOS combos) — the
 *   authoritative gate stays the reactive getVmLaunchError/0x80370102 check.
 * - getVmLaunchError — the REACTIVE authoritative launch-time firmware-block
 *   capture (Pitfall 3). Matching the stable hex token '0x80370102' is
 *   locale-invariant (it's a code, not translated narrative) — D-01-safe.
 *   This is the ONLY signal decideWslState (04-02) treats as authoritative
 *   for the bios-blocked verdict.
 */

import { execPowerShellJson, execWsl } from './wsl-exec';

// V5 guard: validate driveLetter is a single A-Z/a-z character BEFORE it is
// interpolated into the PowerShell probe script — the probe script can never
// be injected via a malformed drive-letter input.
const DRIVE_LETTER_RE = /^[A-Za-z]$/;

const BIOS_LAUNCH_ERROR_TOKEN = '0x80370102';

/** Free space (whole GB, floored) on `driveLetter`'s WSL install target drive. */
export function getFreeDiskGb(driveLetter: string): Promise<number> {
  if (!DRIVE_LETTER_RE.test(driveLetter)) {
    return Promise.resolve(0);
  }
  const script = `(Get-PSDrive -Name '${driveLetter}').Free | ConvertTo-Json`;
  return execPowerShellJson(script)
    .then(({ stdout }) => {
      const bytes = JSON.parse(stdout);
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 0;
      return Math.floor(bytes / 1024 ** 3);
    })
    .catch(() => 0);
}

/**
 * PROACTIVE hint only — a fast pre-reboot signal, never the sole gate. The
 * REASON this returns a boolean (not the raw JSON) is that decide-wsl-state's
 * WslDetectSignals.biosVirtEnabled field is a documented UI-hint, never a
 * ladder input (04-02 key-decisions).
 */
export function getVirtualizationEnabled(): Promise<boolean> {
  const script =
    'Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1 VirtualizationFirmwareEnabled, VMMonitorModeExtensions | ConvertTo-Json -Compress';
  return execPowerShellJson(script)
    .then(({ stdout }) => {
      const parsed = JSON.parse(stdout) as {
        VirtualizationFirmwareEnabled?: boolean;
        VMMonitorModeExtensions?: boolean;
      };
      return !!(parsed.VirtualizationFirmwareEnabled && parsed.VMMonitorModeExtensions);
    })
    .catch(() => true); // a probe glitch must never false-block a doomed reboot warning
}

/**
 * The REACTIVE authoritative firmware probe (Pitfall 3). If no distro is
 * registered yet, there is nothing to boot — returns null immediately
 * without spawning (the proactive hint + 04-05's first-boot verification
 * carry the pre-install case). Otherwise forces a hidden one-shot VM boot
 * and matches the stable hex HRESULT token — locale-safe, D-01-compliant.
 */
export function getVmLaunchError(distroRegistered: boolean): Promise<string | null> {
  if (!distroRegistered) return Promise.resolve(null);
  return execWsl(['-d', 'livinity', '-u', 'root', '--', 'true'])
    .then((r) => {
      const combined = `${r.stdout}${r.stderr}`;
      return combined.includes(BIOS_LAUNCH_ERROR_TOKEN) ? BIOS_LAUNCH_ERROR_TOKEN : null;
    })
    .catch(() => null); // never false-block on a probe/spawn error
}
