/**
 * Phase 256-01 Task 2 — path-allowlist for the `files` tool (LIVOS-002 / SC1).
 *
 * Locks: isFilePathAllowed() realpath-normalizes and ALLOWS only paths under
 * LIV_AGENT_WORKSPACE (and /opt/livos/data/uploads); DENIES .env / secrets /
 * home-creds / /opt/liv / traversal — deny wins, and never throws.
 *
 * Runner: tsx + node:assert/strict. Run with: npx tsx src/files-sandbox.test.ts
 */
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { isFilePathAllowed } from './files-sandbox.js';

const WS = process.env.LIV_AGENT_WORKSPACE || '/opt/livos/data/agent-workspace';

function test1_insideWorkspace() {
  assert.equal(isFilePathAllowed(path.join(WS, 'notes.md')), true, 'inside workspace → allowed');
  console.log('  PASS: path inside LIV_AGENT_WORKSPACE is allowed');
}

function test2_secrets() {
  assert.equal(isFilePathAllowed('/opt/livos/.env'), false, '.env denied');
  assert.equal(isFilePathAllowed('/opt/livos/data/secrets/jwt'), false, 'secrets denied');
  console.log('  PASS: /opt/livos/.env + secrets denied');
}

function test3_homeCreds() {
  assert.equal(
    isFilePathAllowed(path.join(os.homedir(), '.claude/.credentials.json')),
    false,
    'home-cred denied',
  );
  console.log('  PASS: ~/.claude/.credentials.json denied');
}

function test4_traversal() {
  assert.equal(
    isFilePathAllowed(path.join(WS, '../../.env')),
    false,
    'traversal out of workspace → denied (realpath-normalized)',
  );
  console.log('  PASS: ../../.env traversal denied');
}

function test5_livSource() {
  assert.equal(
    isFilePathAllowed('/opt/liv/packages/core/dist/index.js'),
    false,
    'agent own code → denied (no self-modify)',
  );
  console.log('  PASS: /opt/liv (own code) denied');
}

function test6_noThrowOnDenied() {
  // Must return false without throwing, so the tool returns a clean error.
  let threw = false;
  let result: boolean | undefined;
  try {
    result = isFilePathAllowed('/etc/shadow');
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'must not throw on a denied path');
  assert.equal(result, false, 'denied path returns false');
  // workspace-adjacent sibling must NOT match (trailing-sep guard)
  assert.equal(isFilePathAllowed(WS + '-evil/x'), false, 'sibling dir not matched');
  console.log('  PASS: denied paths return false without throwing; sibling-dir guard');
}

console.log('files-sandbox.test.ts — Phase 256-01 Task 2');
test1_insideWorkspace();
test2_secrets();
test3_homeCreds();
test4_traversal();
test5_livSource();
test6_noThrowOnDenied();
console.log('ALL PASS (6 checks)');
