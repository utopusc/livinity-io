/**
 * Hermes phrase constants — V32-HERMES-02.
 *
 * Verbatim port of Hermes display.py THINKING_VERBS / WAITING_VERBS.
 * No KAWAII faces, no emoticons — LivOS uses its own UI animations.
 * This file is backend-only (phrase data for status_detail chunks).
 */

// 15 thinking verbs verbatim from Hermes display.py
export const THINKING_VERBS = [
  'pondering',
  'contemplating',
  'musing',
  'cogitating',
  'ruminating',
  'deliberating',
  'mulling',
  'reflecting',
  'processing',
  'reasoning',
  'analyzing',
  'computing',
  'synthesizing',
  'formulating',
  'brainstorming',
] as const;

export type ThinkingVerb = (typeof THINKING_VERBS)[number];

/** Pick a random thinking verb uniformly from the 15-entry tuple. */
export function pickThinkingVerb(): ThinkingVerb {
  return THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)];
}

export const WAITING_VERBS = ['waiting', 'ready', 'standing by'] as const;

export type WaitingVerb = (typeof WAITING_VERBS)[number];

/** Pick a random waiting verb uniformly from the 3-entry tuple. */
export function pickWaitingVerb(): WaitingVerb {
  return WAITING_VERBS[Math.floor(Math.random() * WAITING_VERBS.length)];
}
