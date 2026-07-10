/**
 * src/main/wsl/map-install-exit.ts
 *
 * Pure, zero-IO install.sh exit-code -> screen-verdict mapper (WSL-04 / D-14).
 * scripts/install.sh hard-gates on systemd-as-PID1 (exit 65, "systemd is not
 * running") and >=15GB free (exit 75, "Only Ngb free on /"); the phase's own
 * baked-in systemd rootfs + early disk pre-check mean these gates SHOULD
 * always pass in practice, but if install.sh still exits non-zero, each
 * documented code maps to exactly one specific, actionable verdict instead of
 * a generic failure screen. Exit 64 is EX_USAGE — the app built install.sh's
 * argv/env wrong, not something the user can fix. Every other non-zero code
 * (including a null exit — the spawned process died without ever reporting a
 * code, e.g. it was killed) falls through to the generic-failure bucket.
 *
 * Exact ladder verified against scripts/install.sh (04-RESEARCH.md Code
 * Examples). Progress/marker parsing into a human-friendly progress bar is a
 * later phase's job (INSTALL-02) -- this module only classifies the terminal
 * exit code.
 *
 * Zero runtime imports -- no filesystem, no child-process, no Electron
 * surface; a plain number (or null) in, a plain discriminated union out.
 */

export type InstallVerdict =
  | { kind: 'ok' }
  | { kind: 'systemd-retry' }
  | { kind: 'disk-too-small' }
  | { kind: 'our-bug' }
  | { kind: 'generic-failure' };

export function mapInstallExit(exitCode: number | null): InstallVerdict {
  if (exitCode === 0) return { kind: 'ok' };
  if (exitCode === 65) return { kind: 'systemd-retry' };
  if (exitCode === 75) return { kind: 'disk-too-small' };
  if (exitCode === 64) return { kind: 'our-bug' };
  return { kind: 'generic-failure' };
}
