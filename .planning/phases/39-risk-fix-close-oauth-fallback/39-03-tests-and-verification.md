---
phase: 39-risk-fix-close-oauth-fallback
plan: 03
type: execute
wave: 3
depends_on:
  - 39-02
files_modified:
  - nexus/packages/core/src/providers/claude.test.ts
  - nexus/packages/core/src/providers/no-authtoken-regression.test.ts
  - nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts
autonomous: true
requirements:
  - FR-RISK-01
tags:
  - risk-fix
  - oauth
  - claude
  - tests

must_haves:
  truths:
    - "Three new test files exist in nexus/packages/core/src/providers/ (co-located with claude.ts, matching the existing pattern of agent-session.test.ts at src/agent-session.test.ts)."
    - "claude.test.ts contains the three D-39-10 unit tests: (a) Redis API key set → getClient() returns Anthropic client (regression for existing API-key flow), (b) no Redis key, no env key, sdk-subscription mode → throws ClaudeAuthMethodMismatchError with mode='subscription-required', (c) no Redis key, no env key, api-key mode → throws ClaudeAuthMethodMismatchError with mode='no-credentials'."
    - "no-authtoken-regression.test.ts asserts grep -rn 'authToken:' nexus/packages/core/src/providers/claude.ts | grep -v test returns zero matches — prevents future re-introduction (D-39-11)."
    - "sdk-agent-runner-integrity.test.ts asserts git hash-object nexus/packages/core/src/sdk-agent-runner.ts matches a hardcoded baseline SHA recorded in the test file (D-39-12) — fails loudly if the sacred file is ever modified."
    - "All three test files run via the existing tsx pattern: `npx tsx <file>` from `nexus/packages/core/` exits 0 with no assertion failures. Mirrors the established convention of nexus/packages/core/src/agent-session.test.ts which uses `node:assert/strict` + tsx (NOT vitest — vitest is not in package.json devDependencies and CONTEXT.md's 'vitest framework existing' claim is incorrect; the executor must use the actual project pattern)."
    - "After all tests pass, the changes are committed atomically as a single commit."
    - "The sacred file integrity test passes when run from the working tree (i.e., it confirms sdk-agent-runner.ts is unchanged at the moment Plan 39-03 commits)."
  artifacts:
    - path: "nexus/packages/core/src/providers/claude.test.ts"
      provides: "Unit tests for ClaudeProvider.getClient() new error behavior"
      min_lines: 80
      contains: "ClaudeAuthMethodMismatchError"
    - path: "nexus/packages/core/src/providers/no-authtoken-regression.test.ts"
      provides: "Grep-based regression test asserting authToken: never re-appears in claude.ts"
      contains: "authToken:"
    - path: "nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts"
      provides: "Sacred file integrity test asserting sdk-agent-runner.ts SHA matches baseline"
      contains: "sdk-agent-runner.ts"
  key_links:
    - from: "claude.test.ts"
      to: "ClaudeProvider class in claude.ts"
      via: "Direct import: `import { ClaudeProvider, ClaudeAuthMethodMismatchError } from './claude.js';`"
      pattern: "from './claude.js'"
    - from: "no-authtoken-regression.test.ts"
      to: "claude.ts source file content"
      via: "Synchronous fs.readFileSync of the source path + assert no `authToken:` substring"
      pattern: "readFileSync.*claude\\.ts"
    - from: "sdk-agent-runner-integrity.test.ts"
      to: "sdk-agent-runner.ts SHA"
      via: "child_process.execSync('git hash-object ...') or crypto.createHash('sha1') over file content with git's blob prefix"
      pattern: "sdk-agent-runner\\.ts"
---

<objective>
Add the three test invariants that make the Phase 39 deletion durable: (1) unit tests proving the new error behavior, (2) a grep regression test preventing re-introduction of `authToken:`, (3) a sacred-file integrity test pinning sdk-agent-runner.ts to its current SHA.

Purpose: Per D-39-10, D-39-11, D-39-12, the deletion in Plan 39-02 is only safe if invariants stop a future hand from putting it back. Plan 39-02 made the change; Plan 39-03 makes the change permanent.

Output: Three new test files, all green via `npx tsx <file>`, committed atomically.

**Critical context override:** CONTEXT.md says "Vitest framework (existing)". The actual nexus/packages/core has NO vitest in package.json devDependencies. The existing test pattern (see `nexus/packages/core/src/agent-session.test.ts`) uses `node:assert/strict` + tsx. Plan 39-03 follows the actual project pattern, NOT the CONTEXT.md error. Per CONTEXT.md "Claude's Discretion" section: "Whether the grep-regression test runs in vitest or as a separate package.json script — planner can pick." We pick the established tsx + node:assert pattern, with a npm-script entry added so CI / future contributors know how to run them.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/phases/39-risk-fix-close-oauth-fallback/39-CONTEXT.md
@.planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md
@.planning/phases/39-risk-fix-close-oauth-fallback/39-02-SUMMARY.md

@nexus/packages/core/src/providers/claude.ts
@nexus/packages/core/src/agent-session.test.ts
@nexus/packages/core/package.json

<interfaces>
<!-- Established test pattern from agent-session.test.ts — copy this style. -->

```typescript
/**
 * Tests for [thing].
 *
 * Lightweight test runner using Node.js assert — no test framework dependency.
 * Run with: npx tsx src/[file].test.ts
 */

import assert from 'node:assert/strict';
import { Thing } from './thing.js';

async function testSomeBehavior() {
  // arrange
  // act
  // assert via assert.equal / assert.deepEqual / assert.rejects
}

// Run all tests
async function main() {
  await testSomeBehavior();
  console.log('✓ All tests passed');
}

main().catch((err) => {
  console.error('✗ Test failed:', err);
  process.exit(1);
});
```

<!-- ClaudeProvider constructor signature — needs Redis (or null/undefined): -->
```typescript
constructor(redis?: Redis) { ... }
```

<!-- For mocking Redis without ioredis dependency, use a duck-typed minimal stub: -->
```typescript
const stubRedis = {
  get: async (key: string) => /* return value or null based on key */,
  // other methods unused by getClient/isAvailable/getAuthMethod
} as unknown as import('ioredis').Redis;
```

<!-- ClaudeAuthMethodMismatchError shape (introduced in Plan 39-02): -->
```typescript
export class ClaudeAuthMethodMismatchError extends Error {
  constructor(message: string, public readonly mode: 'subscription-required' | 'no-credentials');
  // .name === 'ClaudeAuthMethodMismatchError'
}
```

<!-- The exact error message string to assert against (D-39-05 verbatim): -->
"ClaudeProvider.getClient() requires an explicit Anthropic API key in Redis (nexus:config:anthropic_api_key) or env (ANTHROPIC_API_KEY). Subscription users must route through SdkAgentRunner (sdk-subscription mode) — see nexus/packages/core/src/sdk-agent-runner.ts. Direct OAuth-token fallback removed in v29.3 Phase 39 (FR-RISK-01)."

<!-- IMPORTANT: getClient() is `private`. Tests cannot call it directly. -->
<!-- The test must invoke a public method that transitively calls getClient(): -->
<!--   - chat({ messages: [...] }) — calls getClient() at claude.ts:132 -->
<!--   - chatStream({ messages: [...] }).stream first .next() — calls getClient() at claude.ts:190 -->
<!--   - think({ prompt: '...' }) — calls chat() which calls getClient() -->
<!-- Recommended: use chat() with a minimal options object, catch the thrown error. -->
<!-- For the success regression test (Redis API key set), avoid making a real network call -->
<!-- by inspecting that getClient succeeded via a side effect (e.g., this.client !== null) — -->
<!-- BUT this.client is private. Alternative: stub fetch (Anthropic SDK uses global fetch -->
<!-- or its own httpClient) — too brittle. Better: assert isAvailable() === true with the stub Redis -->
<!-- as a proxy for "API-key path is reachable". -->

<!-- Implementation note for the success regression test (a): -->
<!-- Calling provider.chat() with a real API key would fire a real Anthropic API request -->
<!-- (network, costs money). Instead, the test should set a fake API key via stubRedis and -->
<!-- assert provider.isAvailable() === true — proving the api-key path is still wired. -->
<!-- The actual chat() call with a real key is implicitly covered by the existing isAvailable() -->
<!-- check at manager.ts:78 plus the unchanged chat() implementation in claude.ts:121-172. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create claude.test.ts — three unit tests for getClient() new behavior (per D-39-10)</name>
  <files>nexus/packages/core/src/providers/claude.test.ts</files>
  <behavior>
    - Test (a) "API-key path still works": construct ClaudeProvider with a stub Redis that returns a fake API key for `nexus:config:anthropic_api_key`. Assert `await provider.isAvailable() === true`. (Proxy assertion: api-key path is reachable; we don't fire a real chat() call to avoid hitting the Anthropic API in tests.)
    - Test (b) "no creds, sdk-subscription mode → throws with mode='subscription-required'": construct ClaudeProvider with stub Redis returning `null` for the API key but `'sdk-subscription'` for `nexus:config:claude_auth_method`. Clear `ANTHROPIC_API_KEY` env. Call `provider.chat({ systemPrompt: '...', messages: [{role:'user', content:'hi'}], tier: 'sonnet' })` inside `assert.rejects()`. Assert the rejected error is an `instanceof ClaudeAuthMethodMismatchError`, has `name === 'ClaudeAuthMethodMismatchError'`, has `mode === 'subscription-required'`, and the message text equals D-39-05 verbatim.
    - Test (c) "no creds, api-key mode (default) → throws with mode='no-credentials'": construct ClaudeProvider with stub Redis returning `null` for both keys. Clear `ANTHROPIC_API_KEY` env. Call `provider.chat(...)` inside `assert.rejects()`. Assert error is `ClaudeAuthMethodMismatchError`, `mode === 'no-credentials'`, message text equals D-39-05 verbatim.
    - Tests must save+restore process.env.ANTHROPIC_API_KEY around each test (use try/finally) so they don't pollute the test runner's env.
  </behavior>
  <action>
Create `nexus/packages/core/src/providers/claude.test.ts` with the following content. The file uses the established node:assert/strict + tsx pattern (per agent-session.test.ts).

```typescript
/**
 * Tests for ClaudeProvider — Phase 39 Risk Fix (FR-RISK-01).
 *
 * Verifies that getClient() (called transitively via chat()) throws the new
 * ClaudeAuthMethodMismatchError instead of silently falling back to
 * ANTHROPIC_AUTH_TOKEN env or ~/.claude/.credentials.json OAuth tokens.
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
  console.log('✓ Test (a): API-key path still works');
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
  console.log('✓ Test (b): subscription mode throws with mode=subscription-required + verbatim D-39-05 message');
}

// ── Test (c): no creds + api-key mode (default) → ClaudeAuthMethodMismatchError mode='no-credentials' ──
async function testNoCredentialsModeThrowsCorrectError() {
  await withClearedEnv(async () => {
    const stub = makeStubRedis({
      [REDIS_API_KEY]: null,
      [REDIS_AUTH_METHOD]: null, // defaults to 'api-key' per claude.ts:331
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
  console.log('✓ Test (c): no-creds api-key mode throws with mode=no-credentials + verbatim D-39-05 message');
}

async function main() {
  await testApiKeyPathStillWorks();
  await testSubscriptionModeThrowsCorrectError();
  await testNoCredentialsModeThrowsCorrectError();
  console.log('\n✓ All claude.test.ts tests passed (3/3)');
}

main().catch((err) => {
  console.error('\n✗ claude.test.ts FAILED:', err);
  process.exit(1);
});
```

CRITICAL: The constant `D_39_05_MESSAGE` must be character-for-character identical to the message thrown in claude.ts:getClient() — including the em-dash (U+2014, `—`). If Plan 39-02 used the ASCII `--` instead, this test will fail and you must fix the source (or document the discrepancy and fix the test). Either way, both must agree, and the spec is em-dash per D-39-05.
  </action>
  <verify>
    <automated>cd nexus/packages/core && npx tsx src/providers/claude.test.ts exits 0 and prints "All claude.test.ts tests passed (3/3)".</automated>
  </verify>
  <done>claude.test.ts exists, all three tests pass via `npx tsx`. Each test asserts the expected error subtype, mode field, and verbatim message text.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create no-authtoken-regression.test.ts — grep-based regression preventing authToken: re-introduction (per D-39-11)</name>
  <files>nexus/packages/core/src/providers/no-authtoken-regression.test.ts</files>
  <behavior>
    - Synchronously read `nexus/packages/core/src/providers/claude.ts` from disk.
    - Strip line comments and block comments (so a comment like "// authToken: was here" doesn't trip the regression — the spec is "no actual code construction of authToken:", and a comment explaining why it's gone is the documented intent of the deletion).
    - Wait — actually the simpler implementation matches the CONTEXT.md/D-39-11 spec literally: `grep -rn 'authToken:' claude.ts | grep -v test` returns zero. We translate that to: the test file ITSELF must not match (because it's a test, the `grep -v test` filter excludes test files, but the test file lives next to the source — so the test reads ONLY the source file `claude.ts`, NOT the whole tree). With this scope, the test should NOT strip comments — it asserts NO substring `authToken:` anywhere in claude.ts source, comments included. That's the strongest invariant; a future contributor adding `// authToken: was deleted` comment would have to choose a different phrasing, which is fine.
    - Final spec: read claude.ts as text, assert it does NOT contain the substring `authToken:`. If it does, fail with file path + line number(s) where the substring appears.
  </behavior>
  <action>
Create `nexus/packages/core/src/providers/no-authtoken-regression.test.ts` with:

```typescript
/**
 * Regression test — D-39-11 / FR-RISK-01.
 *
 * Asserts that nexus/packages/core/src/providers/claude.ts does NOT contain
 * the substring `authToken:` anywhere in its source.
 *
 * This is the codified version of the shell invariant from CONTEXT.md:
 *   grep -rn "authToken:" nexus/packages/core/src/providers/claude.ts | grep -v test
 *
 * Background: in v29.3 Phase 39, the OAuth-fallback code path that constructed
 * `new Anthropic({ authToken: ... })` from either ANTHROPIC_AUTH_TOKEN env or
 * ~/.claude/.credentials.json was deleted (D-39-01, D-39-02). This test fails
 * loudly if a future contributor reintroduces the pattern.
 *
 * Run with: npx tsx src/providers/no-authtoken-regression.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const claudeSource = join(__dirname, 'claude.ts');

function findOffendingLines(text: string, needle: string): Array<{ line: number; text: string }> {
  const lines = text.split('\n');
  const hits: Array<{ line: number; text: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) hits.push({ line: i + 1, text: lines[i] });
  }
  return hits;
}

async function testNoAuthTokenInClaudeSource() {
  const source = readFileSync(claudeSource, 'utf-8');
  const offending = findOffendingLines(source, 'authToken:');
  if (offending.length > 0) {
    const detail = offending.map((h) => `  ${claudeSource}:${h.line}: ${h.text.trim()}`).join('\n');
    assert.fail(
      `D-39-11 regression: found ${offending.length} occurrence(s) of "authToken:" in claude.ts.\n` +
      `The OAuth-fallback path was deleted in v29.3 Phase 39 (FR-RISK-01).\n` +
      `Subscription tokens MUST NOT reach @anthropic-ai/sdk via authToken — route through SdkAgentRunner.\n` +
      `Offending lines:\n${detail}`,
    );
  }
  console.log('✓ no-authtoken-regression: claude.ts contains zero `authToken:` occurrences');
}

async function main() {
  await testNoAuthTokenInClaudeSource();
  console.log('\n✓ All no-authtoken-regression.test.ts tests passed (1/1)');
}

main().catch((err) => {
  console.error('\n✗ no-authtoken-regression.test.ts FAILED:', err);
  process.exit(1);
});
```
  </action>
  <verify>
    <automated>cd nexus/packages/core && npx tsx src/providers/no-authtoken-regression.test.ts exits 0 and prints "claude.ts contains zero `authToken:` occurrences".</automated>
  </verify>
  <done>Regression test exists and passes against the post-Plan-39-02 claude.ts. If a future hand reintroduces `authToken:` in claude.ts source, the test will fail with line numbers.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create sdk-agent-runner-integrity.test.ts — sacred file SHA pin (per D-39-12, D-39-13)</name>
  <files>nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts</files>
  <behavior>
    - Compute git's blob hash of `nexus/packages/core/src/sdk-agent-runner.ts` (using the exact algorithm git uses: SHA1 over `'blob ' + content_size + '\\0' + content`).
    - Assert the computed hash equals a hardcoded baseline string.
    - The baseline is recorded in the test file as `BASELINE_SHA` and equals the SHA from `39-AUDIT.md` Section 5 (which Plan 39-02's Task 1 confirmed unchanged before any edits, and Plan 39-02's Task 6 verified unchanged after edits). So the same SHA is the truth-anchor across all three plans.
    - On mismatch, fail with the expected SHA and the actual SHA so the next contributor can either (a) revert the sacred file change, or (b) if the change was intentional, update the baseline + write a Phase 39 follow-up note.
    - Implementation may use `child_process.execSync('git hash-object ...')` for simplicity (matches the spec wording in D-39-12 which says "or just `git diff` exit-code check"), OR compute the SHA in pure Node via crypto (no git dependency, runs in any CI). Recommend pure Node for portability — but execSync is acceptable.
  </behavior>
  <action>
Create `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` with the following template. The executor MUST replace `BASELINE_SHA = '...'` with the actual SHA from `39-AUDIT.md` Section 5.

```typescript
/**
 * Sacred file integrity test — D-39-12 / D-39-13.
 *
 * Asserts that nexus/packages/core/src/sdk-agent-runner.ts is byte-identical
 * to its pre-Phase-39 state (recorded as BASELINE_SHA below).
 *
 * Background: SdkAgentRunner is the legitimate path for Claude OAuth subscription
 * users in v29.3. The whole milestone (Phases 39-44) wraps it externally; the
 * file itself MUST NOT be modified — no edits, no whitespace changes, no import
 * reordering. If a future contributor needs to change it, they must (a) update
 * BASELINE_SHA below, AND (b) document the change in a Phase 39 follow-up note,
 * AND (c) audit whether the change re-opens the OAuth-fallback risk this test
 * was created to gate.
 *
 * Run with: npx tsx src/providers/sdk-agent-runner-integrity.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// claude.test.ts lives in src/providers/, sdk-agent-runner.ts lives in src/
const sacredFile = join(__dirname, '..', 'sdk-agent-runner.ts');

// EXECUTOR: replace this with the actual SHA from .planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md Section 5.
// Run `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` from the repo root and paste the result here.
const BASELINE_SHA = 'REPLACE_WITH_SHA_FROM_39-AUDIT.md_SECTION_5';

/**
 * Compute git's blob SHA-1 of a file. Git's blob format is:
 *   "blob " + content_size + "\0" + content
 * SHA-1 of that byte string is the blob hash returned by `git hash-object <file>`.
 */
function gitBlobSha(filePath: string): string {
  const content = readFileSync(filePath);
  const header = Buffer.from(`blob ${content.length}\0`);
  return createHash('sha1').update(Buffer.concat([header, content])).digest('hex');
}

async function testSacredFileUntouched() {
  if (BASELINE_SHA === 'REPLACE_WITH_SHA_FROM_39-AUDIT.md_SECTION_5') {
    assert.fail(
      'BASELINE_SHA placeholder was not replaced. Read .planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md Section 5 and paste the recorded SHA.',
    );
  }

  const actual = gitBlobSha(sacredFile);
  if (actual !== BASELINE_SHA) {
    assert.fail(
      `Sacred file integrity violation — sdk-agent-runner.ts has changed since v29.3 Phase 39.\n` +
      `  Expected SHA: ${BASELINE_SHA}\n` +
      `  Actual SHA:   ${actual}\n` +
      `  File: ${sacredFile}\n\n` +
      `If the change was intentional:\n` +
      `  1. Update BASELINE_SHA in this test to the new SHA (run: git hash-object ${sacredFile}).\n` +
      `  2. Audit whether the change re-introduces any path that lets a Claude OAuth\n` +
      `     subscription token reach raw @anthropic-ai/sdk (the risk Phase 39 closed).\n` +
      `  3. Document the change in a Phase 39 follow-up SUMMARY note.\n` +
      `If the change was unintentional, restore the file with: git checkout -- ${sacredFile}`,
    );
  }
  console.log(`✓ sdk-agent-runner.ts integrity verified (SHA: ${actual})`);
}

async function main() {
  await testSacredFileUntouched();
  console.log('\n✓ All sdk-agent-runner-integrity.test.ts tests passed (1/1)');
}

main().catch((err) => {
  console.error('\n✗ sdk-agent-runner-integrity.test.ts FAILED:', err);
  process.exit(1);
});
```

After creating the file, EDIT it to replace `'REPLACE_WITH_SHA_FROM_39-AUDIT.md_SECTION_5'` with the actual SHA from the AUDIT.md Section 5 (the same SHA was also recorded in 39-02-SUMMARY.md from Plan 39-02 — both must match).
  </action>
  <verify>
    <automated>cd nexus/packages/core && npx tsx src/providers/sdk-agent-runner-integrity.test.ts exits 0 and prints "sdk-agent-runner.ts integrity verified (SHA: <40-char-hex>)". The printed SHA matches the BASELINE_SHA constant in the test file. The BASELINE_SHA constant is NOT the placeholder string.</automated>
  </verify>
  <done>Integrity test exists, BASELINE_SHA is the real SHA from 39-AUDIT.md, test passes against the current sdk-agent-runner.ts. Future modification of the sacred file fails this test loudly.</done>
</task>

<task type="auto">
  <name>Task 4: Add npm-script entry to nexus/packages/core/package.json so all three tests can be run with one command</name>
  <files>nexus/packages/core/package.json</files>
  <action>
Add a `"test:phase39"` script to `nexus/packages/core/package.json` "scripts" block. The script runs all three new tests sequentially via tsx, exits non-zero on any failure.

Current scripts block (line 17-21 of the package.json):
```json
"scripts": {
  "build": "tsc",
  "dev": "tsx watch src/index.ts",
  "start": "node dist/index.js"
},
```

Updated scripts block (insert "test:phase39" after "start"):
```json
"scripts": {
  "build": "tsc",
  "dev": "tsx watch src/index.ts",
  "start": "node dist/index.js",
  "test:phase39": "tsx src/providers/claude.test.ts && tsx src/providers/no-authtoken-regression.test.ts && tsx src/providers/sdk-agent-runner-integrity.test.ts"
},
```

Use `tsx` (not `npx tsx`) since `tsx` is in `devDependencies` (line 53) and npm-script PATH includes node_modules/.bin. The `&&` chain means the first failure stops the run.

Do NOT add any new devDependencies. Do NOT introduce vitest. The tests use only `node:assert/strict`, `node:fs`, `node:crypto`, `node:path`, `node:url`, and the existing tsx tooling.
  </action>
  <verify>
    <automated>grep "test:phase39" nexus/packages/core/package.json returns one match. cd nexus/packages/core && npm run test:phase39 exits 0 and prints all three "All ... tests passed" lines (3 + 1 + 1 = 5 individual test assertions across the three files).</automated>
  </verify>
  <done>package.json has the new test:phase39 script. Running `npm run test:phase39` from `nexus/packages/core/` runs all three test files green.</done>
</task>

<task type="auto">
  <name>Task 5: Final sacred file + clean tree verification before commit</name>
  <files>(none — git verification only)</files>
  <action>
Re-verify nothing leaked into the sacred file during test creation:

```bash
git diff nexus/packages/core/src/sdk-agent-runner.ts | wc -l
# expect: 0

git hash-object nexus/packages/core/src/sdk-agent-runner.ts
# expect: same SHA recorded in 39-AUDIT.md Section 5
```

Also confirm `git status --short` shows ONLY the four expected files:
- `nexus/packages/core/src/providers/claude.test.ts` (added)
- `nexus/packages/core/src/providers/no-authtoken-regression.test.ts` (added)
- `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` (added)
- `nexus/packages/core/package.json` (modified)

Any extra modified file → halt and investigate.
  </action>
  <verify>
    <automated>git diff nexus/packages/core/src/sdk-agent-runner.ts produces zero output. git hash-object on it equals BASELINE_SHA. git status --short lists only the four expected paths above (plus possibly the AUDIT/SUMMARY files from Plans 39-01 and 39-02 if those weren't yet committed — those are independent and acceptable).</automated>
  </verify>
  <done>Sacred file confirmed unchanged. Working tree contains only the four expected modifications.</done>
</task>

<task type="auto">
  <name>Task 6: Atomic commit — three test files + package.json script</name>
  <files>(commit only)</files>
  <action>
Stage and commit:

```bash
git add nexus/packages/core/src/providers/claude.test.ts \
        nexus/packages/core/src/providers/no-authtoken-regression.test.ts \
        nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts \
        nexus/packages/core/package.json

git commit -m "$(cat <<'EOF'
test(39-03): pin OAuth-fallback closure with regression tests (FR-RISK-01)

Add three test invariants that make the Phase 39 deletion durable:

1. claude.test.ts (3 tests): verifies ClaudeProvider.getClient() throws
   ClaudeAuthMethodMismatchError with the correct mode discriminator and
   verbatim D-39-05 error message in both subscription-mode and
   no-credentials configurations; preserves the API-key regression path.

2. no-authtoken-regression.test.ts: codifies the shell-invariant from
   D-39-11 — claude.ts source MUST NOT contain the substring `authToken:`.
   Fails loudly with file:line of any re-introduction.

3. sdk-agent-runner-integrity.test.ts: pins sdk-agent-runner.ts to its
   pre-Phase-39 git blob SHA (D-39-12, D-39-13). Sacred file modifications
   fail this test, forcing intentional changes to update the baseline +
   audit for re-opened OAuth-fallback risk.

Tests follow the established nexus/packages/core pattern (node:assert/strict
+ tsx, mirroring src/agent-session.test.ts) — no new devDependencies.

New npm script: `npm run test:phase39` runs all three files sequentially.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

After commit, verify:
```bash
git log -1 --name-only
# expect: 4 files (claude.test.ts, no-authtoken-regression.test.ts, sdk-agent-runner-integrity.test.ts, package.json)
git log --oneline -2
# expect to see Plan 39-03 commit on top, Plan 39-02 commit below
```
  </action>
  <verify>
    <automated>git log -1 --name-only lists exactly the 4 staged files. git log --oneline -2 shows two consecutive Phase 39 commits (39-03 on top of 39-02). git status is clean afterward.</automated>
  </verify>
  <done>Single atomic commit containing the three test files + the npm-script update.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Checkpoint: human runs the test suite + confirms FR-RISK-01 is closed</name>
  <what-built>
    Three new test files now codify the Phase 39 invariants:
    - 3 unit tests for ClaudeProvider.getClient() new error behavior
    - 1 grep-based regression test preventing `authToken:` re-introduction in claude.ts
    - 1 sacred file integrity test pinning sdk-agent-runner.ts SHA
    All wired to a single `npm run test:phase39` script.
  </what-built>
  <how-to-verify>
1. From `nexus/packages/core/`, run:
   ```bash
   npm run test:phase39
   ```
   Expected output: all five test assertions pass (3 from claude.test.ts, 1 from no-authtoken-regression, 1 from sdk-agent-runner-integrity), each prefixed with `✓`. Final exit code 0.

2. Verify the deletion is real: from the repo root, run:
   ```bash
   grep -rn "authToken:" nexus/packages/core/src/providers/claude.ts | grep -v test
   ```
   Expected output: empty (zero matches). Exit code 1 from grep is normal here (means "no match found").

3. Verify the sacred file is untouched: from the repo root, run:
   ```bash
   git diff nexus/packages/core/src/sdk-agent-runner.ts
   ```
   Expected output: empty.

4. Verify the typed error is exported and importable: from `nexus/packages/core/`, run:
   ```bash
   grep -n "export class ClaudeAuthMethodMismatchError" src/providers/claude.ts
   ```
   Expected output: one match.

5. Confirm the FR-RISK-01 success criteria from ROADMAP Phase 39 are satisfied:
   - Criterion 1 (`grep ... 'authToken: token'` returns zero referencing claudeAiOauth) → step 2 above proves it.
   - Criterion 2 (subscription users → SdkAgentRunner OR clear error, never silent fallback) → claude.test.ts test (b) proves it.
   - Criterion 3 (existing API-key path still works) → claude.test.ts test (a) proves it (proxy via isAvailable).
   - Criterion 4 (sdk-agent-runner.ts byte-identical) → step 3 + sdk-agent-runner-integrity.test.ts prove it.

  </how-to-verify>
  <resume-signal>Type "approved — phase 39 closed" if all five steps pass, or describe issues.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test file → claude.ts source | Tests must read source as text (no-authtoken-regression). Test reads source path via `import.meta.url` + relative join — no untrusted path injection possible. |
| Test file → sdk-agent-runner.ts source | Integrity test reads file content + SHA-1s it. No injection vector — input is the file we're checking. |
| Test file → process.env | Test (b) and (c) mutate process.env.ANTHROPIC_API_KEY. Mitigated by save+restore in `withClearedEnv()` helper. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-39-03-01 | T (Tampering — sacred file changes go unnoticed) | sdk-agent-runner.ts | mitigate | sdk-agent-runner-integrity.test.ts pins the SHA. Future modifications must update BASELINE_SHA, forcing the contributor to acknowledge the sacred file change. |
| T-39-03-02 | T (Tampering — OAuth-fallback re-introduction) | claude.ts | mitigate | no-authtoken-regression.test.ts asserts zero `authToken:` substrings. Reintroduction fails the test. |
| T-39-03-03 | I (Information disclosure — test pollutes process.env with stale ANTHROPIC_API_KEY) | process.env | mitigate | `withClearedEnv()` helper saves the original value in a closure, deletes it for the test body, restores in finally{}. |
| T-39-03-04 | R (Repudiation — test failures don't surface clearly) | Test runner | mitigate | All test files print `✓` per assertion + a final summary line. Failures use `assert.fail()` with a verbose message naming the violated invariant + remediation. The Phase 39 checkpoint asks the human to run `npm run test:phase39` and read the output. |
| T-39-03-05 | E (Elevation of privilege — vitest devDependency added per CONTEXT.md error) | nexus/packages/core/package.json | mitigate | Plan explicitly declines vitest (CONTEXT.md was wrong about it being installed). Tests use Node built-ins. No new devDependencies. Audited via the Task 5 `git status --short` check. |
</threat_model>

<verification>
1. `cd nexus/packages/core && npm run test:phase39` exits 0 and prints all five `✓` assertion lines.
2. `grep -rn "authToken:" nexus/packages/core/src/providers/claude.ts | grep -v test` returns zero matches.
3. `git diff nexus/packages/core/src/sdk-agent-runner.ts` produces zero output.
4. `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` matches BASELINE_SHA in `sdk-agent-runner-integrity.test.ts` AND matches the SHA recorded in `39-AUDIT.md` Section 5 AND matches the SHA recorded in `39-02-SUMMARY.md`.
5. `git log -1 --name-only` (after Task 6) shows exactly four files: the three test files + package.json.
6. `git log --oneline -3` shows three Phase 39 commits in order: 39-03 (this plan), 39-02 (deletion + reroute), 39-01 (audit doc — assuming Plan 39-01 also committed its AUDIT.md, which is standard `gsd-execute-plan` behavior).
7. The human checkpoint approval signal is received.
</verification>

<success_criteria>
- ROADMAP Phase 39 success criterion #1 (zero `authToken: token` matches) — codified by no-authtoken-regression.test.ts. Future re-introduction caught at test time.
- ROADMAP Phase 39 success criterion #2 (subscription users → SdkAgentRunner or clear error) — codified by claude.test.ts test (b). The verbatim D-39-05 message + `mode: 'subscription-required'` are asserted.
- ROADMAP Phase 39 success criterion #3 (existing API-key path works) — codified by claude.test.ts test (a). isAvailable() returns true with stub Redis API key.
- ROADMAP Phase 39 success criterion #4 (sdk-agent-runner.ts byte-identical) — codified by sdk-agent-runner-integrity.test.ts. Future sacred file modifications fail this test.
- FR-RISK-01 — fully satisfied. Code change (Plan 39-02) + invariant tests (this plan) + audit trail (Plan 39-01).
- Phase 39 deployment ready. Standard `bash /opt/livos/update.sh` flow on Mini PC after merge to master, per D-39-14. No data migration (D-39-15). Rollback via Phase 32 livos-rollback.sh if needed (D-39-16).
</success_criteria>

<output>
After completion, create `.planning/phases/39-risk-fix-close-oauth-fallback/39-03-SUMMARY.md` containing:
- Commit SHA of the test commit
- Output of `npm run test:phase39` (full, showing all `✓` lines)
- Output of `grep -rn "authToken:" nexus/packages/core/src/providers/claude.ts | grep -v test` (must be empty)
- Output of `git diff nexus/packages/core/src/sdk-agent-runner.ts` (must be empty)
- The BASELINE_SHA from the integrity test (must match 39-AUDIT.md Section 5)
- Note: deferred from CONTEXT.md vitest claim — explanation that the project uses node:assert/strict + tsx (per nexus/packages/core/src/agent-session.test.ts), and vitest is NOT in devDependencies
- Phase 39 closure statement: "FR-RISK-01 satisfied. Phase 39 ready to close. Phase 40 (Per-User OAuth + HOME Isolation) unblocked."
</output>
