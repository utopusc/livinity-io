/**
 * Phase 256-01 Task 3 (WS-A — Contained Autonomy, LIVOS-002 reversibility leg).
 *
 * Per-session git snapshot of the agent workspace so any run is one revert away
 * from undo (Replit/Aider model). Snapshots track LIV_AGENT_WORKSPACE — the SAME
 * root the bwrap shell write-binds and files-sandbox allowlists (revision fix B);
 * it never snapshots /opt/liv.
 *
 * Best-effort: reversibility is ADDITIVE, never load-bearing for the run to
 * proceed — any failure resolves { ok:false } and never throws.
 */
import { exec as cpExec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { LIV_AGENT_WORKSPACE } from './sandbox.js';

/** Injectable exec — promisified child_process.exec scoped to a cwd. */
export type ExecFn = (
  cmd: string,
  opts: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: ExecFn = (cmd, opts) =>
  new Promise((resolve, reject) => {
    cpExec(cmd, { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });

export interface SnapshotOpts {
  workspace?: string;
  sessionId: string;
  when: 'pre' | 'post';
  exec?: ExecFn;
}

/**
 * Create a per-session git commit + ref (refs/livos-agent/<sessionId>/<when>) of
 * the current state of the agent workspace. Initializes a repo if absent.
 * Returns { ok, sha } — { ok:false } on any failure (best-effort).
 */
export async function snapshotWorkspace(
  opts: SnapshotOpts,
): Promise<{ ok: boolean; sha?: string }> {
  const workspace = opts.workspace ?? LIV_AGENT_WORKSPACE;
  const exec = opts.exec ?? defaultExec;
  const { sessionId, when } = opts;
  const ref = `refs/livos-agent/${sessionId}/${when}`;
  // Identity is set inline per-commit so we never depend on / mutate global config.
  const ident = '-c user.email=livos@local -c user.name=livos-agent';

  try {
    // Initialize a repo if one is not already present.
    const hasGit = fs.existsSync(path.join(workspace, '.git'));
    if (!hasGit) {
      await exec('git init -q', { cwd: workspace });
      await exec('git config user.email livos@local', { cwd: workspace });
      await exec('git config user.name livos-agent', { cwd: workspace });
    }

    await exec('git add -A', { cwd: workspace });
    await exec(
      `git ${ident} commit -q --allow-empty -m "agent ${sessionId} ${when}"`,
      { cwd: workspace },
    );
    await exec(`git update-ref ${ref} HEAD`, { cwd: workspace });

    let sha: string | undefined;
    try {
      const { stdout } = await exec(`git rev-parse ${ref}`, { cwd: workspace });
      sha = stdout.trim() || undefined;
    } catch {
      /* sha read is non-essential */
    }
    return { ok: true, sha };
  } catch {
    // Best-effort: never break the agent run on snapshot failure.
    return { ok: false };
  }
}
