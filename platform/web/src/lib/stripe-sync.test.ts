/**
 * Unit tests for the pure stale-live detector behind the July '26 webhook-loss
 * healing (isStoredStale): a stored LIVE subscription_status whose own clock
 * has run out is the one divergence we can detect locally and must re-check
 * against Stripe.
 *
 *   cd platform/web
 *   DATABASE_URL="postgres://u:p@127.0.0.1:5432/x" npx tsx --test src/lib/stripe-sync.test.ts
 *
 * (Dummy DATABASE_URL only because stripe-sync imports the lazy db pool at
 * module load; the tested pure function never queries.)
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { isStoredStale } from './stripe-sync.js';

const NOW = new Date('2026-07-06T12:00:00Z');
const PAST = new Date('2026-07-04T08:27:39Z'); // alpo's real frozen trial end
const FUTURE = new Date('2026-07-07T11:00:45Z'); // mrpink's genuine trial end

function row(overrides: Record<string, unknown> = {}) {
  return {
    subscription_status: null,
    current_period_end: null,
    past_due_since: null,
    ...overrides,
  } as Parameters<typeof isStoredStale>[0];
}

describe('isStoredStale — trialing/active period check', () => {
  it('trialing with period end in the past IS stale (the frozen-trial case)', () => {
    assert.equal(isStoredStale(row({ subscription_status: 'trialing', current_period_end: PAST }), NOW), true);
  });

  it('trialing with period end in the future is NOT stale', () => {
    assert.equal(isStoredStale(row({ subscription_status: 'trialing', current_period_end: FUTURE }), NOW), false);
  });

  it('active with period end in the past IS stale (missed renewal/cancel mirror)', () => {
    assert.equal(isStoredStale(row({ subscription_status: 'active', current_period_end: PAST }), NOW), true);
  });

  it('active with period end in the future is NOT stale', () => {
    assert.equal(isStoredStale(row({ subscription_status: 'active', current_period_end: FUTURE }), NOW), false);
  });

  it('a live status with NO period end is NOT stale (no local deadline to compare)', () => {
    assert.equal(isStoredStale(row({ subscription_status: 'trialing' }), NOW), false);
    assert.equal(isStoredStale(row({ subscription_status: 'active' }), NOW), false);
  });
});

describe('isStoredStale — past_due grace window', () => {
  it('past_due beyond the grace window IS stale', () => {
    const since = new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000); // 4d > 3d grace
    assert.equal(isStoredStale(row({ subscription_status: 'past_due', past_due_since: since }), NOW), true);
  });

  it('past_due inside the grace window is NOT stale', () => {
    const since = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000); // 1d < 3d grace
    assert.equal(isStoredStale(row({ subscription_status: 'past_due', past_due_since: since }), NOW), false);
  });

  it('past_due with no past_due_since is NOT stale (clock never started)', () => {
    assert.equal(isStoredStale(row({ subscription_status: 'past_due' }), NOW), false);
  });
});

describe('isStoredStale — non-live statuses never stale', () => {
  for (const s of [null, 'canceled', 'unpaid', 'incomplete', 'paused']) {
    it(`${s ?? 'null'} is never stale, even with a past period end`, () => {
      assert.equal(isStoredStale(row({ subscription_status: s, current_period_end: PAST }), NOW), false);
    });
  }
});
