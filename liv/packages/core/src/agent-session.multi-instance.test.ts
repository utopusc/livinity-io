/**
 * Phase 162-04 — Multi-instance session key invariants.
 *
 * Locks:
 * - sessions Map JSDoc references "Phase 162-04" and composite key shape
 * - With vaultModeConfig set, parallel sessions with different composite keys coexist
 * - With vaultModeConfig undefined, legacy key shape behavior is byte-identical to Phase 161
 *   (same key → replace; different key → coexist already by Phase 161)
 * - cleanup() is per-key-exact (does NOT cascade across sessions for same userId)
 *
 * Runner: tsx + node:assert/strict.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 162-04 — Silence the module-scope winston logger BEFORE importing
// AgentSessionManager. The runtime tests below call startSession() which
// detaches consumeAndRelay(); without a real SDK that detached promise
// rejects and calls logger.error(...) from module scope (agent-session.ts
// references the winston logger imported from ./logger.js at line 27).
// Setting logger.silent = true here suppresses that expected noise from
// test output. Test assertions target only the sessions Map state — the
// detached SDK failure is by design and not the contract under test.
import { logger as _winstonLogger } from './logger.js';
_winstonLogger.silent = true;

import { AgentSessionManager } from './agent-session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = readFileSync(resolve(__dirname, 'agent-session.ts'), 'utf8');

// ── Source-text invariants ─────────────────────────────

function testJsdocReferencesComposite() {
  assert.match(SRC, /Phase 162-04[\s\S]*?surfaceKind[\s\S]*?surfaceId[\s\S]*?connectionId/);
  console.log('  PASS: sessions field JSDoc references composite key shape');
}

function testSessionsFieldTypeUnchanged() {
  // The Map type itself MUST still be Map<string, ActiveSession> — Phase 162-04
  // does NOT change the type, only the format of the string keys callers use.
  assert.match(SRC, /private\s+sessions\s*=\s*new\s+Map<string,\s*ActiveSession>\(\)/);
  console.log('  PASS: sessions Map type unchanged (Map<string, ActiveSession>)');
}

// ── Runtime tests ──────────────────────────────────────

async function testParallelSessionsSurvive() {
  // Mock toolRegistry (minimal shape — AgentSessionManager uses it for tool composition)
  const mockToolRegistry: any = { list: () => [], get: () => undefined, listFiltered: () => [] };
  const manager = new AgentSessionManager({
    toolRegistry: mockToolRegistry,
    vaultModeConfig: { vaultPath: '/tmp/vault-test', defaultModel: 'claude-opus-4-7' },
  });

  const keyA = 'admin:main:default:conn01';
  const keyB = 'admin:webapp:suna-uuid:conn02';

  // Start A; consumeAndRelay is detached internally — startSession returns the sessionId synchronously after Map.set
  const sidA = await manager.startSession(keyA, 'hi', undefined, () => {});
  const sidB = await manager.startSession(keyB, 'hi', undefined, () => {});

  assert.notEqual(sidA, sidB, 'parallel sessions get distinct sessionIds');
  assert.ok(manager.getSession(keyA), 'session A survives B start');
  assert.ok(manager.getSession(keyB), 'session B survives A start');
  console.log('  PASS: parallel sessions with different composite keys coexist');

  // Cleanup both before exiting (the detached consumeAndRelay promises will fail
  // because we didn't wire a real SDK — that's fine, they're aborted via cleanup)
  manager.cleanup(keyA);
  manager.cleanup(keyB);
}

async function testSameKeyReplaces() {
  const mockToolRegistry: any = { list: () => [], get: () => undefined, listFiltered: () => [] };
  const manager = new AgentSessionManager({
    toolRegistry: mockToolRegistry,
    vaultModeConfig: { vaultPath: '/tmp/vault-test', defaultModel: 'claude-opus-4-7' },
  });

  const key = 'admin:main:default:conn01';
  const sid1 = await manager.startSession(key, 'first', undefined, () => {});
  const sid2 = await manager.startSession(key, 'second', undefined, () => {});

  assert.notEqual(sid1, sid2, 'second start produces fresh sessionId');
  assert.equal(manager.getSession(key)?.sessionId, sid2, 'only the second session survives');
  console.log('  PASS: same composite key → second start replaces first (Phase 161 behavior preserved per-key)');

  manager.cleanup(key);
}

async function testLegacyRegression() {
  const mockToolRegistry: any = { list: () => [], get: () => undefined, listFiltered: () => [] };
  // No vaultModeConfig — legacy mode
  const manager = new AgentSessionManager({ toolRegistry: mockToolRegistry });

  const legacyKey = 'admin:conn01';
  const sid1 = await manager.startSession(legacyKey, 'first', undefined, () => {});
  const sid2 = await manager.startSession(legacyKey, 'second', undefined, () => {});

  assert.notEqual(sid1, sid2);
  assert.equal(manager.getSession(legacyKey)?.sessionId, sid2);
  console.log('  PASS: legacy mode key shape `userId:connectionId` collisions behave Phase 161 byte-identical');

  manager.cleanup(legacyKey);
}

async function testCleanupAtomicity() {
  const mockToolRegistry: any = { list: () => [], get: () => undefined, listFiltered: () => [] };
  const manager = new AgentSessionManager({
    toolRegistry: mockToolRegistry,
    vaultModeConfig: { vaultPath: '/tmp/vault-test', defaultModel: 'claude-opus-4-7' },
  });

  const keyA = 'admin:main:default:conn01';
  const keyB = 'admin:webapp:suna-uuid:conn02';

  await manager.startSession(keyA, 'a', undefined, () => {});
  await manager.startSession(keyB, 'b', undefined, () => {});

  manager.cleanup(keyA);

  assert.equal(manager.getSession(keyA), undefined, 'cleanup removed A');
  assert.ok(manager.getSession(keyB), 'cleanup did NOT cascade to B');
  console.log('  PASS: cleanup is per-key-exact (no cascading)');

  manager.cleanup(keyB);
}

async function main() {
  console.log('agent-session.multi-instance.test.ts');
  console.log('');
  console.log('Source-text invariants:');
  testJsdocReferencesComposite();
  testSessionsFieldTypeUnchanged();
  console.log('');
  console.log('Runtime tests:');
  await testParallelSessionsSurvive();
  await testSameKeyReplaces();
  await testLegacyRegression();
  await testCleanupAtomicity();
  console.log('');
  console.log('OK: 6/6 multi-instance invariants passed');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
