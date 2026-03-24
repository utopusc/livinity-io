import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export interface ShellResult {
  success: boolean;
  output: string;
  error?: string;
  data?: {
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
  };
}

const MAX_OUTPUT_BYTES = 100 * 1024; // 100KB

function truncate(text: string, label: string): string {
  if (Buffer.byteLength(text, 'utf-8') <= MAX_OUTPUT_BYTES) return text;
  const originalSize = Buffer.byteLength(text, 'utf-8');
  // Slice by bytes: convert to buffer, slice, convert back
  const truncated = Buffer.from(text, 'utf-8').subarray(0, MAX_OUTPUT_BYTES).toString('utf-8');
  return `${truncated}\n...[truncated, original size: ${originalSize} bytes]`;
}

function detectShell(): { shell: string; buildArgs: (command: string) => string[] } {
  if (process.platform === 'win32') {
    return {
      shell: 'powershell.exe',
      buildArgs: (command: string) => ['-NoProfile', '-NonInteractive', '-Command', command],
    };
  }

  const bashPath = '/bin/bash';
  const shellPath = existsSync(bashPath) ? bashPath : '/bin/sh';

  return {
    shell: shellPath,
    buildArgs: (command: string) => ['-c', command],
  };
}

const DEFAULT_TIMEOUT = 30_000; // 30 seconds

export async function executeShell(params: Record<string, unknown>): Promise<ShellResult> {
  const command = params.command as string | undefined;
  const cwd = (params.cwd as string | undefined) || homedir();
  const timeout = (params.timeout as number | undefined) || DEFAULT_TIMEOUT;

  if (!command || typeof command !== 'string' || command.trim() === '') {
    return { success: false, output: '', error: 'Missing required parameter: command' };
  }

  const { shell, buildArgs } = detectShell();
  const shellArgs = buildArgs(command);

  return new Promise<ShellResult>((resolve) => {
    const startTime = Date.now();

    let proc;
    try {
      proc = spawn(shell, shellArgs, {
        cwd,
        timeout,
        env: process.env,
      });
    } catch (err: unknown) {
      return resolve({
        success: false,
        output: '',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    proc.on('error', (err: Error) => {
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        output: '',
        error: err.message,
        data: { stdout: '', stderr: '', exitCode: 1, duration },
      });
    });

    proc.on('close', (code: number | null) => {
      const duration = Date.now() - startTime;
      const rawStdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const rawStderr = Buffer.concat(stderrChunks).toString('utf-8');

      const stdout = truncate(rawStdout, 'stdout');
      const stderr = truncate(rawStderr, 'stderr');
      const exitCode = code ?? 1;

      // Use stdout for display output, fall back to stderr if stdout is empty
      const output = stdout || stderr;

      resolve({
        success: true,
        output,
        data: { stdout, stderr, exitCode, duration },
      });
    });
  });
}
