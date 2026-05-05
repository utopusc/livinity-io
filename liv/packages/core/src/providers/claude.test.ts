/**
 * Tests for ClaudeProvider — Phase 39 Risk Fix (FR-RISK-01).
 *
 * Verifies that getClient() (called transitively via chat()) throws the new
 * ClaudeAuthMethodMismatchError instead of silently falling back to env-var
 * or ~/.claude/.credentials.json OAuth bearer tokens.
 *
 * Lightweight test runner using Node.js assert — no test framework dependency.
 * Run with: npx tsx src/providers/claude.test.ts
 */

import assert from 'node:assert/strict';
import { ClaudeProvider, ClaudeAuthMethodMismatchError } from './claude.js';
import type { Redis } from 'ioredis';

const REDIS_API_KEY = 'nexus:config:anthropic_api_key';
const REDIS_AUTH_METHOD = 'nexus:config:claude_auth_method';

const D_39_05_MESSAGE =
  'ClaudeProvider.getClient() requires an explicit Anthropic API key in Redis (nexus:config:anthropic_api_key) or env (ANTHROPIC_API_KEY). Subscription users must route through SdkAgentRunner (sdk-subscription mode) — see nexus/packages/core/src/sdk-agent-runner.ts. Direct OAuth-token fallback removed in v29.3 Phase 39 (FR-RISK-01).';

/** Build a minimal duck-typed Redis stub. Only `get` is used by the code under test. */
function makeStubRedis(values: Record<string, string | null>): Redis {
  return {
    get: async (key: string) => values[key] ?? null,
  } as unknown as Redis;
}

function withClearedEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  return fn().finally(() => {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  });
}

// ── Test (a): API-key path still works (regression for existing flow) ────────
async function testApiKeyPathStillWorks() {
  await withClearedEnv(async () => {
    const stub = makeStubRedis({
      [REDIS_API_KEY]: 'sk-ant-api03-test-fake-key',
      [REDIS_AUTH_METHOD]: 'api-key',
    });
    const provider = new ClaudeProvider(stub);

    const available = await provider.isAvailable();
    assert.equal(available, true, 'isAvailable() must return true when Redis has an API key');
  });
  console.log('  PASS: Test (a) — API-key path still works (isAvailable returns true with stub Redis API key)');
}

// ── Test (b): no creds + sdk-subscription mode → ClaudeAuthMethodMismatchError mode='subscription-required' ──
async function testSubscriptionModeThrowsCorrectError() {
  await withClearedEnv(async () => {
    const stub = makeStubRedis({
      [REDIS_API_KEY]: null,
      [REDIS_AUTH_METHOD]: 'sdk-subscription',
    });
    const provider = new ClaudeProvider(stub);

    await assert.rejects(
      async () => provider.chat({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        tier: 'sonnet',
      }),
      (err: unknown) => {
        assert.ok(err instanceof ClaudeAuthMethodMismatchError, 'must be ClaudeAuthMethodMismatchError instance');
        assert.equal((err as ClaudeAuthMethodMismatchError).name, 'ClaudeAuthMethodMismatchError');
        assert.equal((err as ClaudeAuthMethodMismatchError).mode, 'subscription-required');
        assert.equal((err as ClaudeAuthMethodMismatchError).message, D_39_05_MESSAGE);
        return true;
      },
    );
  });
  console.log('  PASS: Test (b) — subscription mode throws with mode=subscription-required + verbatim D-39-05 message');
}

// ── Test (c): no creds + api-key mode (default) → ClaudeAuthMethodMismatchError mode='no-credentials' ──
async function testNoCredentialsModeThrowsCorrectError() {
  await withClearedEnv(async () => {
    const stub = makeStubRedis({
      [REDIS_API_KEY]: null,
      [REDIS_AUTH_METHOD]: null, // defaults to 'api-key' per claude.ts:getAuthMethod
    });
    const provider = new ClaudeProvider(stub);

    await assert.rejects(
      async () => provider.chat({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        tier: 'sonnet',
      }),
      (err: unknown) => {
        assert.ok(err instanceof ClaudeAuthMethodMismatchError, 'must be ClaudeAuthMethodMismatchError instance');
        assert.equal((err as ClaudeAuthMethodMismatchError).name, 'ClaudeAuthMethodMismatchError');
        assert.equal((err as ClaudeAuthMethodMismatchError).mode, 'no-credentials');
        assert.equal((err as ClaudeAuthMethodMismatchError).message, D_39_05_MESSAGE);
        return true;
      },
    );
  });
  console.log('  PASS: Test (c) — no-creds api-key mode throws with mode=no-credentials + verbatim D-39-05 message');
}

async function main() {
  await testApiKeyPathStillWorks();
  await testSubscriptionModeThrowsCorrectError();
  await testNoCredentialsModeThrowsCorrectError();
  console.log('\nAll claude.test.ts tests passed (3/3)');
}

main().catch((err) => {
  console.error('\nclaude.test.ts FAILED:', err);
  process.exit(1);
});
