/**
 * src/main/wsl/decide-wsl-state.ts
 *
 * Pure, zero-IO WSL state classifier (WSL-01 / WSL-02). D-01's load-bearing
 * rule: the verdict is decided by exit codes + `--quiet` output + structured
 * probe booleans, never by localized narrative text — `wsl.exe` output is
 * UTF-16 and fully translated under a non-English Windows locale (the Turkish-
 * locale trap), so no branch here ever reads a narrative string.
 *
 * THE SINGLE BIOS RULE (Pitfall 3): `bios-blocked` is reached ONLY on the
 * authoritative reactive launch-time `0x80370102`; the proactive
 * VirtualizationFirmwareEnabled WMI bit is a hint, never a hard gate on its
 * own. Exit 14107 (and any other non-zero `--status`) is feature-enablement
 * territory the enable flow can fix — it classifies as `needs-enable`, NEVER
 * `bios-blocked`. This module is the SINGLE source of truth for that rule —
 * no consumer re-implements it inline (the `wsl:enable`/`wsl:detect`/
 * `wsl:checkBios` handlers in 04-09 all route through `decideWslState`, and
 * the renderer's `mapWslDetectResult`, 04-07, is the sole screen router).
 *
 * Zero runtime imports — no IO, no Node built-ins, no electron surface; the
 * only import is a type-only pull of the result shape from the shared
 * contract (mirrors decide-scope-verdict.ts).
 */

import type { WslDetectResult } from '../../../shared/ipc-contract';
import { isDistroRegistered } from './parse-wsl-list';

/**
 * Already-captured signals fed in by the ipc handler (04-09): `statusExit` is
 * the exit code of `wsl --status` (null on spawn ENOENT / wsl.exe absent);
 * `quietList` is the raw `wsl --list --quiet` stdout; `biosVirtEnabled` is the
 * PROACTIVE WMI `VirtualizationFirmwareEnabled` bit (hint only); `launchError`
 * is the REACTIVE error captured by `getVmLaunchError` (04-04) from an actual
 * distro-launch attempt; `needsReboot` is the pending-reboot flag persisted in
 * state after a completed enable this session.
 */
export interface WslDetectSignals {
  statusExit: number | null;
  quietList?: string;
  biosVirtEnabled?: boolean;
  launchError?: string | null;
  needsReboot?: boolean;
}

export function decideWslState(signals: WslDetectSignals): WslDetectResult {
  // Rule 1 — spawn failed / wsl.exe absent entirely.
  if (signals.statusExit === null) return { kind: 'wsl-missing' };

  // Rule 2 — the authoritative reactive firmware block. Checked BEFORE the
  // exit-code buckets so a launch-time firmware failure is never miscategorised
  // as a plain feature-enablement failure.
  if (signals.launchError?.includes('0x80370102')) return { kind: 'bios-blocked' };

  // Rule 3 — any non-zero --status (including 14107) is feature-enablement
  // territory the enable flow resolves. Explicitly NOT bios-blocked.
  if (signals.statusExit !== 0) return { kind: 'needs-enable' };

  // Rule 4 — an enable just completed this session; reboot pending.
  if (signals.needsReboot) return { kind: 'needs-reboot' };

  // Rule 5 — WSL itself works; the livinity distro isn't imported yet.
  if (!isDistroRegistered(signals.quietList ?? '', 'livinity')) {
    return { kind: 'distro-missing' };
  }

  // Rule 6 — everything checks out. Note: the proactive biosVirtEnabled bit is
  // accepted in the signal shape but is never a hard gate on its own — it is a
  // UI hint 04-09 uses only when routing the pre-reboot warning.
  return { kind: 'ready' };
}
