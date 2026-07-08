import { describe, it, expect } from 'vitest';
import { decideRoute } from '../../src/main/platform/decide-route';

describe('decideRoute', () => {
  it('returns error/network when me is null', () => {
    expect(decideRoute(null, { billing: { active: true, legacyFree: false } })).toEqual({
      kind: 'error',
      reason: 'network',
    });
  });

  it('returns error/network when dashboard is null', () => {
    expect(decideRoute({ free_byod: false }, null)).toEqual({ kind: 'error', reason: 'network' });
  });

  it('returns error/network when both me and dashboard are null', () => {
    expect(decideRoute(null, null)).toEqual({ kind: 'error', reason: 'network' });
  });

  it('returns no-entitlement when billing.active is false', () => {
    expect(
      decideRoute({ free_byod: false }, { billing: { active: false, legacyFree: false } })
    ).toEqual({ kind: 'no-entitlement' });
  });

  it('returns legacy-free-wizard when billing.active && legacyFree, checked BEFORE free_byod', () => {
    expect(
      decideRoute({ free_byod: true }, { billing: { active: true, legacyFree: true } })
    ).toEqual({ kind: 'legacy-free-wizard' });
  });

  it('returns byod-wizard when billing.active && !legacyFree && free_byod', () => {
    expect(
      decideRoute({ free_byod: true }, { billing: { active: true, legacyFree: false } })
    ).toEqual({ kind: 'byod-wizard' });
  });

  it('returns pro-wizard when billing.active && !legacyFree && !free_byod', () => {
    expect(
      decideRoute({ free_byod: false }, { billing: { active: true, legacyFree: false } })
    ).toEqual({ kind: 'pro-wizard' });
  });
});
