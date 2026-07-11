/**
 * src/renderer/screens/update-flow.ts
 *
 * Pure, React-free helpers for the Settings "About & updates" card (07-09) -- the
 * status-line copy, the check-button label/disabled/visible state, and the restart-CTA
 * visibility/label/disabled/blockedNote. Extracted so the whole 07-UI-SPEC §3 copy
 * mapping is unit-testable in the node vitest environment (no jsdom/RTL) -- mirrors
 * src/renderer/screens/settings-flow.ts's template exactly.
 *
 * Nothing here reaches across the preload bridge, touches window.api, or imports a UI
 * library -- plain in / plain out, zero IO. The 7 status-line strings are copied
 * VERBATIM from 07-UI-SPEC §3 (no duration promises) -- do not paraphrase.
 */

import type { UpdateUiState } from '../../../shared/ipc-contract';

/**
 * The About & updates card's status line -- one of exactly 7 variants keyed on
 * `UpdateUiState.state`. Only 'ready' interpolates (the version being offered).
 */
export function updateStatusLine(s: UpdateUiState): string {
  switch (s.state) {
    case 'idle':
      return 'Livinity checks for updates automatically.';
    case 'checking':
      return 'Checking for updates…';
    case 'up-to-date':
      return "You're up to date.";
    case 'downloading':
      return 'Downloading an update in the background. You can keep using Livinity.';
    case 'ready':
      return `Version ${s.readyVersion} is ready. Restart Livinity Desktop when convenient — your server keeps running.`;
    case 'failed':
      return "Couldn't check for updates — Livinity will try again automatically.";
    case 'dev':
      return 'Automatic updates work in the installed app.';
  }
}

export interface CheckButtonState {
  label: string;
  disabled: boolean;
  visible: boolean;
}

/**
 * The "Check for updates" button. Hidden entirely in 'dev' (an unpackaged run has no
 * feed to check against). Busy (label swap + disabled) while a check or download is
 * in flight -- otherwise always the neutral idle label.
 */
export function checkButton(s: UpdateUiState): CheckButtonState {
  if (s.state === 'dev') {
    return { label: 'Check for updates', disabled: false, visible: false };
  }
  if (s.state === 'checking' || s.state === 'downloading') {
    return { label: 'Checking…', disabled: true, visible: true };
  }
  return { label: 'Check for updates', disabled: false, visible: true };
}

export interface RestartCtaState {
  visible: boolean;
  label: string;
  disabled: boolean;
  blockedNote: string | null;
}

/** The D-06 install-gate blocked note -- exact UI-SPEC §3 copy. */
const INSTALL_BLOCKED_NOTE =
  'Setup is in progress — you can restart to update once it finishes.';

/**
 * The "Restart to update" CTA. Visible ONLY in 'ready' (READY-ONLY TRAP -- every other
 * state, including a stray `installBlocked:true` outside 'ready', renders nothing).
 * When blocked by the D-06 install-gate the button stays visible but disabled, paired
 * with the exact blockedNote copy (disabled states must carry text, not just opacity,
 * per the Accessibility Contract). The after-click "Restarting…" swap is
 * component-local state, not decided here.
 */
export function restartCta(s: UpdateUiState): RestartCtaState {
  if (s.state !== 'ready') {
    return { visible: false, label: 'Restart to update', disabled: false, blockedNote: null };
  }
  if (s.installBlocked) {
    return { visible: true, label: 'Restart to update', disabled: true, blockedNote: INSTALL_BLOCKED_NOTE };
  }
  return { visible: true, label: 'Restart to update', disabled: false, blockedNote: null };
}
