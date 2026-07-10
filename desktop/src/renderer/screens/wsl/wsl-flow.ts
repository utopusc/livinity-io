/**
 * src/renderer/screens/wsl/wsl-flow.ts
 *
 * Pure, React-free routing helpers for the App.tsx WSL2 sub-router (04-10).
 * Extracted so the sub-router's result->step mapping, its copy formatting,
 * and its coarse step captions are unit-testable in the node vitest
 * environment -- mirrors screens/cloudflare/cf-flow.ts's template exactly.
 *
 * Nothing here reaches across the preload bridge or imports a UI library --
 * plain in / plain out, zero IO.
 */

import type {
  WslDetectResult,
  WslDistroInstallResult,
  WslEnableResult,
  WslInstallInvokeResult,
} from '../../../../shared/ipc-contract';

/**
 * The WSL2 wizard steps the App.tsx sub-router switches on. mapWslDetectResult
 * is the phase's SOLE result->step router -- an earlier decide-enable-action
 * module was dropped as a redundant second router that risked drifting from
 * this one; every wsl:detect verdict lands on exactly one of these.
 */
export type WslStep =
  | 'wsl-detect'
  | 'wsl-enable'
  | 'wsl-waiting'
  | 'wsl-enabling'
  | 'wsl-restart'
  | 'wsl-resume'
  | 'bios-deadend'
  | 'resource'
  | 'downloading'
  | 'installing'
  | 'install-outcome'
  | 'wsl-handoff';

/**
 * Maps a raw wsl:detect (or wsl:checkBios, which reuses the same result
 * shape -- a reactive re-check, not a distinct verdict space) verdict to the
 * next wizard step. TOTAL over all six WslDetectResult kinds -- 'needs-enable'
 * and 'wsl-missing' both route to the same pre-UAC screen because the
 * elevated enable call self-bootstraps the WSL feature either way
 * (WslEnable.tsx does not need to distinguish them).
 */
export function mapWslDetectResult(r: WslDetectResult): { step: WslStep } {
  switch (r.kind) {
    case 'ready':
      // A registered `livinity` distro does NOT prove LivOS is installed
      // INSIDE it — a distro imported by a prior run whose install.sh never
      // finished is still 'ready' here (live-diagnosed 2026-07-10: an empty
      // reused distro dead-ended the wizard on the handoff placeholder,
      // install.sh never ran). Per D-11 (reuse the distro, re-run install.sh
      // idempotently) route through the SAME setup pipeline as a fresh
      // machine — resource -> downloading (provisionDistro reuses, no
      // re-import) -> installing. Detecting a genuinely-complete install and
      // short-circuiting to a live dashboard is Phase 5's job (install marker),
      // not something Phase-4 detect can prove from distro-registration alone.
      return { step: 'resource' };
    case 'distro-missing':
      return { step: 'resource' };
    case 'needs-enable':
      return { step: 'wsl-enable' };
    case 'wsl-missing':
      return { step: 'wsl-enable' };
    case 'needs-reboot':
      return { step: 'wsl-restart' };
    case 'bios-blocked':
      return { step: 'bios-deadend' };
  }
}

/**
 * A screen-safe rename of WslEnableResult's kinds, consumed by WslEnable.tsx
 * so that file never has to spell the schema's raw "needs-reboot" literal --
 * that substring is reserved for actual restart-triggering calls (T-04-10's
 * grep-enforced invariant); the required Windows restart is only ever a
 * user-signalled CHOICE (D-03), never invoked from this pure mapper either.
 */
export type EnableOutcome = 'restart-required' | 'bios-deadend' | 'declined' | 'error';

/** Maps a raw wsl:enable result to the screen-safe outcome name above. */
export function mapWslEnableResult(r: WslEnableResult): { outcome: EnableOutcome } {
  switch (r.kind) {
    case 'needs-reboot':
      return { outcome: 'restart-required' };
    case 'bios-blocked':
      return { outcome: 'bios-deadend' };
    case 'declined':
      return { outcome: 'declined' };
    case 'error':
      return { outcome: 'error' };
  }
}

/** The Screen-6 mapped outcome of a wsl:installInvoke call (map-install-exit's InstallVerdict, renderer-side). */
export type InstallInvokeOutcome = 'done' | 'systemd-retry' | 'disk' | 'our-bug' | 'generic';

/** Maps a raw wsl:installInvoke result to the Screen-6 outcome the sub-router renders. */
export function mapInstallInvokeResult(r: WslInstallInvokeResult): { outcome: InstallInvokeOutcome } {
  switch (r.kind) {
    case 'ok':
      return { outcome: 'done' };
    case 'systemd-retry':
      return { outcome: 'systemd-retry' };
    case 'disk-too-small':
      return { outcome: 'disk' };
    case 'our-bug':
      return { outcome: 'our-bug' };
    case 'generic-failure':
      return { outcome: 'generic' };
  }
}

/**
 * The Screen-4 mapped outcome of a wsl:distroInstall result. Pass-through
 * shape (mirrors the schema's own fields) -- the disk-too-small case carries
 * freeGb/driveLetter through for the disk-too-small screen's body copy.
 */
export interface DistroInstallOutcome {
  kind: WslDistroInstallResult['kind'];
  freeGb?: number;
  driveLetter?: string;
}

export function mapDistroInstallResult(r: WslDistroInstallResult): DistroInstallOutcome {
  if (r.kind === 'disk-too-small') {
    return { kind: r.kind, freeGb: r.freeGb, driveLetter: r.driveLetter };
  }
  return { kind: r.kind };
}

/**
 * Routes Screen 4's bare 'error' outcome AFTER a follow-up wsl:detect re-check
 * (WR-04): a first-boot firmware block resolves distro-install's 'error' kind,
 * and rendering that as "The download was interrupted" is both the wrong
 * diagnosis and a retry trap — the retry hits the D-11 reuse gate (the distro
 * IS imported) and advances onto a VM that cannot boot. Only a reactive
 * 'bios-blocked' re-check verdict routes to the BIOS dead-end; every other
 * verdict keeps the inline retryable download-failed state.
 */
export function mapDistroErrorRecheck(r: WslDetectResult): 'bios-deadend' | 'download-failed' {
  return r.kind === 'bios-blocked' ? 'bios-deadend' : 'download-failed';
}

/**
 * Formats a Screen-4 download progress readout: "{done} MB of {total} MB ·
 * {pct}%" (decimal MB, matches the UI-SPEC mono readout template verbatim).
 */
export function formatDownloadReadout(doneBytes: number, totalBytes: number): string {
  const doneMb = Math.round(doneBytes / 1_000_000);
  const totalMb = Math.round(totalBytes / 1_000_000);
  const pct = totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0;
  return `${doneMb} MB of ${totalMb} MB · ${pct}%`;
}

/** The Screen-5 coarse step-list labels (the slot Phase 5 enriches without a layout change). */
export function installStepCaptions(): string[] {
  return ['Preparing your system', 'Installing components', 'Starting Livinity'];
}
