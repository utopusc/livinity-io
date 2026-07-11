/**
 * src/main/supervision/holder.ts
 *
 * TRAY-02: the detached `wsl.exe` "holder" process lifecycle -- spawn, adopt-
 * or-spawn across an app restart, kill, and PID-reuse-safe liveness. Per
 * RESEARCH Pattern 1, the holder is spawned as `wsl.exe` DIRECTLY (no Node-
 * wrapper / `ELECTRON_RUN_AS_NODE=1` -- that shape was only needed for the
 * Phase-1 spike's Node placeholder, which had no real long-lived binary to
 * run; `wsl.exe -d livinity --exec sleep infinity` already IS one).
 *
 * DEVIATION 1 (documented, not routed through execWsl): every OTHER wsl call
 * in this phase goes through `wsl-exec.ts`'s `execWsl` wrapper. This module's
 * own holder spawn is the ONE deliberate exception (RESEARCH Pattern 2) --
 * `execWsl` awaits the child's `close` event, which `sleep infinity` never
 * emits (it is meant to run forever). Liveness/adoption still uses locale-
 * safe `tasklist` argv (mirrors `wsl-exec.ts`'s own no-narrative-text-parsing
 * discipline) even though it is not literally `execWsl`.
 *
 * DEVIATION 2 (A1 caveat, Pitfall 2): the wsl.exe-direct shape was not
 * literally in the Phase-1 spike's observed test matrix (the spike tested a
 * Node placeholder under `ELECTRON_RUN_AS_NODE=1`); its own "Implications for
 * Phase 6" section explicitly endorses spawning `wsl.exe` directly as an
 * equally-valid shape. LIVE survival of this exact shape is validated by
 * 06-11's smoke check, not by this module's (necessarily fully-mocked) tests.
 *
 * T-06-03 (Tampering mitigation): adoption requires BOTH a live PID AND that
 * PID currently running as `wsl.exe` (tasklist image-name match) -- a
 * tampered/reused-PID pidfile alone is never sufficient to adopt.
 * T-06-04 (Elevation/Injection mitigation): the holder's spawn argv is the
 * FIXED literal `-d livinity --exec sleep infinity` -- no renderer/state
 * interpolation, no shell (`spawn`, not `exec`, with an explicit argv array).
 *
 * Every IO collaborator (spawn/execFile/fs/kill/`app.getPath`) is injectable
 * via a `Partial<HolderDeps>` seam (mirrors `distro-install.ts`/
 * `install-invoke.ts`) -- zero real process is ever spawned or killed in
 * vitest.
 */

import { spawn as nodeSpawn, execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

export interface HolderRecord {
  pid: number;
  spawnedAt: string;
}

const HOLDER_FILE_NAME = 'holder.json';

/** Fixed literal argv (T-06-04) -- never interpolated, never a secret. */
const HOLDER_ARGS = ['-d', 'livinity', '--exec', 'sleep', 'infinity'];

export interface HolderDeps {
  spawn: typeof nodeSpawn;
  execFile: (
    file: string,
    args: string[],
    options: { windowsHide?: boolean }
  ) => Promise<{ stdout: string; stderr: string }>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, data: string) => Promise<void>;
  unlink: (filePath: string) => Promise<void>;
  /** Best-effort process termination -- production default is `process.kill`. */
  kill: (pid: number) => void;
  getUserDataPath: () => string;
}

const execFileAsync = promisify(nodeExecFile);

function defaultExecFile(
  file: string,
  args: string[],
  options: { windowsHide?: boolean }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(file, args, options).then((r) => ({
    stdout: String(r.stdout ?? ''),
    stderr: String(r.stderr ?? ''),
  }));
}

const defaultDeps: HolderDeps = {
  spawn: nodeSpawn,
  execFile: defaultExecFile,
  readFile: (p) => fs.readFile(p, 'utf8'),
  writeFile: (p, data) => fs.writeFile(p, data, 'utf8'),
  unlink: (p) => fs.unlink(p),
  kill: (pid) => {
    process.kill(pid);
  },
  getUserDataPath: () => app.getPath('userData'),
};

function resolveDeps(deps: Partial<HolderDeps>): HolderDeps {
  return { ...defaultDeps, ...deps };
}

function holderFilePath(d: HolderDeps): string {
  return path.join(d.getUserDataPath(), HOLDER_FILE_NAME);
}

/**
 * Reads+parses `holder.json`. Returns `null` on ANY IO/JSON/shape failure --
 * a missing, corrupt, or tampered-but-malformed pidfile all degrade to
 * "no known holder" rather than throwing (mirrors `state-store.ts`'s
 * `readState` degrade-to-null discipline).
 */
export async function readHolderRecord(deps: Partial<HolderDeps> = {}): Promise<HolderRecord | null> {
  const d = resolveDeps(deps);
  try {
    const raw = await d.readFile(holderFilePath(d));
    const parsed = JSON.parse(raw) as Partial<HolderRecord>;
    if (typeof parsed.pid !== 'number' || typeof parsed.spawnedAt !== 'string') return null;
    return { pid: parsed.pid, spawnedAt: parsed.spawnedAt };
  } catch {
    return null;
  }
}

/**
 * PID-reuse-safe liveness (Pattern 2, T-06-03). `/NH` suppresses the
 * (locale-translated) header row; the `IMAGENAME` column value itself is a
 * literal filename, never translated -- locale-safe, no narrative-text
 * parsing. Never throws past this function: any `execFile` failure (missing
 * binary, access denied) degrades to "not alive."
 */
export async function isPidAliveAsWsl(pid: number, deps: Partial<HolderDeps> = {}): Promise<boolean> {
  const d = resolveDeps(deps);
  try {
    const { stdout } = await d.execFile(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/FI', 'IMAGENAME eq wsl.exe', '/NH'],
      { windowsHide: true }
    );
    return stdout.trim().length > 0 && !/no tasks/i.test(stdout);
  } catch {
    return false;
  }
}

/**
 * Spawns the detached+unref `wsl.exe` holder (RESEARCH Pattern 1) and
 * persists its `{pid, spawnedAt}` to `holder.json`.
 *
 * WR-10: `spawn` reports launch failures (ENOENT/EACCES/EPERM) as an
 * ASYNCHRONOUS `'error'` event on the child -- with no listener attached that
 * is an unhandled `'error'` event, i.e. an uncaught exception in the main
 * process (this spawn runs unattended at login and from every 45s respawn).
 * The listener swallows it: every liveness path (`isPidAliveAsWsl`) already
 * treats a failed spawn as a dead holder, and the next supervision tick
 * retries. On a failed spawn `child.pid` is also `undefined` -- returning 0
 * (a PID no user process ever has) instead of writing a malformed pidfile
 * (`JSON.stringify` would silently drop the undefined pid key).
 */
export async function spawnHolder(deps: Partial<HolderDeps> = {}): Promise<number> {
  const d = resolveDeps(deps);
  const child = d.spawn('wsl.exe', HOLDER_ARGS, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.once('error', () => {
    // Swallowed by design (WR-10) -- liveness treats a failed spawn as dead.
  });
  child.unref();

  if (typeof child.pid !== 'number') {
    return 0; // spawn failed -- no pidfile write; callers' liveness sees "dead"
  }

  const record: HolderRecord = { pid: child.pid, spawnedAt: new Date().toISOString() };
  await d.writeFile(holderFilePath(d), JSON.stringify(record));
  return record.pid;
}

/**
 * Adopts an already-running holder (pidfile present + `isPidAliveAsWsl`
 * true) rather than spawning a second one (SPIKE-VERDICT "Implications for
 * Phase 6"). Spawns only when no live holder exists: pidfile absent, the
 * recorded PID is dead, or the PID is alive but no longer running as
 * `wsl.exe` (reuse guard).
 */
export async function adoptOrSpawnHolder(deps: Partial<HolderDeps> = {}): Promise<number> {
  const d = resolveDeps(deps);
  const record = await readHolderRecord(d);
  if (record && (await isPidAliveAsWsl(record.pid, d))) {
    return record.pid;
  }
  return spawnHolder(d);
}

/**
 * Best-effort holder termination -- reads the pidfile, kills the recorded
 * PID, and clears the pidfile. Never throws: a missing pidfile, an
 * already-dead PID (kill throws ESRCH-equivalent), or a failed unlink all
 * resolve silently. The caller's `wsl --terminate livinity` (STOP, D-03)
 * tears down the in-distro session regardless of whether this kill succeeds.
 *
 * WR-01 (T-06-03, same guard as adoption): a bare pidfile PID is NEVER
 * sufficient to kill -- Windows reuses PIDs aggressively and `holder.json`
 * survives reboots, so a stale record could point at an unrelated innocent
 * process. Kill only when `isPidAliveAsWsl` confirms the PID is still
 * running as `wsl.exe`; the stale pidfile is unlinked either way.
 */
export async function killHolder(deps: Partial<HolderDeps> = {}): Promise<void> {
  const d = resolveDeps(deps);
  const record = await readHolderRecord(d);
  if (record && (await isPidAliveAsWsl(record.pid, d))) {
    try {
      d.kill(record.pid);
    } catch {
      // already dead / access denied -- best-effort only
    }
  }
  try {
    await d.unlink(holderFilePath(d));
  } catch {
    // missing pidfile is not an error
  }
}
