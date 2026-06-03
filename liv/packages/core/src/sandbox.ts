/**
 * Phase 256-01 (WS-A — Contained Autonomy, LIVOS-002).
 *
 * Bubblewrap (`bwrap`) sandbox argv + credential-scrubbed child environment for
 * the agent's in-process `shell` tool exec (ShellExecutor.execute in shell.ts).
 *
 * Design (SECURITY-REMEDIATION-DESIGN.md §"Contained Autonomy"):
 *  1. Write-confine the agent shell to the SINGLE agent-workspace root
 *     (`LIV_AGENT_WORKSPACE`) — never `/opt/liv` (its own compiled code), never
 *     secrets/home-creds, never `/var/run/docker.sock`.
 *  2. Scrub host creds (LIV_API_KEY/DATABASE_URL/JWT/Redis-PG) from the child env.
 *  3. Route all egress through the deny-by-default allowlist proxy via
 *     HTTPS_PROXY/HTTP_PROXY (breaks the lethal-trifecta exfiltration leg).
 *
 * WORKSPACE-ROOT INVARIANT (revision fix B): sandbox.ts (bwrap write-root),
 * files-sandbox.ts (allowlist), and agent-git-snapshot.ts (snapshot dir) all
 * agree on this ONE root. It is NOT `/opt/liv`.
 */
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * The SINGLE agent-workspace root shared by the bwrap write-root (this file),
 * the `files`-tool allowlist (files-sandbox.ts), and the per-session git
 * snapshot (agent-git-snapshot.ts). This is NOT `/opt/liv` (the liv source/dist
 * tree) — the agent's own compiled code must remain unwritable. (revision fix B)
 */
export const LIV_AGENT_WORKSPACE =
  process.env.LIV_AGENT_WORKSPACE || '/opt/livos/data/agent-workspace';

/** The egress allowlist proxy URL (tinyproxy livos-egress, default :13128). */
export const LIV_EGRESS_PROXY =
  process.env.LIV_EGRESS_PROXY || 'http://127.0.0.1:13128';

/**
 * Paths whose CONTENTS must never be readable inside the agent sandbox. These
 * are simply never bound into the bwrap namespace (bwrap starts from an empty
 * root and only the explicit binds below are visible).
 */
const SANDBOX_DENY_READ = [
  '/opt/livos/.env',
  '/opt/livos/data/secrets',
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.claude'),
  path.join(os.homedir(), '.gemini'),
];

/** Host-cred / infra env vars that must NEVER reach the agent child process. */
const SCRUB_KEYS = new Set([
  'LIV_API_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_SECRET_FILE',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'PGPASSWORD',
]);

/** Allow-list of env vars that may be copied into the agent child process. */
const ENV_ALLOW = ['HOME', 'PATH', 'LANG', 'NODE_ENV', 'TERM', 'USER'] as const;

/**
 * Probe whether `bwrap` is on PATH (resolved ONCE at module load). On non-Linux
 * / dev boxes without bubblewrap this is false, and shell.ts degrades gracefully
 * (still scrubbing the env) — see shell.ts execute().
 */
function probeBwrap(): boolean {
  try {
    execFileSync('bwrap', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export const BWRAP_AVAILABLE: boolean = probeBwrap();

/**
 * Build a credential-scrubbed child environment for the agent exec. Allow-list
 * (not deny-list) the copy — mirrors sdk-agent-runner.ts safeEnv philosophy.
 * Always strips the host creds in SCRUB_KEYS and points egress at the proxy.
 */
export function buildScrubbedEnv(srcEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ENV_ALLOW) {
    if (srcEnv[key] !== undefined && !SCRUB_KEYS.has(key)) {
      env[key] = srcEnv[key];
    }
  }
  const proxy = srcEnv.LIV_EGRESS_PROXY || LIV_EGRESS_PROXY;
  env.HTTPS_PROXY = proxy;
  env.HTTP_PROXY = proxy;
  env.NO_PROXY = '';
  return env;
}

/**
 * Build the bubblewrap argv for running `command` write-confined to
 * `opts.workspace` (the agent-workspace). The ONLY writable bind is the
 * workspace; secrets / docker.sock / /opt/liv are never bound.
 *
 * The argv is always constructed (pure string building); `usable` reflects
 * whether `bwrap` is actually on PATH. When `usable:false` callers fall back to
 * a plain (still env-scrubbed) exec on dev boxes — see shell.ts execute().
 */
export function wrapWithBwrap(
  command: string,
  opts: { workspace: string },
): { argv: string[]; usable: boolean } {
  const ws = opts.workspace;
  const argv: string[] = [
    'bwrap',
    '--unshare-all',
    '--share-net', // net stays so the egress proxy is reachable
    '--die-with-parent',
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/bin', '/bin',
    '--ro-bind', '/lib', '/lib',
    '--ro-bind', '/lib64', '/lib64',
    '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    // The ONLY writable bind: the agent workspace. Never /opt/liv, never secrets.
    '--bind', ws, ws,
    '--chdir', ws,
    'sh', '-c', command,
  ];
  return { argv, usable: BWRAP_AVAILABLE };
}

export { SANDBOX_DENY_READ };
