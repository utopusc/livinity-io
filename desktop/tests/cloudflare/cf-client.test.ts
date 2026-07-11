import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * cf-client.test.ts (SUP-02 teardown verbs). The `callCf` transport (cf-http) is
 * mocked so no real network call is ever made; the REAL `CfApiError` class is kept
 * (importOriginal, mirrors wsl.ipc.test.ts's decide-wsl-state discipline) so a
 * thrown `CfApiError` propagates through these verbs unchanged and `instanceof`
 * checks still hold across the boundary.
 */

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/main/cloudflare/cf-http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/cloudflare/cf-http')>();
  return { ...actual, callCf: vi.fn() };
});

import { callCf, CfApiError } from '../../src/main/cloudflare/cf-http';
import { deleteTunnel, deleteTunnelConnections } from '../../src/main/cloudflare/cf-client';
import { logSafe } from '../../src/main/log';

const callCfMock = vi.mocked(callCf);
const logSafeMock = vi.mocked(logSafe);

const TOKEN = 'cf-token-abc123';

beforeEach(() => {
  callCfMock.mockReset();
  logSafeMock.mockClear();
});

describe('deleteTunnelConnections', () => {
  it('issues DELETE /accounts/{acct}/cfd_tunnel/{id}/connections with seg()-escaped segments', async () => {
    callCfMock.mockResolvedValue(undefined);

    await deleteTunnelConnections(TOKEN, 'acct 1', 'tun/nel');

    expect(callCfMock).toHaveBeenCalledWith(TOKEN, {
      method: 'DELETE',
      path: `/accounts/${encodeURIComponent('acct 1')}/cfd_tunnel/${encodeURIComponent('tun/nel')}/connections`,
    });
  });

  it('logSafe carries scalars only -- never the token', async () => {
    callCfMock.mockResolvedValue(undefined);

    await deleteTunnelConnections(TOKEN, 'acct-1', 'tun-1');

    expect(logSafeMock).toHaveBeenCalledWith('cf.deleteConnections', { deleted: true });
    const loggedText = logSafeMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(loggedText).not.toContain(TOKEN);
  });

  it('propagates a CfApiError thrown by callCf unchanged -- the caller (remove-executor) classifies 404, not this verb', async () => {
    const err = new CfApiError({ message: 'boom', status: 500, cfErrorCode: -1, cfMessage: '', endpoint: 'x' });
    callCfMock.mockRejectedValue(err);

    await expect(deleteTunnelConnections(TOKEN, 'acct-1', 'tun-1')).rejects.toBe(err);
  });
});

describe('deleteTunnel', () => {
  it('issues DELETE /accounts/{acct}/cfd_tunnel/{id} with seg()-escaped segments', async () => {
    callCfMock.mockResolvedValue(undefined);

    await deleteTunnel(TOKEN, 'acct 1', 'tun/nel');

    expect(callCfMock).toHaveBeenCalledWith(TOKEN, {
      method: 'DELETE',
      path: `/accounts/${encodeURIComponent('acct 1')}/cfd_tunnel/${encodeURIComponent('tun/nel')}`,
    });
  });

  it('a hostile tunnelId segment (path-traversal-shaped) is seg()-escaped -- never breaks out of the path', async () => {
    callCfMock.mockResolvedValue(undefined);

    await deleteTunnel(TOKEN, 'acct-1', '../../etc/passwd');

    const [, opts] = callCfMock.mock.calls[0] as [string, { method: string; path: string }];
    expect(opts.path).toBe(`/accounts/acct-1/cfd_tunnel/${encodeURIComponent('../../etc/passwd')}`);
    expect(opts.path).not.toContain('../../etc/passwd'); // the raw (unescaped) traversal string is absent
  });

  it('logSafe carries scalars only -- never the token', async () => {
    callCfMock.mockResolvedValue(undefined);

    await deleteTunnel(TOKEN, 'acct-1', 'tun-1');

    expect(logSafeMock).toHaveBeenCalledWith('cf.deleteTunnel', { deleted: true });
    const loggedText = logSafeMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(loggedText).not.toContain(TOKEN);
  });

  it('propagates a CfApiError thrown by callCf unchanged', async () => {
    const err = new CfApiError({ message: 'not found', status: 404, cfErrorCode: -1, cfMessage: '', endpoint: 'x' });
    callCfMock.mockRejectedValue(err);

    await expect(deleteTunnel(TOKEN, 'acct-1', 'tun-1')).rejects.toBe(err);
  });
});
