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
import { isComputerUseSession, AgentSessionManager } from './agent-session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = readFileSync(resolve(__dirname, 'agent-session.ts'), 'utf8');

// Phase 161-02 — ws-agent.ts cross-file source-text invariants.
// ws-agent.ts lives in the livinityd workspace (sibling to liv/); resolve via relative path.
const WS_AGENT_SRC_PATH = resolve(
  __dirname,
  '../../../../livos/packages/livinityd/source/modules/server/ws-agent.ts',
);
const WS_AGENT_SRC = readFileSync(WS_AGENT_SRC_PATH, 'utf8');

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

// ── Phase 161-02 — DI option + cross-file invariants ──────────

function testConstructorAcceptsBuilderOption() {
  const mockRegistry = { listFiltered: () => [], get: () => null } as any;
  const builder = async () => 'FAKE LIVOS PROMPT';
  const manager = new AgentSessionManager({
    toolRegistry: mockRegistry,
    computerUseSystemPromptBuilder: builder,
  });
  assert.ok(manager);
  console.log('  PASS: AgentSessionManager accepts computerUseSystemPromptBuilder option');
}

function testConstructorWithoutBuilderOption() {
  const mockRegistry = { listFiltered: () => [], get: () => null } as any;
  const manager = new AgentSessionManager({ toolRegistry: mockRegistry });
  assert.ok(manager);
  console.log('  PASS: AgentSessionManager accepts construction WITHOUT builder (legacy callers)');
}

function testSourceContainsBuilderOptionAtLeast4Places() {
  // Interface declaration + private field + constructor assignment + consumeAndRelay use
  const matches = SRC.match(/computerUseSystemPromptBuilder/g) ?? [];
  assert.ok(
    matches.length >= 4,
    `expected >=4 occurrences of computerUseSystemPromptBuilder, got ${matches.length}`,
  );
  console.log(`  PASS: computerUseSystemPromptBuilder appears ${matches.length} times in agent-session.ts`);
}

function testSourceContainsAwaitedBuilderCallExactlyOnce() {
  const matches = SRC.match(/await this\.computerUseSystemPromptBuilder\(\)/g) ?? [];
  assert.equal(matches.length, 1, `expected exactly 1 awaited builder call, got ${matches.length}`);
  console.log('  PASS: await this.computerUseSystemPromptBuilder() appears exactly once');
}

function testSourceDoesNotImportFromLivinityd() {
  // Module DAG guard — @liv/core MUST NOT import from livos/packages/livinityd/*
  const forbidden = /from\s+['"][^'"]*livos\/packages\/livinityd[^'"]*['"]/g;
  assert.equal(SRC.search(forbidden), -1, 'agent-session.ts must NOT import from livinityd');
  console.log('  PASS: agent-session.ts does not import from livinityd (module DAG preserved)');
}

function testSourceContainsGracefulDegradeFallback() {
  assert.match(SRC, /falling back to BASE_SYSTEM_PROMPT/);
  console.log('  PASS: builder-failure graceful-degrade fallback present');
}

function testSelectorBranchOrdering() {
  // The if/else-if/else chain must be: computerUse + builder FIRST, then intentResult, then BASE.
  // Verify ordering by finding the indices in the source.
  //
  // For the BASE branch we anchor on the LAST `else { ... systemPrompt = BASE_SYSTEM_PROMPT ... }`
  // dal (multi-line dotall match) — not the catch-block fallback that also assigns
  // BASE_SYSTEM_PROMPT but lives BEFORE the intentResult branch lexically.
  const cuIdx = SRC.search(/if\s*\(\s*computerUse\s*&&\s*this\.computerUseSystemPromptBuilder\s*\)/);
  const intentIdx = SRC.search(/else\s+if\s*\(\s*intentResult\s*\)/);
  const baseBranchRe = /else\s*\{\s*[^}]*systemPrompt\s*=\s*BASE_SYSTEM_PROMPT[^}]*\}/;
  const baseIdx = SRC.search(baseBranchRe);
  assert.ok(cuIdx > 0, 'computer-use branch not found');
  assert.ok(intentIdx > cuIdx, 'intentResult branch must come AFTER computer-use branch');
  assert.ok(baseIdx > intentIdx, 'final BASE_SYSTEM_PROMPT else-branch must come AFTER intentResult branch');
  console.log('  PASS: selector branch ordering = computer-use → intentResult → BASE_SYSTEM_PROMPT');
}

function testWsAgentImportsOverlayBuilder() {
  assert.match(
    WS_AGENT_SRC,
    /import\s*\{\s*buildLuseSystemPromptWithOverlayResolved\s*\}\s+from\s+['"]\.\.\/ai\/agent-prompt-builder\.js['"]/,
  );
  console.log('  PASS: ws-agent.ts imports buildLuseSystemPromptWithOverlayResolved');
}

function testWsAgentPassesBuilderIntoManager() {
  assert.match(WS_AGENT_SRC, /computerUseSystemPromptBuilder:\s*async\s*\(\)/);
  assert.match(WS_AGENT_SRC, /buildLuseSystemPromptWithOverlayResolved\s*\(/);
  console.log('  PASS: ws-agent.ts passes builder closure into AgentSessionManager');
}

function testWsAgentContainsPhase16102Marker() {
  assert.match(WS_AGENT_SRC, /Phase 161-02/);
  console.log('  PASS: ws-agent.ts contains Phase 161-02 marker comment');
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
  console.log('Phase 161-02 — DI option + cross-file invariants:');
  testConstructorAcceptsBuilderOption();
  testConstructorWithoutBuilderOption();
  testSourceContainsBuilderOptionAtLeast4Places();
  testSourceContainsAwaitedBuilderCallExactlyOnce();
  testSourceDoesNotImportFromLivinityd();
  testSourceContainsGracefulDegradeFallback();
  testSelectorBranchOrdering();
  testWsAgentImportsOverlayBuilder();
  testWsAgentPassesBuilderIntoManager();
  testWsAgentContainsPhase16102Marker();

  console.log('');
  console.log('All Phase 161-01 + 161-02 tests passed!');
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
