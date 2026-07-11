import { describe, it, expect } from 'vitest';
import { decideSupervisionAction } from '../../src/main/supervision/decide-supervision';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/wsl/decide-wsl-state.test.ts).
 * The load-bearing property: `installInFlight` is checked FIRST, before desired-state or
 * holder liveness -- a live install can never be interleaved with a self-heal/respawn
 * (IN-06). The second load-bearing property: a deliberately-stopped engine (desiredState
 * !== 'running') never respawns even when its holder is observed dead (Pattern 3).
 */
describe('decideSupervisionAction', () => {
  it('installInFlight=true => skip, even with a dead holder + desiredState=running (IN-06 trap row)', () => {
    expect(
      decideSupervisionAction({
        installInFlight: true,
        desiredState: 'running',
        holderAlive: false,
        healthy: false,
      })
    ).toBe('skip');
  });

  it('installInFlight=true => skip, regardless of every other field', () => {
    expect(
      decideSupervisionAction({
        installInFlight: true,
        desiredState: 'stopped',
        holderAlive: true,
        healthy: true,
      })
    ).toBe('skip');
  });

  it('installInFlight=false, desiredState=stopped, holderAlive=false => noop, NOT respawn (Pattern 3 trap row)', () => {
    expect(
      decideSupervisionAction({
        installInFlight: false,
        desiredState: 'stopped',
        holderAlive: false,
        healthy: false,
      })
    ).toBe('noop');
  });

  it('installInFlight=false, desiredState=stopped, holderAlive=true => noop', () => {
    expect(
      decideSupervisionAction({
        installInFlight: false,
        desiredState: 'stopped',
        holderAlive: true,
        healthy: true,
      })
    ).toBe('noop');
  });

  it('installInFlight=false, desiredState=undefined (never set) => noop (treated as not-running)', () => {
    expect(
      decideSupervisionAction({
        installInFlight: false,
        desiredState: undefined,
        holderAlive: false,
        healthy: false,
      })
    ).toBe('noop');
  });

  it('desiredState=running, holderAlive=false => respawn', () => {
    expect(
      decideSupervisionAction({
        installInFlight: false,
        desiredState: 'running',
        holderAlive: false,
        healthy: false,
      })
    ).toBe('respawn');
  });

  it('desiredState=running, holderAlive=true, healthy=false => heal', () => {
    expect(
      decideSupervisionAction({
        installInFlight: false,
        desiredState: 'running',
        holderAlive: true,
        healthy: false,
      })
    ).toBe('heal');
  });

  it('desiredState=running, holderAlive=true, healthy=true => ok', () => {
    expect(
      decideSupervisionAction({
        installInFlight: false,
        desiredState: 'running',
        holderAlive: true,
        healthy: true,
      })
    ).toBe('ok');
  });
});
