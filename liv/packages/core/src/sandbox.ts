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
import { logger } from './logger.js';

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
 * Phase 262-05 (LIVOS-058): the RUNTIME usability probe argv. A real namespace
 * command — `--version` only proves the binary exists; it succeeds even when
 * unprivileged user namespaces are denied by the kernel/AppArmor at runtime
 * (apparmor_restrict_unprivileged_userns, unprivileged_userns_clone=0,
 * max_user_namespaces=0, nested container without CAP_SYS_ADMIN), in which
 * case every actual bwrap exec fails with a namespace EPERM.
 */
export const BWRAP_RUNTIME_PROBE_ARGV = [
  '--unshare-all',
  '--share-net',
  '--ro-bind', '/', '/',
  'true',
] as const;

/** Cheap PATH-presence check (the old probe) — distinguishes "off PATH" from
 * "present but userns-unusable" so shell.ts can fail SAFE (refusal) instead of
 * silently downgrading to an unsandboxed exec. */
function probeBwrapOnPath(): boolean {
  try {
    execFileSync('bwrap', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** True runtime userns probe (resolved ONCE at module load). */
function probeBwrapRuntime(): boolean {
  try {
    execFileSync('bwrap', [...BWRAP_RUNTIME_PROBE_ARGV], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** bwrap binary is on PATH (says NOTHING about runtime userns usability). */
export const BWRAP_ON_PATH: boolean = probeBwrapOnPath();

/**
 * bwrap is ACTUALLY usable at runtime (on PATH AND the userns probe entered a
 * namespace successfully). On non-Linux / dev boxes without bubblewrap this is
 * false, and shell.ts degrades gracefully (still scrubbing the env) — see
 * shell.ts execute(). When bwrap is present but userns is unavailable, shell.ts
 * REFUSES (never silently unsandboxed) — LIVOS-058.
 */
export const BWRAP_AVAILABLE: boolean = BWRAP_ON_PATH && probeBwrapRuntime();

// ONE operator-facing health log at module load (LIVOS-058): the agent shell is
// disabled (stable refusal per call) until userns is restored on the host.
if (BWRAP_ON_PATH && !BWRAP_AVAILABLE) {
  logger.error(
    'bwrap present but userns unavailable; agent shell disabled (LIVOS-058). ' +
      'Check AppArmor unprivileged-userns restrictions / kernel.unprivileged_userns_clone / max_user_namespaces.',
  );
}

/** The execution modes shell.ts resolves from the two probe facts (LIVOS-058). */
export type ShellExecutionMode = 'bwrap' | 'unsandboxed-dev' | 'refuse';

/**
 * Pure decision: how must the shell tool execute?
 *  - runtime-usable            → 'bwrap' (sandboxed exec, the normal path)
 *  - genuinely off PATH        → 'unsandboxed-dev' (the UNCHANGED env-scrubbed
 *                                dev/non-Linux fallback — fires ONLY when bwrap
 *                                is absent)
 *  - present but userns broken → 'refuse' (stable refusal; NEVER a silent
 *                                unsandboxed fallback — that would disable the
 *                                contained-autonomy control)
 */
export function resolveShellExecutionMode(
  onPath: boolean,
  runtimeUsable: boolean,
): ShellExecutionMode {
  if (runtimeUsable) return 'bwrap';
  if (!onPath) return 'unsandboxed-dev';
  return 'refuse';
}

/** The stable refusal the shell tool returns in 'refuse' mode (LIVOS-058). */
export const SANDBOX_REFUSAL = {
  stdout: '',
  stderr:
    'Shell sandbox unavailable: bwrap present but user namespaces are not permitted on this host. Refusing to run unsandboxed (LIVOS-058).',
  code: 126,
} as const;

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
 * The argv is always constructed (pure string building); `usable` reflects the
 * RUNTIME userns probe (BWRAP_AVAILABLE, Phase 262-05 LIVOS-058) — not mere
 * PATH presence. When `usable:false` shell.ts consults BWRAP_ON_PATH: off-PATH
 * dev boxes fall back to a plain (still env-scrubbed) exec; present-but-
 * userns-unavailable hosts get the stable SANDBOX_REFUSAL instead.
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
