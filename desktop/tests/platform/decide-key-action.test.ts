import { describe, it, expect } from 'vitest';
import { decideKeyAction } from '../../src/main/platform/decide-key-action';

describe('decideKeyAction', () => {
  it('returns mint when neither vault nor platform has a key', () => {
    expect(decideKeyAction(false, false)).toBe('mint');
  });

  it('returns choice-screen when platform has a key but vault does not (reinstall/other device)', () => {
    expect(decideKeyAction(false, true)).toBe('choice-screen');
  });

  it('returns use-cached when both vault and platform have a key (steady state)', () => {
    expect(decideKeyAction(true, true)).toBe('use-cached');
  });

  it('returns stale-reprompt when vault has a key but platform does not (revoked elsewhere)', () => {
    expect(decideKeyAction(true, false)).toBe('stale-reprompt');
  });
});
