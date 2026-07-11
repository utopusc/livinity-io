/**
 * src/renderer/screens/settings-flow.ts
 *
 * Pure, React-free helpers for the Settings screen (06-09) -- the status-badge
 * label/class, Start/Stop toggle label, Restart button label, and the
 * "last checked Ns ago" formatter. Extracted so the whole 06-UI-SPEC copy
 * mapping is unit-testable in the node vitest environment (no jsdom/RTL) --
 * mirrors src/renderer/screens/wsl/wsl-flow.ts's template exactly.
 *
 * Nothing here reaches across the preload bridge, touches window.api, or
 * imports a UI library -- plain in / plain out, zero IO. The three transition
 * strings (Starting…/Stopping…/Restarting…) are NOT re-typed here -- they are
 * imported from `ENGINE_TRANSITION_LABELS` (shared/ipc-contract, 06-01), the
 * single source of truth this module and the tray's buildTrayView (06-11)
 * both read, so the two surfaces can never drift.
 */

import { ENGINE_TRANSITION_LABELS } from '../../../shared/ipc-contract';

/** The three in-flight engine actions a Settings/tray surface can be mid-way through. */
export type Transition = 'starting' | 'stopping' | 'restarting' | null;

export interface StatusBadgeInput {
  desired: 'running' | 'stopped';
  transition: Transition;
  /** The live D-03 health-probe verdict. Only consulted once neither `needsAttention`
   *  nor `transition` applies -- see the header note on the desired=running/healthy=false
   *  branch below. */
  healthy: boolean;
  /** Self-heal exhausted (holder respawn failed) -- 06-07's supervision loop signal, D-08. */
  needsAttention: boolean;
}

export type StatusBadgeClassName =
  | 'status-running'
  | 'status-stopped'
  | 'status-installing'
  | 'status-error';

export interface StatusBadge {
  className: StatusBadgeClassName;
  label: string;
}

/**
 * Maps the current engine state to the Settings/tray status-badge class+label
 * per the 06-UI-SPEC Copywriting Contract. Precedence, checked in this exact
 * order (needsAttention wins over all; transition wins over desired):
 *
 * 1. needsAttention -> 'status-error' / 'Needs attention' (self-heal exhausted).
 * 2. transition (starting/stopping/restarting) -> 'status-installing', label
 *    from ENGINE_TRANSITION_LABELS -- this is the precedence trap: a running
 *    engine mid-restart shows "Restarting…", never "Running".
 * 3. desired='stopped' -> 'status-stopped' / 'Stopped'.
 * 4. desired='running' -> 'status-running' / 'Running', REGARDLESS of the live
 *    `healthy` probe value, as long as self-heal has not yet been signalled
 *    exhausted. The UI-SPEC defines exactly four visual states (running /
 *    stopped / transitioning / error) with no separate "silently healing"
 *    state -- D-08's whole point is no visual noise until an edge is
 *    confirmed, so a momentary unhealthy blip the supervisor is still
 *    actively repairing stays "Running" until either health recovers (no
 *    badge change) or repair is exhausted (needsAttention flips true, rule 1).
 */
export function statusBadge(input: StatusBadgeInput): StatusBadge {
  if (input.needsAttention) {
    return { className: 'status-error', label: 'Needs attention' };
  }
  if (input.transition) {
    return { className: 'status-installing', label: ENGINE_TRANSITION_LABELS[input.transition] };
  }
  if (input.desired === 'stopped') {
    return { className: 'status-stopped', label: 'Stopped' };
  }
  return { className: 'status-running', label: 'Running' };
}

export interface ToggleLabelInput {
  desired: 'running' | 'stopped';
  transition: Transition;
}

export interface ActionLabel {
  label: string;
  disabled: boolean;
}

/**
 * The Start/Stop toggle's dynamic label + disabled state. The UI-SPEC names
 * the transitioning text ONLY for starting/stopping (the two transitions the
 * toggle itself triggers) -- while a restart is in flight (triggered by the
 * separate Restart button) the toggle is disabled (busy engine, avoid
 * overlapping actions) but keeps its desired-state-based verb, since a
 * restart never changes desiredState.
 */
export function toggleLabel({ desired, transition }: ToggleLabelInput): ActionLabel {
  if (transition === 'starting') {
    return { label: ENGINE_TRANSITION_LABELS.starting, disabled: true };
  }
  if (transition === 'stopping') {
    return { label: ENGINE_TRANSITION_LABELS.stopping, disabled: true };
  }
  const label = desired === 'stopped' ? 'Start engine' : 'Stop engine';
  return { label, disabled: transition === 'restarting' };
}

export interface RestartLabelInput {
  transition: Transition;
}

/**
 * The Restart button's dynamic label + disabled state. Disabled whenever ANY
 * transition is in flight (never allow overlapping start/stop/restart
 * actions), but the label only swaps to the restarting-specific text when
 * the in-flight transition IS the restart itself.
 */
export function restartLabel({ transition }: RestartLabelInput): ActionLabel {
  if (transition === 'restarting') {
    return { label: ENGINE_TRANSITION_LABELS.restarting, disabled: true };
  }
  return { label: 'Restart engine', disabled: transition !== null };
}

/**
 * WR-09: `wsl:configApply` ends in a whole-VM `wsl --shutdown` (the only way
 * CPU/RAM limits take effect -- a pre-existing, accepted Phase-4 behavior in
 * a context where nothing was running yet). Saving while the engine runs must
 * therefore be an ORCHESTRATED stop -> apply -> start, never a bare apply:
 * a bare apply silently killed the holder/livinityd/cloudflared/dashboard,
 * showed "Saved." over a dead engine for up to ~45s, and the eventual
 * tick-respawn fired a spurious "recovered automatically" toast as the direct
 * result of the user's own Save click.
 */
export type ResourceSaveStep = 'engine-stop' | 'config-apply' | 'engine-start';

/** Pure plan: desired-running => bracket the apply with an engine stop/start
 * (surfaced as the existing 'restarting' transition UI); desired-stopped =>
 * the apply alone (nothing to bounce, nothing to bring back). */
export function resourceSavePlan(desired: 'running' | 'stopped'): ResourceSaveStep[] {
  if (desired === 'running') {
    return ['engine-stop', 'config-apply', 'engine-start'];
  }
  return ['config-apply'];
}

/** Below this threshold (ms), the last-checked line reads "just now" rather than "0s ago". */
const JUST_NOW_THRESHOLD_MS = 2000;

/**
 * Formats the Status card's "Last checked…" line. `null` (no probe has run
 * yet this session) is treated the same as a very recent probe -- both read
 * "Last checked just now" rather than exposing the null/undefined gap to copy.
 */
export function formatLastChecked(msAgo: number | null): string {
  if (msAgo === null || msAgo < JUST_NOW_THRESHOLD_MS) {
    return 'Last checked just now';
  }
  const seconds = Math.round(msAgo / 1000);
  return `Last checked ${seconds}s ago`;
}
