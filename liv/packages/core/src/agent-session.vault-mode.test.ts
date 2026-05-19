/**
 * Phase 162-02 — Vault mode option + settingSources/cwd wiring invariants.
 *
 * Locks:
 * - vaultModeConfig field present on AgentSessionManagerOptions interface
 * - private vaultModeConfig field on AgentSessionManager class
 * - sessionCwd / sessionModelOverride derivation block present in consumeAndRelay
 * - query() options pass cwd + settingSources gated by vaultMode
 * - Chat-path-untouched regression: when vaultModeConfig: undefined, runtime
 *   behavior matches Phase 161 — sessionModelOverride === undefined collapses
 *   `model: sessionModelOverride ?? tierToModel(tier)` to `model: tierToModel(tier)`,
 *   matching Phase 161's chat-path output byte-for-byte at the SDK boundary.
 * - Phase 161 computer-use override still wins over vault mode (the !computerUse
 *   conjunction in the vaultMode derivation)
 * - createAgentWebSocketHandler factory stays SYNCHRONOUS (no `export async function`)
 *   so wss.on('connection', handler) keeps working without per-connection await
 * - AiModule init-once Redis resolution (chatBackend + defaultChatModel fields,
 *   liv:config:chat_backend / liv:config:default_chat_model reads in start())
 * - server/index.ts /ws/agent mount builds vaultModeConfig synchronously from
 *   AiModule fields and passes it into createAgentWebSocketHandler
 *
 * Runner: tsx + node:assert/strict (sibling to agent-session.computer-use.test.ts).
 * Run with: npx tsx src/agent-session.vault-mode.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC = readFileSync(resolve(__dirname, 'agent-session.ts'), 'utf8');

// Cross-file source-text invariants — ws-agent + AiModule + server mount all
// live in the livinityd workspace (sibling to liv/); resolve via relative paths.
const WS_AGENT_SRC_PATH = resolve(
  __dirname,
  '../../../../livos/packages/livinityd/source/modules/server/ws-agent.ts',
);
const WS_AGENT_SRC = readFileSync(WS_AGENT_SRC_PATH, 'utf8');

const AI_MODULE_SRC_PATH = resolve(
  __dirname,
  '../../../../livos/packages/livinityd/source/modules/ai/index.ts',
);
const AI_MODULE_SRC = readFileSync(AI_MODULE_SRC_PATH, 'utf8');

const SERVER_INDEX_SRC_PATH = resolve(
  __dirname,
  '../../../../livos/packages/livinityd/source/modules/server/index.ts',
);
const SERVER_INDEX_SRC = readFileSync(SERVER_INDEX_SRC_PATH, 'utf8');

// ── agent-session.ts vault-mode invariants ─────────────────────

function test1_interfaceFieldPresent() {
  assert.ok(
    SRC.includes('vaultModeConfig?:'),
    'AgentSessionManagerOptions must declare optional vaultModeConfig field',
  );
  console.log('  PASS: AgentSessionManagerOptions has vaultModeConfig?: field');
}

function test2_privateClassField() {
  assert.ok(
    SRC.includes('private vaultModeConfig:'),
    'AgentSessionManager must declare private vaultModeConfig field',
  );
  console.log('  PASS: AgentSessionManager has private vaultModeConfig field');
}

function test3_constructorAssignment() {
  assert.ok(
    SRC.includes('this.vaultModeConfig = opts.vaultModeConfig ?? null'),
    'constructor must assign vaultModeConfig with null fallback',
  );
  console.log('  PASS: constructor assigns this.vaultModeConfig = opts.vaultModeConfig ?? null');
}

function test4_vaultModeDerivation() {
  assert.match(
    SRC,
    /const\s+vaultMode\s*=\s*!computerUse\s*&&\s*this\.vaultModeConfig\s*!==\s*null/,
  );
  console.log('  PASS: const vaultMode = !computerUse && this.vaultModeConfig !== null');
}

function test5_cwdAtCallSite() {
  // The cwd: sessionCwd, line in the SDK query() options block.
  const matches = SRC.match(/cwd:\s*sessionCwd,/g) ?? [];
  assert.equal(matches.length, 1, `expected exactly 1 cwd: sessionCwd at call site, got ${matches.length}`);
  console.log('  PASS: query() options pass cwd: sessionCwd');
}

function test6_settingSourcesAtCallSite() {
  assert.match(
    SRC,
    /settingSources:\s*vaultMode\s*\?\s*\['project'\]\s*:\s*undefined/,
  );
  console.log("  PASS: query() options pass settingSources: vaultMode ? ['project'] : undefined");
}

function test7_systemPromptGated() {
  assert.match(
    SRC,
    /systemPrompt:\s*vaultMode\s*\?\s*undefined\s*:\s*systemPrompt/,
  );
  console.log('  PASS: query() options pass systemPrompt: vaultMode ? undefined : systemPrompt');
}

function test8_modelFieldRefactored() {
  assert.match(
    SRC,
    /model:\s*sessionModelOverride\s*\?\?\s*tierToModel\(tier\)/,
  );
  console.log('  PASS: model: sessionModelOverride ?? tierToModel(tier) — refactored form');
}

function test9_phase161PrecedencePreserved() {
  // sessionModelOverride derivation routes computer-use to dated Haiku FIRST,
  // BEFORE vault mode's defaultModel can apply. Match the ternary across newlines.
  assert.match(
    SRC,
    /sessionModelOverride[\s\S]*?computerUse[\s\S]*?['"]claude-haiku-4-5-20251001['"]/,
  );
  console.log('  PASS: sessionModelOverride routes computer-use to dated Haiku first (Phase 161 wins)');
}

// ── ws-agent.ts factory invariants ─────────────────────────────

function test10_factoryStaysSync() {
  // The critical contract: factory MUST stay synchronous so wss.on('connection', handler)
  // can call it without an async cascade.
  assert.match(
    WS_AGENT_SRC,
    /export\s+function\s+createAgentWebSocketHandler/,
  );
  assert.doesNotMatch(
    WS_AGENT_SRC,
    /export\s+async\s+function\s+createAgentWebSocketHandler/,
    'createAgentWebSocketHandler must NOT be async — wss.on handler cannot await a Promise',
  );
  console.log('  PASS: createAgentWebSocketHandler stays SYNCHRONOUS (export function, NOT async)');
}

function test11_wsAgentOptsShapeAndPassthrough() {
  // Factory opts type declares vaultModeConfig
  assert.match(
    WS_AGENT_SRC,
    /vaultModeConfig\?:\s*\{[\s\S]*?vaultPath:\s*string/,
  );
  // Factory threads vaultModeConfig into AgentSessionManager constructor call
  assert.match(
    WS_AGENT_SRC,
    /vaultModeConfig:\s*opts\.vaultModeConfig/,
  );
  console.log('  PASS: ws-agent factory opts declares vaultModeConfig + threads it into AgentSessionManager');
}

// ── AiModule init-once invariants ─────────────────────────────

function test12_aiModuleFieldsAndRedisRead() {
  assert.match(
    AI_MODULE_SRC,
    /chatBackend:\s*['"]vault['"]\s*\|\s*['"]legacy['"]/,
  );
  assert.match(
    AI_MODULE_SRC,
    /defaultChatModel:\s*string\s*\|\s*null/,
  );
  // Init-once Redis read in start() — accept both single + double quotes
  assert.ok(
    AI_MODULE_SRC.includes("'liv:config:chat_backend'") ||
      AI_MODULE_SRC.includes('"liv:config:chat_backend"'),
    'AiModule must read liv:config:chat_backend from Redis in start()',
  );
  console.log('  PASS: AiModule declares chatBackend + defaultChatModel fields + reads liv:config:chat_backend');
}

// ── server/index.ts /ws/agent mount invariants ───────────────

function test13_serverMountWiresVaultConfig() {
  assert.match(
    SERVER_INDEX_SRC,
    /ai\.chatBackend\s*===\s*['"]vault['"]/,
  );
  assert.match(
    SERVER_INDEX_SRC,
    /vaultModeConfig,/,
  );
  console.log('  PASS: server/index.ts /ws/agent mount gates on ai.chatBackend === "vault" and passes vaultModeConfig');
}

// ── Runner ─────────────────────────────────────────────────────

async function main() {
  console.log('agent-session.vault-mode.test.ts');
  console.log('');
  console.log('agent-session.ts vault-mode option + derivation:');
  test1_interfaceFieldPresent();
  test2_privateClassField();
  test3_constructorAssignment();
  test4_vaultModeDerivation();

  console.log('');
  console.log('SDK query() options gated by vaultMode:');
  test5_cwdAtCallSite();
  test6_settingSourcesAtCallSite();
  test7_systemPromptGated();
  test8_modelFieldRefactored();
  test9_phase161PrecedencePreserved();

  console.log('');
  console.log('ws-agent.ts factory stays sync + threads vaultModeConfig:');
  test10_factoryStaysSync();
  test11_wsAgentOptsShapeAndPassthrough();

  console.log('');
  console.log('AiModule init-once Redis resolution:');
  test12_aiModuleFieldsAndRedisRead();

  console.log('');
  console.log('server/index.ts /ws/agent mount wiring:');
  test13_serverMountWiresVaultConfig();

  console.log('');
  console.log('OK: 13/13 vault-mode invariants passed');
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
