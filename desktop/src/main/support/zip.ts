/**
 * src/main/support/zip.ts
 *
 * The sanctioned `Compress-Archive` spawn seam (SUP-01 / D-09, 07-RESEARCH.md
 * Q6). Mirrors `src/main/wsl/elevate.ts`'s injectable-deps + fixed-literal
 * command discipline: the ONLY interpolated values are two main-generated
 * paths (`stagingDir`, `zipPath`) — never a renderer/network-derived string.
 * Each is escaped via `psQuote` (PowerShell single-quote doubling), never
 * concatenated raw into the `-Command` string (T-07-10).
 *
 * Judgment is exit-code + `fs.stat` ONLY — no stdout/stderr parsing (locale-
 * safe, mirrors `wsl-exec.ts`'s own no-narrative-text-parsing discipline).
 * `$ErrorActionPreference='Stop'` is load-bearing (Pitfall 8): without it, a
 * non-terminating Compress-Archive error can still exit 0 over a partial/
 * missing zip — the `fs.stat` check is the second, independent proof the
 * output actually exists.
 *
 * D-09 fallback: ANY failure (non-zero exit, timeout, missing zip file, AV
 * interference) opens the staging folder via `shell.openPath` instead — a
 * diagnostics export must never be a dead end.
 */

import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { shell } from 'electron';

const TIMEOUT_MS = 60_000;

/** PowerShell single-quote escape (the only interpolation this module ever performs). */
export const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export type ZipResult = { ok: true } | { ok: false; folderOpened: boolean };

export interface ZipDeps {
  execFile: (
    file: string,
    args: string[],
    options: { windowsHide?: boolean; timeout?: number }
  ) => Promise<{ stdout: string; stderr: string }>;
  stat: (p: string) => Promise<unknown>;
  /** Resolves '' on success, a non-empty error message on failure — matches
   * Electron's real `shell.openPath` contract (never rejects). */
  openPath: (p: string) => Promise<string>;
}

const execFileAsync = promisify(nodeExecFile);

function defaultExecFile(
  file: string,
  args: string[],
  options: { windowsHide?: boolean; timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(file, args, options).then((r) => ({
    stdout: String(r.stdout ?? ''),
    stderr: String(r.stderr ?? ''),
  }));
}

const defaultDeps: ZipDeps = {
  execFile: defaultExecFile,
  stat: (p) => fs.stat(p),
  openPath: (p) => shell.openPath(p),
};

function resolveDeps(deps: Partial<ZipDeps>): ZipDeps {
  return { ...defaultDeps, ...deps };
}

/** Builds the fixed-literal `-Command` string — only `stagingDir`/`zipPath` vary,
 * and only through `psQuote`. Exported for the direct command-shape assertion. */
export function buildCompressCommand(stagingDir: string, zipPath: string): string {
  return [
    "$ErrorActionPreference='Stop';",
    `Compress-Archive -Path ${psQuote(stagingDir + '\\*')}`,
    `-DestinationPath ${psQuote(zipPath)} -Force`,
  ].join(' ');
}

/**
 * Zips every file directly under `stagingDir` into `zipPath` via Windows'
 * built-in `Compress-Archive` (zero new deps, D-09). Success requires BOTH
 * exit code 0 AND a present `zipPath` (Pitfall 8). On ANY other outcome, the
 * staging folder is opened instead (`shell.openPath`) so the user always has
 * SOME way to retrieve the diagnostics files — never a dead end.
 */
export async function zipStagingFolder(
  stagingDir: string,
  zipPath: string,
  deps: Partial<ZipDeps> = {}
): Promise<ZipResult> {
  const d = resolveDeps(deps);
  const cmd = buildCompressCommand(stagingDir, zipPath);

  try {
    await d.execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
      { windowsHide: true, timeout: TIMEOUT_MS }
    );
    await d.stat(zipPath);
    return { ok: true };
  } catch {
    try {
      const err = await d.openPath(stagingDir);
      return { ok: false, folderOpened: err === '' };
    } catch {
      return { ok: false, folderOpened: false };
    }
  }
}
