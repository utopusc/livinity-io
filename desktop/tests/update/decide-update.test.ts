import { describe, it, expect } from 'vitest';
import {
  shouldCheck,
  admitQuitAndInstall,
  shouldNotify,
  nextStatus,
} from '../../src/main/update/decide-update';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/supervision/decide-supervision.test.ts /
 * tests/wsl/decide-wsl-state.test.ts). Four load-bearing properties, each with a named trap row:
 * (1) shouldCheck gates on `packaged` FIRST (Pitfall 5) -- an unpackaged/dev run never schedules
 * a check no matter how large `now`/`lastCheckAt` are; (2) admitQuitAndInstall gates on
 * `installInFlight` FIRST (D-06) -- both gates set true still reports the install-gate reason,
 * never the transition one; (3) shouldNotify is once-per-version against the caller-owned
 * `lastUpdateNotifiedVersion` memory; (4) nextStatus is monotonic -- a background re-check or a
 * check-error can never regress an already-'ready' state for the same download.
 */
describe('shouldCheck', () => {
  it('PACKAGED-FIRST TRAP: packaged=false => false even with lastCheckAt=null and now huge', () => {
    expect(
      shouldCheck({ packaged: false, now: 999_999_999, lastCheckAt: null, readyDelayMs: 1, intervalMs: 1 })
    ).toBe(false);
  });

  it('packaged=false => false, regardless of every other field', () => {
    expect(
      shouldCheck({ packaged: false, now: 0, lastCheckAt: 0, readyDelayMs: 0, intervalMs: 0 })
    ).toBe(false);
  });

  it('packaged=true, lastCheckAt=null, now < readyDelayMs => false (too early for the first check)', () => {
    expect(
      shouldCheck({ packaged: true, now: 100, lastCheckAt: null, readyDelayMs: 180_000, intervalMs: 21_600_000 })
    ).toBe(false);
  });

  it('packaged=true, lastCheckAt=null, now >= readyDelayMs => true (the +3min first check fires)', () => {
    expect(
      shouldCheck({ packaged: true, now: 180_000, lastCheckAt: null, readyDelayMs: 180_000, intervalMs: 21_600_000 })
    ).toBe(true);
  });

  it('packaged=true, lastCheckAt set, elapsed < intervalMs => false (too soon for the next check)', () => {
    expect(
      shouldCheck({ packaged: true, now: 1_000_000, lastCheckAt: 1_000_000 - 21_599_999, readyDelayMs: 180_000, intervalMs: 21_600_000 })
    ).toBe(false);
  });

  it('packaged=true, lastCheckAt set, elapsed >= intervalMs => true (the 6h cadence fires)', () => {
    expect(
      shouldCheck({ packaged: true, now: 21_600_000, lastCheckAt: 0, readyDelayMs: 180_000, intervalMs: 21_600_000 })
    ).toBe(true);
  });
});

describe('admitQuitAndInstall', () => {
  it('INSTALL-GATE-FIRST TRAP: installInFlight=true AND transitionInFlight=true => reason install-in-flight, NOT transition-in-flight', () => {
    expect(admitQuitAndInstall({ installInFlight: true, transitionInFlight: true })).toEqual({
      ok: false,
      reason: 'install-in-flight',
    });
  });

  it('installInFlight=true, transitionInFlight=false => still blocked on install-in-flight', () => {
    expect(admitQuitAndInstall({ installInFlight: true, transitionInFlight: false })).toEqual({
      ok: false,
      reason: 'install-in-flight',
    });
  });

  it('installInFlight=false, transitionInFlight=true => blocked on transition-in-flight', () => {
    expect(admitQuitAndInstall({ installInFlight: false, transitionInFlight: true })).toEqual({
      ok: false,
      reason: 'transition-in-flight',
    });
  });

  it('installInFlight=false, transitionInFlight=false => ok', () => {
    expect(admitQuitAndInstall({ installInFlight: false, transitionInFlight: false })).toEqual({ ok: true });
  });
});

describe('shouldNotify (D-05 once-per-version)', () => {
  it("('0.2.1', undefined) => true (never notified this session/ever)", () => {
    expect(shouldNotify('0.2.1', undefined)).toBe(true);
  });

  it("NO-RE-TOAST TRAP: ('0.2.1', '0.2.1') => false -- same version already notified", () => {
    expect(shouldNotify('0.2.1', '0.2.1')).toBe(false);
  });

  it("('0.2.2', '0.2.1') => true -- a newer version always notifies", () => {
    expect(shouldNotify('0.2.2', '0.2.1')).toBe(true);
  });
});

describe('nextStatus (monotonic state machine)', () => {
  const base = { currentVersion: '0.2.0', installBlocked: false };

  it("'checking' from idle => state:'checking'", () => {
    expect(
      nextStatus(
        { kind: 'checking' },
        { state: 'idle', readyVersion: null, ...base }
      )
    ).toEqual({ state: 'checking', readyVersion: null, ...base });
  });

  it("'available' from checking => state:'downloading'", () => {
    expect(
      nextStatus(
        { kind: 'available' },
        { state: 'checking', readyVersion: null, ...base }
      )
    ).toEqual({ state: 'downloading', readyVersion: null, ...base });
  });

  it("'progress' while downloading => stays 'downloading'", () => {
    expect(
      nextStatus(
        { kind: 'progress' },
        { state: 'downloading', readyVersion: null, ...base }
      )
    ).toEqual({ state: 'downloading', readyVersion: null, ...base });
  });

  it("'up-to-date' from checking => state:'up-to-date'", () => {
    expect(
      nextStatus(
        { kind: 'up-to-date' },
        { state: 'checking', readyVersion: null, ...base }
      )
    ).toEqual({ state: 'up-to-date', readyVersion: null, ...base });
  });

  it("'downloaded'(v) => state:'ready' + readyVersion set", () => {
    expect(
      nextStatus(
        { kind: 'downloaded', version: '0.2.1' },
        { state: 'downloading', readyVersion: null, ...base }
      )
    ).toEqual({ state: 'ready', readyVersion: '0.2.1', ...base });
  });

  it("MONOTONIC TRAP: 'checking' while prev.state==='ready' (same version) => STAYS 'ready', never regresses to 'checking'", () => {
    const ready = { state: 'ready' as const, readyVersion: '0.2.1', ...base };
    expect(nextStatus({ kind: 'checking' }, ready)).toEqual(ready);
  });

  it("'error' from 'checking' => state:'failed'", () => {
    expect(
      nextStatus(
        { kind: 'error' },
        { state: 'checking', readyVersion: null, ...base }
      )
    ).toEqual({ state: 'failed', readyVersion: null, ...base });
  });

  it("ERROR-AFTER-READY TRAP: 'error' while prev.state==='ready' => STAYS 'ready' -- a ready download survives a later check hiccup", () => {
    const ready = { state: 'ready' as const, readyVersion: '0.2.1', ...base };
    expect(nextStatus({ kind: 'error' }, ready)).toEqual(ready);
  });

  it("currentVersion/installBlocked always pass through unchanged from prev", () => {
    const prev = { state: 'idle' as const, readyVersion: null, currentVersion: '0.3.5', installBlocked: true };
    expect(nextStatus({ kind: 'checking' }, prev)).toEqual({
      state: 'checking',
      readyVersion: null,
      currentVersion: '0.3.5',
      installBlocked: true,
    });
  });
});
