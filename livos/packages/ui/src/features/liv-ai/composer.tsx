/**
 * Phase 199-05 — Extracted Composer component.
 *
 * Mounted in BOTH AuiIf branches of <Assistant /> (D-199-18). The SAME
 * <Composer /> module is rendered:
 *   - inside the `thread.isEmpty === true` centered hero (operator types
 *     their first message into a vertically-centered composer), AND
 *   - inside `ThreadPrimitive.ViewportFooter` once the thread has messages
 *     (sticky-footer chat layout).
 *
 * Sharing a single component means the assistant-ui runtime preserves
 * ComposerPrimitive state (text input, focus, IME composition) across
 * the empty→chat transition — operator typing in the centered composer
 * does NOT lose characters when the layout flips to chat on first send
 * (RESEARCH Pitfall 7).
 *
 * `data-empty` / `data-running` attribute pattern (D-199-19) lets future
 * Tailwind CSS state-driven rules (group-data-[empty=true]/composer:…)
 * tighten the composer in one branch without re-rendering. Today's
 * stylesheet treats both branches identically, but the attribute hooks
 * are in place for Plan 199-07 polish work.
 *
 * Model picker placement: a `<div />` slot is reserved next to the Send
 * button — Plan 199-07 (header bar) is the canonical mount point for
 * <LivAiModelPicker />. The slot here exists only to preserve the row
 * layout target shape from RESEARCH Pattern 3 in case 199-07 later
 * decides to add a composer-local picker as a secondary surface; until
 * then it renders empty (no visual artifact).
 */

import {ArrowUp} from 'lucide-react'

import {ComposerPrimitive, useAuiState} from '@assistant-ui/react'

export function Composer() {
	const isEmpty = useAuiState((s: {composer: {isEmpty: boolean}}) =>
		s.composer.isEmpty,
	)
	const isRunning = useAuiState(
		(s: {thread: {isRunning: boolean}}) => s.thread.isRunning,
	)
	return (
		<ComposerPrimitive.Root
			className='group/composer mx-auto mb-3 w-full max-w-3xl'
			data-empty={isEmpty}
			data-running={isRunning}
		>
			<div className='rounded-2xl border bg-card ring-1 ring-border'>
				<ComposerPrimitive.Input
					placeholder='Ask Liv anything...'
					className='w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground'
					rows={1}
					autoFocus
					aria-label='Message input'
				/>
				<div className='flex items-center justify-between p-2'>
					{/*
					 * Plan 199-07 mounts <LivAiModelPicker /> in the header bar
					 * above the layout — leave this slot empty for now to
					 * avoid a duplicate picker. The placeholder div keeps the
					 * justify-between row balanced so the Send button stays at
					 * the right edge.
					 */}
					<div />
					<ComposerPrimitive.Send
						className='rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-30'
						aria-label='Send message'
					>
						<ArrowUp className='size-4' />
					</ComposerPrimitive.Send>
				</div>
			</div>
		</ComposerPrimitive.Root>
	)
}

export default Composer
