/**
 * Phase 211.1 — defensive dual-writer collision-guard tests for
 * McpConfigManager.saveAndPublish().
 *
 * The livinityd tRPC `mcp-config-router.ts` uses Redis HASH primitives on the
 * same `liv:mcp:config` key. McpConfigManager uses STRING primitives. Writing
 * to a HASH key with SET would Redis-WRONGTYPE-error. These tests prove the
 * type-check guard refuses to SET when the key is already a HASH, and that
 * the cross-publish to `liv:mcp:updated` fires alongside the existing
 * `liv:config:updated` publish.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the logger so we can assert on it.
vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { McpConfigManager } from './mcp-config-manager.js';
import { logger } from './logger.js';

type FakeRedis = {
  type: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
};

function makeFakeRedis(typeResult: string): FakeRedis {
  return {
    type: vi.fn().mockResolvedValue(typeResult),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1),
  };
}

describe('McpConfigManager — Phase 211.1 dual-writer guard', () => {
  it('refuses to SET when the key is already a Redis HASH (other writer owns it)', async () => {
    const redis = makeFakeRedis('hash');
    const mgr = new McpConfigManager(redis as never);

    await mgr.setRawConfig(JSON.stringify({ mcpServers: { foo: { transport: 'stdio', command: 'x' } } }));

    expect(redis.type).toHaveBeenCalledWith('liv:mcp:config');
    expect(redis.set).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    const errMsg = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(errMsg).toContain('liv:mcp:config');
    expect(errMsg).toContain('hash');
    expect(errMsg).toContain('CARRY-P211-UNIFY');
  });

  it('SETs the key when current type is "none" (key does not exist)', async () => {
    const redis = makeFakeRedis('none');
    const mgr = new McpConfigManager(redis as never);

    await mgr.setRawConfig(JSON.stringify({ mcpServers: {} }));

    expect(redis.type).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith('liv:mcp:config', expect.any(String));
  });

  it('SETs the key when current type is already "string" (idempotent)', async () => {
    const redis = makeFakeRedis('string');
    const mgr = new McpConfigManager(redis as never);

    await mgr.setRawConfig(JSON.stringify({ mcpServers: {} }));

    expect(redis.set).toHaveBeenCalled();
  });

  it('publishes on BOTH liv:config:updated AND liv:mcp:updated channels', async () => {
    const redis = makeFakeRedis('none');
    const mgr = new McpConfigManager(redis as never);

    await mgr.setRawConfig(JSON.stringify({ mcpServers: {} }));

    const channels = redis.publish.mock.calls.map((c) => c[0] as string);
    expect(channels).toContain('liv:config:updated');
    expect(channels).toContain('liv:mcp:updated');
  });
});
