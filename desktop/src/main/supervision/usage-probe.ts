/**
 * src/main/supervision/usage-probe.ts
 *
 * Tray quick-panel addendum (post-Phase-7): the `engine:getUsage` orchestrator
 * behind the panel's live RAM/CPU/disk rows. PASSIVE discipline mirrors
 * `engine.ts`'s `getEngineStatus` WR-03 rule verbatim — while the engine is
 * not desired-running, this returns `{ ok:false, reason:'engine-stopped' }`
 * WITHOUT ever touching wsl.exe (ANY `wsl -d livinity` exec BOOTS a
 * terminated distro, so probing here would re-boot it on every 2.5s poll).
 *
 * While running: a SINGLE `wsl -d livinity` exec (the existing `execWsl`
 * seam, WSL_UTF8=1 baked in there) runs
 * `cat /proc/meminfo /proc/loadavg && nproc && df -k /` in one shot — the
 * combined stdout is parsed NUMERICALLY by the pure `parseUsageOutput`
 * (/proc + `df -k` POSIX output is locale-stable, unlike wsl.exe's own
 * human-facing text). Any exec/parse failure degrades to
 * `{ ok:false, reason:'probe-failed' }`, never a throw across the caller.
 *
 * Every collaborator is injected via `Partial<UsageProbeDeps>` (mirrors
 * `engine.ts`'s `EngineDeps` pattern) — no real wsl.exe/state-store IO in
 * tests.
 */

import { readState as realReadState } from '../storage/state-store';
import { execWsl as realExecWsl, type ExecResult } from '../wsl/wsl-exec';
import type { UsageResult } from '../../../shared/ipc-contract';

type ExecWslFn = (args: string[], opts?: { timeoutMs?: number }) => Promise<ExecResult>;

export interface UsageProbeDeps {
  readState: typeof realReadState;
  execWsl: ExecWslFn;
}

const defaultDeps: UsageProbeDeps = {
  readState: realReadState,
  execWsl: realExecWsl,
};

function resolveDeps(deps: Partial<UsageProbeDeps>): UsageProbeDeps {
  return { ...defaultDeps, ...deps };
}

/** Single-shot combined probe — one `wsl -d livinity` exec, never a chain of separate calls. */
const USAGE_ARGS = ['-d', 'livinity', '--', 'sh', '-c', 'cat /proc/meminfo /proc/loadavg && nproc && df -k /'];

export interface ParsedUsage {
  memUsedKb: number;
  memTotalKb: number;
  load1: number;
  cpuCount: number;
  diskUsedKb: number;
  diskTotalKb: number;
}

const MEM_TOTAL_RE = /^MemTotal:\s+(\d+)\s*kB/m;
const MEM_AVAILABLE_RE = /^MemAvailable:\s+(\d+)\s*kB/m;
const MEM_FREE_RE = /^MemFree:\s+(\d+)\s*kB/m;
/** /proc/loadavg: "0.52 0.58 0.59 1/213 12345" — load1 is the first field. */
const LOADAVG_RE = /^(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+\/\d+\s+\d+\s*$/m;
/** `nproc`'s entire output is a single bare integer on its own line. */
const NPROC_RE = /^(\d+)\s*$/m;
/** `df -k /`'s data row: Filesystem 1K-blocks Used Available Use% Mounted-on("/"). */
const DF_ROW_RE = /^\S+\s+(\d+)\s+(\d+)\s+\d+\s+\d+%\s+\/\s*$/m;

/**
 * Pure parser — locale-safe (numeric /proc + `df -k` POSIX fields only, never
 * wsl.exe's own human-facing text). Returns `null` on ANY missing/malformed
 * section rather than a partial result.
 */
export function parseUsageOutput(stdout: string): ParsedUsage | null {
  const memTotalMatch = stdout.match(MEM_TOTAL_RE);
  const memAvailableMatch = stdout.match(MEM_AVAILABLE_RE) ?? stdout.match(MEM_FREE_RE);
  const loadMatch = stdout.match(LOADAVG_RE);
  const cpuMatch = stdout.match(NPROC_RE);
  const dfMatch = stdout.match(DF_ROW_RE);

  if (!memTotalMatch || !memAvailableMatch || !loadMatch || !cpuMatch || !dfMatch) return null;

  const memTotalKb = Number(memTotalMatch[1]);
  const memAvailableKb = Number(memAvailableMatch[1]);
  const load1 = Number(loadMatch[1]);
  const cpuCount = Number(cpuMatch[1]);
  const diskTotalKb = Number(dfMatch[1]);
  const diskUsedKb = Number(dfMatch[2]);

  if (
    !Number.isFinite(memTotalKb) ||
    !Number.isFinite(memAvailableKb) ||
    !Number.isFinite(load1) ||
    !Number.isFinite(cpuCount) ||
    cpuCount <= 0 ||
    !Number.isFinite(diskTotalKb) ||
    !Number.isFinite(diskUsedKb)
  ) {
    return null;
  }

  return {
    memUsedKb: Math.max(0, memTotalKb - memAvailableKb),
    memTotalKb,
    load1,
    cpuCount,
    diskUsedKb,
    diskTotalKb,
  };
}

/**
 * `engine:getUsage`'s orchestrator. PASSIVE while not desired-running (never
 * touches wsl.exe); a single combined exec + numeric parse while running.
 * Never throws — every failure degrades to a schema-valid `UsageResult`.
 */
export async function getUsage(depsIn: Partial<UsageProbeDeps> = {}): Promise<UsageResult> {
  const d = resolveDeps(depsIn);
  try {
    const st = await d.readState();
    // PASSIVE (mirrors engine.ts's getEngineStatus WR-03 rule): a desired-
    // stopped/never-started engine's usage is 'engine-stopped' WITHOUT ever
    // touching wsl.exe — ANY `wsl -d livinity` exec would BOOT a terminated
    // distro on every 2.5s panel poll.
    if (st?.engineDesiredState !== 'running') {
      return { ok: false, reason: 'engine-stopped' };
    }
    const result = await d.execWsl(USAGE_ARGS);
    if (result.code !== 0) {
      return { ok: false, reason: 'probe-failed' };
    }
    const parsed = parseUsageOutput(result.stdout);
    if (!parsed) {
      return { ok: false, reason: 'probe-failed' };
    }
    return { ok: true, ...parsed };
  } catch {
    return { ok: false, reason: 'probe-failed' };
  }
}
