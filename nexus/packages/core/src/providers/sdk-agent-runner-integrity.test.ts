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
// This test lives in src/providers/, sdk-agent-runner.ts lives in src/
const sacredFile = join(__dirname, '..', 'sdk-agent-runner.ts');

// Baseline SHA originally recorded in .planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md Section 5.
// BASELINE updated 2026-04-30 by v29.3 Phase 40 (homeOverride addition for per-user OAuth isolation).
// BASELINE re-pinned 2026-05-01 by v29.4 Phase 45 plan 01 (Carry-Forward C2).
// Source byte-identical at re-pin; SHA moved from 623a65b9... to 4f868d31... due to v43.x
// model-bump drift commits (most recent first):
//   - 9f1562be feat(43.12): bump tierToModel to Claude 4.X (Opus 4.7 / Sonnet 4.6) + Bolt.diy category fix
//   - 47890a85 feat(43.10): inject model identity line — fix Claude 3.5 Sonnet hallucination
//   - 9d368bb5 feat(43.8): broker passthrough — drop Nexus identity for raw API callers
// Verification: `git diff --shortstat <c2-commit>~1 <c2-commit> -- nexus/packages/core/src/sdk-agent-runner.ts`
// returns empty for the C2 commit (audit-only — no source change).
// See .planning/phases/40-per-user-claude-oauth-home-isolation/40-CONTEXT.md D-40-02 / D-40-11.
// See .planning/phases/45-carry-forward-sweep/45-CONTEXT.md FR-CF-02.
// Computed via: git hash-object nexus/packages/core/src/sdk-agent-runner.ts
const BASELINE_SHA = '4f868d318abff71f8c8bfbcf443b2393a553018b';

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
  console.log(`  PASS: sdk-agent-runner.ts integrity verified (SHA: ${actual})`);
}

async function main() {
  await testSacredFileUntouched();
  console.log('\nAll sdk-agent-runner-integrity.test.ts tests passed (1/1)');
}

main().catch((err) => {
  console.error('\nsdk-agent-runner-integrity.test.ts FAILED:', err);
  process.exit(1);
});
