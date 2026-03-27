/**
 * MCP Tool Bridge Verification Script
 *
 * Validates that buildSdkTools() correctly converts ToolRegistry tools into
 * SDK MCP tool definitions, including image content forwarding, output
 * truncation, and error handling.
 *
 * Run: npx tsx src/verify-mcp-bridge.ts
 * Exit code 0 = all checks pass, 1 = failures found.
 */

import { z } from 'zod';
import { paramTypeToZod, buildSdkTools } from './sdk-agent-runner.js';
import { ToolRegistry } from './tool-registry.js';
import type { Tool } from './types.js';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${label}`);
  } else {
    failed++;
    console.log(`[FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ─── 1. paramTypeToZod conversion ───────────────────────────────────────────

console.log('MCP Tool Bridge Verification');
console.log('=============================');

// string
const strField = paramTypeToZod('string', 'a string');
check('paramTypeToZod: string -> z.string', strField instanceof z.ZodString);

// number
const numField = paramTypeToZod('number', 'a number');
check('paramTypeToZod: number -> z.number', numField instanceof z.ZodNumber);

// boolean
const boolField = paramTypeToZod('boolean', 'a bool');
check('paramTypeToZod: boolean -> z.boolean', boolField instanceof z.ZodBoolean);

// array
const arrField = paramTypeToZod('array', 'an array');
check('paramTypeToZod: array -> z.array', arrField instanceof z.ZodArray);

// object
const objField = paramTypeToZod('object', 'an object');
check('paramTypeToZod: object -> z.record', objField instanceof z.ZodRecord);

// integer (maps to z.number)
const intField = paramTypeToZod('integer', 'an int');
check('paramTypeToZod: integer -> z.number', intField instanceof z.ZodNumber);

// enum
const enumField = paramTypeToZod('string', 'pick one', ['a', 'b', 'c']);
check('paramTypeToZod: enum -> z.enum', enumField instanceof z.ZodEnum);

// ─── 2. Register mock tools and build SDK tools ─────────────────────────────

const testRegistry = new ToolRegistry();

const testSimple: Tool = {
  name: 'test_simple',
  description: 'Returns simple text',
  parameters: [],
  execute: async () => ({ success: true, output: 'hello world' }),
};

const testParams: Tool = {
  name: 'test_params',
  description: 'Accepts various parameters',
  parameters: [
    { name: 'query', type: 'string', description: 'Search query', required: true },
    { name: 'limit', type: 'number', description: 'Max results', required: false },
    { name: 'format', type: 'string', description: 'Output format', required: false, enum: ['json', 'text', 'csv'] },
  ],
  execute: async (params) => ({ success: true, output: `query=${params.query} limit=${params.limit}` }),
};

const testImages: Tool = {
  name: 'test_images',
  description: 'Returns text and images',
  parameters: [],
  execute: async () => ({
    success: true,
    output: 'screenshot taken',
    images: [
      { base64: 'iVBORw0KGgoAAAANSUhEUg==', mimeType: 'image/png' },
      { base64: '/9j/4AAQSkZJRg==', mimeType: 'image/jpeg' },
    ],
  }),
};

const testError: Tool = {
  name: 'test_error',
  description: 'Always returns an error result',
  parameters: [],
  execute: async () => ({ success: false, output: '', error: 'intentional test failure' }),
};

const testLargeOutput: Tool = {
  name: 'test_large_output',
  description: 'Returns 100k chars of output',
  parameters: [],
  execute: async () => ({ success: true, output: 'X'.repeat(100_000) }),
};

testRegistry.register(testSimple);
testRegistry.register(testParams);
testRegistry.register(testImages);
testRegistry.register(testError);
testRegistry.register(testLargeOutput);

// Build SDK tools from the test registry
const sdkTools = buildSdkTools(testRegistry);

check('buildSdkTools: converts 5 tools', sdkTools.length === 5, `got ${sdkTools.length}`);

// Verify each tool has required properties
const toolNames = sdkTools.map((t: any) => t.name);
check(
  'buildSdkTools: tool names match',
  ['test_simple', 'test_params', 'test_images', 'test_error', 'test_large_output'].every(n => toolNames.includes(n)),
  `names: ${toolNames.join(', ')}`,
);

// ─── 3. Execute each tool handler and verify results ────────────────────────

async function runHandlerTests() {
  // test_simple: returns text content, no error
  const simpleTool = sdkTools.find((t: any) => t.name === 'test_simple')!;
  const simpleResult = await (simpleTool as any).handler({}, {});
  check(
    'test_simple: returns text content',
    simpleResult.content.length === 1 &&
    simpleResult.content[0].type === 'text' &&
    simpleResult.content[0].text === 'hello world' &&
    simpleResult.isError === false,
  );

  // test_params: accepts arguments and returns text
  const paramsTool = sdkTools.find((t: any) => t.name === 'test_params')!;
  const paramsResult = await (paramsTool as any).handler({ query: 'test', limit: 10 }, {});
  check(
    'test_params: accepts arguments',
    paramsResult.content.length === 1 &&
    paramsResult.content[0].type === 'text' &&
    paramsResult.content[0].text.includes('query=test') &&
    paramsResult.isError === false,
  );

  // test_images: returns text + image content blocks
  const imagesTool = sdkTools.find((t: any) => t.name === 'test_images')!;
  const imagesResult = await (imagesTool as any).handler({}, {});
  const hasText = imagesResult.content.some((c: any) => c.type === 'text');
  const imageBlocks = imagesResult.content.filter((c: any) => c.type === 'image');
  check(
    'test_images: returns text + image content',
    hasText &&
    imageBlocks.length === 2 &&
    imageBlocks[0].mimeType === 'image/png' &&
    imageBlocks[1].mimeType === 'image/jpeg' &&
    imagesResult.isError === false,
    `content blocks: ${imagesResult.content.length}, images: ${imageBlocks.length}`,
  );

  // test_error: returns isError=true with error message (ToolRegistry-caught error)
  const errorTool = sdkTools.find((t: any) => t.name === 'test_error')!;
  const errorResult = await (errorTool as any).handler({}, {});
  check(
    'test_error: returns isError=true',
    errorResult.isError === true &&
    errorResult.content[0].type === 'text' &&
    errorResult.content[0].text.includes('Error:') &&
    errorResult.content[0].text.includes('intentional test failure'),
  );

  // test_large_output: truncates at 50k chars
  const largeTool = sdkTools.find((t: any) => t.name === 'test_large_output')!;
  const largeResult = await (largeTool as any).handler({}, {});
  const outputText = largeResult.content[0].text;
  check(
    'test_large_output: truncates at 50k chars',
    outputText.includes('...[truncated') &&
    outputText.length < 100_000 &&
    largeResult.isError === false,
    `output length: ${outputText.length}`,
  );
}

await runHandlerTests();

// ─── 4. Test try/catch path (handler-level exception) ───────────────────────

// Create a registry with a broken execute() that throws past ToolRegistry's catch
const brokenRegistry = new ToolRegistry();
const brokenTool: Tool = {
  name: 'test_throws',
  description: 'Tool that triggers handler try/catch',
  parameters: [],
  execute: async () => ({ success: true, output: 'ok' }),
};
brokenRegistry.register(brokenTool);

// Monkey-patch execute to throw directly (simulates unexpected failure)
const origExecute = brokenRegistry.execute.bind(brokenRegistry);
brokenRegistry.execute = async () => { throw new Error('unexpected registry failure'); };

const brokenSdkTools = buildSdkTools(brokenRegistry);
const throwsTool = brokenSdkTools.find((t: any) => t.name === 'test_throws')!;
const throwsResult = await (throwsTool as any).handler({}, {});
check(
  'test_throws: handler try/catch returns Tool execution error',
  throwsResult.isError === true &&
  throwsResult.content[0].type === 'text' &&
  throwsResult.content[0].text.includes('Tool execution error'),
);

// Restore
brokenRegistry.execute = origExecute;

// ─── Summary ────────────────────────────────────────────────────────────────

console.log('');
console.log(`${passed}/${passed + failed} checks passed`);

if (failed > 0) {
  console.error(`\n${failed} check(s) FAILED`);
  process.exit(1);
}
