/**
 * KimiAgentRunner _repairToolArguments tests — Phase 87, V32-HERMES-06.
 *
 * Tests the 4-pass JSON repair chain directly via a thin test harness.
 * Runs standalone with tsx.
 */

// We access the private method via a test subclass.
import { KimiAgentRunner } from './kimi-agent-runner.js';
import type { AgentConfig } from './agent.js';

class TestableKimiRunner extends KimiAgentRunner {
  repairArgs(raw: string): string {
    // Access private via type coercion — test-only.
    return (this as any)._repairToolArguments(raw);
  }
}

const fakeConfig = {
  stream: false,
} as unknown as AgentConfig;

function makeRunner(): TestableKimiRunner {
  return new TestableKimiRunner(fakeConfig);
}

// ── Harness ─────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${name}: ${(e as Error).message}`);
    fail++;
  }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── Tests ────────────────────────────────────────────────────────────────

console.log('KimiAgentRunner JSON repair chain tests (Phase 87 V32-HERMES-06)');

// Pass 1: valid JSON — returned as canonical re-serialized form.
test('Pass 1: valid JSON returned re-serialized', () => {
  const runner = makeRunner();
  const result = runner.repairArgs('{"key": "value", "num": 42}');
  const parsed = JSON.parse(result);
  assert(parsed.key === 'value', `key should be 'value', got '${parsed.key}'`);
  assert(parsed.num === 42, `num should be 42, got ${parsed.num}`);
});

// Pass 1: nested valid JSON.
test('Pass 1: nested valid JSON round-trips correctly', () => {
  const runner = makeRunner();
  const input = JSON.stringify({ a: [1, 2, 3], b: { c: true } });
  const result = runner.repairArgs(input);
  const parsed = JSON.parse(result);
  assert(Array.isArray(parsed.a), 'a should be array');
  assert(parsed.b.c === true, 'b.c should be true');
});

// Pass 2: trailing comma stripped.
test('Pass 2: trailing comma in object repaired', () => {
  const runner = makeRunner();
  // Suppress debug noise during repair
  const origDebug = console.debug;
  console.debug = () => {};
  try {
    const result = runner.repairArgs('{"key": "value",}');
    const parsed = JSON.parse(result);
    assert(parsed.key === 'value', `key should be 'value', got '${parsed.key}'`);
  } finally {
    console.debug = origDebug;
  }
});

// Pass 2: trailing comma in array.
test('Pass 2: trailing comma in array repaired', () => {
  const runner = makeRunner();
  const origDebug = console.debug;
  console.debug = () => {};
  try {
    const result = runner.repairArgs('[1, 2, 3,]');
    const parsed = JSON.parse(result);
    assert(Array.isArray(parsed), 'result should be array');
    assert(parsed.length === 3, `array length should be 3, got ${parsed.length}`);
  } finally {
    console.debug = origDebug;
  }
});

// Pass 2: unclosed brace balanced.
test('Pass 2: unclosed brace balanced', () => {
  const runner = makeRunner();
  const origDebug = console.debug;
  console.debug = () => {};
  try {
    const result = runner.repairArgs('{"key": "value"');
    const parsed = JSON.parse(result);
    assert(parsed.key === 'value', `key should be 'value', got '${parsed.key}'`);
  } finally {
    console.debug = origDebug;
  }
});

// Pass 3: Python None/True/False replaced.
test('Pass 3: Python None/True/False replaced with JSON equivalents', () => {
  const runner = makeRunner();
  const origDebug = console.debug;
  console.debug = () => {};
  try {
    // Invalid JSON with Python literals
    const result = runner.repairArgs('{"flag": True, "other": False, "val": None}');
    const parsed = JSON.parse(result);
    assert(parsed.flag === true, `flag should be true, got ${parsed.flag}`);
    assert(parsed.other === false, `other should be false, got ${parsed.other}`);
    assert(parsed.val === null, `val should be null, got ${parsed.val}`);
  } finally {
    console.debug = origDebug;
  }
});

// Pass 4: completely unparseable — returns '{}'.
test('Pass 4: totally malformed JSON returns empty object', () => {
  const runner = makeRunner();
  const origDebug = console.debug;
  console.debug = () => {};
  try {
    const result = runner.repairArgs('not json at all !!! {{{');
    assert(result === '{}', `last resort must return '{}', got '${result}'`);
  } finally {
    console.debug = origDebug;
  }
});

// Pass 4: empty string is unrepairable.
test('Pass 4: empty string returns empty object', () => {
  const runner = makeRunner();
  const origDebug = console.debug;
  console.debug = () => {};
  try {
    const result = runner.repairArgs('');
    assert(result === '{}', `empty string must return '{}', got '${result}'`);
  } finally {
    console.debug = origDebug;
  }
});

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
