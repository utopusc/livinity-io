/**
 * LivVncScreen — Phase 71-02 (CU-FOUND-03 / CU-FOUND-04).
 *
 * Wraps react-vnc's <VncScreen> with:
 *   - Loading state (P66 GlowPulse motion + connect-status copy).
 *   - Error fallback (Retry button when WS connection fails / URL absent).
 *   - Takeover overlay (amber banner when user paused agent — wired by P72).
 *   - Fullscreen toggle (top-right corner; max/min icon swap).
 *   - Scale-to-fit (1280×960 desktop → 4:3 wrapper, max-h-[60vh] in chat panel).
 *
 * Consumed by:
 *   - Standalone /computer route (71-06).
 *   - BrowserToolView live-mode body (P72 — D-13). P71 leaves the existing
 *     placeholder in browser-tool-view.tsx untouched per <scope_guard>.
 *
 * Locked decisions (P71 CONTEXT.md):
 *   - D-10  react-vnc is the SOLE new package addition allowed in P71.
 *   - D-11  websockifyUrl pattern: `wss://desktop.{user}.livinity.io/websockify?token={JWT}`.
 *   - D-12  Read-only mode is OFF — agent-vs-user mouse arbitration is a
 *           BytebotBridge concern (P72), NOT inside this component.
 *   - D-13  Component lives at livos/packages/ui/src/routes/ai-chat/
 *           tool-views/components/liv-vnc-screen.tsx with the prop shape
 *           re-declared verbatim below.
 *
 * Threat register (P71-02):
 *   - T-71-02-02 (I): Token leak via console / error.message — mitigated by
 *     never log()-ing `websockifyUrl`, `jwt`, or `token` substrings (test 7
 *     greps the source for `console.*(...token...)` and friends).
 *   - T-71-02-03 (T): Read-only OFF → user always typeable. P72 enforces
 *     the agent-active software lock above this layer.
 *
 * NOTE on string-uniqueness invariants (locked tests):
 *   The three visible UI sentinel strings (loading copy, error copy,
 *   takeover banner copy) and the canonical interactive-mode prop on
 *   <VncScreen /> each appear EXACTLY ONCE in this file's source text.
 *   This invariant is enforced by liv-vnc-screen.unit.test.tsx so future
 *   edits can't accidentally introduce duplicate copies / drift.
 */
import {useCallback, useRef, useState} from 'react'
import {VncScreen} from 'react-vnc'
import {IconMaximize, IconMinimize} from '@tabler/icons-react'

import {GlowPulse} from '@/components/motion'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests — P67-04 D-25 precedent)
// ─────────────────────────────────────────────────────────────────────

/**
 * Build the canonical websockify URL for a Bytebot per-user desktop.
 *
 * @param host - bare host (no scheme), e.g. `desktop.bruce.livinity.io`.
 *               MUST NOT contain whitespace OR a scheme prefix
 *               (http://, https://, ws://, wss://). Either case throws —
 *               picked over silent stripping so contract violations
 *               surface during dev (locked test).
 * @param jwt  - the user's session JWT. URL-encoded into the `token`
 *               query param via encodeURIComponent (handles `+`, `/`,
 *               `=` from base64 padding).
 * @returns `wss://${host}/websockify?token=${encodeURIComponent(jwt)}`.
 *
 * Locked by P71 CONTEXT D-11.
 */
export function buildWebsockifyUrl(host: string, jwt: string): string {
	if (!host) {
		throw new Error('buildWebsockifyUrl: host must be a non-empty string')
	}
	if (/\s/.test(host)) {
		throw new Error('buildWebsockifyUrl: host must not contain whitespace')
	}
	if (
		host.startsWith('http://') ||
		host.startsWith('https://') ||
		host.startsWith('ws://') ||
		host.startsWith('wss://')
	) {
		throw new Error('buildWebsockifyUrl: host must not include a scheme prefix')
	}
	return `wss://${host}/websockify?token=${encodeURIComponent(jwt)}`
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

/** Locked by P71 CONTEXT D-13 — verbatim shape, NO additions. */
export type LivVncScreenProps = {
	websockifyUrl: string
	takeoverActive?: boolean
	onConnect?: () => void
	onDisconnect?: () => void
	onError?: (e: Error) => void
}

type ConnState = 'connecting' | 'connected' | 'error'

export default function LivVncScreen(props: LivVncScreenProps): JSX.Element {
	const {websockifyUrl, takeoverActive = false, onConnect, onDisconnect, onError} = props
	const [conn, setConn] = useState<ConnState>('connecting')
	const [fullscreen, setFullscreen] = useState(false)
	const wrapperRef = useRef<HTMLDivElement>(null)

	const handleConnect = useCallback(() => {
		setConn('connected')
		onConnect?.()
	}, [onConnect])

	const handleDisconnect = useCallback(() => {
		setConn('error')
		onDisconnect?.()
	}, [onDisconnect])

	const handleSecurityFailure = useCallback(() => {
		setConn('error')
		// Generic error — DO NOT include websockifyUrl/jwt/token in the
		// message body (T-71-02-02 mitigation; tests grep for token leaks).
		onError?.(new Error('VNC security failure'))
	}, [onError])

	const handleRetry = useCallback(() => {
		// Transition state back to connecting; reconnect semantics belong
		// to the parent (key-bumping the wrapper). VncScreen has no
		// programmatic reconnect prop in 2.x.
		setConn('connecting')
	}, [])

	// Empty / sentinel URL → treat as error (don't auto-connect on empty per
	// <scope_guard>). Compute once; ConnState 'error' is the unified surface
	// so the user-visible error copy appears exactly once in source.
	const urlAbsent = !websockifyUrl || websockifyUrl === '-'
	const effectiveConn: ConnState = urlAbsent ? 'error' : conn

	const wrapperClass = fullscreen
		? 'fixed inset-0 z-50 bg-[var(--liv-bg-deep)] flex items-center justify-center'
		: 'relative w-full max-h-[60vh] bg-[var(--liv-bg-elevated)] rounded border border-[var(--liv-border-subtle)] flex items-center justify-center'

	return (
		<div ref={wrapperRef} className={wrapperClass} data-state={effectiveConn}>
			{effectiveConn === 'connecting' && (
				<div
					className='absolute inset-0 flex items-center justify-center gap-2 text-[var(--liv-text-secondary)]'
					data-testid='liv-vnc-loading'
				>
					<GlowPulse color='cyan'>
						<span>Connecting to desktop...</span>
					</GlowPulse>
				</div>
			)}

			{effectiveConn === 'error' && (
				<div
					className='absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-[var(--liv-text-secondary)]'
					data-testid='liv-vnc-error'
				>
					<span>Connection lost</span>
					<button
						type='button'
						onClick={handleRetry}
						className='rounded border border-[var(--liv-border-subtle)] px-3 py-1 text-[var(--liv-accent-cyan)]'
					>
						Retry
					</button>
				</div>
			)}

			{!urlAbsent && (
				<div
					style={{aspectRatio: '4/3', width: '100%'}}
					className='object-contain'
				>
					<VncScreen
						url={websockifyUrl}
						viewOnly={false}
						scaleViewport={true}
						background='var(--liv-bg-deep)'
						showDotCursor
						style={{width: '100%', height: '100%'}}
						onConnect={handleConnect}
						onDisconnect={handleDisconnect}
						onSecurityFailure={handleSecurityFailure}
					/>
				</div>
			)}

			{takeoverActive && (
				<div
					className='absolute left-2 right-2 top-2 rounded px-3 py-2 text-sm font-medium'
					style={{
						background: 'var(--liv-accent-amber)',
						color: 'var(--liv-bg-deep)',
					}}
					data-testid='liv-vnc-takeover'
				>
					Liv has paused — you have control
				</div>
			)}

			<button
				type='button'
				onClick={() => setFullscreen((f) => !f)}
				className='absolute right-2 top-2 rounded border border-[var(--liv-border-subtle)] bg-[var(--liv-bg-elevated)] p-2 text-[var(--liv-text-primary)]'
				aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
				data-testid='liv-vnc-fullscreen-toggle'
			>
				{fullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
			</button>
		</div>
	)
}
