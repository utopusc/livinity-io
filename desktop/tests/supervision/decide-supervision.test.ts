import { describe, it, expect } from 'vitest';
import { decideSupervisionAction, decideAutoBringUp } from '../../src/main/supervision/decide-supervision';

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

/**
 * WR-08 table: launch-time auto-bring-up must be gated on install evidence.
 * The trap row is the FRESH MACHINE (nothing persisted): pre-fix the
 * "undefined => bring-up" default started a doomed engine before any
 * login/CF/WSL existed -- red "Error" tray at first launch + 'running'
 * persisted pre-install + a doomed respawn every 45s, forever.
 */
describe('decideAutoBringUp (WR-08)', () => {
  it('FRESH MACHINE trap row: desiredState undefined + no flowStep => skip-never-installed (never a doomed pre-install start)', () => {
    expect(decideAutoBringUp({ engineDesiredState: undefined, flowStep: undefined })).toBe(
      'skip-never-installed'
    );
  });

  it('desiredState="stopped" => skip-stopped (honors the user STOP), regardless of flowStep', () => {
    expect(decideAutoBringUp({ engineDesiredState: 'stopped', flowStep: 'live-success' })).toBe('skip-stopped');
    expect(decideAutoBringUp({ engineDesiredState: 'stopped', flowStep: undefined })).toBe('skip-stopped');
  });

  it('desiredState="running" => start (only startEngine ever persists it -- itself install evidence)', () => {
    expect(decideAutoBringUp({ engineDesiredState: 'running', flowStep: undefined })).toBe('start');
  });

  it('undefined desiredState + post-install flowStep ("live-success"/"connected-check") => start', () => {
    expect(decideAutoBringUp({ engineDesiredState: undefined, flowStep: 'live-success' })).toBe('start');
    expect(decideAutoBringUp({ engineDesiredState: undefined, flowStep: 'connected-check' })).toBe('start');
  });

  it('undefined desiredState + PRE-install flowStep (wizard mid-journey) => skip-never-installed', () => {
    for (const step of ['wsl-detect', 'cf-wizard', 'cf-reconnect']) {
      expect(decideAutoBringUp({ engineDesiredState: undefined, flowStep: step })).toBe(
        'skip-never-installed'
      );
    }
  });

  it('undefined desiredState + flowStep="installing" (relaunch mid-install) => skip -- never boot-and-heal a half-provisioned distro', () => {
    expect(decideAutoBringUp({ engineDesiredState: undefined, flowStep: 'installing' })).toBe(
      'skip-never-installed'
    );
  });
});
