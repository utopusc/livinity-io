/**
 * Phase 200-05 — LivAiComposer (canonical, Grok-pattern).
 *
 * Rewrites the Phase 199-05 78-LOC scaffold into the canonical surface
 * Plan 200-05 specifies (D-200-13 / D-200-14 / D-200-15 / D-200-17,
 * RESEARCH §D "Final Composer"):
 *
 *   • <ComposerPrimitive.Unstable_TriggerPopoverRoot> wraps the Root
 *     so both `@` and `/` ComposerTriggerPopover children render their
 *     popups correctly (RESEARCH §J8 Pitfall — popovers don't surface
 *     outside this root).
 *
 *   • Footer-strip layout (Grok pattern): LEFT cluster carries the
 *     attachment "+" button + the inline <LivAiModelPicker>. RIGHT
 *     carries the Send/Stop affordance (ArrowUp when idle, Square when
 *     thread.isRunning). Closes envelope item 12 (model picker lives
 *     INSIDE composer, not header).
 *
 *   • `<ComposerTriggerPopover char="@" {...mention} />` mounts the
 *     Plan 200-03 static catalog of 7 tools.
 *   • `<ComposerTriggerPopover char="/" {...slash} />` mounts the
 *     Plan 200-04 canonical slash adapter (4 commands).
 *
 *   • `data-empty` / `data-running` attributes on Root drive the
 *     `group-data-[empty=false]/composer:max-w-0` collapse-while-typing
 *     CSS wrapper around the picker (D-200-13).
 *
 * Sibling-placement note (Pitfall 8 / RESEARCH §B1.3): the two
 * <ComposerTriggerPopover> elements sit as siblings of
 * <ComposerPrimitive.Root> INSIDE <Unstable_TriggerPopoverRoot> — NOT
 * nested inside Root itself.
 *
 * Pitfall 6 — Single model picker: the legacy <LivAiHeaderBar> mount
 * point is DELETED in this plan (header-bar.tsx + header-bar.test.tsx
 * removed). The only place <LivAiModelPicker> renders is here, in the
 * composer footer-strip. The `data-testid="liv-ai-model-picker-trigger"`
 * therefore appears exactly ONCE in any rendered DOM (regression-locked
 * by composer.test.tsx).
 *
 * INV-200-05 — ALL placeholder + button-label copy is ENGLISH. No
 * Turkish strings. Placeholder is "Ask Liv anything…".
 */

import {ArrowUp, Square} from 'lucide-react'

import {
	AuiIf,
	ComposerPrimitive,
	useAssistantRuntime,
	useAuiState,
} from '@assistant-ui/react'

import {
	ComposerAddAttachment,
} from '@/components/assistant-ui/attachment'
import {ComposerTriggerPopover} from '@/components/assistant-ui/composer-trigger-popover'
import {TooltipIconButton} from '@/components/assistant-ui/tooltip-icon-button'
import {Button} from '@/shadcn-components/ui/button'

import {useLivAiMentionAdapter} from './mention-adapter'
import {LivAiModelPicker} from './model-picker'
import type {LivAiModelId} from './models'
import {useLivAiSlashAdapter} from './slash-adapter'

export interface LivAiComposerProps {
	selectedModel: LivAiModelId
	onModelChange: (next: LivAiModelId) => void
}

/**
 * Canonical Liv AI composer. Mounted by `<Assistant />` in BOTH AuiIf
 * branches (empty hero + chat ViewportFooter) — runtime preserves text
 * + focus across the empty→chat transition (RESEARCH Pitfall 7).
 */
export function LivAiComposer({
	selectedModel,
	onModelChange,
}: LivAiComposerProps) {
	// `data-empty` / `data-running` attributes power the
	// `group-data-[empty=…]/composer:*` Tailwind rules — read both bits
	// of state and forward them onto <ComposerPrimitive.Root /> below.
	const isEmpty = useAuiState(
		(s: {composer: {isEmpty: boolean}}) => s.composer.isEmpty,
	)
	const isRunning = useAuiState(
		(s: {thread: {isRunning: boolean}}) => s.thread.isRunning,
	)
	const runtime = useAssistantRuntime()

	const mention = useLivAiMentionAdapter()
	const slash = useLivAiSlashAdapter(runtime)

	return (
		<ComposerPrimitive.Unstable_TriggerPopoverRoot>
			<ComposerPrimitive.Root
				className='group/composer relative mx-auto mb-3 w-full max-w-3xl'
				data-empty={isEmpty}
				data-running={isRunning}
			>
				<div className='flex w-full flex-col gap-2 rounded-3xl border bg-background p-2.5 focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20'>
					<ComposerPrimitive.Input
						placeholder='Ask Liv anything…'
						className='max-h-32 min-h-10 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground/80'
						rows={1}
						autoFocus
						aria-label='Message input'
					/>
					<div className='flex items-center justify-between gap-2'>
						<div className='flex items-center gap-1'>
							<ComposerAddAttachment />
							{/*
							 * D-200-13 — model picker collapse-while-typing.
							 * LivAiModelPicker (Phase 199-04) has no internal
							 * collapse CSS, so the wrapper layer here applies the
							 * `group-data-[empty=...]/composer:max-w-*` rule against
							 * the parent <ComposerPrimitive.Root data-empty="…">.
							 */}
							<div className='overflow-hidden transition-[max-width] group-data-[empty=false]/composer:max-w-0 group-data-[empty=true]/composer:max-w-40'>
								<LivAiModelPicker
									value={selectedModel}
									onChange={onModelChange}
								/>
							</div>
						</div>
						<AuiIf condition={(s: {thread: {isRunning: boolean}}) => !s.thread.isRunning}>
							<ComposerPrimitive.Send asChild>
								<TooltipIconButton
									tooltip='Send'
									variant='primary'
									className='size-8 rounded-full p-0'
									aria-label='Send message'
									data-testid='liv-ai-composer-send'
								>
									<ArrowUp className='size-4' />
								</TooltipIconButton>
							</ComposerPrimitive.Send>
						</AuiIf>
						<AuiIf condition={(s: {thread: {isRunning: boolean}}) => s.thread.isRunning}>
							<ComposerPrimitive.Cancel asChild>
								<Button
									variant='primary'
									size='icon-only'
									className='size-8 min-w-0 rounded-full p-0'
									aria-label='Stop'
									data-testid='liv-ai-composer-stop'
								>
									<Square className='size-3 fill-current' />
								</Button>
							</ComposerPrimitive.Cancel>
						</AuiIf>
					</div>
				</div>

				{/* @ mention popover — Plan 200-03 static catalog of 7 tools */}
				<ComposerTriggerPopover char='@' {...mention} />

				{/* / slash command popover — Plan 200-04 canonical adapter */}
				<ComposerTriggerPopover char='/' {...slash} />
			</ComposerPrimitive.Root>
		</ComposerPrimitive.Unstable_TriggerPopoverRoot>
	)
}

export default LivAiComposer
