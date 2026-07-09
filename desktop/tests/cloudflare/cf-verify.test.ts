import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * cf-verify.test.ts mocks the CF client (cf-client), the vault (secrets-vault),
 * and the state store (state-store) — the three IO collaborators cf-verify
 * composes — while using the REAL pure decision cores (decide-scope-verdict,
 * validate-sub-label) and the REAL CfApiError class (cf-http is NOT mocked, so
 * `err instanceof CfApiError` matches across the boundary). This proves the
 * orchestration wiring end-to-end without touching the network, the DPAPI
 * vault, or disk.
 */

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/main/cloudflare/cf-client', () => ({
  verifyToken: vi.fn(),
  getZones: vi.fn(),
  getZone: vi.fn(),
  listTunnels: vi.fn(),
  listDnsByName: vi.fn(),
}));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultGet: vi.fn(),
  vaultSet: vi.fn(),
}));

vi.mock('../../src/main/storage/state-store', () => ({
  patchState: vi.fn(),
}));

import { CfApiError } from '../../src/main/cloudflare/cf-http';
import {
  verifyToken,
  getZones,
  getZone,
  listTunnels,
  listDnsByName,
} from '../../src/main/cloudflare/cf-client';
import { vaultGet, vaultSet } from '../../src/main/storage/secrets-vault';
import { patchState } from '../../src/main/storage/state-store';
import {
  verifyAndProbe,
  getZonesFromVault,
  selectDomainProbe,
  recheckZone,
  __resetVerifyCache,
} from '../../src/main/cloudflare/cf-verify';
import type { Zone, DnsRecordList } from '../../src/main/cloudflare/cf-schemas';

const verifyTokenMock = vi.mocked(verifyToken);
const getZonesMock = vi.mocked(getZones);
const getZoneMock = vi.mocked(getZone);
const listTunnelsMock = vi.mocked(listTunnels);
const listDnsByNameMock = vi.mocked(listDnsByName);
const vaultGetMock = vi.mocked(vaultGet);
const vaultSetMock = vi.mocked(vaultSet);
// The state store exposes patchState; cf-verify imports it as `setState` (the
// name the plan's persistence step + acceptance grep use). Assert on it here
// under that intent-revealing alias.
const setStateMock = vi.mocked(patchState);

const TOKEN = 'cf-token-abc123';

/** A terminal Cloudflare API error at a given HTTP status (0 = network/transport). */
function cfErr(status: number): CfApiError {
  return new CfApiError({
    message: `boom ${status}`,
    status,
    cfErrorCode: 9109,
    cfMessage: 'overloaded code',
    endpoint: 'GET /x',
  });
}

/** A minimal parsed Zone (as cf-client.getZones would return). */
function zone(over: Partial<Zone> = {}): Zone {
  return {
    id: 'zone-1',
    name: 'example.com',
    status: 'active',
    account: { id: 'acct-1' },
    ...over,
  } as Zone;
}

beforeEach(() => {
  verifyTokenMock.mockReset();
  getZonesMock.mockReset();
  getZoneMock.mockReset();
  listTunnelsMock.mockReset();
  listDnsByNameMock.mockReset();
  vaultGetMock.mockReset();
  vaultSetMock.mockReset();
  setStateMock.mockReset();
  __resetVerifyCache();
});

describe('verifyAndProbe (staged read probes -> per-scope verdict)', () => {
  it('a dead token short-circuits to token-invalid with NO vault write and NO scope probes', async () => {
    verifyTokenMock.mockResolvedValue({ alive: false });

    const result = await verifyAndProbe(TOKEN);

    expect(result).toEqual({ kind: 'token-invalid' });
    expect(vaultSetMock).not.toHaveBeenCalled();
    expect(getZonesMock).not.toHaveBeenCalled();
    expect(listTunnelsMock).not.toHaveBeenCalled();
  });

  it('all probes pass -> verified, and stores the token to the vault exactly once', async () => {
    verifyTokenMock.mockResolvedValue({ alive: true });
    getZonesMock.mockResolvedValue([zone()]);
    listTunnelsMock.mockResolvedValue([]);

    const result = await verifyAndProbe(TOKEN);

    expect(result.kind).toBe('verified');
    expect(vaultSetMock).toHaveBeenCalledTimes(1);
    expect(vaultSetMock).toHaveBeenCalledWith('cfToken', TOKEN);
    // stage-2 tunnel probe uses the FIRST visible zone's account id.
    expect(listTunnelsMock).toHaveBeenCalledWith(TOKEN, 'acct-1');
  });

  it('a zone-scope 403 (after verify passed) -> scope-missing with the Zone·Read row failed, no vault write', async () => {
    verifyTokenMock.mockResolvedValue({ alive: true });
    getZonesMock.mockRejectedValue(cfErr(403));

    const result = await verifyAndProbe(TOKEN);

    expect(result.kind).toBe('scope-missing');
    if (result.kind === 'scope-missing') {
      const zoneRow = result.rows.find((r) => r.scope === 'zone');
      expect(zoneRow).toMatchObject({ ok: false, missingLabel: 'Zone · Zone · Read' });
    }
    // zone probe failed first -> the tunnel probe is skipped (no account id).
    expect(listTunnelsMock).not.toHaveBeenCalled();
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('a tunnel-scope 403 (after a good zone probe) -> scope-missing with the Tunnel row failed, no vault write', async () => {
    verifyTokenMock.mockResolvedValue({ alive: true });
    getZonesMock.mockResolvedValue([zone()]);
    listTunnelsMock.mockRejectedValue(cfErr(403));

    const result = await verifyAndProbe(TOKEN);

    expect(result.kind).toBe('scope-missing');
    if (result.kind === 'scope-missing') {
      const tunnelRow = result.rows.find((r) => r.scope === 'tunnel');
      expect(tunnelRow).toMatchObject({ ok: false, missingLabel: 'Account · Cloudflare Tunnel · Edit' });
    }
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('a transport failure on the zone probe -> network verdict (never a false "token invalid"), no vault write', async () => {
    verifyTokenMock.mockResolvedValue({ alive: true });
    getZonesMock.mockRejectedValue(cfErr(0));

    const result = await verifyAndProbe(TOKEN);

    expect(result).toEqual({ kind: 'network' });
    expect(vaultSetMock).not.toHaveBeenCalled();
  });

  it('a transport failure at the token-alive gate (verifyToken re-throws) -> network, no vault write', async () => {
    verifyTokenMock.mockRejectedValue(cfErr(500));

    const result = await verifyAndProbe(TOKEN);

    expect(result).toEqual({ kind: 'network' });
    expect(getZonesMock).not.toHaveBeenCalled();
    expect(vaultSetMock).not.toHaveBeenCalled();
  });
});

describe('getZonesFromVault (secret-free zone list; zero zones never a dead end)', () => {
  it('returns a secret-free {id,name,status} list from the verify cache (no re-fetch, no account id)', async () => {
    verifyTokenMock.mockResolvedValue({ alive: true });
    getZonesMock.mockResolvedValue([zone({ id: 'z9', name: 'mybox.dev', status: 'pending' })]);
    listTunnelsMock.mockResolvedValue([]);
    await verifyAndProbe(TOKEN); // populates the cache

    getZonesMock.mockClear();
    const result = await getZonesFromVault();

    expect(result).toEqual({ ok: true, zones: [{ id: 'z9', name: 'mybox.dev', status: 'pending' }] });
    // served from cache — no second network call, and no account id leaked.
    expect(getZonesMock).not.toHaveBeenCalled();
  });

  it('zero zones on a verified token -> ok:true with an empty list (D-09 guided path, not an error)', async () => {
    vaultGetMock.mockResolvedValue(TOKEN);
    getZonesMock.mockResolvedValue([]);

    const result = await getZonesFromVault();

    expect(result).toEqual({ ok: true, zones: [] });
  });

  it('no vault token -> unauthorized', async () => {
    vaultGetMock.mockResolvedValue(null);

    const result = await getZonesFromVault();

    expect(result).toEqual({ ok: false, reason: 'unauthorized' });
  });

  it('a 403 while (re)fetching zones -> unauthorized', async () => {
    vaultGetMock.mockResolvedValue(TOKEN);
    getZonesMock.mockRejectedValue(cfErr(403));

    const result = await getZonesFromVault();

    expect(result).toEqual({ ok: false, reason: 'unauthorized' });
  });
});

/** Seeds the in-process zone cache (via a verified verifyAndProbe) and arms the vault to return the token. */
async function seedCacheWith(z: Zone): Promise<void> {
  verifyTokenMock.mockResolvedValue({ alive: true });
  getZonesMock.mockResolvedValue([z]);
  listTunnelsMock.mockResolvedValue([]);
  await verifyAndProbe(TOKEN);
  verifyTokenMock.mockClear();
  getZonesMock.mockClear();
  listTunnelsMock.mockClear();
  vaultSetMock.mockClear();
  vaultGetMock.mockResolvedValue(TOKEN);
}

/** A parsed DNS record (as cf-client.listDnsByName would return) pointing at `content`. */
function dnsRecord(content: string): DnsRecordList[number] {
  return { id: 'rec-1', name: 'liv.example.com', type: 'CNAME', content, proxied: true };
}

describe('selectDomainProbe (main-side sub-label gate + DNS-scope proof + D-08 collision read)', () => {
  it('a dotted sub-label is rejected MAIN-SIDE before any vault read or CF call (T-03-06)', async () => {
    await seedCacheWith(zone());

    const result = await selectDomainProbe('zone-1', 'foo.bar');

    expect(result).toEqual({ kind: 'network' });
    // the authoritative gate ran BEFORE any hostname build / CF call.
    expect(listDnsByNameMock).not.toHaveBeenCalled();
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it('an illegal leading/trailing-hyphen sub-label (-x-) is rejected main-side, listDnsByName NOT called', async () => {
    await seedCacheWith(zone());

    const result = await selectDomainProbe('zone-1', '-x-');

    expect(result).toEqual({ kind: 'network' });
    expect(listDnsByNameMock).not.toHaveBeenCalled();
  });

  it('a DNS-scope 403 on the chosen zone -> scope-missing with the DNS row failed (no facts persisted)', async () => {
    await seedCacheWith(zone());
    listDnsByNameMock.mockRejectedValue(cfErr(403));

    const result = await selectDomainProbe('zone-1', 'liv');

    expect(result.kind).toBe('scope-missing');
    if (result.kind === 'scope-missing') {
      const dnsRow = result.rows.find((r) => r.scope === 'dns');
      expect(dnsRow).toMatchObject({ ok: false, missingLabel: 'Zone · DNS · Edit' });
    }
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it('an existing record pointing elsewhere -> collision (D-08), facts still persisted for take-over', async () => {
    await seedCacheWith(zone());
    listDnsByNameMock.mockResolvedValue([dnsRecord('other.example.com')] as DnsRecordList);

    const result = await selectDomainProbe('zone-1', 'liv');

    expect(result).toEqual({ kind: 'collision' });
    // facts persisted BEFORE the collision branch so provision has account.id on the take-over path.
    expect(setStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: 'zone-1', subLabel: 'liv', accountId: 'acct-1', zoneName: 'example.com' })
    );
  });

  it('a record already pointing at our tunnel -> ready (silent resume) + persists {zoneId, subLabel, accountId}', async () => {
    await seedCacheWith(zone());
    listDnsByNameMock.mockResolvedValue([dnsRecord('abc123.cfargotunnel.com')] as DnsRecordList);

    const result = await selectDomainProbe('zone-1', 'liv');

    expect(result).toEqual({ kind: 'ready' });
    expect(setStateMock).toHaveBeenCalledTimes(1);
    expect(setStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: 'zone-1', subLabel: 'liv', accountId: 'acct-1' })
    );
  });

  it('no existing record -> ready, and persists the chosen-zone facts', async () => {
    await seedCacheWith(zone());
    listDnsByNameMock.mockResolvedValue([]);

    const result = await selectDomainProbe('zone-1', 'liv');

    expect(result).toEqual({ kind: 'ready' });
    expect(setStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct-1' })
    );
  });

  it('a DNS-scope transport failure -> network (never a false scope-missing)', async () => {
    await seedCacheWith(zone());
    listDnsByNameMock.mockRejectedValue(cfErr(0));

    const result = await selectDomainProbe('zone-1', 'liv');

    expect(result).toEqual({ kind: 'network' });
  });

  it('a zone id not in the cache -> network defensively, no CF call', async () => {
    await seedCacheWith(zone({ id: 'zone-1' }));

    const result = await selectDomainProbe('some-other-zone', 'liv');

    expect(result).toEqual({ kind: 'network' });
    expect(listDnsByNameMock).not.toHaveBeenCalled();
  });

  it('no vault token -> network defensively', async () => {
    await seedCacheWith(zone());
    vaultGetMock.mockResolvedValue(null);

    const result = await selectDomainProbe('zone-1', 'liv');

    expect(result).toEqual({ kind: 'network' });
    expect(listDnsByNameMock).not.toHaveBeenCalled();
  });
});

describe('recheckZone (CF-04 active vs pending + live name_servers)', () => {
  it('an active zone -> { kind: "active" }', async () => {
    vaultGetMock.mockResolvedValue(TOKEN);
    getZoneMock.mockResolvedValue({ status: 'active', nameServers: ['x.ns.cloudflare.com', 'y.ns.cloudflare.com'] });

    const result = await recheckZone('zone-1');

    expect(result).toEqual({ kind: 'active' });
  });

  it('a pending zone -> { kind: "pending" } carrying the live name_servers', async () => {
    vaultGetMock.mockResolvedValue(TOKEN);
    getZoneMock.mockResolvedValue({ status: 'pending', nameServers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] });

    const result = await recheckZone('zone-1');

    expect(result).toEqual({ kind: 'pending', nameServers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] });
  });

  it('no vault token -> network', async () => {
    vaultGetMock.mockResolvedValue(null);

    const result = await recheckZone('zone-1');

    expect(result).toEqual({ kind: 'network' });
    expect(getZoneMock).not.toHaveBeenCalled();
  });

  it('a transport failure -> network', async () => {
    vaultGetMock.mockResolvedValue(TOKEN);
    getZoneMock.mockRejectedValue(cfErr(0));

    const result = await recheckZone('zone-1');

    expect(result).toEqual({ kind: 'network' });
  });
});
