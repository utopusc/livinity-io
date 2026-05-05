/**
 * LivDesktopViewer — Phase 72 Plan 72-native-04 (CU-LOOP-05).
 *
 * REPLACES the role of the deprecated 71-02 `LivVncScreen`. D-NATIVE-* drops
 * the bytebot-desktop container, which removes the websockify VNC endpoint;
 * we render the same screenshot bytes the agent gets — same source-of-truth,
 * same correctness gate. Polling-PNG is simpler than VNC for our single-user
 * case and matches Bytebot's screenshot-driven mental model.
 *
 * Two display modes (mutually exclusive):
 *   - **snapshot mode** — caller provides `src` as `data:image/png;base64,…`.
 *     Component renders a single static <img>. Used by `BrowserToolView`
 *     (P69) when a `computer_screenshot` tool result arrives in a snapshot.
 *   - **live mode** — caller provides `pollingMs`; component polls the
 *     `computerUse.takeScreenshot` tRPC procedure (72-native-04 backend) at
 *     that cadence and re-renders <img> on each successful response. Used
 *     by the standalone /computer route (71-06) and the LivToolPanel
 *     live-view embed.
 *
 * Defensive fallback (T8 / T-72N4-03): when neither mode resolves (no `src`
 * AND no `pollingMs`, OR src fails the `shouldRenderImg` data-URL guard),
 * the component renders an empty placeholder rather than crashing or
 * feeding arbitrary content into <img src>.
 *
 * Locked decisions (P72 + carried from earlier phases):
 *   - D-NATIVE-04 — Polling PNG, NO VNC. The 71-02 react-vnc viewer file
 *     stays on disk as historical reference but is no longer canonical.
 *   - D-NATIVE-12 — NO new npm deps in UI (D-NO-NEW-DEPS hard).
 *   - D-22 — P66 design tokens only. No hex literals.
 *   - D-25 — Pure helper extraction for unit-testability.
 *
 * Threat register (72-native-04 PLAN <threat_model>):
 *   - T-72N4-02 (DoS) — client default `pollingMs=1000` keeps under 1 req/s
 *     budget; server enforces 1/sec rate limit (existing broker pattern).
 *   - T-72N4-03 (Tampering) — `shouldRenderImg` validates the data-URL
 *     prefix shape before assigning to <img src>; malformed payload renders
 *     empty placeholder, NOT arbitrary content.
 */
import React, {memo, useCallback, useEffect, useMemo, useState} from 'react'

import {GlowPulse} from '@/components/motion'
import {trpcReact} from '@/trpc/trpc'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests — P67-04 D-25 / P71-02 precedent)
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate that a string is a usable PNG data URL before assigning it to
 * `<img src>`. Mitigates T-72N4-03: malformed bytes from a (compromised)
 * poll response can't render arbitrary content — failed validation falls
 * back to the empty placeholder.
 *
 * Accepted shape: `data:image/png;base64,<non-empty-payload>`.
 * Rejected: empty string, null/undefined, http(s) URLs, non-PNG mime types,
 * empty payload after the comma.
 */
export function shouldRenderImg(src: string | null | undefined): boolean {
	if (!src || typeof src !== 'string') return false
	const PREFIX = 'data:image/png;base64,'
	if (!src.startsWith(PREFIX)) return false
	return src.length > PREFIX.length
}

/**
 * Exponential backoff curve for live-mode poll-error recovery.
 *
 * 0 errors → baseMs (no slowdown — first attempt or successful run).
 * n errors → min(baseMs * 2^n, 30_000) — caps at 30s so the UI never
 * stalls indefinitely without showing the user something is wrong.
 *
 * Negative / NaN inputs are normalised to 0 (defensive — a parent that
 * passes a glitchy counter shouldn't crash this).
 */
export function nextPollDelay(consecutiveErrors: number, baseMs: number): number {
	const n =
		Number.isFinite(consecutiveErrors) && consecutiveErrors > 0
			? Math.floor(consecutiveErrors)
			: 0
	const grown = baseMs * Math.pow(2, n)
	return Math.min(grown, 30_000)
}

// ─────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────

export interface LivDesktopViewerProps {
	/**
	 * When provided, component renders this single static screenshot
	 * (`data:image/png;base64,…`). Mutually exclusive with `pollingMs`.
	 */
	src?: string
	/**
	 * When provided (typical: 1000), polls `computerUse.takeScreenshot`
	 * every N ms and re-renders <img> on each success. Mutually exclusive
	 * with `src`. Default poll cadence is the caller's responsibility —
	 * this component does not assume one when omitted.
	 */
	pollingMs?: number
	/** Called with poll/render errors. Parent owns logging policy. */
	onError?: (err: Error) => void
	/** Optional class for outer wrapper. */
	className?: string
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

const WRAPPER_BASE =
	'relative w-full max-h-[60vh] bg-[var(--liv-bg-elevated)] rounded border border-[var(--liv-border-subtle)] flex items-center justify-center'

const ERROR_THRESHOLD = 3

/**
 * Snapshot-mode subtree — parent passes a known-good data URL; we render
 * a single <img>. No fetch loop, no error tracking. Safe to renderToString.
 */
function SnapshotView({src, className}: {src: string; className?: string}): JSX.Element {
	return (
		<div className={[WRAPPER_BASE, className].filter(Boolean).join(' ')} data-state='snapshot'>
			<img
				src={src}
				alt='Desktop snapshot'
				data-testid='liv-desktop-viewer-img'
				style={{width: '100%', height: '100%', objectFit: 'contain'}}
			/>
		</div>
	)
}

/**
 * Empty-mode subtree — neither `src` nor `pollingMs` resolves to renderable
 * content. Renders a passive placeholder so the panel is still demarcated.
 */
function EmptyView({className}: {className?: string}): JSX.Element {
	return (
		<div
			className={[WRAPPER_BASE, className].filter(Boolean).join(' ')}
			data-testid='liv-desktop-viewer-empty'
			data-state='empty'
		>
			<span className='text-[var(--liv-text-secondary)]'>No desktop session</span>
		</div>
	)
}

/**
 * Live-mode subtree — polls the tRPC `computerUse.takeScreenshot` procedure
 * every `pollingMs` and renders the latest result as <img>. Tracks
 * consecutive errors; after 3 in a row, surfaces an error banner with retry.
 *
 * NOTE: this subtree must be mounted under a TRPCProvider (the standard app
 * shell). Snapshot + empty modes do NOT require it — the parent dispatcher
 * picks which subtree to mount based on props, so a caller that never sets
 * `pollingMs` never pays the provider cost.
 */
function LiveView({
	pollingMs,
	className,
	onError,
}: {
	pollingMs: number
	className?: string
	onError?: (err: Error) => void
}): JSX.Element {
	const [consecutiveErrors, setConsecutiveErrors] = useState(0)
	const effectiveInterval = useMemo(
		() => nextPollDelay(consecutiveErrors, pollingMs),
		[consecutiveErrors, pollingMs],
	)

	const query = trpcReact.computerUse.takeScreenshot.useQuery(undefined, {
		refetchInterval: effectiveInterval,
		refetchIntervalInBackground: false,
		retry: false,
	})

	// Track consecutive errors for backoff + threshold-3 banner.
	useEffect(() => {
		if (query.isError && query.error) {
			setConsecutiveErrors((n) => n + 1)
			onError?.(new Error(query.error.message ?? 'screenshot fetch failed'))
		} else if (query.isSuccess) {
			setConsecutiveErrors(0)
		}
	}, [query.isError, query.isSuccess, query.error, onError])

	const handleRetry = useCallback(() => {
		setConsecutiveErrors(0)
		void query.refetch()
	}, [query])

	const src = query.data ? `data:image/png;base64,${query.data.base64}` : undefined
	const showError = consecutiveErrors >= ERROR_THRESHOLD
	const showLoading = !showError && !shouldRenderImg(src)

	return (
		<div
			className={[WRAPPER_BASE, className].filter(Boolean).join(' ')}
			data-state={showError ? 'error' : showLoading ? 'loading' : 'live'}
		>
			{shouldRenderImg(src) && !showError && (
				<img
					src={src}
					alt='Desktop live view'
					data-testid='liv-desktop-viewer-img'
					style={{width: '100%', height: '100%', objectFit: 'contain'}}
				/>
			)}

			{showLoading && (
				<div
					className='absolute inset-0 flex items-center justify-center gap-2 text-[var(--liv-text-secondary)]'
					data-testid='liv-desktop-viewer-loading'
				>
					<GlowPulse color='cyan'>
						<span>Connecting to desktop…</span>
					</GlowPulse>
				</div>
			)}

			{showError && (
				<div
					className='absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-[var(--liv-text-secondary)]'
					data-testid='liv-desktop-viewer-error'
				>
					<span>Desktop unavailable</span>
					<button
						type='button'
						onClick={handleRetry}
						className='rounded border border-[var(--liv-border-subtle)] px-3 py-1 text-[var(--liv-accent-cyan)]'
					>
						Retry
					</button>
				</div>
			)}
		</div>
	)
}

/**
 * Top-level dispatcher — picks the subtree based on props:
 *   - valid `src` → SnapshotView
 *   - `pollingMs` set (and src absent) → LiveView
 *   - neither (or src fails the data-URL guard) → EmptyView
 *
 * Memoised because the typical caller (BrowserToolView) re-renders on
 * unrelated prop churn. If the parent recreates `onError` each render
 * the perf cost lives upstream — document in JSDoc per plan must-have.
 */
function LivDesktopViewerInner(props: LivDesktopViewerProps): JSX.Element {
	const {src, pollingMs, onError, className} = props

	if (shouldRenderImg(src)) {
		return <SnapshotView src={src!} className={className} />
	}
	if (typeof pollingMs === 'number' && pollingMs > 0) {
		return <LiveView pollingMs={pollingMs} className={className} onError={onError} />
	}
	return <EmptyView className={className} />
}

const LivDesktopViewer = React.memo(LivDesktopViewerInner)
LivDesktopViewer.displayName = 'LivDesktopViewer'

export default LivDesktopViewer
