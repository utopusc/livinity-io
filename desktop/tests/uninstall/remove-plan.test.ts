import { describe, it, expect } from 'vitest';
import { removePlan } from '../../src/main/uninstall/remove-plan';
import type { RemoveChoices } from '../../shared/ipc-contract';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/supervision/decide-supervision.test.ts).
 * The load-bearing property (R-3): `stop-engine` is emitted whenever a step needs the box
 * offline (CF OR distro) while the engine is running -- NOT only for CF -- and NEVER for a
 * clear-only removal (clearing saved credentials touches nothing running). D-13 fixes the
 * output order: stop-engine -> cf-teardown -> distro-remove -> credential-clear.
 */
function choices(partial: Partial<RemoveChoices>): RemoveChoices {
  return { cf: false, distro: false, clear: false, ...partial };
}

describe('removePlan', () => {
  it('zero-opt removal (all false) => [] -- no teardown steps at all, any engineRunning', () => {
    expect(removePlan(choices({}), true)).toEqual([]);
    expect(removePlan(choices({}), false)).toEqual([]);
  });

  it('R-3 trap row: {clear:true} engineRunning=true => [\'credential-clear\'] -- NO stop-engine, clear alone never stops the box', () => {
    expect(removePlan(choices({ clear: true }), true)).toEqual(['credential-clear']);
  });

  it('{cf:true} engineRunning=true => [\'stop-engine\',\'cf-teardown\']', () => {
    expect(removePlan(choices({ cf: true }), true)).toEqual(['stop-engine', 'cf-teardown']);
  });

  it('R-3 trap row: {distro:true} engineRunning=true => [\'stop-engine\',\'distro-remove\'] -- distro-only STILL stops the engine', () => {
    expect(removePlan(choices({ distro: true }), true)).toEqual(['stop-engine', 'distro-remove']);
  });

  it('{distro:true} engineRunning=false => [\'distro-remove\'] -- no stop-engine when already stopped', () => {
    expect(removePlan(choices({ distro: true }), false)).toEqual(['distro-remove']);
  });

  it('full D-13 order: {cf:true,distro:true,clear:true} engineRunning=true => [\'stop-engine\',\'cf-teardown\',\'distro-remove\',\'credential-clear\']', () => {
    expect(removePlan(choices({ cf: true, distro: true, clear: true }), true)).toEqual([
      'stop-engine',
      'cf-teardown',
      'distro-remove',
      'credential-clear',
    ]);
  });

  it('{cf:false} any engineRunning => the plan never contains \'cf-teardown\' (destructive step gated on its own choice)', () => {
    for (const engineRunning of [true, false]) {
      for (const distro of [true, false]) {
        for (const clear of [true, false]) {
          expect(removePlan(choices({ cf: false, distro, clear }), engineRunning)).not.toContain('cf-teardown');
        }
      }
    }
  });

  it('{distro:false} any engineRunning => the plan never contains \'distro-remove\' (destructive step gated on its own choice)', () => {
    for (const engineRunning of [true, false]) {
      for (const cf of [true, false]) {
        for (const clear of [true, false]) {
          expect(removePlan(choices({ cf, distro: false, clear }), engineRunning)).not.toContain('distro-remove');
        }
      }
    }
  });

  it('{cf:true,distro:true} engineRunning=false => [\'cf-teardown\',\'distro-remove\'] -- no stop-engine when already stopped, even with two destructive steps', () => {
    expect(removePlan(choices({ cf: true, distro: true }), false)).toEqual(['cf-teardown', 'distro-remove']);
  });
});
