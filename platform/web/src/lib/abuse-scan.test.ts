/**
 * Unit tests for the abuse-scan risk classifier (Phase 280/283 CFC-03).
 *
 *   cd platform/web
 *   npx tsx --test src/lib/abuse-scan.test.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { classifyRisk, egressLimitBytes, DEFAULT_EGRESS_GB_PER_DAY, BYTES_PER_GB } from './abuse-scan.js';

const LIMIT = 50 * BYTES_PER_GB; // 50 GB/day

describe('classifyRisk — egress (CFC-03)', () => {
  it('flags egress over the limit as watch', () => {
    const r = classifyRisk({ egress24hBytes: 80 * BYTES_PER_GB, reputation: 'clean' }, LIMIT);
    assert.equal(r.egressFlagged, true);
    assert.equal(r.level, 'watch');
  });

  it('does NOT flag egress under the limit', () => {
    const r = classifyRisk({ egress24hBytes: 10 * BYTES_PER_GB, reputation: 'clean' }, LIMIT);
    assert.equal(r.egressFlagged, false);
    assert.equal(r.level, 'ok');
  });

  it('treats exactly-at-the-limit as NOT flagged (strictly greater)', () => {
    const r = classifyRisk({ egress24hBytes: LIMIT, reputation: 'clean' }, LIMIT);
    assert.equal(r.egressFlagged, false);
  });

  it('NEVER flags a null egress reading (missing data, not zero)', () => {
    const r = classifyRisk({ egress24hBytes: null, reputation: 'clean' }, LIMIT);
    assert.equal(r.egressFlagged, false);
    assert.equal(r.level, 'ok');
  });
});

describe('classifyRisk — reputation', () => {
  it('flagged reputation is HIGH regardless of egress', () => {
    const r = classifyRisk({ egress24hBytes: 1 * BYTES_PER_GB, reputation: 'flagged' }, LIMIT);
    assert.equal(r.reputationFlagged, true);
    assert.equal(r.level, 'high');
  });

  it('reputation HIGH outranks an egress watch', () => {
    const r = classifyRisk({ egress24hBytes: 999 * BYTES_PER_GB, reputation: 'flagged' }, LIMIT);
    assert.equal(r.level, 'high', 'reputation high takes precedence over egress watch');
    assert.equal(r.egressFlagged, true, 'egress still recorded as flagged');
  });

  it("'unknown' reputation is not a flag", () => {
    const r = classifyRisk({ egress24hBytes: 1 * BYTES_PER_GB, reputation: 'unknown' }, LIMIT);
    assert.equal(r.reputationFlagged, false);
    assert.equal(r.level, 'ok');
  });
});

describe('egressLimitBytes — env parsing', () => {
  const KEY = 'ABUSE_EGRESS_GB_PER_DAY';
  const orig = process.env[KEY];
  const restore = () => {
    if (orig === undefined) delete process.env[KEY];
    else process.env[KEY] = orig;
  };

  it('defaults when unset', () => {
    delete process.env[KEY];
    assert.equal(egressLimitBytes(), DEFAULT_EGRESS_GB_PER_DAY * BYTES_PER_GB);
    restore();
  });

  it('honors a positive override', () => {
    process.env[KEY] = '100';
    assert.equal(egressLimitBytes(), 100 * BYTES_PER_GB);
    restore();
  });

  it('falls back on garbage / non-positive values', () => {
    for (const bad of ['0', '-5', 'abc', '']) {
      process.env[KEY] = bad;
      assert.equal(egressLimitBytes(), DEFAULT_EGRESS_GB_PER_DAY * BYTES_PER_GB, `bad="${bad}"`);
    }
    restore();
  });
});
