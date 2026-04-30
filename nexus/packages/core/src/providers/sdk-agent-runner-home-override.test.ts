/**
 * Sacred file behavior test — D-40-13.
 *
 * Asserts that sdk-agent-runner.ts honors the homeOverride parameter from
 * AgentConfig (Phase 40, FR-AUTH-03), AND that backward compatibility is
 * preserved (when homeOverride is unset, behavior falls through to
 * process.env.HOME || '/root', byte-identical to pre-Phase-40).
 *
 * Source-grep based (consistent with Phase 39's no-authtoken-regression test) —
 * we do not spawn the actual SDK, we assert the source contains the expected
 * patterns. Future contributors who refactor the homeOverride wiring will trip
 * this test and must update both the test and the documentation.
 *
 * Run with: npx tsx src/providers/sdk-agent-runner-home-override.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sacredFile = join(__dirname, '..', 'sdk-agent-runner.ts');
const agentConfigFile = join(__dirname, '..', 'agent.ts');

function testSacredFileHonorsHomeOverride() {
  const source = readFileSync(sacredFile, 'utf8');
  const expectedLine = "HOME: this.config.homeOverride || process.env.HOME || '/root',";
  assert.ok(
    source.includes(expectedLine),
    `Sacred file does NOT contain the expected HOME-with-homeOverride line.\n` +
    `Expected substring (D-40-02 / D-40-13):\n  ${expectedLine}\n` +
    `If you changed this line, update both this test and 40-CONTEXT.md D-40-02.`,
  );
  console.log('  PASS: Test 1 — sdk-agent-runner.ts HOME line honors this.config.homeOverride');
}

function testSacredFileHomeOverrideOccursOnlyOnce() {
  const source = readFileSync(sacredFile, 'utf8');
  const matches = source.match(/homeOverride/g) || [];
  assert.equal(
    matches.length,
    1,
    `Sacred file should contain "homeOverride" exactly once (the HOME line).\n` +
    `Found ${matches.length} occurrences. If you intentionally added more, update this test.`,
  );
  console.log(`  PASS: Test 2 — sdk-agent-runner.ts contains "homeOverride" exactly once`);
}

function testAgentConfigHasHomeOverride() {
  const source = readFileSync(agentConfigFile, 'utf8');
  assert.ok(
    /homeOverride\?\s*:\s*string\s*;/.test(source),
    `agent.ts AgentConfig is missing optional homeOverride?: string field.\n` +
    `Expected pattern: homeOverride?: string;\n` +
    `Per D-40-02: this field is the entry point for per-user OAuth credential isolation.`,
  );
  console.log('  PASS: Test 3 — agent.ts AgentConfig has optional homeOverride?: string');
}

function testAgentConfigHomeOverrideHasJsdoc() {
  const source = readFileSync(agentConfigFile, 'utf8');
  // Find the homeOverride declaration line, then check that the preceding ~15 lines
  // contain a JSDoc block mentioning homeOverride or per-user OAuth context.
  const lines = source.split('\n');
  const fieldLineIdx = lines.findIndex((l) => /homeOverride\?\s*:\s*string\s*;/.test(l));
  assert.ok(fieldLineIdx >= 0, 'homeOverride field not found (caught by Test 3)');
  const window = lines.slice(Math.max(0, fieldLineIdx - 15), fieldLineIdx).join('\n');
  assert.ok(
    /homeOverride|HOME|per-user|isolation|OAuth/i.test(window),
    `agent.ts homeOverride field is missing a JSDoc block above it.\n` +
    `Per D-40-02: include a JSDoc explaining per-user OAuth credential isolation purpose.`,
  );
  console.log('  PASS: Test 4 — agent.ts homeOverride has JSDoc above it');
}

async function main() {
  testSacredFileHonorsHomeOverride();
  testSacredFileHomeOverrideOccursOnlyOnce();
  testAgentConfigHasHomeOverride();
  testAgentConfigHomeOverrideHasJsdoc();
  console.log('\nAll sdk-agent-runner-home-override.test.ts tests passed (4/4)');
}

main().catch((err) => {
  console.error('\nsdk-agent-runner-home-override.test.ts FAILED:', err);
  process.exit(1);
});
