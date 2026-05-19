/**
 * Phase 161-01 — Computer-use session detection + Haiku routing invariants.
 *
 * Locks:
 * - isComputerUseSession() pure helper behavior across native: / webapp: / plain / undefined
 * - Source-text presence of the dated 'claude-haiku-4-5-20251001' literal at SDK call
 * - Source-text absence of un-dated `tierToModel('haiku')` at the query() option
 *   (asserts the ternary `computerUse ? 'claude-haiku-4-5-20251001' : tierToModel(tier)`
 *   pattern is the actual model field assignment)
 * - Sacred SHA marker for sdk-agent-runner.ts (Phase 160-01 invariant style)
 * - Chat-path-untouched regression: plain UUIDs and non-prefixed convIds return false
 *
 * Runner: tsx + node:assert/strict (mirrors agent-session.test.ts).
 * Run with: npx tsx src/agent-session.computer-use.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isComputerUseSession } from './agent-session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = readFileSync(resolve(__dirname, 'agent-session.ts'), 'utf8');

// ── Pure helper behavior tests ────────────────────────────────

function testNativePrefixDetected() {
  assert.equal(isComputerUseSession('native:abc:123'), true);
  console.log('  PASS: native: prefix detected');
}

function testWebappPrefixDetected() {
  assert.equal(isComputerUseSession('webapp:abc:123'), true);
  console.log('  PASS: webapp: prefix detected');
}

function testPlainUuidNotDetected() {
  assert.equal(isComputerUseSession('550e8400-e29b-41d4-a716-446655440000'), false);
  console.log('  PASS: plain UUID returns false');
}

function testUndefinedNotDetected() {
  assert.equal(isComputerUseSession(undefined), false);
  console.log('  PASS: undefined returns false');
}

function testEmptyStringNotDetected() {
  assert.equal(isComputerUseSession(''), false);
  console.log('  PASS: empty string returns false');
}

// ── Source-text invariants ────────────────────────────────────

function testSourceContainsDatedHaikuLiteral() {
  assert.match(SRC, /claude-haiku-4-5-20251001/);
  console.log('  PASS: agent-session.ts contains dated Haiku literal');
}

function testSourceDoesNotUseUndatedHaikuAtCallSite() {
  // The SDK query() model option must NOT be `tierToModel(tier)` alone for
  // computer-use sessions — it must branch on `computerUse` and use the dated
  // literal. Assert that the ternary pattern is present at the model: assignment.
  assert.match(
    SRC,
    /model:\s*computerUse\s*\?\s*['"]claude-haiku-4-5-20251001['"]\s*:\s*tierToModel\(tier\)/,
  );
  console.log('  PASS: SDK query() branches dated-literal vs tierToModel(tier) correctly');
}

function testSourceContainsBothPrefixLiterals() {
  assert.match(SRC, /startsWith\(['"]native:['"]\)/);
  assert.match(SRC, /startsWith\(['"]webapp:['"]\)/);
  console.log('  PASS: both prefix literals present in helper');
}

function testSourceContainsPhase161Marker() {
  assert.match(SRC, /Phase 161-01/);
  console.log('  PASS: Phase 161-01 marker comment present');
}

function testSourceContainsSacredShaMarker() {
  assert.match(SRC, /sdk-agent-runner\.ts/);
  console.log('  PASS: sdk-agent-runner.ts sacred-SHA marker present in comments');
}

// ── Chat-path-untouched regression ────────────────────────────

function testChatPathUntouchedRegression() {
  // A plain UUID (AI Chat panel session) must NOT be detected as computer-use.
  // This is the chat-path-untouched contract guard.
  assert.equal(isComputerUseSession('chat-session-uuid-12345'), false);
  assert.equal(isComputerUseSession('AI-Chat-Default'), false);
  console.log('  PASS: chat-path session shapes return false (chat-path-untouched contract)');
}

// ── Runner ─────────────────────────────────────────────────────

async function main() {
  console.log('agent-session.computer-use.test.ts');
  console.log('');
  console.log('isComputerUseSession (pure helper):');
  testNativePrefixDetected();
  testWebappPrefixDetected();
  testPlainUuidNotDetected();
  testUndefinedNotDetected();
  testEmptyStringNotDetected();

  console.log('');
  console.log('Source-text invariants:');
  testSourceContainsDatedHaikuLiteral();
  testSourceDoesNotUseUndatedHaikuAtCallSite();
  testSourceContainsBothPrefixLiterals();
  testSourceContainsPhase161Marker();
  testSourceContainsSacredShaMarker();

  console.log('');
  console.log('Chat-path-untouched regression:');
  testChatPathUntouchedRegression();

  console.log('');
  console.log('All Phase 161-01 tests passed!');
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
