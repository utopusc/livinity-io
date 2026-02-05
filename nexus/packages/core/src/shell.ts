import { exec } from 'child_process';
import { logger } from './logger.js';

const NEXUS_BASE_DIR = process.env.NEXUS_BASE_DIR || '/opt/nexus';

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

    logger.info('Shell: executing', { command, timeout: timeoutMs });

    return new Promise((resolve) => {
      exec(command, { cwd: this.cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        const truncate = (s: string) => s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n...[truncated]' : s;
        const code = error ? (error as any).code ?? 1 : 0;

        if (error && (error as any).killed) {
          resolve({ stdout: truncate(stdout), stderr: `Command timed out after ${timeoutMs}ms`, code: 124 });
          return;
        }

        resolve({
          stdout: truncate(stdout),
          stderr: truncate(stderr),
          code,
        });
      });
    });
  }
}
