/**
 * Phase 256-01 Task 3 — per-session git snapshot for reversibility (LIVOS-002).
 *
 * Locks: snapshotWorkspace() creates a git repo + per-session pre/post refs
 * (refs/livos-agent/<sessionId>/<when>), supports revert-to-pre, fails SOFT when
 * git is unavailable, and defaults its workspace to LIV_AGENT_WORKSPACE.
 *
 * Runner: tsx + node:assert/strict. Run with: npx tsx src/agent-git-snapshot.test.ts
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotWorkspace } from './agent-git-snapshot.js';
import { LIV_AGENT_WORKSPACE } from './sandbox.js';

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'livos-snap-'));
}

async function test1_creatsRepoAndPreRef() {
  const ws = mkTmp();
  const r = await snapshotWorkspace({ workspace: ws, sessionId: 's1', when: 'pre' });
  assert.equal(r.ok, true, 'snapshot must succeed');
  assert.ok(r.sha && r.sha.length >= 7, 'must return a commit sha');
  // ref exists
  const ref = execSync('git rev-parse refs/livos-agent/s1/pre', { cwd: ws }).toString().trim();
  assert.ok(ref.length >= 7, 'pre ref must resolve to a commit');
  console.log('  PASS: fresh dir → git repo + livos-agent/s1/pre ref + sha');
}

async function test2_postRefAndRevert() {
  const ws = mkTmp();
  await snapshotWorkspace({ workspace: ws, sessionId: 's1', when: 'pre' });
  fs.writeFileSync(path.join(ws, 'new.txt'), 'agent wrote this');
  const post = await snapshotWorkspace({ workspace: ws, sessionId: 's1', when: 'post' });
  assert.equal(post.ok, true, 'post snapshot ok');

  const preSha = execSync('git rev-parse refs/livos-agent/s1/pre', { cwd: ws }).toString().trim();
  const postSha = execSync('git rev-parse refs/livos-agent/s1/post', { cwd: ws }).toString().trim();
  assert.notEqual(preSha, postSha, 'pre and post refs must differ');

  // Revert post → pre restores the pre-snapshot state (file gone).
  execSync(`git -c user.email=t@t -c user.name=t reset --hard ${preSha}`, { cwd: ws });
  assert.equal(fs.existsSync(path.join(ws, 'new.txt')), false, 'file gone after restoring pre');
  console.log('  PASS: post ref differs; revert-to-pre restores workspace');
}

async function test3_failsSoft() {
  const ws = mkTmp();
  // Inject a failing exec → snapshot must resolve { ok:false }, never throw.
  const failingExec = async () => {
    throw new Error('git unavailable (injected)');
  };
  let threw = false;
  let res: any;
  try {
    res = await snapshotWorkspace({ workspace: ws, sessionId: 's2', when: 'pre', exec: failingExec });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'must not throw on git failure');
  assert.equal(res.ok, false, 'fails soft → ok:false');
  console.log('  PASS: git-unavailable → { ok:false }, no throw');
}

async function test4_defaultWorkspace() {
  // Stub exec so we can observe the cwd it is invoked with, without touching
  // the real LIV_AGENT_WORKSPACE on disk.
  const seenCwds: string[] = [];
  const stubExec = async (cmd: string, opts: { cwd: string }) => {
    seenCwds.push(opts.cwd);
    // emulate "no .git yet" then success for the rest
    return { stdout: '', stderr: '' };
  };
  const r = await snapshotWorkspace({ sessionId: 's3', when: 'pre', exec: stubExec });
  assert.equal(r.ok, true, 'stubbed exec → ok');
  assert.ok(
    seenCwds.every((c) => c === LIV_AGENT_WORKSPACE),
    `default workspace must be LIV_AGENT_WORKSPACE (saw ${JSON.stringify(seenCwds)})`,
  );
  console.log('  PASS: default workspace = LIV_AGENT_WORKSPACE');
}

(async () => {
  console.log('agent-git-snapshot.test.ts — Phase 256-01 Task 3');
  await test1_creatsRepoAndPreRef();
  await test2_postRefAndRevert();
  await test3_failsSoft();
  await test4_defaultWorkspace();
  console.log('ALL PASS (4 checks)');
})().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
