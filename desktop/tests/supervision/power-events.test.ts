import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { wirePowerEvents, DEBOUNCE_MS } from '../../src/main/supervision/power-events';

/**
 * power-events.test.ts injects a plain Node `EventEmitter` as the fake
 * `powerMonitor` (its `.on(event, listener)` shape matches what
 * `wirePowerEvents` calls) via the `deps` seam, and uses `vi.useFakeTimers()`
 * to control the shared debounce window deterministically -- no real OS power
 * event or real wall-clock wait is ever needed.
 */

describe('wirePowerEvents', () => {
  let fakePowerMonitor: EventEmitter;
  let onWake: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fakePowerMonitor = new EventEmitter();
    onWake = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to both resume and unlock-screen', () => {
    const onSpy = vi.spyOn(fakePowerMonitor, 'on');

    wirePowerEvents(onWake, { powerMonitor: fakePowerMonitor as never });

    const subscribedEvents = onSpy.mock.calls.map((c) => c[0]);
    expect(subscribedEvents).toContain('resume');
    expect(subscribedEvents).toContain('unlock-screen');
  });

  it('resume then unlock-screen within DEBOUNCE_MS -> onWake called exactly ONCE', () => {
    wirePowerEvents(onWake, { powerMonitor: fakePowerMonitor as never });

    fakePowerMonitor.emit('resume');
    vi.advanceTimersByTime(500);
    fakePowerMonitor.emit('unlock-screen');
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it('a single resume, timer advanced past DEBOUNCE_MS -> onWake called once', () => {
    wirePowerEvents(onWake, { powerMonitor: fakePowerMonitor as never });

    fakePowerMonitor.emit('resume');
    expect(onWake).not.toHaveBeenCalled(); // debounced -- not immediate

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it('two wake bursts separated by > DEBOUNCE_MS -> onWake called twice (window re-arms after firing)', () => {
    wirePowerEvents(onWake, { powerMonitor: fakePowerMonitor as never });

    fakePowerMonitor.emit('resume');
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(onWake).toHaveBeenCalledTimes(1);

    fakePowerMonitor.emit('unlock-screen');
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(onWake).toHaveBeenCalledTimes(2);
  });

  it('a burst of resume+unlock-screen fired repeatedly inside the window still coalesces to ONE onWake', () => {
    wirePowerEvents(onWake, { powerMonitor: fakePowerMonitor as never });

    fakePowerMonitor.emit('resume');
    vi.advanceTimersByTime(100);
    fakePowerMonitor.emit('unlock-screen');
    vi.advanceTimersByTime(100);
    fakePowerMonitor.emit('resume');
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(onWake).toHaveBeenCalledTimes(1);
  });
});
