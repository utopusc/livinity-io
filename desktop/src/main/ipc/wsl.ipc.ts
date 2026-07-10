/**
 * src/main/ipc/wsl.ipc.ts
 *
 * The renderer<->main IPC boundary for the WSL2 provisioning engine — the
 * nine zod-validated wsl:* invoke handlers plus the wsl:downloadUpdate /
 * wsl:installUpdate progress pushes. Mirrors src/main/ipc/cf.ipc.ts
 * VERBATIM: every renderer-supplied payload is safeParse'd before it touches
 * an orchestrator, every handler body is wrapped in try/catch so no
 * exception ever crosses the boundary as a rejected IPC promise (a safe
 * result union is returned instead), and every logSafe carries scalar
 * metadata only — never a secret.
 *
 * SECRET DISCIPLINE (mirrors cf.ipc.ts's header): none of these handlers
 * ever returns a secret. `install-invoke.ts`'s `runInstall` reads the vault
 * plaintext MAIN-SIDE entirely on its own — this file never touches the
 * plaintext vault reader at all (grep-enforced in the plan's acceptance
 * criteria); the renderer never supplies and never receives LIVOS_API_KEY /
 * LIVOS_CF_TOKEN / LIVOS_CF_TUNNEL_TOKEN.
 *
 * THE SINGLE BIOS RULE (Pitfall 3, 04-02's decide-wsl-state.ts): `wsl:detect`,
 * `wsl:enable`, and `wsl:checkBios` ALL route their exit codes / probe
 * signals through `decideWslState` — none of them hardcodes an exit code to
 * a verdict inline. `bios-blocked` is reached ONLY when the reactive
 * `getVmLaunchError` (04-04) captures a launch-time firmware-block token; the
 * proactive `getVirtualizationEnabled` WMI hint is never a sole gate.
 *
 * D-04 (auto-resume): a successful `wsl:enable` arms
 * `app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })` so
 * the app relaunches hidden-to-tray after the mandatory reboot and resumes
 * the wizard; `wsl:restartNow` re-arms the same settings defensively before
 * triggering the ONLY reboot in this file (USER-INITIATED ONLY — never
 * auto-called).
 *
 * D-16 (validate-before-write): `wsl:configApply` runs `validateResourceLimits`
 * BEFORE any `.wslconfig` read/merge/write — an invalid value rejects the
 * WHOLE call and `fs.writeFile` is never reached.
 *
 * DEEP-LINK ALLOWLIST: `wsl:openExternal` accepts a two-value enum, not a
 * URL — the handler maps the enum to a FIXED help URL, so a raw renderer-
 * supplied URL can never reach `shell.openExternal` (mirrors cf.ipc.ts's
 * enum-allowlisted openExternal / T-03-15).
 *
 * wsl:downloadUpdate / wsl:installUpdate are main -> renderer progress pushes
 * (mirror cf:provisionUpdate) forwarded through deps.getMainWindow() — the
 * one thing this file's WslIpcDeps is retained for. Zero imports from tray/
 * or renderer/.
 */

import { ipcMain, shell, app, type BrowserWindow } from 'electron';
import { z } from 'zod';
import os from 'node:os';
import path from 'node:path';
import { promises as fsPromises } from 'node:fs';
import { spawn } from 'node:child_process';
import { CHANNELS } from '../../../shared/ipc-contract';
import type { WslResourceInfo } from '../../../shared/ipc-contract';
import { execWsl } from '../wsl/wsl-exec';
import { runElevatedWslInstall } from '../wsl/elevate';
import { getFreeDiskGb, getVirtualizationEnabled, getVmLaunchError } from '../wsl/disk-probe';
import { isDistroRegistered } from '../wsl/parse-wsl-list';
import { decideWslState } from '../wsl/decide-wsl-state';
import { provisionDistro } from '../wsl/distro-install';
import { runInstall } from '../wsl/install-invoke';
import { decideResourceDefaults } from '../wsl/decide-resource-defaults';
import { parseIni, mergeWsl2Keys, serializeIni, validateResourceLimits } from '../wsl/wslconfig';
import { readState, patchState } from '../storage/state-store';
import { logSafe } from '../log';

// Per-handler payload schemas (mirror cf.ipc.ts:47-56). NoPayload = z.undefined()
// still runs on every no-arg handler as defense in depth (IN-04) — a hostile
// renderer's stray payload is BRANCHED on, never silently discarded.
const NoPayload = z.undefined();
const ConfigApplyPayload = z.object({
  memoryGb: z.number().optional(),
  processors: z.number().optional(),
  diskGb: z.number(),
});
const WslOpenExternalPayload = z.object({ target: z.enum(['bios-help', 'arm-help']) });

const DISTRO_NAME = 'livinity';

// The single wszStep value that means "an enable just completed this
// session, reboot pending" — written by wsl:enable / wsl:restartNow and read
// back by wsl:detect to feed decideWslState's needsReboot signal. Mirrors the
// literal src/renderer/screens/wsl/wsl-flow.ts's WslStep already uses for the
// Restart screen, so main/renderer never drift on the step name.
const WSL_RESTART_STEP = 'wsl-restart';

const BIOS_HELP_URL = 'https://livinity.io/help/enable-virtualization';
const ARM_HELP_URL = 'https://livinity.io/help/arm-unsupported';

const SAFE_RESOURCE_INFO_DEFAULT: WslResourceInfo = {
  totalRamGb: 0,
  totalCores: 1,
  freeDiskGb: 0,
  driveLetter: 'C',
  recommended: { memoryGb: 1, processors: 1, diskGb: 15 },
  current: {},
  cpuRamTunable: true,
};

function wslconfigPath(): string {
  return path.join(os.homedir(), '.wslconfig');
}

/** Tolerates absence (no `.wslconfig` yet) — degrades to '' so parseIni sees an empty file. */
async function readWslconfigContent(): Promise<string> {
  try {
    return await fsPromises.readFile(wslconfigPath(), 'utf8');
  } catch {
    return '';
  }
}

/** Parses a `.wslconfig` `memory` value shaped `<n>GB` — undefined on any other shape. */
function parseCurrentMemoryGb(value: string): number | undefined {
  const match = value.trim().match(/^(\d+)\s*GB$/i);
  return match ? Number(match[1]) : undefined;
}

/** Parses a `.wslconfig` `processors` value (a plain integer) — undefined on any other shape. */
function parseCurrentProcessors(value: string): number | undefined {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** Same drive-letter derivation as distro-install.ts's resolveInstallTarget — the
 * disk-free probe must check the SAME drive the livinity VHD actually lives on. */
function resolveDriveLetter(): string {
  const base = app.getPath('userData') || process.env.LOCALAPPDATA || 'C:\\';
  return /^[A-Za-z]:/.test(base) ? base[0].toUpperCase() : 'C';
}

export interface WslIpcDeps {
  /** Used by wsl:distroInstall / wsl:installInvoke to push progress events to the renderer. */
  getMainWindow: () => BrowserWindow | null;
}

export function registerWslIpc(deps: WslIpcDeps): void {
  // wsl:detect — gathers locale-safe signals main-side and routes them
  // through the SINGLE decider (decideWslState); it never classifies an exit
  // code or probe result to a verdict inline. A malformed payload degrades to
  // the conservative 'needs-enable' default (never a throw, never treated as
  // 'ready').
  ipcMain.handle(CHANNELS.wslDetect, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'needs-enable' as const };
    }
    try {
      const status = await execWsl(['--status']);
      const list = await execWsl(['--list', '--quiet']);
      const distroReg = isDistroRegistered(list.stdout, DISTRO_NAME);
      const biosVirtEnabled = await getVirtualizationEnabled();
      const launchError = await getVmLaunchError(distroReg);
      const s = await readState();
      let needsReboot = s?.wslStep === WSL_RESTART_STEP;
      if (needsReboot && status.code === 0) {
        // A clean `wsl --status` proves the feature works — the persisted
        // pending-reboot flag is stale (the reboot happened, or was never
        // actually needed). NOTHING else ever clears it, so without this the
        // post-reboot resume loops forever on needs-reboot -> "Windows setup
        // didn't finish" (WR-02). Clearing it also disarms the D-04 hidden-
        // resume login item wsl:enable/wsl:restartNow armed — its single job
        // (surviving the mandatory reboot) is done.
        await patchState({ wslStep: undefined });
        app.setLoginItemSettings({ openAtLogin: false });
        needsReboot = false;
      }

      return decideWslState({
        statusExit: status.code,
        quietList: list.stdout,
        biosVirtEnabled,
        launchError,
        needsReboot,
      });
    } catch {
      logSafe('wsl.detect', { exception: true });
      return { kind: 'needs-enable' as const };
    }
  });

  // wsl:enable — runs the single-UAC elevated enable and NEVER hardcodes a
  // verdict for its exit code. A declined/dismissed UAC prompt (exitCode -1)
  // is recoverable; a clean success (ok) arms the D-04 hidden-resume login
  // item and persists the restart step BEFORE returning 'needs-reboot'. Any
  // other non-zero exit is routed through decideWslState (launchError is
  // null — this step never boots a VM) so it is classified the same way
  // every other feature-enablement failure is, NEVER as bios-blocked; since
  // WslEnableResult has no 'needs-enable' kind, that verdict surfaces as the
  // recoverable 'error' outcome (the WslEnable "Try again" re-runs
  // enable -> detect).
  ipcMain.handle(CHANNELS.wslEnable, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'error' as const };
    }
    try {
      const { ok, exitCode } = await runElevatedWslInstall();

      if (exitCode === -1) {
        return { kind: 'declined' as const };
      }

      if (ok) {
        await patchState({ wslStep: WSL_RESTART_STEP });
        app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
        return { kind: 'needs-reboot' as const };
      }

      // SINGLE-DECIDER RULE: this exit code is never classified inline —
      // it is routed through the same decideWslState every WSL-state
      // signal goes through. No consumer branch below reads verdict.kind:
      // WslEnableResult has no 'needs-enable' kind, so any non-zero exit
      // here (feature-enablement failure OR a BIOS-disabled firmware exit)
      // surfaces as the recoverable 'error' outcome — never 'bios-blocked'
      // (that verdict is reachable only via the reactive probe in
      // wsl:detect/wsl:checkBios).
      const verdict = decideWslState({ statusExit: exitCode, launchError: null });
      logSafe('wsl.enable', { ok: false, exitCode, verdict: verdict.kind });
      return { kind: 'error' as const };
    } catch {
      logSafe('wsl.enable', { exception: true });
      return { kind: 'error' as const };
    }
  });

  // wsl:checkBios — a reactive re-check reusing WslDetectResult's shape
  // (04-01). Routes through the SAME decider as wsl:detect; never gates on
  // the proactive WMI hint alone (RESEARCH Anti-Pattern) — the reactive
  // getVmLaunchError probe re-run above is the sole authoritative signal.
  ipcMain.handle(CHANNELS.wslCheckBios, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'needs-enable' as const };
    }
    try {
      const status = await execWsl(['--status']);
      const list = await execWsl(['--list', '--quiet']);
      const distroReg = isDistroRegistered(list.stdout, DISTRO_NAME);
      const biosVirtEnabled = await getVirtualizationEnabled();
      const launchError = await getVmLaunchError(distroReg);

      return decideWslState({
        statusExit: status.code,
        quietList: list.stdout,
        biosVirtEnabled,
        launchError,
        needsReboot: false,
      });
    } catch {
      logSafe('wsl.checkBios', { exception: true });
      return { kind: 'needs-enable' as const };
    }
  });

  // wsl:restartNow — USER-INITIATED ONLY (the D-03 "Restart now" button).
  // Re-arms the --hidden auto-resume settings defensively (a harmless no-op
  // if wsl:enable already armed them) then triggers the ONE reboot path in
  // this entire file via a hidden `shutdown /r /t 0` — never auto-called.
  ipcMain.handle(CHANNELS.wslRestartNow, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return;
    try {
      await patchState({ wslStep: WSL_RESTART_STEP });
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });

      logSafe('wsl.restartNow', { userInitiated: true });
      spawn('shutdown', ['/r', '/t', '0'], { windowsHide: true });
    } catch {
      logSafe('wsl.restartNow', { exception: true });
    }
  });

  // wsl:distroInstall — delegates to provisionDistro (04-05), forwarding its
  // onUpdate progress to the renderer via wsl:downloadUpdate (mirrors
  // cf:provisionUpdate).
  ipcMain.handle(CHANNELS.wslDistroInstall, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'error' as const };
    }
    try {
      const win = deps.getMainWindow();
      return await provisionDistro((u) => win?.webContents.send(CHANNELS.wslDownloadUpdate, u));
    } catch {
      logSafe('wsl.distroInstall', { exception: true });
      return { kind: 'error' as const };
    }
  });

  // wsl:installInvoke — resolves the tier main-side from the same non-secret
  // CF facts the Free/BYOD wizard already persisted (03-05's selectDomainProbe
  // writes subLabel/zoneName to state); a Pro run never collects either, so
  // their presence is the entering branch's own signal — no separate tier
  // flag exists in State. Delegates to runInstall (04-06), which reads the
  // actual secrets from the plaintext vault reader entirely on its own; this
  // handler never touches that reader directly.
  ipcMain.handle(CHANNELS.wslInstallInvoke, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'generic-failure' as const };
    }
    try {
      const s = await readState();
      const tier: 'free' | 'pro' = s?.subLabel && s?.zoneName ? 'free' : 'pro';

      const win = deps.getMainWindow();
      return await runInstall({ tier }, (u) => win?.webContents.send(CHANNELS.wslInstallUpdate, u));
    } catch {
      logSafe('wsl.installInvoke', { exception: true });
      return { kind: 'generic-failure' as const };
    }
  });

  // wsl:configGet — assembles the secret-free WslResourceInfo snapshot Screen
  // 3 pre-fills from: real system facts (os.totalmem/os.cpus), the disk-free
  // probe on the SAME drive the distro lives on, decideResourceDefaults'
  // recommendation, and any already-set memory/processors read out of the
  // existing `.wslconfig` (tolerating its absence). cpuRamTunable defaults
  // true (D-16/D-17) — the read-merge-write path is proven safe, so the full
  // CPU/RAM+disk form is offered with the honest VM-global disclosure.
  ipcMain.handle(CHANNELS.wslConfigGet, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) {
      return SAFE_RESOURCE_INFO_DEFAULT;
    }
    try {
      const content = await readWslconfigContent();
      const lines = parseIni(content);

      let currentMemoryGb: number | undefined;
      let currentProcessors: number | undefined;
      for (const line of lines) {
        if (line.kind === 'kv' && line.section === 'wsl2') {
          if (line.key === 'memory') currentMemoryGb = parseCurrentMemoryGb(line.value);
          if (line.key === 'processors') currentProcessors = parseCurrentProcessors(line.value);
        }
      }

      const driveLetter = resolveDriveLetter();
      const freeDiskGb = await getFreeDiskGb(driveLetter);
      const recommended = decideResourceDefaults({
        totalRamBytes: os.totalmem(),
        totalCores: os.cpus().length,
        freeDiskGb,
      });

      return {
        totalRamGb: Math.floor(os.totalmem() / 1024 ** 3),
        totalCores: os.cpus().length,
        freeDiskGb,
        driveLetter,
        recommended,
        current: { memoryGb: currentMemoryGb, processors: currentProcessors },
        cpuRamTunable: true,
      };
    } catch {
      logSafe('wsl.configGet', { exception: true });
      return SAFE_RESOURCE_INFO_DEFAULT;
    }
  });

  // wsl:configApply — V5 gate: validateResourceLimits runs BEFORE any
  // `.wslconfig` read/merge/write; an invalid value rejects the WHOLE call
  // and fs.writeFile is NEVER reached (D-16). The write is a targeted
  // read-merge-write (parseIni -> mergeWsl2Keys -> serializeIni, 04-03) that
  // preserves every byte this app doesn't own. Disk is per-distro (a VHD
  // resize, best-effort/non-fatal); CPU/RAM only take effect after a hidden
  // `wsl --shutdown` (D-05/D-16).
  ipcMain.handle(CHANNELS.wslConfigApply, async (_event, raw: unknown) => {
    const parsed = ConfigApplyPayload.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, reason: 'invalid_values' as const };
    }

    const v = validateResourceLimits(parsed.data);
    if (!v.ok) {
      return { ok: false as const, reason: 'invalid_values' as const };
    }

    try {
      const content = await readWslconfigContent();

      // Encoding tripwire (WR-05): a non-UTF-8 `.wslconfig` (e.g. UTF-16LE
      // saved by an editor as "Unicode") read as utf8 becomes NUL-laced
      // mojibake — parseIni would see no [wsl2] section, append a fresh one,
      // and the write below would permanently destroy every prior line for
      // ALL the user's distros. Refuse to write anything that looks garbled.
      if (content.includes('\u0000') || content.includes('\uFFFD')) {
        logSafe('wsl.configApply', { ok: false, step: 'encoding-guard' });
        return { ok: false as const, reason: 'write_failed' as const };
      }

      const merged = mergeWsl2Keys(parseIni(content), v.patch);
      const serialized = serializeIni(merged);

      try {
        await fsPromises.writeFile(wslconfigPath(), serialized, 'utf8');
      } catch {
        logSafe('wsl.configApply', { ok: false, step: 'write' });
        return { ok: false as const, reason: 'write_failed' as const };
      }

      // Disk is per-distro (a VHD resize), never a .wslconfig key —
      // best-effort/non-fatal; a resize hiccup never blocks the CPU/RAM
      // apply below.
      const resizeResult = await execWsl([
        '--manage',
        DISTRO_NAME,
        '--resize',
        `${parsed.data.diskGb}GB`,
      ]);
      if (resizeResult.code !== 0) {
        logSafe('wsl.configApply', { ok: false, step: 'resize', code: resizeResult.code ?? -1 });
      }

      const shutdownResult = await execWsl(['--shutdown']);
      if (shutdownResult.code !== 0) {
        logSafe('wsl.configApply', { ok: false, step: 'shutdown', code: shutdownResult.code ?? -1 });
        return { ok: false as const, reason: 'shutdown_failed' as const };
      }

      await patchState({
        wslResourceMemoryGb: parsed.data.memoryGb,
        wslResourceProcessors: parsed.data.processors,
        wslResourceDiskGb: parsed.data.diskGb,
      });

      logSafe('wsl.configApply', { ok: true });
      return { ok: true as const };
    } catch {
      logSafe('wsl.configApply', { exception: true });
      return { ok: false as const, reason: 'write_failed' as const };
    }
  });

  // wsl:openExternal — enum-allowlisted (mirrors cf:openExternal). The
  // renderer sends one of two fixed enum targets; the handler maps it to a
  // frozen help URL. A raw renderer-supplied URL can NEVER reach
  // shell.openExternal (the schema admits no URL string at all).
  ipcMain.handle(CHANNELS.wslOpenExternal, async (_event, raw: unknown) => {
    const parsed = WslOpenExternalPayload.safeParse(raw);
    if (!parsed.success) return;

    const url = parsed.data.target === 'bios-help' ? BIOS_HELP_URL : ARM_HELP_URL;
    logSafe('wsl.openExternal', { target: parsed.data.target });
    try {
      await shell.openExternal(url);
    } catch {
      logSafe('wsl.openExternal', { exception: true });
    }
  });
}
