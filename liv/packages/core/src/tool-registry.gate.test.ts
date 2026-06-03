/**
 * Phase 256-06 Task 2 — the revived approval gate at toolRegistry.execute()
 * (LIVOS-002 layer 5 / SC7, SC8).
 *
 * Locks: execute() consults classifyToolCall BEFORE tool.execute; ordinary ops
 * fast-allow (no approval), irreversible ops route through the ApprovalManager
 * (approve→runs, deny/timeout/no-manager→fail-safe DENY ToolResult).
 *
 * Runner: tsx + node:assert/strict. Run with: npx tsx src/tool-registry.gate.test.ts
 */
import assert from 'node:assert/strict';
import { ToolRegistry } from './tool-registry.js';
import type { Tool, ToolResult, ApprovalRequest, ApprovalResponse } from './types.js';

/** A spy tool that records whether it ran. */
function makeSpyTool(name: string): { tool: Tool; ran: () => boolean } {
  let didRun = false;
  const tool: Tool = {
    name,
    description: 'spy',
    parameters: [],
    execute: async (): Promise<ToolResult> => {
      didRun = true;
      return { success: true, output: 'ran' };
    },
  };
  return { tool, ran: () => didRun };
}

/** A stub ApprovalManager matching the gate's structural interface. */
function makeStubApproval(decision: 'approve' | 'deny' | null) {
  let createCalls = 0;
  const mgr = {
    createRequest: async (opts: {
      sessionId: string;
      tool: string;
      params: Record<string, unknown>;
      thought: string;
    }): Promise<ApprovalRequest> => {
      createCalls++;
      return {
        id: 'req-1',
        sessionId: opts.sessionId,
        tool: opts.tool,
        params: opts.params,
        thought: opts.thought,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000,
      };
    },
    waitForResponse: async (): Promise<ApprovalResponse | null> => {
      if (decision === null) return null;
      return { requestId: 'req-1', decision };
    },
  };
  return { mgr, createCalls: () => createCalls };
}

async function test1_ordinaryFastAllows() {
  const reg = new ToolRegistry();
  const { tool, ran } = makeSpyTool('shell');
  reg.register(tool);
  const { mgr, createCalls } = makeStubApproval('approve');
  reg.setApprovalGate(mgr as any, 'sess-1');

  const res = await reg.execute('shell', { command: 'ls -la' });
  assert.equal(res.success, true, 'ordinary op succeeds');
  assert.equal(ran(), true, 'tool.execute ran');
  assert.equal(createCalls(), 0, 'createRequest NEVER called for ordinary op');
  console.log('  PASS: ordinary op fast-allows (no approval)');
}

async function test2_irreversibleApprovedRuns() {
  const reg = new ToolRegistry();
  const { tool, ran } = makeSpyTool('shell');
  reg.register(tool);
  const { mgr, createCalls } = makeStubApproval('approve');
  reg.setApprovalGate(mgr as any, 'sess-1');

  const res = await reg.execute('shell', { command: 'git push --force origin main' });
  assert.equal(createCalls(), 1, 'createRequest called for irreversible op');
  assert.equal(ran(), true, 'approved → tool.execute runs');
  assert.equal(res.success, true, 'approved result returned');
  console.log('  PASS: irreversible op approved → runs');
}

async function test3_irreversibleDeniedDoesNotRun() {
  const reg = new ToolRegistry();
  const { tool, ran } = makeSpyTool('shell');
  reg.register(tool);
  const { mgr } = makeStubApproval('deny');
  reg.setApprovalGate(mgr as any, 'sess-1');

  const res = await reg.execute('shell', { command: 'git push --force' });
  assert.equal(ran(), false, 'denied → tool.execute NEVER runs');
  assert.equal(res.success, false, 'deny returns failure ToolResult');
  assert.equal(res.output, '', 'deny output empty');
  assert.match(res.error || '', /denied|not approved|approval/i, 'deny error message');
  console.log('  PASS: irreversible op denied → does NOT run');
}

async function test4_timeoutFailSafe() {
  const reg = new ToolRegistry();
  const { tool, ran } = makeSpyTool('shell');
  reg.register(tool);
  const { mgr } = makeStubApproval(null); // timeout
  reg.setApprovalGate(mgr as any, 'sess-1');

  const res = await reg.execute('shell', { command: 'git push --force' });
  assert.equal(ran(), false, 'timeout → tool.execute NOT invoked');
  assert.equal(res.success, false, 'timeout returns failure');
  assert.match(res.error || '', /timed out|not approved|approval/i, 'timeout error message');
  console.log('  PASS: approval timeout → fail-safe deny');
}

async function test5_noManagerFailSafe() {
  const reg = new ToolRegistry();
  const { tool, ran } = makeSpyTool('shell');
  reg.register(tool);
  // NO setApprovalGate — gate unconfigured.

  // ordinary op still runs
  const ok = await reg.execute('shell', { command: 'npm run build' });
  assert.equal(ok.success, true, 'ordinary op runs with no manager');
  assert.equal(ran(), true, 'ordinary tool ran');

  // irreversible op → fail-safe DENY (NOT silent allow)
  const { tool: t2, ran: ran2 } = makeSpyTool('docker_exec');
  reg.register(t2);
  const blocked = await reg.execute('docker_exec', { command: 'git push --force' });
  assert.equal(ran2(), false, 'no-manager irreversible op does NOT run (fail-safe)');
  assert.equal(blocked.success, false, 'no-manager irreversible → deny ToolResult');
  assert.match(blocked.error || '', /approval/i, 'no-manager deny message');
  console.log('  PASS: no ApprovalManager → ordinary allow, irreversible fail-safe deny');
}

async function main() {
  console.log('tool-registry.gate.test.ts — Phase 256-06 Task 2');
  await test1_ordinaryFastAllows();
  await test2_irreversibleApprovedRuns();
  await test3_irreversibleDeniedDoesNotRun();
  await test4_timeoutFailSafe();
  await test5_noManagerFailSafe();
  console.log('ALL PASS (5 checks)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
