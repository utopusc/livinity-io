/**
 * Unit tests for the DNS-reconciler classifier (Phase 283 QUOTA-03).
 *
 * Pure logic — no CF/DB — so this runs with no env gating:
 *
 *   cd platform/web
 *   npx tsx --test src/lib/dns-reconcile.test.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  classifyOrphans,
  parseTunnelId,
  TUNNEL_CONTENT_SUFFIX,
  type ClassifyInput,
} from './dns-reconcile.js';

const NOW = Date.parse('2026-06-17T12:00:00.000Z');
const GRACE_MS = 24 * 60 * 60 * 1000; // 24h

const TWO_DAYS_AGO = '2026-06-15T12:00:00.000Z'; // aged
const SIX_HOURS_AGO = '2026-06-17T06:00:00.000Z'; // within grace

// Minimal CF DnsRecord factory.
function rec(over: {
  id: string;
  name: string;
  content: string;
  type?: string;
  created_on?: string;
}) {
  return {
    id: over.id,
    name: over.name,
    type: over.type ?? 'CNAME',
    content: over.content,
    created_on: over.created_on,
  };
}

function tunnelContent(tunnelId: string): string {
  return `${tunnelId}${TUNNEL_CONTENT_SUFFIX}`;
}

function classify(records: ReturnType<typeof rec>[], over: Partial<ClassifyInput> = {}) {
  return classifyOrphans({
    records,
    knownRecordIds: new Set<string>(),
    knownTunnelIds: new Set<string>(),
    now: NOW,
    graceMs: GRACE_MS,
    ...over,
  });
}

describe('parseTunnelId', () => {
  it('extracts the tunnel id from a cfargotunnel CNAME', () => {
    assert.equal(parseTunnelId('abc123.cfargotunnel.com'), 'abc123');
  });
  it('returns null for non-tunnel content', () => {
    assert.equal(parseTunnelId('cname.vercel-dns.com'), null);
    assert.equal(parseTunnelId('1.2.3.4'), null);
  });
  it('returns null for an empty tunnel id (bare suffix)', () => {
    assert.equal(parseTunnelId('.cfargotunnel.com'), null);
  });
});

describe('classifyOrphans — scope gates', () => {
  it('ignores non-CNAME records entirely (apex A, MX, …)', () => {
    const r = classify([
      rec({ id: 'a1', name: 'livinity.io', type: 'A', content: '76.76.21.21', created_on: TWO_DAYS_AGO }),
      rec({ id: 'mx1', name: 'livinity.io', type: 'MX', content: 'mx.example.com', created_on: TWO_DAYS_AGO }),
    ]);
    assert.equal(r.total, 2);
    assert.equal(r.tunnelBackedTotal, 0);
    assert.equal(r.orphans.length, 0);
  });

  it('ignores CNAMEs that are not tunnel-backed (Vercel/verification)', () => {
    const r = classify([
      rec({ id: 'c1', name: 'www.livinity.io', content: 'cname.vercel-dns.com', created_on: TWO_DAYS_AGO }),
    ]);
    assert.equal(r.tunnelBackedTotal, 0);
    assert.equal(r.orphans.length, 0);
  });

  it('counts a DB-tracked tunnel CNAME as legit (not an orphan)', () => {
    const r = classify(
      [rec({ id: 'live1', name: 'lucy.livinity.io', content: tunnelContent('tun-lucy'), created_on: TWO_DAYS_AGO })],
      { knownRecordIds: new Set(['live1']), knownTunnelIds: new Set(['tun-lucy']) },
    );
    assert.equal(r.tunnelBackedTotal, 1);
    assert.equal(r.orphans.length, 0);
  });
});

describe('classifyOrphans — orphan reasons', () => {
  it('flags an untracked record on a LIVE tunnel as untracked-on-live-tunnel', () => {
    const r = classify(
      [rec({ id: 'orph1', name: 'radarr-lucy.livinity.io', content: tunnelContent('tun-lucy'), created_on: TWO_DAYS_AGO })],
      { knownRecordIds: new Set(['some-other-id']), knownTunnelIds: new Set(['tun-lucy']) },
    );
    assert.equal(r.orphans.length, 1);
    assert.equal(r.orphans[0].reason, 'untracked-on-live-tunnel');
    assert.equal(r.orphans[0].tunnelId, 'tun-lucy');
  });

  it('flags a record whose tunnel matches no live user as deleted-user-tunnel', () => {
    const r = classify(
      [rec({ id: 'orph2', name: 'jack.livinity.io', content: tunnelContent('tun-jack'), created_on: TWO_DAYS_AGO })],
      { knownTunnelIds: new Set(['tun-lucy']) }, // tun-jack absent
    );
    assert.equal(r.orphans.length, 1);
    assert.equal(r.orphans[0].reason, 'deleted-user-tunnel');
  });
});

describe('classifyOrphans — grace window (deletion eligibility)', () => {
  it('marks a record older than the grace window as aged (deletable)', () => {
    const r = classify([
      rec({ id: 'old', name: 'old.livinity.io', content: tunnelContent('t1'), created_on: TWO_DAYS_AGO }),
    ]);
    assert.equal(r.orphans.length, 1);
    assert.equal(r.orphans[0].aged, true);
    assert.equal(r.agedOrphans.length, 1);
  });

  it('does NOT mark a fresh record (within grace) as aged — never raced', () => {
    const r = classify([
      rec({ id: 'young', name: 'young.livinity.io', content: tunnelContent('t2'), created_on: SIX_HOURS_AGO }),
    ]);
    assert.equal(r.orphans.length, 1, 'still reported');
    assert.equal(r.orphans[0].aged, false);
    assert.equal(r.agedOrphans.length, 0, 'but not deletable');
  });

  it('treats a missing created_on as NOT aged (reported, never auto-deleted)', () => {
    const r = classify([
      rec({ id: 'nodate', name: 'nodate.livinity.io', content: tunnelContent('t3') }),
    ]);
    assert.equal(r.orphans.length, 1);
    assert.equal(r.orphans[0].ageMs, null);
    assert.equal(r.orphans[0].aged, false);
    assert.equal(r.agedOrphans.length, 0);
  });

  it('treats a garbled created_on as NOT aged', () => {
    const r = classify([
      rec({ id: 'bad', name: 'bad.livinity.io', content: tunnelContent('t4'), created_on: 'not-a-date' }),
    ]);
    assert.equal(r.orphans[0].ageMs, null);
    assert.equal(r.orphans[0].aged, false);
  });
});

describe('classifyOrphans — mixed zone tallies', () => {
  it('totals records, tunnel-backed, orphans and aged orphans correctly', () => {
    const r = classify(
      [
        rec({ id: 'apexA', name: 'livinity.io', type: 'A', content: '76.76.21.21', created_on: TWO_DAYS_AGO }),
        rec({ id: 'live1', name: 'lucy.livinity.io', content: tunnelContent('tun-lucy'), created_on: TWO_DAYS_AGO }),
        rec({ id: 'orphOld', name: 'ghost.livinity.io', content: tunnelContent('tun-ghost'), created_on: TWO_DAYS_AGO }),
        rec({ id: 'orphNew', name: 'fresh-lucy.livinity.io', content: tunnelContent('tun-lucy'), created_on: SIX_HOURS_AGO }),
      ],
      { knownRecordIds: new Set(['live1']), knownTunnelIds: new Set(['tun-lucy']) },
    );
    assert.equal(r.total, 4);
    assert.equal(r.tunnelBackedTotal, 3); // live1 + orphOld + orphNew
    assert.equal(r.orphans.length, 2); // orphOld + orphNew
    assert.equal(r.agedOrphans.length, 1); // only orphOld
    assert.equal(r.agedOrphans[0].id, 'orphOld');
  });
});
