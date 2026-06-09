import { exec, execFile } from 'child_process';
import { mkdirSync } from 'fs';
import { logger } from './logger.js';
import {
  wrapWithBwrap,
  buildScrubbedEnv,
  BWRAP_ON_PATH,
  LIV_AGENT_WORKSPACE,
  resolveShellExecutionMode,
  SANDBOX_REFUSAL,
} from './sandbox.js';

const NEXUS_BASE_DIR = process.env.LIV_BASE_DIR || '/opt/liv';

// Phase 256-01 (WS-A): ensure the agent-workspace bind target exists. Best-effort,
// sync, swallow errors — the workspace is created on the host (not /opt/liv).
try {
  mkdirSync(LIV_AGENT_WORKSPACE, { recursive: true });
} catch {
  /* best-effort */
}

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?!\w)/,         // rm -rf /
  /mkfs\./,                       // mkfs.ext4 etc
  /:\(\)\s*\{\s*:\|:\s*&\s*\}/,  // fork bomb
  /dd\s+if=.*of=\/dev\//,        // dd to disk device
  />\s*\/dev\/sd[a-z]/,          // redirect to disk
  /shutdown|reboot|init\s+0/,    // system shutdown/reboot
  /chmod\s+-R\s+777\s+\//,      // recursive chmod on root
  /rm\s+-rf\s+\/\*/,            // rm -rf /*
];

const MAX_OUTPUT = 10_000;
const DEFAULT_TIMEOUT = 30_000;

export class ShellExecutor {
  private cwd: string;
  /** Test-only probe-state override (Phase 262-05) — production always uses the
   * module-load BWRAP_ON_PATH / wrapWithBwrap().usable facts. */
  private sandboxStateOverride?: { onPath: boolean; usable: boolean };

  constructor(cwd = NEXUS_BASE_DIR, sandboxStateOverride?: { onPath: boolean; usable: boolean }) {
    this.cwd = cwd;
    this.sandboxStateOverride = sandboxStateOverride;
  }

  async execute(command: string, timeoutMs = DEFAULT_TIMEOUT): Promise<{ stdout: string; stderr: string; code: number }> {
    // Check blocklist
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        logger.warn('Shell: blocked dangerous command', { command });
        return { stdout: '', stderr: `Blocked: command matches safety filter`, code: 1 };
      }
    }

    const { argv, usable } = wrapWithBwrap(command, { workspace: LIV_AGENT_WORKSPACE });

    // Phase 262-05 (LIVOS-058): resolve the execution mode from the TWO probe
    // facts (PATH presence vs runtime userns usability) instead of the old
    // PATH-only gate.
    const onPath = this.sandboxStateOverride?.onPath ?? BWRAP_ON_PATH;
    const runtimeUsable = this.sandboxStateOverride?.usable ?? usable;
    const mode = resolveShellExecutionMode(onPath, runtimeUsable);
    // `sandboxed` reflects ACTUAL engagement (true only when the bwrap branch
    // runs) — not the stale PATH-presence flag (LIVOS-058 log fix).
    const sandboxed = mode === 'bwrap';

    if (mode === 'refuse') {
      // bwrap is present but user namespaces are unavailable at runtime.
      // DO NOT execute — and NEVER silently fall back to unsandboxed exec
      // (that would disable the contained-autonomy control and convert this
      // availability gap into a security downgrade). The single operator
      // health log fired at sandbox.ts module load.
      logger.warn('Shell: refusing — bwrap present but userns unavailable (LIVOS-058)', { command });
      return { ...SANDBOX_REFUSAL };
    }

    logger.info('Shell: executing', { command, timeout: timeoutMs, sandboxed });

    // Phase 256-01 (WS-A / LIVOS-002): scrub host creds from the child env
    // ALWAYS (defense-in-depth, even on dev boxes without bwrap). The agent
    // shell's write-confined root is LIV_AGENT_WORKSPACE, NOT this.cwd / /opt/liv.
    const env = buildScrubbedEnv();
    const truncate = (s: string) => (s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n...[truncated]' : s);

    return new Promise((resolve) => {
      const cb = (error: any, stdout: string, stderr: string) => {
        const code = error ? (error as any).code ?? 1 : 0;
        if (error && (error as any).killed) {
          resolve({ stdout: truncate(stdout), stderr: `Command timed out after ${timeoutMs}ms`, code: 124 });
          return;
        }
        resolve({ stdout: truncate(stdout), stderr: truncate(stderr), code });
      };

      if (mode === 'bwrap') {
        // bwrap-sandboxed: write-root = LIV_AGENT_WORKSPACE, deny-read secrets,
        // no docker.sock, egress via proxy (HTTPS_PROXY in scrubbed env).
        execFile('bwrap', argv.slice(1), { timeout: timeoutMs, maxBuffer: 1024 * 1024, env }, cb);
      } else {
        // Dev/non-Linux fallback (bwrap genuinely OFF PATH — UNCHANGED, fires
        // only in 'unsandboxed-dev' mode): still env-scrubbed, still run in the
        // agent workspace (NOT this.cwd / /opt/liv) so the liv code stays
        // unwritable.
        exec(command, { cwd: LIV_AGENT_WORKSPACE, timeout: timeoutMs, maxBuffer: 1024 * 1024, env }, cb);
      }
    });
  }
}
