import { exec, execFile } from 'child_process';
import { mkdirSync } from 'fs';
import { logger } from './logger.js';
import {
  wrapWithBwrap,
  buildScrubbedEnv,
  BWRAP_AVAILABLE,
  LIV_AGENT_WORKSPACE,
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

  constructor(cwd = NEXUS_BASE_DIR) {
    this.cwd = cwd;
  }

  async execute(command: string, timeoutMs = DEFAULT_TIMEOUT): Promise<{ stdout: string; stderr: string; code: number }> {
    // Check blocklist
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        logger.warn('Shell: blocked dangerous command', { command });
        return { stdout: '', stderr: `Blocked: command matches safety filter`, code: 1 };
      }
    }

    logger.info('Shell: executing', { command, timeout: timeoutMs, sandboxed: BWRAP_AVAILABLE });

    // Phase 256-01 (WS-A / LIVOS-002): scrub host creds from the child env
    // ALWAYS (defense-in-depth, even on dev boxes without bwrap). The agent
    // shell's write-confined root is LIV_AGENT_WORKSPACE, NOT this.cwd / /opt/liv.
    const env = buildScrubbedEnv();
    const truncate = (s: string) => (s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n...[truncated]' : s);

    const { argv, usable } = wrapWithBwrap(command, { workspace: LIV_AGENT_WORKSPACE });

    return new Promise((resolve) => {
      const cb = (error: any, stdout: string, stderr: string) => {
        const code = error ? (error as any).code ?? 1 : 0;
        if (error && (error as any).killed) {
          resolve({ stdout: truncate(stdout), stderr: `Command timed out after ${timeoutMs}ms`, code: 124 });
          return;
        }
        resolve({ stdout: truncate(stdout), stderr: truncate(stderr), code });
      };

      if (usable) {
        // bwrap-sandboxed: write-root = LIV_AGENT_WORKSPACE, deny-read secrets,
        // no docker.sock, egress via proxy (HTTPS_PROXY in scrubbed env).
        execFile('bwrap', argv.slice(1), { timeout: timeoutMs, maxBuffer: 1024 * 1024, env }, cb);
      } else {
        // Dev/non-Linux fallback: still env-scrubbed, still run in the agent
        // workspace (NOT this.cwd / /opt/liv) so the liv code stays unwritable.
        exec(command, { cwd: LIV_AGENT_WORKSPACE, timeout: timeoutMs, maxBuffer: 1024 * 1024, env }, cb);
      }
    });
  }
}
