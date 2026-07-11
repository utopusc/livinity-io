import { describe, it, expect } from 'vitest';
import {
  statusBadge,
  toggleLabel,
  restartLabel,
  formatLastChecked,
} from '../../src/renderer/screens/settings-flow';
import { ENGINE_TRANSITION_LABELS } from '../../shared/ipc-contract';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/wsl/wsl-flow.test.ts /
 * tests/supervision/decide-supervision.test.ts). Two load-bearing properties:
 * (1) transition ALWAYS takes precedence over desired (the precedence trap --
 * a running engine mid-restart must show 'Restarting…', never 'Running');
 * (2) needsAttention wins over everything, including an in-flight transition.
 * The transition-label rows assert IDENTITY against ENGINE_TRANSITION_LABELS
 * (shared/ipc-contract, 06-01) via `toBe`, proving settings-flow.ts imports
 * the shared const rather than re-typing the three strings.
 */
describe('statusBadge', () => {
  it('desired=running, healthy=true, no transition, no needsAttention -> status-running/Running', () => {
    expect(
      statusBadge({ desired: 'running', transition: null, healthy: true, needsAttention: false })
    ).toEqual({ className: 'status-running', label: 'Running' });
  });

  it('desired=running, healthy=false, no transition, no needsAttention (silent self-heal in progress) -> still status-running/Running, no visual noise until exhausted', () => {
    expect(
      statusBadge({ desired: 'running', transition: null, healthy: false, needsAttention: false })
    ).toEqual({ className: 'status-running', label: 'Running' });
  });

  it('desired=stopped, no transition -> status-stopped/Stopped', () => {
    expect(
      statusBadge({ desired: 'stopped', transition: null, healthy: false, needsAttention: false })
    ).toEqual({ className: 'status-stopped', label: 'Stopped' });
  });

  it('PRECEDENCE TRAP: transition=starting while desired=running -> ENGINE_TRANSITION_LABELS.starting, NOT "Running"', () => {
    const result = statusBadge({
      desired: 'running',
      transition: 'starting',
      healthy: true,
      needsAttention: false,
    });
    expect(result.className).toBe('status-installing');
    expect(result.label).not.toBe('Running');
    expect(result.label).toBe(ENGINE_TRANSITION_LABELS.starting);
  });

  it('transition=stopping while desired=running -> status-installing/ENGINE_TRANSITION_LABELS.stopping', () => {
    const result = statusBadge({
      desired: 'running',
      transition: 'stopping',
      healthy: true,
      needsAttention: false,
    });
    expect(result).toEqual({ className: 'status-installing', label: ENGINE_TRANSITION_LABELS.stopping });
  });

  it('transition=restarting while desired=running -> status-installing/ENGINE_TRANSITION_LABELS.restarting', () => {
    const result = statusBadge({
      desired: 'running',
      transition: 'restarting',
      healthy: true,
      needsAttention: false,
    });
    expect(result).toEqual({
      className: 'status-installing',
      label: ENGINE_TRANSITION_LABELS.restarting,
    });
  });

  it('IDENTITY: the transition label IS ENGINE_TRANSITION_LABELS.starting, not a duplicated literal', () => {
    const result = statusBadge({
      desired: 'running',
      transition: 'starting',
      healthy: true,
      needsAttention: false,
    });
    expect(result.label).toBe(ENGINE_TRANSITION_LABELS.starting);
  });

  it('needsAttention=true wins over an in-flight transition -> status-error/Needs attention', () => {
    expect(
      statusBadge({ desired: 'running', transition: 'starting', healthy: false, needsAttention: true })
    ).toEqual({ className: 'status-error', label: 'Needs attention' });
  });

  it('needsAttention=true wins over desired=running/healthy=true -> status-error/Needs attention (self-heal exhausted)', () => {
    expect(
      statusBadge({ desired: 'running', transition: null, healthy: true, needsAttention: true })
    ).toEqual({ className: 'status-error', label: 'Needs attention' });
  });

  it('WCAG 1.4.1: label is non-empty for every reachable state (never color-alone)', () => {
    const inputs: Array<Parameters<typeof statusBadge>[0]> = [
      { desired: 'running', transition: null, healthy: true, needsAttention: false },
      { desired: 'running', transition: null, healthy: false, needsAttention: false },
      { desired: 'stopped', transition: null, healthy: false, needsAttention: false },
      { desired: 'running', transition: 'starting', healthy: false, needsAttention: false },
      { desired: 'running', transition: 'stopping', healthy: true, needsAttention: false },
      { desired: 'running', transition: 'restarting', healthy: true, needsAttention: false },
      { desired: 'running', transition: null, healthy: false, needsAttention: true },
    ];
    for (const input of inputs) {
      expect(statusBadge(input).label.length).toBeGreaterThan(0);
    }
  });
});

describe('toggleLabel', () => {
  it('desired=stopped, no transition -> "Start engine", enabled', () => {
    expect(toggleLabel({ desired: 'stopped', transition: null })).toEqual({
      label: 'Start engine',
      disabled: false,
    });
  });

  it('desired=running, no transition -> "Stop engine", enabled', () => {
    expect(toggleLabel({ desired: 'running', transition: null })).toEqual({
      label: 'Stop engine',
      disabled: false,
    });
  });

  it('transition=starting -> ENGINE_TRANSITION_LABELS.starting, disabled', () => {
    const result = toggleLabel({ desired: 'stopped', transition: 'starting' });
    expect(result).toEqual({ label: ENGINE_TRANSITION_LABELS.starting, disabled: true });
  });

  it('transition=stopping -> ENGINE_TRANSITION_LABELS.stopping, disabled', () => {
    const result = toggleLabel({ desired: 'running', transition: 'stopping' });
    expect(result).toEqual({ label: ENGINE_TRANSITION_LABELS.stopping, disabled: true });
  });

  it('transition=restarting, desired=running -> "Stop engine" text, disabled (busy, not itself a start/stop verb)', () => {
    expect(toggleLabel({ desired: 'running', transition: 'restarting' })).toEqual({
      label: 'Stop engine',
      disabled: true,
    });
  });

  it('transition=restarting, desired=stopped -> "Start engine" text, disabled', () => {
    expect(toggleLabel({ desired: 'stopped', transition: 'restarting' })).toEqual({
      label: 'Start engine',
      disabled: true,
    });
  });
});

describe('restartLabel', () => {
  it('no transition -> "Restart engine", enabled', () => {
    expect(restartLabel({ transition: null })).toEqual({ label: 'Restart engine', disabled: false });
  });

  it('transition=starting (busy elsewhere) -> "Restart engine" text, disabled', () => {
    expect(restartLabel({ transition: 'starting' })).toEqual({ label: 'Restart engine', disabled: true });
  });

  it('transition=stopping (busy elsewhere) -> "Restart engine" text, disabled', () => {
    expect(restartLabel({ transition: 'stopping' })).toEqual({ label: 'Restart engine', disabled: true });
  });

  it('transition=restarting -> ENGINE_TRANSITION_LABELS.restarting, disabled', () => {
    expect(restartLabel({ transition: 'restarting' })).toEqual({
      label: ENGINE_TRANSITION_LABELS.restarting,
      disabled: true,
    });
  });
});

describe('formatLastChecked', () => {
  it('null -> "Last checked just now"', () => {
    expect(formatLastChecked(null)).toBe('Last checked just now');
  });

  it('0ms -> "Last checked just now"', () => {
    expect(formatLastChecked(0)).toBe('Last checked just now');
  });

  it('1999ms (just under the 2s threshold) -> "Last checked just now"', () => {
    expect(formatLastChecked(1999)).toBe('Last checked just now');
  });

  it('2000ms -> "Last checked 2s ago"', () => {
    expect(formatLastChecked(2000)).toBe('Last checked 2s ago');
  });

  it('5400ms -> "Last checked 5s ago" (rounds to nearest second)', () => {
    expect(formatLastChecked(5400)).toBe('Last checked 5s ago');
  });

  it('45000ms -> "Last checked 45s ago"', () => {
    expect(formatLastChecked(45000)).toBe('Last checked 45s ago');
  });
});
