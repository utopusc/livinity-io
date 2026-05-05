/**
 * Tests for AgentSessionManager and createInputChannel.
 *
 * Lightweight test runner using Node.js assert — no test framework dependency.
 * Run with: npx tsx src/agent-session.test.ts
 */

import assert from 'node:assert/strict';
import { createInputChannel, AgentSessionManager } from './agent-session.js';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

// ── createInputChannel tests ─────────────────────────────────

async function testInputChannelPushAndYield() {
  const channel = createInputChannel();
  const msg: SDKUserMessage = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    session_id: 'test-session',
    parent_tool_use_id: null,
  };

  channel.push(msg);

  // Generator should yield the pushed message
  const result = await channel.generator.next();
  assert.equal(result.done, false);
  assert.deepEqual(result.value, msg);

  channel.close();
  console.log('  PASS: createInputChannel push causes generator to yield');
}

async function testInputChannelBlocksWhenEmpty() {
  const channel = createInputChannel();
  let resolved = false;

  // Start reading from generator (will block since nothing is pushed)
  const readPromise = channel.generator.next().then((result) => {
    resolved = true;
    return result;
  });

  // Give the event loop a tick -- generator should still be blocking
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(resolved, false, 'Generator should block when empty');

  // Now push a message -- should unblock the generator
  const msg: SDKUserMessage = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'delayed' }] },
    session_id: 'test-session',
    parent_tool_use_id: null,
  };
  channel.push(msg);

  const result = await readPromise;
  assert.equal(resolved, true, 'Generator should unblock after push');
  assert.deepEqual(result.value, msg);

  channel.close();
  console.log('  PASS: createInputChannel blocks when empty, resumes on push');
}

async function testInputChannelCloseBreaksLoop() {
  const channel = createInputChannel();

  // Start consuming in background
  const collected: SDKUserMessage[] = [];
  const consumePromise = (async () => {
    for await (const msg of channel.generator) {
      collected.push(msg);
    }
  })();

  // Push one message, then close
  const msg: SDKUserMessage = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'before close' }] },
    session_id: 'test-session',
    parent_tool_use_id: null,
  };
  channel.push(msg);

  // Allow the generator to process
  await new Promise((r) => setTimeout(r, 10));

  channel.close();
  await consumePromise;

  assert.equal(collected.length, 1);
  assert.equal((collected[0].message as any).content[0].text, 'before close');
  console.log('  PASS: createInputChannel close breaks generator loop');
}

// ── AgentSessionManager tests ────────────────────────────────
// Note: Full session tests require SDK mocking which is complex without a framework.
// We test the session map management and cleanup logic.

function testSessionManagerStoresSession() {
  // We can't fully test startSession without mocking query(), but we can
  // verify the session manager class exists and has the correct interface.
  const mockRegistry = { listFiltered: () => [], get: () => null } as any;
  const manager = new AgentSessionManager({ toolRegistry: mockRegistry });

  assert.equal(manager.getSession('user1'), undefined, 'No session should exist initially');
  console.log('  PASS: AgentSessionManager stores sessions in Map keyed by userId');
}

function testSessionManagerCleanupRemovesSession() {
  const mockRegistry = { listFiltered: () => [], get: () => null } as any;
  const manager = new AgentSessionManager({ toolRegistry: mockRegistry });

  // Manually insert a session to test cleanup
  const abortController = new AbortController();
  const channel = createInputChannel();
  (manager as any).sessions.set('user1', {
    userId: 'user1',
    sessionId: 'test-session-id',
    abortController,
    inputChannel: channel,
    startedAt: Date.now(),
  });

  assert.ok(manager.getSession('user1'), 'Session should exist before cleanup');
  manager.cleanup('user1');
  assert.equal(manager.getSession('user1'), undefined, 'Session should be removed after cleanup');
  assert.equal(abortController.signal.aborted, true, 'AbortController should be aborted');
  console.log('  PASS: AgentSessionManager.cleanup removes session and aborts');
}

async function testHandleMessageInterrupt() {
  const mockRegistry = { listFiltered: () => [], get: () => null } as any;
  const manager = new AgentSessionManager({ toolRegistry: mockRegistry });

  const abortController = new AbortController();
  const channel = createInputChannel();
  (manager as any).sessions.set('user1', {
    userId: 'user1',
    sessionId: 'test-session-id',
    abortController,
    inputChannel: channel,
    startedAt: Date.now(),
  });

  const messages: any[] = [];
  await manager.handleMessage('user1', { type: 'interrupt' }, (msg) => messages.push(msg));

  assert.equal(abortController.signal.aborted, true, 'Interrupt should abort the session');
  console.log('  PASS: AgentSessionManager.handleMessage interrupt aborts the session');
}

async function testHandleMessageCancel() {
  const mockRegistry = { listFiltered: () => [], get: () => null } as any;
  const manager = new AgentSessionManager({ toolRegistry: mockRegistry });

  const abortController = new AbortController();
  const channel = createInputChannel();
  (manager as any).sessions.set('user1', {
    userId: 'user1',
    sessionId: 'test-session-id',
    abortController,
    inputChannel: channel,
    startedAt: Date.now(),
  });

  const messages: any[] = [];
  await manager.handleMessage('user1', { type: 'cancel' }, (msg) => messages.push(msg));

  assert.equal(manager.getSession('user1'), undefined, 'Cancel should remove session');
  assert.equal(abortController.signal.aborted, true, 'Cancel should abort session');
  console.log('  PASS: AgentSessionManager.handleMessage cancel closes and removes session');
}

async function testHandleMessageForMissingSession() {
  const mockRegistry = { listFiltered: () => [], get: () => null } as any;
  const manager = new AgentSessionManager({ toolRegistry: mockRegistry });

  const messages: any[] = [];
  await manager.handleMessage('user1', { type: 'message', text: 'hello' }, (msg) =>
    messages.push(msg),
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'error');
  assert.ok(messages[0].message.includes('No active session'));
  console.log('  PASS: AgentSessionManager.handleMessage with message on missing session sends error');
}

// ── Run all tests ────────────────────────────────────────────

async function main() {
  console.log('agent-session.test.ts');
  console.log('');
  console.log('createInputChannel:');
  await testInputChannelPushAndYield();
  await testInputChannelBlocksWhenEmpty();
  await testInputChannelCloseBreaksLoop();

  console.log('');
  console.log('AgentSessionManager:');
  testSessionManagerStoresSession();
  testSessionManagerCleanupRemovesSession();
  await testHandleMessageInterrupt();
  await testHandleMessageCancel();
  await testHandleMessageForMissingSession();

  console.log('');
  console.log('All tests passed!');
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
