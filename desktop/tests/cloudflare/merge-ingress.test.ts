import { describe, it, expect } from 'vitest';
import { mergeIngress } from '../../src/main/cloudflare/merge-ingress';

/**
 * Flat table (mirrors tests/platform/decide-route.test.ts). The load-bearing
 * property (D-15): a read-modify-write ingress merge that ADDS the apex host and
 * keeps a single trailing catch-all WITHOUT clobbering per-app rules a prior box
 * install pushed — the documented "installed but 404s" lost-update bug cannot
 * recur through this pure fn.
 */
describe('mergeIngress', () => {
  it('adds the apex host + a trailing catch-all to an empty ingress', () => {
    expect(mergeIngress([], 'liv.example.com')).toEqual([
      { hostname: 'liv.example.com', service: 'http://localhost:80' },
      { service: 'http_status:404' },
    ]);
  });

  it('PRESERVES an existing per-app rule while adding the apex (D-15 no-clobber)', () => {
    const current = [
      { hostname: 'chat-liv.example.com', service: 'http://localhost:80' },
      { service: 'http_status:404' },
    ];
    const next = mergeIngress(current, 'liv.example.com');
    // the pre-existing per-app rule survives verbatim
    expect(next).toContainEqual({ hostname: 'chat-liv.example.com', service: 'http://localhost:80' });
    // the apex rule was added
    expect(next).toContainEqual({ hostname: 'liv.example.com', service: 'http://localhost:80' });
    // exact shape/order: existing app rule, then apex, then catch-all last
    expect(next).toEqual([
      { hostname: 'chat-liv.example.com', service: 'http://localhost:80' },
      { hostname: 'liv.example.com', service: 'http://localhost:80' },
      { service: 'http_status:404' },
    ]);
  });

  it('keeps the catch-all LAST and UNIQUE', () => {
    const current = [
      { hostname: 'chat-liv.example.com', service: 'http://localhost:80' },
      { service: 'http_status:404' },
    ];
    const next = mergeIngress(current, 'liv.example.com');
    const catchAlls = next.filter((i) => i.service === 'http_status:404' && !i.hostname);
    expect(catchAlls).toHaveLength(1);
    expect(next[next.length - 1]).toEqual({ service: 'http_status:404' });
  });

  it('is idempotent — merging the same apex twice does not duplicate the apex rule (dedup by hostname)', () => {
    const once = mergeIngress([], 'liv.example.com');
    const twice = mergeIngress(once, 'liv.example.com');
    expect(twice).toEqual(once);
    expect(twice.filter((i) => i.hostname === 'liv.example.com')).toHaveLength(1);
  });

  it('strips a pre-existing catch-all from the MIDDLE and re-appends it at the tail (never left mid-array)', () => {
    const current = [
      { service: 'http_status:404' }, // misplaced catch-all (first)
      { hostname: 'chat-liv.example.com', service: 'http://localhost:80' },
    ];
    const next = mergeIngress(current, 'liv.example.com');
    expect(next[next.length - 1]).toEqual({ service: 'http_status:404' });
    expect(next.filter((i) => i.service === 'http_status:404' && !i.hostname)).toHaveLength(1);
    expect(next).toContainEqual({ hostname: 'chat-liv.example.com', service: 'http://localhost:80' });
    expect(next).toEqual([
      { hostname: 'chat-liv.example.com', service: 'http://localhost:80' },
      { hostname: 'liv.example.com', service: 'http://localhost:80' },
      { service: 'http_status:404' },
    ]);
  });
});
