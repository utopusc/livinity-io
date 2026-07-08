/**
 * src/main/platform/decide-key-action.ts
 *
 * Pure, zero-IO vault-vs-platform key-state matrix (AUTH-06). This is the
 * ONLY authority for when a generate-key/regenerate-key call is legal: the
 * platform's `generate-key` and `regenerate-key` actions are server-side
 * IDENTICAL (both unconditionally delete any existing key row), so this
 * matrix is what prevents an invisible mint call from silently disconnecting
 * a user's live box (02-RESEARCH.md Pattern 4 / Pitfall 1).
 *
 * Zero imports from the electron module, the Node fs/http built-ins, or
 * anything with IO.
 */

import type { KeyAction } from '../../../shared/ipc-contract';

export function decideKeyAction(vaultHasKey: boolean, platformHasKey: boolean): KeyAction {
  if (!vaultHasKey && !platformHasKey) return 'mint';
  if (!vaultHasKey && platformHasKey) return 'choice-screen';
  if (vaultHasKey && platformHasKey) return 'use-cached';
  return 'stale-reprompt'; // vaultHasKey && !platformHasKey
}
