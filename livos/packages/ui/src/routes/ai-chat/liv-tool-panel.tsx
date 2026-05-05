/**
 * LivToolPanel — Phase 68-05 (CONTEXT D-15..D-19).
 *
 * The visible side-panel surface for the v31 AI chat. Consumes the
 * Zustand store from 68-01, the dispatcher from 68-04, the SlideInPanel
 * motion primitive from P66-02, and shadcn `liv-*` variants from P66-03.
 *
 * Layout: fixed right-edge OVERLAY (does NOT push chat layout; D-15).
 *   `fixed inset-y-0 right-0 z-30 w-full md:w-[500px] lg:w-[600px] xl:w-[680px]`
 *
 * Chrome:
 *   - <SlideInPanel from="right"> wrapper (D-16) inside <AnimatePresence>
 *   - <Card variant="liv-elevated"> (D-17) — confirmed shipped at
 *     `@/components/ui/card.tsx` line 32 (P66-03; the shadcn-components/ui
 *     path the plan referenced is a misnomer — the project's Card lives in
 *     `components/ui/card.tsx`).
 *   - Header: close (IconX), tool title, status Badge, step counter
 *     ("Step N of M") with optional <GlowPulse color="cyan"> in live+running.
 *   - Body: dispatched view via `useToolView(toolName)` (68-04). Empty
 *     state when no snapshots.
 *   - Footer: shadcn Slider variant="liv-slider" with prev/next IconChevron
 *     buttons. "Return to live" (cyan-pulsing) when manual+running. "Jump
 *     to latest" outline button when manual+!running.
 *
 * NOT mounted anywhere yet — orphan component until P70 wires it into
 * `ai-chat/index.tsx` (CONTEXT scope_guard line 102). UAT happens post-P70.
 *
 * Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` not touched.
 */

import {AnimatePresence} from 'framer-motion'
import {IconChevronLeft, IconChevronRight, IconPlayerPlay, IconX} from '@tabler/icons-react'
import {useMemo} from 'react'

import {Card} from '@/components/ui/card'
import {GlowPulse, SlideInPanel} from '@/components/motion'
import {useLivToolPanelShortcut} from '@/hooks/use-liv-tool-panel-shortcut'
import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {Slider} from '@/shadcn-components/ui/slider'
import {cn} from '@/shadcn-lib/utils'

import {useLivToolPanelStore, type ToolCallSnapshot} from '@/stores/liv-tool-panel-store'

import LivNeedsHelpCard, {shouldShowNeedsHelpCard} from './components/liv-needs-help-card'
import {useToolView} from './tool-views/dispatcher'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests — D-NO-NEW-DEPS pattern)
// ─────────────────────────────────────────────────────────────────────

/**
 * Step counter formula (CONTEXT D-18):
 *   N = completedSnapshots.indexOf(currentSnapshot) + 1
 *   M = completedSnapshots.length
 *   "Step N of M" when current is in completed; "— of —" otherwise.
 *
 * `completedSnapshots` excludes `status === 'running'` per Suna pattern.
 */
export function computeStepLabel(
	snapshots: readonly ToolCallSnapshot[],
	currentSnapshot: ToolCallSnapshot | null,
): string {
	if (!currentSnapshot) return '— of —'
	const completed = snapshots.filter((s) => s.status !== 'running')
	const idx = completed.findIndex((s) => s.toolId === currentSnapshot.toolId)
	if (idx < 0) return '— of —'
	return `Step ${idx + 1} of ${completed.length}`
}

/**
 * Affordance-visibility predicates (CONTEXT D-19):
 *   - "Return to live": manual mode AND current snapshot is running.
 *   - "Jump to latest": manual mode AND current is NOT running AND there is at least one snapshot.
 *   - The two are mutually exclusive (return-to-live wins when both could match).
 */
export function showReturnToLive(
	mode: 'live' | 'manual',
	currentSnapshot: ToolCallSnapshot | null,
): boolean {
	return mode === 'manual' && currentSnapshot?.status === 'running'
}

export function showJumpToLatest(
	mode: 'live' | 'manual',
	currentSnapshot: ToolCallSnapshot | null,
	snapshotCount: number,
): boolean {
	if (mode !== 'manual') return false
	if (currentSnapshot?.status === 'running') return false
	return snapshotCount > 0
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export function LivToolPanel() {
	useLivToolPanelShortcut()
	const isOpen = useLivToolPanelStore((s) => s.isOpen)
	const navigationMode = useLivToolPanelStore((s) => s.navigationMode)
	const internalIndex = useLivToolPanelStore((s) => s.internalIndex)
	const snapshots = useLivToolPanelStore((s) => s.snapshots)
	const close = useLivToolPanelStore((s) => s.close)
	const goToIndex = useLivToolPanelStore((s) => s.goToIndex)
	const goLive = useLivToolPanelStore((s) => s.goLive)

	const currentSnapshot = useMemo<ToolCallSnapshot | null>(() => {
		if (internalIndex < 0 || internalIndex >= snapshots.length) return null
		return snapshots[internalIndex]
	}, [internalIndex, snapshots])

	// D-22: dispatcher resolution memoised on toolName via useToolView (68-04).
	const View = useToolView(currentSnapshot?.toolName ?? 'generic')

	const stepLabel = computeStepLabel(snapshots, currentSnapshot)
	const sliderMax = Math.max(0, snapshots.length - 1)

	const isLiveRunning = navigationMode === 'live' && currentSnapshot?.status === 'running'
	const showReturn = showReturnToLive(navigationMode, currentSnapshot)
	const showJump = showJumpToLatest(navigationMode, currentSnapshot, snapshots.length)

	return (
		<AnimatePresence>
			{isOpen && (
				<SlideInPanel
					key='liv-tool-panel'
					from='right'
					duration={0.35}
					className='fixed inset-y-0 right-0 z-30 w-full md:w-[500px] lg:w-[600px] xl:w-[680px]'
				>
					<Card
						variant='liv-elevated'
						className='flex h-full w-full flex-col rounded-none border-l border-[color:var(--liv-border-subtle)] p-0'
						data-testid='liv-tool-panel'
						data-tour='liv-tool-panel'
					>
						{/* Header (D-18) */}
						<header className='flex items-center gap-2 border-b border-[color:var(--liv-border-subtle)] p-3'>
							<Button
								variant='ghost'
								size='icon-only'
								onClick={close}
								aria-label='Close panel'
								data-testid='panel-close-btn'
							>
								<IconX className='size-4' />
							</Button>
							<div className='min-w-0 flex-1'>
								<div className='truncate text-h3' data-testid='panel-title'>
									{currentSnapshot?.toolName ?? 'Tool calls'}
								</div>
								<div
									className='text-caption text-[color:var(--liv-text-muted)]'
									data-testid='step-counter'
								>
									{isLiveRunning ? (
										<GlowPulse color='cyan' blur='soft' duration={2}>
											<span>{stepLabel}</span>
										</GlowPulse>
									) : (
										<span>{stepLabel}</span>
									)}
								</div>
							</div>
							{currentSnapshot && (
								<Badge
									variant={
										currentSnapshot.status === 'running' ? 'liv-status-running' : 'default'
									}
									data-testid='panel-status-badge'
								>
									{currentSnapshot.status}
								</Badge>
							)}
						</header>

						{/* Body (D-19) */}
						<div className='flex-1 overflow-y-auto' data-testid='panel-body'>
							{/* Phase 72-native-05 additive mount: NEEDS_HELP banner.
							 * Surfaces when agent emits set_task_status with kind='needs-help'.
							 * Callbacks wire to /api/agent/runs/:runId/control + /api/agent/start
							 * (P67-03 endpoints); 74+ orchestration plans replace these stubs
							 * with the real run-id + cooperative-stop signal threading. */}
							{shouldShowNeedsHelpCard(currentSnapshot) && currentSnapshot ? (
								<LivNeedsHelpCard
									snapshot={currentSnapshot}
									onTakeOver={() => {
										// eslint-disable-next-line no-console -- operator visibility into the takeover gesture (74+ wires the real handoff).
										console.log('[LivNeedsHelpCard] takeover requested')
									}}
									onSubmitGuidance={(text) => {
										// eslint-disable-next-line no-console
										console.log('[LivNeedsHelpCard] guidance submitted:', text)
									}}
									onCancel={() => {
										// eslint-disable-next-line no-console
										console.log('[LivNeedsHelpCard] cancel requested')
									}}
								/>
							) : null}
							{currentSnapshot ? (
								<View snapshot={currentSnapshot} isActive={true} />
							) : (
								<div
									className='p-8 text-center text-caption text-[color:var(--liv-text-muted)]'
									data-testid='panel-empty-state'
								>
									No tool calls yet
								</div>
							)}
						</div>

						{/* Footer / slider (D-19) — only when there are snapshots to navigate */}
						{snapshots.length > 0 && (
							<footer
								className='flex items-center gap-2 border-t border-[color:var(--liv-border-subtle)] p-3'
								data-testid='panel-footer'
							>
								<Button
									variant='ghost'
									size='icon-only'
									onClick={() => goToIndex(Math.max(0, internalIndex - 1))}
									disabled={internalIndex <= 0}
									aria-label='Previous tool call'
									data-testid='panel-prev-btn'
								>
									<IconChevronLeft className='size-4' />
								</Button>
								<Slider
									variant='liv-slider'
									min={0}
									max={sliderMax}
									step={1}
									value={[Math.max(0, Math.min(internalIndex, sliderMax))]}
									onValueChange={([v]) => goToIndex(v)}
									className={cn('flex-1')}
									data-testid='panel-slider'
									aria-label='Navigate tool call history'
								/>
								<Button
									variant='ghost'
									size='icon-only'
									onClick={() => goToIndex(Math.min(sliderMax, internalIndex + 1))}
									disabled={internalIndex >= sliderMax}
									aria-label='Next tool call'
									data-testid='panel-next-btn'
								>
									<IconChevronRight className='size-4' />
								</Button>
								{showReturn && (
									<GlowPulse color='cyan' blur='soft' duration={2}>
										<Button
											variant='liv-primary'
											size='sm'
											onClick={goLive}
											data-testid='panel-return-to-live'
										>
											<IconPlayerPlay className='mr-1 size-3' />
											Return to live
										</Button>
									</GlowPulse>
								)}
								{showJump && (
									<Button
										variant='default'
										size='sm'
										onClick={goLive}
										data-testid='panel-jump-to-latest'
									>
										Jump to latest
									</Button>
								)}
							</footer>
						)}
					</Card>
				</SlideInPanel>
			)}
		</AnimatePresence>
	)
}
