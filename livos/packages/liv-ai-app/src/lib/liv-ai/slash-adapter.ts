/**
 * Phase 200-04 — `/` slash command adapter for the Liv AI composer.
 *
 * Phase 201-04 — Ported 1:1 from livos/packages/ui/src/features/liv-ai/
 *   slash-adapter.ts. No path remap (only @assistant-ui/react +
 *   sibling './slash-commands' import).
 *
 * Replaces the Phase 198-06 imperative `SlashCommandInterceptor` with
 * the canonical `unstable_useSlashCommandAdapter` pattern from
 * `@assistant-ui/react`. The hook returns the spreadable
 * `{ adapter, action }` bundle the canonical `<ComposerTriggerPopover
 * char="/" {...slash} />` primitive expects.
 *
 * The 4 Phase 198-06 SLASH_COMMANDS entries map verbatim to
 * `Unstable_SlashCommand` (INV-200-06):
 *
 *   /help        → setText(transform()) + send()
 *   /clear       → runtime.threads.switchToNewThread()       (D-200-11)
 *   /screenshot  → setText(transform()) + send()
 *   /search      → setText(transform()) + send()
 *
 * `removeOnExecute: true` is passed so the picker strips the trigger
 * text (`/clear`, `/help`, …) from the composer after execution.
 */

import {
  unstable_useSlashCommandAdapter,
  type AssistantRuntime,
  type Unstable_SlashCommand,
} from "@assistant-ui/react";

import { SLASH_COMMANDS } from "./slash-commands";

/**
 * D-200-10 / INV-200-06 — locked id list for the 4 Phase 198-06 slash
 * commands. Exported for pinning; the picker order is the same
 * as the Phase 198-06 SLASH_COMMANDS literal (linear scan).
 */
export const LIV_AI_SLASH_COMMANDS: readonly string[] = [
  "help",
  "clear",
  "screenshot",
  "search",
] as const;

/**
 * Pure factory — builds the `Unstable_SlashCommand[]` array the canonical
 * `unstable_useSlashCommandAdapter` consumes.
 *
 * Each `execute` callback closes over `runtime` — fired when the operator
 * picks an item in the `/` popover.
 *
 *   - `clear` calls `runtime.threads.switchToNewThread()` (D-200-11).
 *   - Every other command calls the Phase 198-06 `transform()` to
 *     produce a natural-language prompt, then injects it into the
 *     composer via `composer.setText` + `composer.send`.
 */
export function buildLivAiSlashCommands(
  runtime: AssistantRuntime,
): readonly Unstable_SlashCommand[] {
  return SLASH_COMMANDS.map((cmd) => {
    const id = cmd.trigger.replace(/^\//, ""); // '/clear' → 'clear'
    return {
      id,
      label: cmd.label,
      description: cmd.description,
      execute: () => {
        if (id === "clear") {
          // D-200-11 — canonical runtime-sync path. Same call used
          // by the New Conversation button fix (D-200-19).
          void runtime.threads.switchToNewThread();
          return;
        }
        const transformed = cmd.transform("", "");
        if (!transformed) return; // defensive (shouldn't happen for non-clear)
        const composer = runtime.thread.composer;
        composer.setText(transformed);
        composer.send();
      },
    };
  });
}

/**
 * React hook returning the `{ adapter, action }` spread bundle for the
 * `/` slash picker.
 */
export function useLivAiSlashAdapter(runtime: AssistantRuntime) {
  const commands = buildLivAiSlashCommands(runtime);
  return unstable_useSlashCommandAdapter({
    commands,
    removeOnExecute: true,
  });
}
