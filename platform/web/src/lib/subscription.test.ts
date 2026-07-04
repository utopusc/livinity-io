/**
 * Unit tests for the subscription access gate's pure decision core, focused on
 * the free_byod (BYO domain + BYO Cloudflare) tier and proving the paid/legacy
 * paths are unchanged by it.
 *
 *   cd platform/web
 *   DATABASE_URL="postgres://u:p@127.0.0.1:5432/x" npx tsx --test src/lib/subscription.test.ts
 *
 * (A dummy DATABASE_URL is required only because subscription.ts imports the lazy
 * db pool at module load; the tested pure function never queries.)
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { decideSubscriptionAccess } from './subscription.js';

const NOW = new Date('2026-07-04T00:00:00Z');
const FUTURE = new Date('2026-08-01T00:00:00Z');

// Minimal row builder — undefined fields default to the "never subscribed" shape.
function row(overrides: Record<string, unknown> = {}) {
  return {
    subscription_status: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    legacy_free: null,
    suspended_at: null,
    comp_until: null,
    free_byod: null,
    ...overrides,
  } as Parameters<typeof decideSubscriptionAccess>[0];
}

describe('decideSubscriptionAccess — free_byod tier', () => {
  it('grants access (active + plan=free) to a free_byod account with no subscription', () => {
    const r = decideSubscriptionAccess(row({ free_byod: true }), NOW);
    assert.equal(r.active, true);
    assert.equal(r.plan, 'free');
    assert.equal(r.legacyFree, false); // distinct from grandfathered legacy_free
  });

  it('a SUSPENDED free_byod account is still blocked (suspension overrides everything)', () => {
    const r = decideSubscriptionAccess(row({ free_byod: true, suspended_at: new Date('2026-06-01') }), NOW);
    assert.equal(r.active, false);
    assert.equal(r.reason, 'suspended');
  });

  it('treats a missing free_byod column (undefined) as no free access', () => {
    const r = decideSubscriptionAccess(row({ free_byod: undefined }), NOW);
    assert.equal(r.active, false);
    assert.equal(r.reason, 'no_subscription');
  });
});

describe('decideSubscriptionAccess — paid/legacy paths unchanged by free_byod', () => {
  it('a trialing subscriber (free_byod=false) still has access', () => {
    const r = decideSubscriptionAccess(row({ subscription_status: 'trialing', current_period_end: FUTURE, free_byod: false }), NOW);
    assert.equal(r.active, true);
    assert.equal(r.plan, 'trialing');
  });

  it('an active subscriber (free_byod=false) still has access', () => {
    const r = decideSubscriptionAccess(row({ subscription_status: 'active', current_period_end: FUTURE, free_byod: false }), NOW);
    assert.equal(r.active, true);
    assert.equal(r.plan, 'active');
  });

  it('a legacy_free account still has access (plan=free, legacyFree=true)', () => {
    const r = decideSubscriptionAccess(row({ legacy_free: true }), NOW);
    assert.equal(r.active, true);
    assert.equal(r.plan, 'free');
    assert.equal(r.legacyFree, true);
  });

  it('a never-subscribed account with no flags is denied', () => {
    const r = decideSubscriptionAccess(row(), NOW);
    assert.equal(r.active, false);
    assert.equal(r.reason, 'no_subscription');
  });

  it('an unknown user (no row) is denied', () => {
    const r = decideSubscriptionAccess(undefined, NOW);
    assert.equal(r.active, false);
    assert.equal(r.reason, 'user_not_found');
  });
});
