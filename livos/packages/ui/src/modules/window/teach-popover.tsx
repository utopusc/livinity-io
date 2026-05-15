// Phase 101-08 Task 2 — TeachPopover.
//
// Radix Popover anchored at click coordinates (x, y) via virtualRef. Hosts
// the instruction-text input "Bu adımı ne için yapıyorsun?" with Save +
// Cancel actions. Replaces the previous Sonner-toast-per-event flow
// (webapp-teach-popup-host.tsx legacy pattern) with a persistent popover
// that BLOCKS until the user enters their intent for the step.
//
// THREAT T-101-04 (XSS via instruction text): the popover's preview line
// (which echoes the user's typing back to them in a small sub-text under
// the input) runs every render through `sanitize()` — strips control bytes
// (0x00-0x1f), strips < and >, and caps at 1024 chars. Radix Content's
// children render through React's text-node escape by default, but the
// inline preview path is the explicit defense layer per the threat
// register's mitigation column.
//
// PendingStep.draftId resets the internal draft state when a NEW pending
// step arrives (rapid-click queue cycling). The host component generates a
// fresh randomId() per click so each popover starts blank.
//
// Sacred SHA: sdk-agent-runner.ts unchanged.

import {useEffect, useMemo, useState} from 'react'
import * as Popover from '@radix-ui/react-popover'

export interface PendingStep {
	x: number
	y: number
	draftId: string
}

export interface TeachPopoverProps {
	pendingStep: PendingStep | null
	onCommit: (instruction: string) => void
	onCancel: () => void
}

/**
 * THREAT T-101-04 mitigation: strip control chars + < > and cap length at
 * 1024. Plain-text input → no DOMPurify dep needed (Radix Content already
 * runs children through React text-node escaping).
 */
export function sanitize(s: string): string {
	if (typeof s !== 'string') return ''
	// eslint-disable-next-line no-control-regex
	return s.replace(/[\x00-\x1f<>]/g, '').slice(0, 1024)
}

export function TeachPopover({pendingStep, onCommit, onCancel}: TeachPopoverProps) {
	const [draft, setDraft] = useState('')

	// Reset draft whenever a new pending step arrives (queue advance).
	useEffect(() => {
		setDraft('')
	}, [pendingStep?.draftId])

	const virtualRef = useMemo(() => {
		if (!pendingStep) return null
		const {x, y} = pendingStep
		return {
			getBoundingClientRect: () => new DOMRect(x, y, 1, 1),
		}
	}, [pendingStep?.x, pendingStep?.y])

	if (!pendingStep || !virtualRef) return null

	const canSave = draft.trim().length > 0
	const previewText = draft.trim().length > 0 ? sanitize(draft) : ''

	return (
		<Popover.Root open={true}>
			{/* virtualRef anchors the Content at (pendingStep.x, pendingStep.y)
			    without needing a real DOM anchor. Radix accepts the
			    `virtualRef` prop with a `getBoundingClientRect`-only ref
			    object — exactly the shape we provide here. */}
			<Popover.Anchor virtualRef={virtualRef as never} />
			<Popover.Portal>
				<Popover.Content
					side='bottom'
					sideOffset={6}
					className='z-50 w-80 rounded-md border border-border-default bg-surface-base p-3 shadow-md'
				>
					<label
						htmlFor='teach-popover-input'
						className='mb-1 block text-xs font-medium text-text-primary'
					>
						Bu adımı ne için yapıyorsun?
					</label>
					<input
						id='teach-popover-input'
						autoFocus
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && canSave) {
								onCommit(draft.trim())
							}
							if (e.key === 'Escape') {
								onCancel()
							}
						}}
						placeholder='Step description'
						className='w-full rounded-radius-sm border border-border-default bg-surface-1 px-2 py-1 text-caption-sm text-text-primary outline-none focus:border-accent-blue'
						maxLength={1024}
					/>
					{previewText ? (
						<div className='mt-1 text-[10px] text-text-tertiary'>
							Preview: {previewText}
						</div>
					) : null}
					<div className='mt-3 flex justify-end gap-2'>
						<button
							type='button'
							onClick={onCancel}
							className='inline-flex h-7 items-center rounded-radius-sm bg-surface-1 px-2 text-caption-sm text-text-primary hover:bg-surface-2'
						>
							Cancel
						</button>
						<button
							type='button'
							onClick={() => onCommit(draft.trim())}
							disabled={!canSave}
							className={
								'inline-flex h-7 items-center rounded-radius-sm bg-accent-blue px-2 text-caption-sm text-white hover:bg-accent-blue/90 ' +
								(!canSave ? 'cursor-not-allowed opacity-50' : '')
							}
						>
							Save
						</button>
					</div>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	)
}

export default TeachPopover
