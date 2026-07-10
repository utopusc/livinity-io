/**
 * src/main/wsl/wsl-exec.ts
 *
 * D-05 (hard rule): every wsl.exe / PowerShell child in this phase spawns
 * through here — `windowsHide: true` is non-negotiable, no terminal window is
 * ever visible. `WSL_UTF8: '1'` forces wsl.exe to emit UTF-8 on stdout instead
 * of its default UTF-16LE (RESEARCH.md Pitfall 1) — without it, parsed output
 * is garbled/NUL-laced regardless of how carefully the parser is written.
 *
 * This is the ONLY sanctioned wsl.exe/powershell.exe spawn wrapper for the
 * WSL2 provisioning phase — every orchestrator (distro-install.ts,
 * install-invoke.ts, disk-probe.ts, wsl.ipc.ts) calls execWsl/
 * execPowerShellJson, never a bare child_process.spawn.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { logSafe } from '../log';

const DEFAULT_TIMEOUT_MS = 60_000;

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Drains a spawned child's stdout/stderr and settles once on whichever of
 * close/error/timeout happens first. A spawn 'error' (e.g. ENOENT — wsl.exe
 * missing) resolves rather than rejects: callers treat `code: null` as the
 * "couldn't run it" signal (never a hung promise, never an unhandled
 * rejection crossing an IPC boundary).
 */
function drainChild(child: ChildProcess, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ code: null, stdout, stderr });
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: String(err) });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * The sanctioned wsl.exe spawn wrapper. Never logs the raw env (secrets) —
 * only scalar breadcrumbs (arg0, exit code).
 */
export function execWsl(
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<ExecResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const child = spawn('wsl.exe', args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WSL_UTF8: '1' },
  });
  return drainChild(child, timeoutMs).then((result) => {
    logSafe('wsl.exec', { arg0: args[0] ?? '', code: result.code ?? -1 });
    return result;
  });
}

/**
 * The sanctioned powershell.exe spawn wrapper for JSON-emitting probes
 * (RESEARCH.md Pattern 2). Returns raw stdout — the caller JSON.parses it.
 */
export function execPowerShellJson(
  script: string,
  opts: { timeoutMs?: number } = {}
): Promise<{ code: number | null; stdout: string }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WSL_UTF8: '1' },
  });
  return drainChild(child, timeoutMs).then(({ code, stdout }) => ({ code, stdout }));
}
