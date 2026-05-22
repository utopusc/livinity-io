import {useEffect, useReducer, useRef} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {FooterBar} from '../footer-bar'
import {Icon} from '../icon'

/* =========================================================
   ConnectAiStep — Phase 195 Plan 04 (replaces the Phase 136
   deferred placeholder that lied to the user with a static
   "AI is connected" panel for the previous provider).

   Real flow:
     idle ───click──▶ starting ───start.mutate──▶ awaiting-user
                                                       │
                                              waitForCompletion
                                                       ▼
                                                  connected
                                                       │
                                                continue ▶ next step

     Any branch → error → retry (back to idle) | skip

   Hidden mechanics (NOT shown to operator):
     - Backend spawns `opencode auth login -p xai -m …` and emits
       a device-code URL via `trpc.auth.xai.start`.
     - This component opens it in a new tab with noopener+noreferrer.
     - Long-poll `trpc.auth.xai.waitForCompletion` survives WS reconnect
       (it's in httpOnlyPaths per Phase 195-03).
     - On success, `trpc.auth.xai.status` reports tier + scopes from
       the JWT — we map scopes → display labels (Chat/Tools/Image/Video).
       Speech / transcription capabilities are intentionally omitted from
       the displayed chips per 2026-05-22 live evidence (xAI 403/404
       on those endpoints for tier-1 SuperGrok).

   Security mitigations (STRIDE — see plan threat_model):
     - T-195-04-01 Tampering: every window.open call is gated by
       `isXaiOAuthUrl()`. Only `https://x.ai/` or `https://auth.x.ai/`
       are allowed. Attacker-controlled URLs (compromised backend or
       MITM injection) land us in error state instead of opening a tab.
     - T-195-04-02 Denial of Service: a 10-minute watchdog
       (setTimeout 600_000) breaks us out of awaiting-user even if
       the user closes the OAuth tab without completing — UI shows
       "Sign-in timed out — click Retry".
     - T-195-04-03 Information Disclosure: window.open ALWAYS passes
       'noopener,noreferrer' to block reverse window.opener access.
     - T-195-04-04 Spoofing: the `connected` state is entered ONLY after
       `status.connected === true`. If status reports false (or throws),
       we transition to error instead of showing a green check.
   ========================================================= */

type Props = {
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
}

type State =
	| {kind: 'idle'}
	| {kind: 'starting'}
	| {kind: 'awaiting-user'; url: string; flowId: string}
	| {kind: 'connected'; tier?: number; scopes: string[]}
	| {kind: 'error'; message: string}

/**
 * T-195-04-01 mitigation: tight allow-list for window.open targets.
 * Returns true only for `https://x.ai/...` or `https://auth.x.ai/...`.
 *
 * Uses the native URL parser (not a regex) so attacker tricks like
 * `https://x.ai.evil.example.com/` or `https:x.ai@evil.example.com/`
 * are caught by hostname comparison, not substring matching.
 */
export function isXaiOAuthUrl(u: string): boolean {
	try {
		const url = new URL(u)
		return url.protocol === 'https:' && (url.hostname === 'x.ai' || url.hostname === 'auth.x.ai')
	} catch {
		return false
	}
}

/**
 * Map raw OAuth scope strings → human-readable capability labels.
 * Speech / transcription chips are INTENTIONALLY absent from this
 * mapping — xAI's speech endpoint returned 403 and transcriptions
 * returned 404 during the 2026-05-22 live audit with the operator's
 * own SuperGrok subscription. Surfacing those chips would be the
 * same dishonest UX bug we are removing from Phase 136. Extend the
 * mapping here if xAI ever ships those capabilities on a future tier.
 */
export function mapScopesToDisplay(scopes: string[]): string[] {
	const out: string[] = []
	if (scopes.includes('grok-cli:access')) out.push('Chat')
	if (scopes.includes('api:access')) {
		out.push('Tools', 'Image', 'Video')
	}
	return out
}

function stateReducer(_prev: State, next: State): State {
	return next
}

export function ConnectAiStep({onContinue, onSkip, onBack}: Props) {
	const [state, setState] = useReducer(stateReducer, {kind: 'idle'} as State)
	const startM = trpcReact.auth.xai.start.useMutation()
	const waitM = trpcReact.auth.xai.waitForCompletion.useMutation()
	const ctx = trpcReact.useUtils()
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// T-195-04-02 — 10-minute watchdog while awaiting-user. Even if the
	// user closes the OAuth tab without completing, we transition to
	// error so the UI never gets stuck spinning forever.
	useEffect(() => {
		if (state.kind !== 'awaiting-user') return
		timeoutRef.current = setTimeout(() => {
			setState({kind: 'error', message: 'Sign-in timed out — click Retry'})
		}, 600_000)
		return () => {
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current)
				timeoutRef.current = null
			}
		}
	}, [state.kind])

	async function handleSignIn() {
		setState({kind: 'starting'})
		try {
			const {flowId, url} = await startM.mutateAsync()
			// T-195-04-01 — URL validation BEFORE window.open. A compromised
			// backend or MITM that injects `https://evil.example.com/oauth`
			// lands here instead of in a malicious new tab.
			if (!isXaiOAuthUrl(url)) {
				setState({
					kind: 'error',
					message: 'Backend returned an unexpected sign-in URL — aborted for safety',
				})
				return
			}
			// T-195-04-03 — noopener,noreferrer prevents reverse window.opener
			// access from the OAuth tab back into Livinity onboarding.
			window.open(url, '_blank', 'noopener,noreferrer')
			setState({kind: 'awaiting-user', url, flowId})
			try {
				await waitM.mutateAsync({flowId})
				// T-195-04-04 — only enter `connected` if status actually reports
				// connected=true. Never trust the waitForCompletion success alone.
				const status = await ctx.auth.xai.status.fetch()
				if (!status.connected) {
					setState({
						kind: 'error',
						message: 'Sign-in completed but no credentials detected',
					})
					return
				}
				setState({
					kind: 'connected',
					tier: status.tier,
					scopes: status.scopes ?? [],
				})
			} catch (innerErr) {
				const message = innerErr instanceof Error ? innerErr.message : 'Sign-in failed'
				setState({kind: 'error', message})
			}
		} catch (outerErr) {
			const message = outerErr instanceof Error ? outerErr.message : 'Could not start sign-in'
			setState({kind: 'error', message})
		}
	}

	function handleReopen() {
		if (state.kind === 'awaiting-user' && isXaiOAuthUrl(state.url)) {
			// Re-validate before re-opening — defensive in case state was
			// somehow tampered after the initial validation.
			window.open(state.url, '_blank', 'noopener,noreferrer')
		}
	}

	function handleRetry() {
		setState({kind: 'idle'})
	}

	const continueDisabled = state.kind !== 'connected'

	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>05 · Connect AI</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Sign in with <em>xAI</em>
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Liv uses Grok as its reasoning engine. Click below to sign in with your X / xAI account —
					a new tab will open to complete authentication.
				</p>
			</div>

			<div className='field-card fade-up d2' style={{padding: 24}}>
				{state.kind === 'idle' && (
					<div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
						<button
							className='btn btn-primary'
							onClick={handleSignIn}
							data-testid='xai-signin-btn'
							style={{alignSelf: 'flex-start'}}
						>
							<Icon name='arrow-right' size={14} style={{marginRight: 6}} />
							Sign in with xAI
						</button>
						<div style={{fontSize: 13, color: 'var(--fg-mute)'}}>
							You'll authenticate in a new browser tab. We never see or store your X password.
						</div>
					</div>
				)}

				{state.kind === 'starting' && (
					<div style={{display: 'flex', alignItems: 'center', gap: 10}} data-testid='xai-starting'>
						<span
							style={{
								width: 16,
								height: 16,
								borderRadius: '50%',
								border: '2px solid var(--fg-mute)',
								borderTopColor: 'transparent',
								animation: 'spin 0.8s linear infinite',
							}}
						/>
						<div style={{fontSize: 14}}>Preparing auth…</div>
					</div>
				)}

				{state.kind === 'awaiting-user' && (
					<div
						style={{display: 'flex', flexDirection: 'column', gap: 12}}
						data-testid='xai-awaiting'
					>
						<div style={{display: 'flex', alignItems: 'center', gap: 10}}>
							<span
								style={{
									width: 16,
									height: 16,
									borderRadius: '50%',
									border: '2px solid var(--fg-mute)',
									borderTopColor: 'transparent',
									animation: 'spin 0.8s linear infinite',
								}}
							/>
							<div style={{fontSize: 14, fontWeight: 500}}>Complete auth in the new tab</div>
						</div>
						<div style={{fontSize: 13, color: 'var(--fg-mute)'}}>
							Finish signing in to xAI in the browser tab that just opened. We'll detect it
							automatically.
						</div>
						<button
							className='btn btn-text'
							onClick={handleReopen}
							data-testid='xai-reopen-btn'
							style={{alignSelf: 'flex-start', fontSize: 12}}
						>
							Reopen tab
						</button>
					</div>
				)}

				{state.kind === 'connected' && (
					<div
						style={{display: 'flex', flexDirection: 'column', gap: 14}}
						data-testid='xai-connected'
					>
						<div style={{display: 'flex', alignItems: 'center', gap: 10}}>
							<span
								style={{
									width: 28,
									height: 28,
									borderRadius: '50%',
									background: 'var(--green)',
									display: 'grid',
									placeItems: 'center',
									color: 'white',
								}}
							>
								<Icon name='check' size={14} />
							</span>
							<div>
								<div style={{fontSize: 15, fontWeight: 600}}>
									{state.tier !== undefined
										? `Connected — SuperGrok Tier ${state.tier}`
										: 'Connected to xAI'}
								</div>
								<div style={{fontSize: 13, color: 'var(--fg-mute)'}}>
									Grok via xAI · authenticated via OpenCode CLI
								</div>
							</div>
						</div>
						<div
							style={{
								display: 'flex',
								gap: 6,
								flexWrap: 'wrap',
							}}
						>
							{mapScopesToDisplay(state.scopes).map((label) => (
								<span
									key={label}
									className='chip'
									style={{
										fontSize: 12,
										padding: '4px 10px',
										borderRadius: 999,
										background: 'var(--surface)',
										border: '1px solid var(--line)',
										color: 'var(--fg)',
									}}
								>
									{label}
								</span>
							))}
						</div>
					</div>
				)}

				{state.kind === 'error' && (
					<div
						style={{display: 'flex', flexDirection: 'column', gap: 12}}
						data-testid='xai-error'
					>
						<div
							className='warn-note'
							style={{
								background: 'var(--red-bg, rgba(220,38,38,0.08))',
								borderColor: 'var(--red, #dc2626)',
								color: 'var(--red, #dc2626)',
								padding: 12,
								borderRadius: 10,
								borderWidth: 1,
								borderStyle: 'solid',
								fontSize: 13,
							}}
						>
							<Icon name='shield' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
							{state.message}
						</div>
						<div style={{display: 'flex', gap: 8}}>
							<button
								className='btn btn-primary'
								onClick={handleRetry}
								data-testid='xai-retry-btn'
							>
								Retry
							</button>
							<button className='btn btn-text' onClick={onSkip} data-testid='xai-skip-link'>
								Skip for now
							</button>
						</div>
					</div>
				)}
			</div>

			<FooterBar
				onBack={onBack}
				onContinue={onContinue}
				onSkip={onSkip}
				continueLabel='Continue'
				continueDisabled={continueDisabled}
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}
