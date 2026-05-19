/**
 * Phase 163-03 — Surface-overlay composition lock test.
 *
 * Locks the POST-163-02.5 composition: when isComputerUseSession returns
 * true AND vaultModeConfig is set, the SDK query() receives BOTH:
 *   - systemPrompt from the Phase 161-02 builder (overlay precedence)
 *   - cwd = surface vault path (Phase 163-02.5 decoupled gate)
 *
 * Plus the Phase 161/162-04 invariants required for the chain to function:
 *   - isComputerUseSession helper UNCHANGED (Phase 161)
 *   - dated Haiku literal UNCHANGED (Phase 161)
 *   - buildSessionKey closure literal UNCHANGED (Phase 162-04)
 *   - resolveSessionVaultPath exists + surface prefix branches (Phase 163-02)
 *
 * This plan ships ZERO source code edits — only this new test file. Source
 * changes that produced the post-163-02.5 composition live in 163-02.5; the
 * Phase 163-02 surface routing in ws-agent.ts lives in 163-02.
 *
 * Runner: tsx + node:assert/strict (sibling to agent-session.vault-mode.test.ts).
 * Run with: cd liv && npx tsx packages/core/src/agent-session.surface-overlay.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// agent-session.ts — post-163-02.5 (this file's primary lock target)
const AGENT_SESSION_SRC = readFileSync(
  resolve(__dirname, 'agent-session.ts'),
  'utf8',
);

// ws-agent.ts — post-163-02 (cross-package, sibling livinityd workspace)
const WS_AGENT_SRC = readFileSync(
  resolve(
    __dirname,
    '../../../../livos/packages/livinityd/source/modules/server/ws-agent.ts',
  ),
  'utf8',
);

let passed = 0;
let failed = 0;
const fail = (name: string, err: unknown) => {
  failed++;
  console.error(`FAIL: ${name} — ${err instanceof Error ? err.message : String(err)}`);
};
const pass = (name: string) => {
  passed++;
  console.log(`PASS: ${name}`);
};

// ── Invariant 1: post-163-02.5 decoupled gate literal ─────────────────────

function invariant1_decoupledGateLiteral() {
  const name = 'Inv 1: agent-session.ts contains `const vaultMode = this.vaultModeConfig !== null`';
  try {
    const needle = 'const vaultMode = this.vaultModeConfig !== null';
    const count = AGENT_SESSION_SRC.split(needle).length - 1;
    assert.equal(count, 1, `expected exactly 1 match, got ${count}`);
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Invariant 2: post-163-02.5 overlay-preserving systemPrompt gate ───────

function invariant2_systemPromptGate() {
  const name = 'Inv 2: agent-session.ts contains `systemPrompt: vaultMode && !computerUse ? undefined : systemPrompt,`';
  try {
    const needle = 'systemPrompt: vaultMode && !computerUse ? undefined : systemPrompt,';
    const count = AGENT_SESSION_SRC.split(needle).length - 1;
    assert.equal(count, 1, `expected exactly 1 match, got ${count}`);
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Invariant 3: post-163-02.5 skills-suppress settingSources gate ────────

function invariant3_settingSourcesGate() {
  const name = "Inv 3: agent-session.ts contains `settingSources: vaultMode && !computerUse ? ['project'] : undefined,`";
  try {
    const needle = "settingSources: vaultMode && !computerUse ? ['project'] : undefined,";
    const count = AGENT_SESSION_SRC.split(needle).length - 1;
    assert.equal(count, 1, `expected exactly 1 match, got ${count}`);
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Invariant 4: cwd threading line UNCHANGED (now reaches SDK for computer-use too) ─

function invariant4_cwdThreading() {
  const name = 'Inv 4: agent-session.ts contains `cwd: sessionCwd,` exactly once';
  try {
    const needle = 'cwd: sessionCwd,';
    const count = AGENT_SESSION_SRC.split(needle).length - 1;
    assert.equal(count, 1, `expected exactly 1 match, got ${count}`);
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Invariant 5: pre-163-02.5 OLD coupled gate fully removed ──────────────

function invariant5_oldGateRemoved() {
  const name = 'Inv 5: agent-session.ts does NOT contain OLD literal `const vaultMode = !computerUse && this.vaultModeConfig !== null`';
  try {
    const needle = 'const vaultMode = !computerUse && this.vaultModeConfig !== null';
    const count = AGENT_SESSION_SRC.split(needle).length - 1;
    assert.equal(count, 0, `expected 0 matches (literal must be removed by 163-02.5), got ${count}`);
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Invariant 6: Phase 161 dated Haiku literal preserved ──────────────────

function invariant6_haikuDatedLiteralPreserved() {
  const name = "Inv 6: agent-session.ts contains 'claude-haiku-4-5-20251001' ≥2 times";
  try {
    const matches = (AGENT_SESSION_SRC.match(/claude-haiku-4-5-20251001/g) ?? []).length;
    assert.ok(matches >= 2, `expected ≥2, got ${matches}`);
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Invariant 7: Phase 161 isComputerUseSession helper UNCHANGED ──────────

function invariant7_isComputerUseSessionHelperUnchanged() {
  const name = 'Inv 7: agent-session.ts contains Phase 161 isComputerUseSession helper exactly once with known fingerprint';
  try {
    // Signature
    const sig = 'export function isComputerUseSession(conversationId: string | undefined): boolean';
    const sigCount = AGENT_SESSION_SRC.split(sig).length - 1;
    assert.equal(sigCount, 1, `expected 1 signature match, got ${sigCount}`);

    // Body fingerprint — two lines verbatim
    const body1 = '  if (!conversationId) return false;';
    const body2 = "  return conversationId.startsWith('native:') || conversationId.startsWith('webapp:');";
    assert.ok(AGENT_SESSION_SRC.includes(body1), 'isComputerUseSession body line 1 (conversationId guard) missing');
    assert.ok(AGENT_SESSION_SRC.includes(body2), 'isComputerUseSession body line 2 (startsWith branch) missing');
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Invariant 8: ws-agent.ts Phase 162-04 buildSessionKey closure literal ─

function invariant8_phase162_04SessionKeyClosure() {
  const name = 'Inv 8: ws-agent.ts contains Phase 162-04 buildSessionKey closure literal `opts.vaultModeConfig === undefined` exactly 1 match';
  try {
    const needle = 'opts.vaultModeConfig === undefined';
    const count = WS_AGENT_SRC.split(needle).length - 1;
    assert.equal(count, 1, `expected exactly 1 match, got ${count}`);
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Invariant 9: ws-agent.ts Phase 163-02 resolveSessionVaultPath export ──

function invariant9_resolveSessionVaultPathExported() {
  const name = 'Inv 9: ws-agent.ts exports Phase 163-02 resolveSessionVaultPath function';
  try {
    assert.match(
      WS_AGENT_SRC,
      /export\s+function\s+resolveSessionVaultPath/,
      'export function resolveSessionVaultPath must be declared',
    );
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Invariant 10: ws-agent.ts surface prefix branches ─────────────────────

function invariant10_surfacePrefixBranches() {
  const name = 'Inv 10: ws-agent.ts contains surface prefix branches for both webapp: and native:';
  try {
    // Phase 163-02's resolveSessionVaultPath compares kind to 'webapp' / 'native'
    // (post-split form). It does NOT need .startsWith() — accept either the
    // strict-equality form or the startsWith form.
    const hasWebappBranch =
      WS_AGENT_SRC.includes("kind !== 'webapp'") ||
      WS_AGENT_SRC.includes("kind === 'webapp'") ||
      WS_AGENT_SRC.includes(".startsWith('webapp:')") ||
      WS_AGENT_SRC.includes("conversationId.startsWith('webapp:')");
    const hasNativeBranch =
      WS_AGENT_SRC.includes("kind !== 'native'") ||
      WS_AGENT_SRC.includes("kind === 'native'") ||
      WS_AGENT_SRC.includes(".startsWith('native:')") ||
      WS_AGENT_SRC.includes("conversationId.startsWith('native:')");
    assert.ok(hasWebappBranch, 'ws-agent.ts must reference webapp: surface prefix in the resolver');
    assert.ok(hasNativeBranch, 'ws-agent.ts must reference native: surface prefix in the resolver');
    pass(name);
  } catch (err) { fail(name, err); }
}

// ── Runner ────────────────────────────────────────────────────────────────

async function main() {
  console.log('agent-session.surface-overlay.test.ts');
  console.log('');
  console.log('Phase 163-02.5 post-revision composition (Invariants 1-7):');
  invariant1_decoupledGateLiteral();
  invariant2_systemPromptGate();
  invariant3_settingSourcesGate();
  invariant4_cwdThreading();
  invariant5_oldGateRemoved();
  invariant6_haikuDatedLiteralPreserved();
  invariant7_isComputerUseSessionHelperUnchanged();

  console.log('');
  console.log('Phase 163-02 surface routing + Phase 162-04 sessionKey (Invariants 8-10):');
  invariant8_phase162_04SessionKeyClosure();
  invariant9_resolveSessionVaultPathExported();
  invariant10_surfacePrefixBranches();

  console.log('');
  console.log(`${passed} PASS / ${failed} FAIL`);

  // Strip listeners (Windows SDK teardown noise per 162-04 SUMMARY)
  process.removeAllListeners('exit');
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('UNCAUGHT:', err);
  process.exit(1);
});
