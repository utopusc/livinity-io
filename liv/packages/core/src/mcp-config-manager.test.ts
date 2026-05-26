/**
 * Phase 218 T6 — McpConfigManager HASH-everywhere tests.
 *
 * After Phase 218 T6, McpConfigManager no longer writes STRING. Both this
 * file and livinityd's `mcp-config-router.ts` use Redis HASH primitives on
 * `liv:mcp:config`, so the dual-writer WRONGTYPE collision is impossible.
 * Existing STRING values left over from pre-T6 code self-heal via the
 * inline `ensureHashPrimitive()` migration on first read.
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
  del: ReturnType<typeof vi.fn>;
  hget: ReturnType<typeof vi.fn>;
  hgetall: ReturnType<typeof vi.fn>;
  hset: ReturnType<typeof vi.fn>;
  hdel: ReturnType<typeof vi.fn>;
  multi: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
};

function makeFakeRedis(opts: { type?: string; stringValue?: string | null; hashValue?: Record<string, string> } = {}): FakeRedis {
  const pipeline = {
    del: vi.fn().mockReturnThis(),
    hset: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  return {
    type: vi.fn().mockResolvedValue(opts.type ?? 'none'),
    get: vi.fn().mockResolvedValue(opts.stringValue ?? null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    hget: vi.fn().mockImplementation(async (_key: string, field: string) => opts.hashValue?.[field] ?? null),
    hgetall: vi.fn().mockResolvedValue(opts.hashValue ?? {}),
    hset: vi.fn().mockResolvedValue(1),
    hdel: vi.fn().mockResolvedValue(1),
    multi: vi.fn().mockReturnValue(pipeline),
    publish: vi.fn().mockResolvedValue(1),
  };
}

describe('McpConfigManager — Phase 218 T6 HASH primitive', () => {
  it('reads via HGETALL and parses each field as JSON', async () => {
    const redis = makeFakeRedis({
      type: 'hash',
      hashValue: {
        foo: JSON.stringify({ transport: 'stdio', command: 'foo-bin', enabled: true }),
        bar: JSON.stringify({ transport: 'http', url: 'https://bar', enabled: false }),
      },
    });
    const mgr = new McpConfigManager(redis as never);
    const config = await mgr.getConfig();
    expect(redis.hgetall).toHaveBeenCalledWith('liv:mcp:config');
    expect(config.mcpServers.foo).toEqual({ transport: 'stdio', command: 'foo-bin', enabled: true });
    expect(config.mcpServers.bar).toEqual({ transport: 'http', url: 'https://bar', enabled: false });
  });

  it('installServer writes via HSET (not SET)', async () => {
    const redis = makeFakeRedis({ type: 'none' });
    const mgr = new McpConfigManager(redis as never);
    await mgr.installServer({ name: 'filesystem', transport: 'stdio', command: 'fs-bin', enabled: true } as never);
    expect(redis.hset).toHaveBeenCalledWith('liv:mcp:config', 'filesystem', expect.any(String));
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('removeServer writes via HDEL (not DEL)', async () => {
    const redis = makeFakeRedis({
      type: 'hash',
      hashValue: { foo: JSON.stringify({ transport: 'stdio', command: 'x', enabled: true }) },
    });
    const mgr = new McpConfigManager(redis as never);
    const removed = await mgr.removeServer('foo');
    expect(removed).toBe(true);
    expect(redis.hdel).toHaveBeenCalledWith('liv:mcp:config', 'foo');
  });

  it('removeServer returns false when the field is missing', async () => {
    const redis = makeFakeRedis({ type: 'hash', hashValue: {} });
    const mgr = new McpConfigManager(redis as never);
    const removed = await mgr.removeServer('missing');
    expect(removed).toBe(false);
    expect(redis.hdel).not.toHaveBeenCalled();
  });

  it('setRawConfig uses pipeline DEL + HSET (replace-all semantics)', async () => {
    const redis = makeFakeRedis({ type: 'none' });
    const mgr = new McpConfigManager(redis as never);
    await mgr.setRawConfig(JSON.stringify({
      mcpServers: {
        foo: { transport: 'stdio', command: 'fb', enabled: true },
        bar: { transport: 'http', url: 'https://bar', enabled: true },
      },
    }));
    expect(redis.multi).toHaveBeenCalled();
    const pipeline = redis.multi.mock.results[0]?.value;
    expect(pipeline.del).toHaveBeenCalledWith('liv:mcp:config');
    expect(pipeline.hset).toHaveBeenCalledTimes(2);
    expect(pipeline.exec).toHaveBeenCalled();
  });

  it('publishes on BOTH liv:config:updated AND liv:mcp:updated channels on install', async () => {
    const redis = makeFakeRedis({ type: 'none' });
    const mgr = new McpConfigManager(redis as never);
    await mgr.installServer({ name: 'foo', transport: 'stdio', command: 'fb', enabled: true } as never);
    const channels = redis.publish.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(channels).toContain('liv:config:updated');
    expect(channels).toContain('liv:mcp:updated');
  });
});

describe('McpConfigManager — Phase 218 T6 STRING→HASH inline migration', () => {
  it('migrates an existing STRING value to HASH on first read', async () => {
    const stringValue = JSON.stringify({
      mcpServers: {
        foo: { transport: 'stdio', command: 'fb', enabled: true },
        bar: { transport: 'http', url: 'https://bar', enabled: false },
      },
    });
    const redis = makeFakeRedis({ type: 'string', stringValue, hashValue: {} });
    const mgr = new McpConfigManager(redis as never);
    await mgr.getConfig();
    expect(redis.del).toHaveBeenCalledWith('liv:mcp:config');
    expect(redis.hset).toHaveBeenCalledWith('liv:mcp:config', 'foo', expect.any(String));
    expect(redis.hset).toHaveBeenCalledWith('liv:mcp:config', 'bar', expect.any(String));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('STRING → HASH (2 servers)'));
  });

  it('handles legacy `servers` key (old shape) during migration', async () => {
    const stringValue = JSON.stringify({
      servers: { foo: { transport: 'stdio', command: 'fb', enabled: true } },
    });
    const redis = makeFakeRedis({ type: 'string', stringValue, hashValue: {} });
    const mgr = new McpConfigManager(redis as never);
    await mgr.getConfig();
    expect(redis.del).toHaveBeenCalledWith('liv:mcp:config');
    expect(redis.hset).toHaveBeenCalledWith('liv:mcp:config', 'foo', expect.any(String));
  });

  it('clears an empty STRING value without crashing', async () => {
    const redis = makeFakeRedis({ type: 'string', stringValue: null, hashValue: {} });
    const mgr = new McpConfigManager(redis as never);
    const config = await mgr.getConfig();
    expect(redis.del).toHaveBeenCalledWith('liv:mcp:config');
    expect(config.mcpServers).toEqual({});
  });

  it('deletes a malformed STRING value to recover (does not crash)', async () => {
    const redis = makeFakeRedis({ type: 'string', stringValue: 'not-json{{{', hashValue: {} });
    const mgr = new McpConfigManager(redis as never);
    const config = await mgr.getConfig();
    expect(redis.del).toHaveBeenCalledWith('liv:mcp:config');
    expect(config.mcpServers).toEqual({});
    expect(logger.error).toHaveBeenCalled();
  });

  it('is a no-op when type is already "hash" (no migration churn)', async () => {
    const redis = makeFakeRedis({
      type: 'hash',
      hashValue: { foo: JSON.stringify({ transport: 'stdio', command: 'x', enabled: true }) },
    });
    const mgr = new McpConfigManager(redis as never);
    await mgr.getConfig();
    expect(redis.del).not.toHaveBeenCalled();
    expect(redis.hset).not.toHaveBeenCalled();
  });

  it('is a no-op when type is "none" (fresh key)', async () => {
    const redis = makeFakeRedis({ type: 'none' });
    const mgr = new McpConfigManager(redis as never);
    await mgr.getConfig();
    expect(redis.del).not.toHaveBeenCalled();
    expect(redis.hset).not.toHaveBeenCalled();
  });
});
