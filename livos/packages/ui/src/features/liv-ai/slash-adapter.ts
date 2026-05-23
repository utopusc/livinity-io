/**
 * Phase 200-04 — `/` slash command adapter for the Liv AI composer.
 *
 * Replaces the Phase 198-06 imperative `SlashCommandInterceptor` (the
 * `composerRuntime.send` monkey-patch that lived in `assistant.tsx`) with
 * the canonical `unstable_useSlashCommandAdapter` pattern from
 * `@assistant-ui/react@0.14.7`. The hook returns the spreadable
 * `{ adapter, action }` bundle the canonical `<ComposerTriggerPopover
 * char="/" {...slash} />` primitive expects (Plan 200-02 ported the
 * popover; Plan 200-05 mounts it inside `<LivAiComposer>`).
 *
 * The 4 Phase 198-06 SLASH_COMMANDS entries map verbatim to
 * `Unstable_SlashCommand` (INV-200-06):
 *
 *   /help        → setText(transform()) + send()
 *   /clear       → runtime.threads.switchToNewThread()       (D-200-11)
 *   /screenshot  → setText(transform()) + send()
 *   /search      → setText(transform()) + send()
 *                  (no-arg transform returns the clarifying fallback;
 *                  multi-arg `/search foo bar` is a Phase 201+
 *                  enhancement — the canonical adapter's `execute`
 *                  callback has no access to the trailing-text input,
 *                  so first ship uses the static no-arg prompt)
 *
 * `removeOnExecute: true` is passed so the picker strips the trigger
 * text (`/clear`, `/help`, …) from the composer after execution — the
 * operator never sees the literal slash in the sent message.
 *
 * The pure factory `buildLivAiSlashCommands(runtime)` is exported for
 * isolated unit-testing (it's a function of the runtime, NOT a hook,
 * so it can run without AssistantRuntime context). The hook
 * `useLivAiSlashAdapter(runtime)` composes the factory with the
 * canonical adapter — that path is exercised by Plan 200-05's composer
 * integration test + Plan 200-08's operator UAT.
 */

import {
	unstable_useSlashCommandAdapter,
	type AssistantRuntime,
	type Unstable_SlashCommand,
} from '@assistant-ui/react'

import {SLASH_COMMANDS} from './slash-commands'

/**
 * D-200-10 / INV-200-06 — locked id list for the 4 Phase 198-06 slash
 * commands. Exported for vitest pinning; the picker order is the same
 * as the Phase 198-06 SLASH_COMMANDS literal (linear scan).
 */
export const LIV_AI_SLASH_COMMANDS: readonly string[] = [
	'help',
	'clear',
	'screenshot',
	'search',
] as const

/**
 * Pure factory — builds the `Unstable_SlashCommand[]` array the canonical
 * `unstable_useSlashCommandAdapter` consumes. Exported separately from
 * the hook so we can unit-test the execute side-effects against a fake
 * runtime without needing the AssistantRuntimeProvider React context.
 *
 * Each `execute` callback closes over `runtime` — fired when the operator
 * picks an item in the `/` popover.
 *
 *   - `clear` calls `runtime.threads.switchToNewThread()` (D-200-11).
 *     This is the SAME canonical runtime-sync call the New Conversation
 *     button fix uses in Plan 200-07 (D-200-19) — both paths converge
 *     so the runtime + sidebar state stay in lockstep.
 *
 *   - Every other command calls the Phase 198-06 `transform()` to
 *     produce a natural-language prompt, then injects it into the
 *     composer via `composer.setText` + `composer.send`. The agent sees
 *     the clean prompt, NOT the literal `/screenshot` text.
 */
export function buildLivAiSlashCommands(
	runtime: AssistantRuntime,
): readonly Unstable_SlashCommand[] {
	return SLASH_COMMANDS.map((cmd) => {
		const id = cmd.trigger.replace(/^\//, '') // '/clear' → 'clear'
		return {
			id,
			label: cmd.label,
			description: cmd.description,
			execute: () => {
				if (id === 'clear') {
					// D-200-11 — canonical runtime-sync path. Same call used
					// by the New Conversation button fix (D-200-19).
					void runtime.threads.switchToNewThread()
					return
				}
				// Text commands: invoke transform → inject text → send.
				// Phase 198-06 transform signature is (raw?, rest?) — we
				// call with no args; the multi-arg `/search foo bar`
				// enhancement is deferred to Phase 201+ (the canonical
				// adapter's execute callback has no access to trailing
				// composer text).
				const transformed = cmd.transform('', '')
				if (!transformed) return // defensive (shouldn't happen for non-clear)
				const composer = runtime.thread.composer
				composer.setText(transformed)
				composer.send()
			},
		}
	})
}

/**
 * React hook returning the `{ adapter, action }` spread bundle for the
 * `/` slash picker. Mount via:
 *
 *   const slash = useLivAiSlashAdapter(runtime)
 *   <ComposerTriggerPopover char="/" {...slash} />
 *
 * `removeOnExecute: true` strips the trigger text from the composer
 * after the operator picks an item — so `/clear` doesn't leave a
 * literal `/clear` in the textarea after switching threads.
 */
export function useLivAiSlashAdapter(runtime: AssistantRuntime) {
	const commands = buildLivAiSlashCommands(runtime)
	return unstable_useSlashCommandAdapter({
		commands,
		removeOnExecute: true,
	})
}
