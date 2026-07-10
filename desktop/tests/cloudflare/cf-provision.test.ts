import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  listDnsByName,
  createDnsCname,
  deleteDnsRecord,
} from '../../src/main/cloudflare/cf-client';
import { vaultGet, vaultSet } from '../../src/main/storage/secrets-vault';
import { readState, patchState } from '../../src/main/storage/state-store';
import { provisionTunnelAndDns } from '../../src/main/cloudflare/cf-provision';
import type { IngressEntry, TunnelList, DnsRecordList } from '../../src/main/cloudflare/cf-schemas';
import type { State } from '../../../shared/ipc-contract';

const listTunnelsMock = vi.mocked(listTunnels);
const createTunnelMock = vi.mocked(createTunnel);
const getTunnelTokenMock = vi.mocked(getTunnelToken);
const getIngressMock = vi.mocked(getIngress);
const putIngressMock = vi.mocked(putIngress);
const listDnsByNameMock = vi.mocked(listDnsByName);
const createDnsCnameMock = vi.mocked(createDnsCname);
const deleteDnsRecordMock = vi.mocked(deleteDnsRecord);
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
  listDnsByNameMock.mockReset();
  createDnsCnameMock.mockReset();
  deleteDnsRecordMock.mockReset();
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
  // DNS defaults: no existing apex record -> a single clean create.
  listDnsByNameMock.mockResolvedValue([]);
  createDnsCnameMock.mockResolvedValue({ id: 'rec-new' });
  deleteDnsRecordMock.mockResolvedValue(undefined);
  vaultSetMock.mockResolvedValue(undefined);
  setStateMock.mockResolvedValue(state());
});

/** A parsed DNS record (as cf-client.listDnsByName returns) pointing at `content`. */
function dnsRecord(content: string, id = 'rec-1'): DnsRecordList[number] {
  return { id, name: APEX, type: 'CNAME', content, proxied: true };
}

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

describe('provisionTunnelAndDns — re-asserts the authoritative sub-label gate on the renderer-mutable state (WR-01 / T-03-06)', () => {
  it('a dotted/illegal subLabel persisted into state -> network BEFORE any CF write (the gate is re-run here, not just at 03-05)', async () => {
    // A compromised/XSS'd renderer overwrites ONLY the subLabel field via
    // window.api.setState (StateSchema.partial() accepts any string) AFTER
    // selectDomainProbe gated the real one and persisted the validated account facts.
    getStateMock.mockResolvedValue(state({ subLabel: 'a.b.evil' }));

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result).toEqual({ kind: 'network' });
    // no external CF state is touched — the guard runs before the first account write.
    expect(listTunnelsMock).not.toHaveBeenCalled();
    expect(createTunnelMock).not.toHaveBeenCalled();
    expect(createDnsCnameMock).not.toHaveBeenCalled();
    // and the un-revalidated value is never persisted as the LIVOS_DOMAIN install fact.
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it('a subLabel with an illegal charset (uppercase/underscore) is likewise rejected before any CF write', async () => {
    getStateMock.mockResolvedValue(state({ subLabel: 'Bad_Label' }));

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result).toEqual({ kind: 'network' });
    expect(listTunnelsMock).not.toHaveBeenCalled();
    expect(createTunnelMock).not.toHaveBeenCalled();
  });

  it('a normal single-label subLabel passes the re-assert and provisions through to ready', async () => {
    // the beforeEach default subLabel 'liv' is a valid single DNS label.
    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result.kind).toBe('ready');
    expect(listTunnelsMock).toHaveBeenCalled();
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

describe('provisionTunnelAndDns — collision-gated apex CNAME (D-08 / D-13)', () => {
  it('a record already pointing at OUR tunnel -> ready, createDnsCname NOT called (silent resume)', async () => {
    // default create path -> tunnelId 'tun-new'; the existing record already targets it.
    listDnsByNameMock.mockResolvedValue([dnsRecord('tun-new.cfargotunnel.com')] as DnsRecordList);

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result.kind).toBe('ready');
    expect(createDnsCnameMock).not.toHaveBeenCalled();
    expect(deleteDnsRecordMock).not.toHaveBeenCalled();
  });

  it('a FOREIGN record with takeOver=false -> collision, deleteDnsRecord NOT called, no facts persisted', async () => {
    listDnsByNameMock.mockResolvedValue([dnsRecord('other.example.com')] as DnsRecordList);

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result).toEqual({ kind: 'collision' });
    expect(deleteDnsRecordMock).not.toHaveBeenCalled();
    expect(createDnsCnameMock).not.toHaveBeenCalled();
    // returns BEFORE the state write — the destructive path is fully gated.
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it('a FOREIGN record with takeOver=true -> deletes the foreign record THEN creates our CNAME', async () => {
    listDnsByNameMock.mockResolvedValue([dnsRecord('other.example.com', 'rec-9')] as DnsRecordList);

    const result = await provisionTunnelAndDns({ username: 'drampa', takeOver: true });

    expect(result.kind).toBe('ready');
    expect(deleteDnsRecordMock).toHaveBeenCalledWith(TOKEN, 'zone-1', 'rec-9');
    expect(createDnsCnameMock).toHaveBeenCalledWith(TOKEN, 'zone-1', APEX, 'tun-new');
    // delete happens BEFORE create.
    expect(deleteDnsRecordMock.mock.invocationCallOrder[0]).toBeLessThan(
      createDnsCnameMock.mock.invocationCallOrder[0]
    );
  });

  it('no existing record -> exactly ONE createDnsCname for the apex host (no wildcard name)', async () => {
    listDnsByNameMock.mockResolvedValue([]);

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result.kind).toBe('ready');
    expect(createDnsCnameMock).toHaveBeenCalledTimes(1);
    const nameArg = createDnsCnameMock.mock.calls[0][2];
    expect(nameArg).toBe(APEX);
    // apex-only, D-13: the created name is never a catch-everything wildcard.
    expect(nameArg.startsWith('*')).toBe(false);
    expect(deleteDnsRecordMock).not.toHaveBeenCalled();
  });

  it('a 403 on the collision read -> scope-missing step:"dns" with the DNS row failed', async () => {
    listDnsByNameMock.mockRejectedValue(cfErr(403));

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result.kind).toBe('scope-missing');
    if (result.kind === 'scope-missing') {
      expect(result.step).toBe('dns');
      const dnsRow = result.rows.find((r) => r.scope === 'dns');
      expect(dnsRow).toMatchObject({ ok: false, missingLabel: 'Zone · DNS · Edit' });
    }
  });

  it('a 403 on createDnsCname -> scope-missing step:"dns"', async () => {
    createDnsCnameMock.mockRejectedValue(cfErr(403));

    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result.kind).toBe('scope-missing');
    if (result.kind === 'scope-missing') expect(result.step).toBe('dns');
  });
});

describe('provisionTunnelAndDns — non-secret facts + Screen-5 summary (D-16 / D-17)', () => {
  it('persists all five chosen-zone facts (tunnelId/accountId/zoneId/zoneName/subLabel)', async () => {
    await provisionTunnelAndDns({ username: 'drampa' });

    expect(setStateMock).toHaveBeenCalledWith({
      tunnelId: 'tun-new',
      accountId: 'acct-1',
      zoneId: 'zone-1',
      zoneName: 'example.com',
      subLabel: 'liv',
    });
  });

  it('returns the ready summary with address=`<sub>.<zone>`, the tunnel name, and the apex-only records label', async () => {
    const result = await provisionTunnelAndDns({ username: 'drampa' });

    expect(result).toEqual({
      kind: 'ready',
      summary: { address: APEX, tunnelName: DERIVED_NAME, recordsLabel: '1 DNS record + tunnel route' },
    });
  });
});

describe('provisionTunnelAndDns — apex-only source invariant (D-13)', () => {
  it('the cf-provision source never constructs a wildcard host name', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../src/main/cloudflare/cf-provision.ts', import.meta.url)),
      'utf8'
    );
    // A wildcard-host literal (asterisk-dot) must appear nowhere in the module.
    expect(src.includes('*' + '.')).toBe(false);
  });
});
