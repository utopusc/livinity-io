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
 * a bearer-token Anthropic client from either an env var or the
 * ~/.claude/.credentials.json file was deleted (D-39-01, D-39-02). This test
 * fails loudly if a future contributor reintroduces the pattern — including
 * in comments. To document the deletion, use a different phrasing that does
 * not include the literal substring.
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
      `Subscription tokens MUST NOT reach @anthropic-ai/sdk via the bearer-token route — use SdkAgentRunner.\n` +
      `Offending lines:\n${detail}`,
    );
  }
  console.log('  PASS: no-authtoken-regression — claude.ts contains zero `authToken:` occurrences');
}

async function main() {
  await testNoAuthTokenInClaudeSource();
  console.log('\nAll no-authtoken-regression.test.ts tests passed (1/1)');
}

main().catch((err) => {
  console.error('\nno-authtoken-regression.test.ts FAILED:', err);
  process.exit(1);
});
