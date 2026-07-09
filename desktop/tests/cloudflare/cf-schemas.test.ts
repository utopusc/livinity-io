import { describe, it, expect } from 'vitest';
import {
  ZoneSchema,
  ZoneListSchema,
  ZoneDetailSchema,
  VerifySchema,
  IngressEntrySchema,
  ConfigurationsSchema,
  DnsRecordSchema,
  DnsRecordListSchema,
  TunnelSchema,
  TunnelListSchema,
} from '../../src/main/cloudflare/cf-schemas';

describe('ZoneSchema', () => {
  it('parses a real CF zone (id/name/status/account.id) and IGNORES extra fields (.passthrough)', () => {
    const parsed = ZoneSchema.safeParse({
      id: 'abc123',
      name: 'example.com',
      status: 'active',
      account: { id: 'acct1', name: 'My Account' },
      name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
      // extra CF-added fields that must not fail parsing:
      paused: false,
      type: 'full',
      created_on: '2024-01-01T00:00:00Z',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe('abc123');
      expect(parsed.data.name).toBe('example.com');
      expect(parsed.data.status).toBe('active');
      expect(parsed.data.account.id).toBe('acct1');
      expect(parsed.data.name_servers).toEqual(['ns1.cloudflare.com', 'ns2.cloudflare.com']);
    }
  });

  it('accepts a zone with only account.id (account.name optional)', () => {
    const parsed = ZoneSchema.safeParse({
      id: 'z1',
      name: 'example.com',
      status: 'pending',
      account: { id: 'acct1' },
    });
    expect(parsed.success).toBe(true);
  });

  it('degrades an UNKNOWN status value to "pending" (.catch), never throws', () => {
    const parsed = ZoneSchema.safeParse({
      id: 'z1',
      name: 'example.com',
      status: 'some-brand-new-status-cf-invented',
      account: { id: 'acct1' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('pending');
    }
  });

  it('rejects a hostile shape missing required id (still safeParse, never throws)', () => {
    const parsed = ZoneSchema.safeParse({ name: 'example.com', status: 'active', account: { id: 'a' } });
    expect(parsed.success).toBe(false);
  });

  it('ZoneListSchema parses an array of zones', () => {
    const parsed = ZoneListSchema.safeParse([
      { id: 'z1', name: 'a.com', status: 'active', account: { id: 'a1' } },
      { id: 'z2', name: 'b.com', status: 'pending', account: { id: 'a1' } },
    ]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toHaveLength(2);
    }
  });
});

describe('ZoneDetailSchema', () => {
  it('defaults name_servers to [] when absent (free-plan-safe)', () => {
    const parsed = ZoneDetailSchema.safeParse({ id: 'z1', name: 'example.com', status: 'active' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name_servers).toEqual([]);
    }
  });

  it('keeps the provided name_servers[] and passes through extra fields', () => {
    const parsed = ZoneDetailSchema.safeParse({
      id: 'z1',
      name: 'example.com',
      status: 'pending',
      name_servers: ['gina.ns.cloudflare.com', 'rob.ns.cloudflare.com'],
      original_name_servers: ['ns1.registrar.com'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name_servers).toEqual(['gina.ns.cloudflare.com', 'rob.ns.cloudflare.com']);
    }
  });

  it('degrades an unknown status to "pending" on the detail schema too', () => {
    const parsed = ZoneDetailSchema.safeParse({ id: 'z1', name: 'example.com', status: 'weird' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('pending');
    }
  });
});

describe('VerifySchema', () => {
  it.each(['active', 'disabled', 'expired'] as const)('parses result.status = %s', (status) => {
    const parsed = VerifySchema.safeParse({ result: { id: 'tok1', status } });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.result.status).toBe(status);
    }
  });

  it('accepts a result without an id (id optional)', () => {
    const parsed = VerifySchema.safeParse({ result: { status: 'active' } });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown token status (a hostile/unexpected verify shape fails safeParse, never throws)', () => {
    const parsed = VerifySchema.safeParse({ result: { status: 'revoked' } });
    expect(parsed.success).toBe(false);
  });
});

describe('ConfigurationsSchema', () => {
  it('tolerates a missing config.ingress (returns undefined, caller defaults to [])', () => {
    const parsed = ConfigurationsSchema.safeParse({ config: {} });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.config?.ingress).toBeUndefined();
    }
  });

  it('tolerates an entirely missing config object', () => {
    const parsed = ConfigurationsSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.config).toBeUndefined();
    }
  });

  it('parses an ingress array of {hostname?, service}', () => {
    const parsed = ConfigurationsSchema.safeParse({
      config: {
        ingress: [
          { hostname: 'liv.example.com', service: 'http://localhost:80' },
          { service: 'http_status:404' },
        ],
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.config?.ingress).toHaveLength(2);
      expect(parsed.data.config?.ingress?.[1].hostname).toBeUndefined();
    }
  });
});

describe('IngressEntrySchema', () => {
  it('requires service, hostname optional', () => {
    expect(IngressEntrySchema.safeParse({ service: 'http_status:404' }).success).toBe(true);
    expect(IngressEntrySchema.safeParse({ hostname: 'x', service: 'http://localhost:80' }).success).toBe(true);
    expect(IngressEntrySchema.safeParse({ hostname: 'x' }).success).toBe(false);
  });
});

describe('DnsRecordSchema', () => {
  it('parses a dns_record list item and passes through extra fields', () => {
    const parsed = DnsRecordSchema.safeParse({
      id: 'rec1',
      name: 'liv.example.com',
      type: 'CNAME',
      content: 'tunnelid.cfargotunnel.com',
      proxied: true,
      ttl: 1,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.proxied).toBe(true);
    }
  });

  it('accepts a record without proxied (optional)', () => {
    const parsed = DnsRecordSchema.safeParse({ id: 'r', name: 'n', type: 'A', content: '1.2.3.4' });
    expect(parsed.success).toBe(true);
  });

  it('DnsRecordListSchema parses an array', () => {
    const parsed = DnsRecordListSchema.safeParse([
      { id: 'r', name: 'n', type: 'CNAME', content: 'c' },
    ]);
    expect(parsed.success).toBe(true);
  });
});

describe('TunnelSchema', () => {
  it('parses a tunnel list item {id,name} and passes through extra fields', () => {
    const parsed = TunnelSchema.safeParse({
      id: 't1',
      name: 'livos-bruce',
      created_at: '2024-01-01T00:00:00Z',
      deleted_at: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe('t1');
      expect(parsed.data.name).toBe('livos-bruce');
    }
  });

  it('TunnelListSchema parses an array', () => {
    const parsed = TunnelListSchema.safeParse([{ id: 't1', name: 'livos-bruce' }]);
    expect(parsed.success).toBe(true);
  });
});
