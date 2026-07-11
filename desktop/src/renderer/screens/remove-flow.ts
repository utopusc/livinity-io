/**
 * src/renderer/screens/remove-flow.ts
 *
 * Pure, React-free helpers for the Remove flow's two screens (R1 choices / R2
 * confirm-working-hand-off). Extracted so the whole 07-UI-SPEC §7/§8 copy mapping
 * is unit-testable in the node vitest environment (no jsdom/RTL) -- mirrors
 * src/renderer/screens/settings-flow.ts / update-flow.ts's template exactly.
 *
 * Nothing here reaches across the preload bridge, touches window.api, or imports
 * a UI library -- plain in / plain out, zero IO. The renderer never imports
 * main -- so `stepCaptions` does NOT import `removePlan` from
 * src/main/uninstall/remove-plan.ts; it re-derives the SAME D-13 ordering rule
 * locally (a drift test on both agrees row-for-row) and maps the result through
 * the shared `REMOVE_STEP_LABELS` VALUE import -- the single source of truth
 * both this file and the future main executor (remove-executor.ts, 07-06) read,
 * so the confirm summary, the working step-list, and the real teardown can
 * never disagree.
 */

import type { RemoveChoices, RemoveOffer, RemoveStepId } from '../../../shared/ipc-contract';
import { REMOVE_STEP_LABELS } from '../../../shared/ipc-contract';

export interface VisibleChoices {
  cf: boolean;
  distro: boolean;
  clear: boolean;
}

/** D-12: the CF checkbox is offered only for free_byod accounts with a live
 *  provisioning receipt + cfToken (main-side computed). Distro + clear are
 *  universal opt-ins, always visible. */
export function visibleChoices(offer: RemoveOffer): VisibleChoices {
  return { cf: offer.offerCfTeardown, distro: true, clear: true };
}

/** UI-SPEC §8 "WHAT GOES" -- always the app itself, plus one line per selected
 * choice, in choice order (cf, distro, clear). Exact copy, apexHost interpolated. */
export function goesList(c: RemoveChoices, offer: RemoveOffer): string[] {
  const items: string[] = ['The Livinity Desktop app'];
  if (c.cf) items.push(`The Cloudflare tunnel and DNS records for ${offer.apexHost ?? ''}`);
  if (c.distro) items.push('The Livinity system and all its data on this PC');
  if (c.clear) items.push('Your saved sign-in and settings on this PC');
  return items;
}

/** UI-SPEC §8 "WHAT STAYS" -- the exact complement of goesList over the offered
 * options: the account line is always present; the CF line appears ONLY when
 * CF teardown was offered but not chosen (byod-only, matches visibleChoices);
 * distro/clear lines appear whenever their choice was NOT selected. */
export function staysList(c: RemoveChoices, offer: RemoveOffer): string[] {
  const items: string[] = ['Your Livinity account'];
  if (offer.offerCfTeardown && !c.cf) {
    items.push(`The Cloudflare tunnel and DNS records for ${offer.apexHost ?? ''}`);
  }
  if (!c.distro) items.push('Your server and everything stored on it');
  if (!c.clear) items.push('Your saved sign-in and settings on this PC');
  return items;
}

/**
 * The working step-list captions, in D-13 order, single-sourced from
 * REMOVE_STEP_LABELS. Re-derives remove-plan.ts's exact ordering rule locally
 * (renderer never imports main) -- R-3: stop-engine is included whenever CF OR
 * distro is selected while the engine is running, never for a clear-only removal.
 */
export function stepCaptions(c: RemoveChoices, engineRunning: boolean): string[] {
  const steps: RemoveStepId[] = [];
  if ((c.cf || c.distro) && engineRunning) steps.push('stop-engine');
  if (c.cf) steps.push('cf-teardown');
  if (c.distro) steps.push('distro-remove');
  if (c.clear) steps.push('credential-clear');
  return steps.map((id) => REMOVE_STEP_LABELS[id]);
}

export interface FinalButton {
  label: string;
  danger: boolean;
  disabled: boolean;
}

/**
 * R2's final CTA. Red + gated ONLY when distro deletion is selected (the
 * phase's sole destructive confirm, D-12) -- disabled until the gate checkbox
 * is checked. Every other combination (including CF teardown / credential
 * clear alone) is the plain accent "Remove Livinity", never gated -- data
 * that is recoverable/re-creatable never earns the red treatment.
 */
export function finalButton(c: RemoveChoices, gateChecked: boolean): FinalButton {
  if (c.distro) {
    return { label: 'Remove Livinity and delete my data', danger: true, disabled: !gateChecked };
  }
  return { label: 'Remove Livinity', danger: false, disabled: false };
}
