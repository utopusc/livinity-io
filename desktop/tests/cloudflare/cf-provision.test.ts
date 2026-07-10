import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * cf-provision.test.ts mocks the CF client (cf-client), the vault (secrets-vault),
 * and the state store (state-store) — the IO collaborators the write orchestrator
 * composes — while using the REAL pure helpers (mergeIngress, deriveTunnelName) and
 * the REAL CfApiError class (cf-http is NOT mocked, so `err instanceof CfApiError`
 * matches across the boundary). This proves idempotency (reuse-by-name), the RMW
 * no-clobber guarantee, and the write-403 -> per-scope mapping WITHOUT touching the
 * network, the DPAPI vault, or disk.
 */

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/main/cloudflare/cf-client', () => ({
  listTunnels: vi.fn(),
  createTunnel: vi.fn(),
  getTunnelToken: vi.fn(),
  getIngress: vi.fn(),
  putIngress: vi.fn(),
  listDnsByName: vi.fn(),
  createDnsCname: vi.fn(),
  deleteDnsRecord: vi.fn(),
}));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultGet: vi.fn(),
  vaultSet: vi.fn(),
}));

vi.mock('../../src/main/storage/state-store', () => ({
  readState: vi.fn(),
  patchState: vi.fn(),
}));

import { CfApiError } from '../../src/main/cloudflare/cf-http';
import {
  listTunnels,
  createTunnel,
  getTunnelToken,
  getIngress,
  putIngress,
} from '../../src/main/cloudflare/cf-client';
import { vaultGet, vaultSet } from '../../src/main/storage/secrets-vault';
import { readState, patchState } from '../../src/main/storage/state-store';
import { provisionTunnelAndDns } from '../../src/main/cloudflare/cf-provision';
import type { IngressEntry, TunnelList } from '../../src/main/cloudflare/cf-schemas';
import type { State } from '../../../shared/ipc-contract';

const listTunnelsMock = vi.mocked(listTunnels);
const createTunnelMock = vi.mocked(createTunnel);
const getTunnelTokenMock = vi.mocked(getTunnelToken);
const getIngressMock = vi.mocked(getIngress);
const putIngressMock = vi.mocked(putIngress);
const vaultGetMock = vi.mocked(vaultGet);
const vaultSetMock = vi.mocked(vaultSet);
// state-store exposes readState/patchState; cf-provision imports them as
// getState/setState (the names the plan's steps + acceptance greps use). Assert on
// them here under those intent-revealing aliases.
const getStateMock = vi.mocked(readState);
const setStateMock = vi.mocked(patchState);

const TOKEN = 'cf-token-abc123';
const CONNECTOR = 'connector-blob-secret';
const APEX = 'liv.example.com';
// deriveTunnelName({ username:'drampa', subLabel:'liv' }) is deterministic: livos-<slug(username)>.
const DERIVED_NAME = 'livos-drampa';

/** A terminal Cloudflare API error at a given HTTP status (0 = network/transport). */
function cfErr(status: number): CfApiError {
  return new CfApiError({
    message: `boom ${status}`,
    status,
    cfErrorCode: 9109,
    cfMessage: 'overloaded code',
    endpoint: 'POST /x',
  });
}

/** The full chosen-zone facts 03-05 selectDomainProbe persists (read back here). */
function state(over: Partial<State> = {}): State {
  return {
    version: 1,
    currentStep: 'domain',
    zoneId: 'zone-1',
    zoneName: 'example.com',
    subLabel: 'liv',
    accountId: 'acct-1',
    ...over,
  };
}

/** A pre-seeded per-app ingress rule a prior box install pushed onto a reused tunnel. */
const PER_APP_RULE: IngressEntry = { hostname: 'app-drampa.example.com', service: 'http://localhost:80' };
const CATCH_ALL: IngressEntry = { service: 'http_status:404' };

beforeEach(() => {
  listTunnelsMock.mockReset();
  createTunnelMock.mockReset();
  getTunnelTokenMock.mockReset();
  getIngressMock.mockReset();
  putIngressMock.mockReset();
  vaultGetMock.mockReset();
  vaultSetMock.mockReset();
  getStateMock.mockReset();
  setStateMock.mockReset();

  // Sensible defaults: authenticated, a selected zone, no existing tunnel/ingress.
  vaultGetMock.mockResolvedValue(TOKEN);
  getStateMock.mockResolvedValue(state());
  listTunnelsMock.mockResolvedValue([] as TunnelList);
  createTunnelMock.mockResolvedValue({ tunnelId: 'tun-new' });
  getTunnelTokenMock.mockResolvedValue(CONNECTOR);
  // Ingress already carries the apex after a push -> the verify-and-repair loop breaks.
  getIngressMock.mockResolvedValue([PER_APP_RULE, { hostname: APEX, service: 'http://localhost:80' }, CATCH_ALL]);
  putIngressMock.mockResolvedValue(undefined);
  vaultSetMock.mockResolvedValue(undefined);
  setStateMock.mockResolvedValue(state());
});

describe('provisionTunnelAndDns — accountId guard (read from the 03-05-persisted state)', () => {
  it('a missing accountId short-circuits to network BEFORE any listTunnels call (the guard)', async () => {
    getStateMock.mockResolvedValue(state({ accountId: undefined }));

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result).toEqual({ kind: 'network' });
    expect(listTunnelsMock).not.toHaveBeenCalled();
    expect(createTunnelMock).not.toHaveBeenCalled();
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('an absent state file (readState -> null) short-circuits to network, no listTunnels', async () => {
    getStateMock.mockResolvedValue(null);

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result).toEqual({ kind: 'network' });
    expect(listTunnelsMock).not.toHaveBeenCalled();
  });

  it('no vault CF token -> network, no listTunnels', async () => {
    vaultGetMock.mockResolvedValue(null);

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result).toEqual({ kind: 'network' });
    expect(listTunnelsMock).not.toHaveBeenCalled();
  });
});

describe('provisionTunnelAndDns — tunnel reuse-by-name idempotency (CF-05 / D-14)', () => {
  it('reuses the tunnel when one already exists with the derived name (createTunnel NOT called)', async () => {
    listTunnelsMock.mockResolvedValue([{ id: 'tun-existing', name: DERIVED_NAME }] as TunnelList);

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result.kind).toBe('ready');
    expect(listTunnelsMock).toHaveBeenCalledWith(TOKEN, 'acct-1');
    expect(createTunnelMock).not.toHaveBeenCalled();
    // the connector token is fetched for the REUSED tunnel id.
    expect(getTunnelTokenMock).toHaveBeenCalledWith(TOKEN, 'acct-1', 'tun-existing');
  });

  it('creates a fresh tunnel with the derived name when no match exists', async () => {
    listTunnelsMock.mockResolvedValue([{ id: 'tun-other', name: 'livos-someone-else' }] as TunnelList);

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result.kind).toBe('ready');
    expect(createTunnelMock).toHaveBeenCalledWith(TOKEN, 'acct-1', DERIVED_NAME);
  });
});

describe('provisionTunnelAndDns — connector token -> vault (D-16)', () => {
  it("stores the connector blob under the vault 'tunnelToken' key", async () => {
    await provisionTunnelAndDns({ username: 'drampa' });

    expect(vaultSetMock).toHaveBeenCalledWith('tunnelToken', CONNECTOR);
  });
});

describe('provisionTunnelAndDns — RMW ingress no-clobber (D-15 / T-03-07)', () => {
  it('pushes an ingress that preserves the pre-seeded per-app rule + adds the apex + keeps the catch-all LAST', async () => {
    // First GET returns the pre-seeded ingress WITHOUT the apex (so mergeIngress adds it);
    // subsequent verify GETs return it WITH the apex (loop breaks — no re-push needed).
    getIngressMock
      .mockResolvedValueOnce([PER_APP_RULE, CATCH_ALL])
      .mockResolvedValue([PER_APP_RULE, { hostname: APEX, service: 'http://localhost:80' }, CATCH_ALL]);

    await provisionTunnelAndDns({ username: 'drampa' });

    expect(putIngressMock).toHaveBeenCalledTimes(1);
    const pushed = putIngressMock.mock.calls[0][3] as IngressEntry[];
    // per-app rule survives (no-clobber), apex added, catch-all last exactly once.
    expect(pushed).toContainEqual(PER_APP_RULE);
    expect(pushed).toContainEqual({ hostname: APEX, service: 'http://localhost:80' });
    expect(pushed[pushed.length - 1]).toEqual(CATCH_ALL);
    expect(pushed.filter((e) => e.service === 'http_status:404' && !e.hostname)).toHaveLength(1);
  });
});

describe('provisionTunnelAndDns — write-403 -> precise per-scope step (D-04)', () => {
  it('a 403 on the tunnel list/create -> scope-missing step:"tunnel" with the Tunnel row failed', async () => {
    listTunnelsMock.mockRejectedValue(cfErr(403));

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result.kind).toBe('scope-missing');
    if (result.kind === 'scope-missing') {
      expect(result.step).toBe('tunnel');
      const tunnelRow = result.rows.find((r) => r.scope === 'tunnel');
      expect(tunnelRow).toMatchObject({ ok: false, missingLabel: 'Account · Cloudflare Tunnel · Edit' });
    }
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('a 403 on the ingress push -> scope-missing step:"ingress"', async () => {
    putIngressMock.mockRejectedValue(cfErr(403));

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result.kind).toBe('scope-missing');
    if (result.kind === 'scope-missing') expect(result.step).toBe('ingress');
  });

  it('a transport failure (status 0) on a write -> network (never a false scope-missing)', async () => {
    listTunnelsMock.mockRejectedValue(cfErr(0));

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result).toEqual({ kind: 'network' });
  });
});
