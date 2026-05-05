/**
 * LivNeedsHelpCard — Phase 72-native-05 (CU-LOOP-04 / CU-LOOP-05).
 *
 * Banner card surfaced inside LivToolPanel when the bytebot agent emits
 * `set_task_status` with `status='needs_help'`. Reads the `_liv_meta`
 * extension field on the tool result (D-NATIVE-08) — when
 * `_liv_meta.kind === 'needs-help'`, this card renders with three
 * affordances:
 *   1. Take over    — (primary)   parent should hand control to the user.
 *   2. Provide guidance — (secondary) toggles an inline textarea that, on
 *      submit, posts free-text guidance back to the agent run.
 *   3. Cancel task  — (tertiary)  parent should stop the run.
 *
 * D-21 binding contract:
 *   - P66 tokens only (`var(--liv-accent-amber)`, `var(--liv-bg-elevated)`,
 *     `liv-elevated` Card variant). NO hex literals (asserted by unit tests).
 *   - GlowPulse motion on banner border (color="amber").
 *   - 3 buttons with stable testids (`liv-needs-help-takeover` /
 *     `liv-needs-help-guidance` / `liv-needs-help-cancel`) for parent
 *     wiring + UAT scripts.
 *
 * Surface:
 *   <LivNeedsHelpCard
 *     snapshot={currentSnapshot!}
 *     onTakeOver={() => ...}
 *     onSubmitGuidance={(text) => ...}
 *     onCancel={() => ...}
 *   />
 *
 * Wire-up site: livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx —
 * additive mount at the top of the panel body, gated by
 * `shouldShowNeedsHelpCard(currentSnapshot)`.
 *
 * Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` not touched.
 */
import {useState} from 'react'

import {Card} from '@/components/ui/card'
import {GlowPulse} from '@/components/motion'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'

import type {ToolCallSnapshot} from '@/stores/liv-tool-panel-store'

// ─────────────────────────────────────────────────────────────────────
// Pure helper (D-NATIVE-08)
// ─────────────────────────────────────────────────────────────────────

/**
 * Predicate: does the given snapshot represent an agent emission that
 * should surface the LivNeedsHelpCard banner?
 *
 * Returns true ONLY when ALL of the following hold:
 *   - snapshot != null
 *   - snapshot.category === 'computer-use'
 *   - snapshot.toolName ends with 'set_task_status' (so both
 *     `mcp_bytebot_set_task_status` and any future server-prefix variant fire)
 *   - tool result output (parsed if string) has `_liv_meta?.kind === 'needs-help'`
 *
 * Defensive: JSON parse errors are swallowed (unparseable string output is
 * treated as not-a-needs-help signal, returning false).
 */
export function shouldShowNeedsHelpCard(snapshot: ToolCallSnapshot | null): boolean {
	if (!snapshot) return false
	if (snapshot.category !== 'computer-use') return false
	if (!snapshot.toolName.endsWith('set_task_status')) return false

	const output = snapshot.toolResult?.output
	if (output == null) return false

	let parsed: unknown = output
	if (typeof output === 'string') {
		try {
			parsed = JSON.parse(output)
		} catch {
			return false
		}
	}

	if (typeof parsed !== 'object' || parsed === null) return false
	const meta = (parsed as {_liv_meta?: unknown})._liv_meta
	if (typeof meta !== 'object' || meta === null) return false
	const kind = (meta as {kind?: unknown}).kind
	return kind === 'needs-help'
}

/**
 * Extract the human-readable message from the snapshot's _liv_meta. Returns
 * empty string when the meta is missing or malformed (defensive — this helper
 * is only called from inside the render path AFTER shouldShowNeedsHelpCard
 * has already gated the snapshot, so the missing-meta branches are
 * effectively dead code, kept for type safety).
 */
function extractNeedsHelpMessage(snapshot: ToolCallSnapshot): string {
	const output = snapshot.toolResult?.output
	if (output == null) return ''
	let parsed: unknown = output
	if (typeof output === 'string') {
		try {
			parsed = JSON.parse(output)
		} catch {
			return ''
		}
	}
	if (typeof parsed !== 'object' || parsed === null) return ''
	const meta = (parsed as {_liv_meta?: unknown})._liv_meta
	if (typeof meta !== 'object' || meta === null) return ''
	const message = (meta as {message?: unknown}).message
	return typeof message === 'string' ? message : ''
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export interface LivNeedsHelpCardProps {
	snapshot: ToolCallSnapshot
	onTakeOver?: () => void
	onSubmitGuidance?: (text: string) => void
	onCancel?: () => void
}

export default function LivNeedsHelpCard({
	snapshot,
	onTakeOver,
	onSubmitGuidance,
	onCancel,
}: LivNeedsHelpCardProps) {
	const [showGuidance, setShowGuidance] = useState(false)
	const [guidanceText, setGuidanceText] = useState('')

	const message = extractNeedsHelpMessage(snapshot)

	const handleSubmitGuidance = () => {
		const trimmed = guidanceText.trim()
		if (trimmed.length === 0) return
		onSubmitGuidance?.(trimmed)
		setGuidanceText('')
		setShowGuidance(false)
	}

	return (
		<GlowPulse color='amber' blur='soft' duration={2}>
			<Card
				variant='liv-elevated'
				className={cn(
					'm-3 flex flex-col gap-3 border-[color:var(--liv-accent-amber)]',
				)}
				data-testid='liv-needs-help-card'
			>
				{/* Header / banner copy */}
				<div className='flex flex-col gap-1'>
					<div
						className='text-h3 text-[color:var(--liv-accent-amber)]'
						data-testid='liv-needs-help-banner'
					>
						Liv needs help
					</div>
					{message ? (
						<div
							className='text-body text-[color:var(--liv-text-default)]'
							data-testid='liv-needs-help-message'
						>
							{message}
						</div>
					) : null}
				</div>

				{/* Action buttons */}
				<div className='flex flex-wrap gap-2'>
					<Button
						variant='liv-primary'
						size='sm'
						onClick={() => onTakeOver?.()}
						data-testid='liv-needs-help-takeover'
					>
						Take over
					</Button>
					<Button
						variant='default'
						size='sm'
						onClick={() => setShowGuidance((prev) => !prev)}
						data-testid='liv-needs-help-guidance'
						aria-expanded={showGuidance}
					>
						Provide guidance
					</Button>
					<Button
						variant='ghost'
						size='sm'
						onClick={() => onCancel?.()}
						data-testid='liv-needs-help-cancel'
					>
						Cancel task
					</Button>
				</div>

				{/* Inline textarea — toggled by 'Provide guidance' button */}
				<div
					data-testid='liv-needs-help-guidance-panel'
					data-state={showGuidance ? 'open' : 'closed'}
					className={cn('flex flex-col gap-2', showGuidance ? 'block' : 'hidden')}
				>
					<textarea
						value={guidanceText}
						onChange={(e) => setGuidanceText(e.target.value)}
						placeholder='Describe what Liv should do next…'
						rows={3}
						data-testid='liv-needs-help-guidance-textarea'
						className={cn(
							'w-full rounded-md border border-[color:var(--liv-border-subtle)] p-2',
							'bg-[color:var(--liv-bg-elevated)] text-body text-[color:var(--liv-text-default)]',
							'focus:outline-none focus:ring-2 focus:ring-[color:var(--liv-accent-amber)]',
						)}
					/>
					<div className='flex justify-end gap-2'>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => {
								setShowGuidance(false)
								setGuidanceText('')
							}}
							data-testid='liv-needs-help-guidance-discard'
						>
							Discard
						</Button>
						<Button
							variant='liv-primary'
							size='sm'
							onClick={handleSubmitGuidance}
							disabled={guidanceText.trim().length === 0}
							data-testid='liv-needs-help-guidance-submit'
						>
							Submit guidance
						</Button>
					</div>
				</div>
			</Card>
		</GlowPulse>
	)
}
