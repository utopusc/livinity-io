/**
 * src/main/supervision/power-events.ts
 *
 * TRAY-03 (D-06): wires Electron's `powerMonitor` `resume`/`unlock-screen`
 * events to ONE debounced `onWake` callback (RESEARCH Pattern 7). A laptop
 * waking from sleep commonly fires `resume` and then `unlock-screen` within a
 * second or two of each other -- D-06 wants exactly one health pass per real
 * wake event, not one per underlying OS event. The debounce window re-arms
 * once it fires, so two wake bursts separated by more than `DEBOUNCE_MS` each
 * trigger their own `onWake` call.
 *
 * The phase's first `powerMonitor` use (no prior analog module) -- built from
 * RESEARCH Pattern 7 verbatim. `powerMonitor` is injectable via a `deps`
 * param (production default: Electron's real `powerMonitor`) so no real OS
 * power event is ever needed to exercise this in vitest (fake timers drive
 * the debounce window instead).
 */

import { powerMonitor as electronPowerMonitor, type PowerMonitor } from 'electron';

/** Shared debounce window (Claude's discretion per CONTEXT.md) -- a single
 * wake burst (resume + unlock-screen firing close together) coalesces to one
 * health pass within this window. */
export const DEBOUNCE_MS = 5_000;

export interface PowerEventsDeps {
  powerMonitor: Pick<PowerMonitor, 'on'>;
}

const defaultDeps: PowerEventsDeps = {
  powerMonitor: electronPowerMonitor,
};

/**
 * Subscribes to `resume` and `unlock-screen`; both call the same shared
 * debounce trigger. `if (debounceTimer) return;` is the coalescing gate -- a
 * second event inside the window is dropped, not queued or restarted.
 */
export function wirePowerEvents(onWake: () => void, deps: Partial<PowerEventsDeps> = {}): void {
  const powerMonitor = deps.powerMonitor ?? defaultDeps.powerMonitor;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const trigger = (): void => {
    if (debounceTimer) return; // already scheduled -- coalesce, don't queue
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onWake();
    }, DEBOUNCE_MS);
  };

  powerMonitor.on('resume', trigger);
  powerMonitor.on('unlock-screen', trigger);
}
