/**
 * src/main/uninstall/remove-plan.ts
 *
 * Pure, zero-IO teardown-order decider for the Remove flow (SUP-02). Encodes D-13's
 * fixed step order (stop-engine -> cf-teardown -> distro-remove -> credential-clear)
 * and R-3's stop-engine gate: the box goes offline whenever EITHER CF teardown OR
 * distro removal is selected while the engine is running -- not only for CF (the
 * UI-SPEC checker's own R-3 note: "the plan stops the engine whenever a step needs
 * the box offline, not only for CF"). A clear-only removal never stops anything --
 * clearing saved credentials touches no running process.
 *
 * This is the SAME ordering rule both the future main executor (remove-executor.ts,
 * 07-06, walks `removePlan(...)` verbatim to drive its progress pushes) and the
 * renderer (remove-flow.ts, this plan, Task 2) key their step captions from -- one
 * source, so the confirm summary, the working step-list, and the real teardown can
 * never disagree.
 *
 * Zero runtime imports -- no IO, no Node built-ins, no electron surface (mirrors
 * decide-supervision.ts / decide-wsl-state.ts).
 */

import type { RemoveChoices, RemoveStepId } from '../../../shared/ipc-contract';

export function removePlan(c: RemoveChoices, engineRunning: boolean): RemoveStepId[] {
  const steps: RemoveStepId[] = [];
  // R-3: stop-engine is gated on "does ANY selected step need the box offline"
  // (cf || distro), never on cf alone -- a distro-only removal still stops the
  // engine before deleting the distro's files out from under a live process.
  if ((c.cf || c.distro) && engineRunning) steps.push('stop-engine');
  if (c.cf) steps.push('cf-teardown');
  if (c.distro) steps.push('distro-remove');
  if (c.clear) steps.push('credential-clear');
  return steps;
}
