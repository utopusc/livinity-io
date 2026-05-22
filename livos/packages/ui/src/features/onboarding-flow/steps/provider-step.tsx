/* =========================================================
   ProviderStep — Phase 196.1 (absorbs Phase 195-04 ConnectAiStep).

   Operator picks the AI provider. xAI is the only enabled option;
   Claude / OpenAI / Anthropic API are ship-disabled placeholders
   for future phases. Clicking xAI no longer auto-routes to a
   separate Connect AI step — instead the auth flow appears inline
   on this same step (Phase 196.1 redesign). Continue enables only
   after the auth flow completes successfully (connected state).

   State machine (inline auth):
     idle ───click xAI──▶ starting ───start.mutate──▶ awaiting-user
                                                            │
                                                  waitForCompletion
                                                            ▼
                                                       connected
                                                            │
                                                     continue ▶ next step

     Any branch → error → retry (back to idle) | skip

   Security mitigations (carried from Phase 195-04 plan threat_model):
     - T-195-04-01 Tampering: every window.open call is gated by
       `isXaiOAuthUrl()`. Only `https://x.ai/`, `https://auth.x.ai/`,
       or `https://accounts.x.ai/` are allowed. Phase 196.1 widened
       the allow-list to include `accounts.x.ai` because opencode
       1.15+ Headless / Remote / VPS device-code flow emits URLs of
       the form `https://accounts.x.ai/oauth2/device?user_code=…`.
     - T-195-04-02 Denial of Service: 10-minute watchdog while
       awaiting-user — UI never spins forever.
     - T-195-04-03 Information Disclosure: window.open ALWAYS passes
       'noopener,noreferrer'.
     - T-195-04-04 Spoofing: the `connected` state is entered ONLY
       after `status.connected === true`.
   ========================================================= */

import {useEffect, useReducer, useRef} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {FooterBar} from '../footer-bar'
import {Icon} from '../icon'
import type {OnboardingData} from '../constants'

type Props = {
	data: OnboardingData
	setData: (d: OnboardingData) => void
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
}

type ProviderId = 'xai' | 'claude' | 'openai' | 'anthropic'

type ProviderCardSpec = {
	id: ProviderId
	name: string
	subtitle: string
	enabled: boolean
	badge?: string
}

const PROVIDERS: ProviderCardSpec[] = [
	{id: 'xai', name: 'xAI (Grok)', subtitle: 'Connect with your X / xAI account', enabled: true},
	{id: 'claude', name: 'Claude', subtitle: 'Anthropic Claude', enabled: false, badge: 'Coming soon'},
	{id: 'openai', name: 'OpenAI', subtitle: 'GPT family', enabled: false, badge: 'Coming soon'},
	{
		id: 'anthropic',
		name: 'Anthropic API',
		subtitle: 'Direct API key',
		enabled: false,
		badge: 'Coming soon',
	},
]

type AuthState =
	| {kind: 'idle'}
	| {kind: 'starting'}
	| {kind: 'awaiting-user'; url: string; flowId: string}
	| {kind: 'connected'; tier?: number; scopes: string[]}
	| {kind: 'error'; message: string}

/**
 * T-195-04-01 mitigation: tight allow-list for window.open targets.
 * Phase 196.1 widens to accept `accounts.x.ai` for the Headless /
 * Remote / VPS device-code flow URL shape.
 */
export function isXaiOAuthUrl(u: string): boolean {
	try {
		const url = new URL(u)
		if (url.protocol !== 'https:') return false
		return (
			url.hostname === 'x.ai' ||
			url.hostname === 'auth.x.ai' ||
			url.hostname === 'accounts.x.ai'
		)
	} catch {
		return false
	}
}

/**
 * Map raw OAuth scope strings → human-readable capability labels.
 * Speech / transcription chips intentionally absent (xAI 403/404 on those
 * endpoints for SuperGrok Tier 1 per Phase 195 verified facts).
 */
export function mapScopesToDisplay(scopes: string[]): string[] {
	const out: string[] = []
	if (scopes.includes('grok-cli:access')) out.push('Chat')
	if (scopes.includes('api:access')) {
		out.push('Tools', 'Image', 'Video')
	}
	return out
}

function stateReducer(_prev: AuthState, next: AuthState): AuthState {
	return next
}

export function ProviderStep({data, setData, onContinue, onSkip, onBack}: Props) {
	const [state, setState] = useReducer(stateReducer, {kind: 'idle'} as AuthState)
	const startM = trpcReact.auth.xai.start.useMutation()
	const waitM = trpcReact.auth.xai.waitForCompletion.useMutation()
	const ctx = trpcReact.useUtils()
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// T-195-04-02 — 10-minute watchdog while awaiting-user.
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

	async function handleSelectXai() {
		setData({...data, provider: 'xai'} as OnboardingData)
		setState({kind: 'starting'})
		try {
			const {flowId, url} = await startM.mutateAsync()
			if (!isXaiOAuthUrl(url)) {
				setState({
					kind: 'error',
					message: 'Backend returned an unexpected sign-in URL — aborted for safety',
				})
				return
			}
			window.open(url, '_blank', 'noopener,noreferrer')
			setState({kind: 'awaiting-user', url, flowId})
			try {
				await waitM.mutateAsync({flowId})
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
			const message =
				outerErr instanceof Error ? outerErr.message : 'Could not start sign-in'
			setState({kind: 'error', message})
		}
	}

	function handleReopen() {
		if (state.kind === 'awaiting-user' && isXaiOAuthUrl(state.url)) {
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
				<div className='onb-eyebrow'>05 · Provider</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Choose your AI provider
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Liv runs on a single AI provider. Pick xAI to continue — additional
					providers will arrive in upcoming releases.
				</p>
			</div>

			<div
				className='provider-grid fade-up d2'
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
					gap: 12,
				}}
			>
				{PROVIDERS.map((p) => {
					const isXaiSelected = data.provider === 'xai' && p.id === 'xai'
					if (p.enabled) {
						return (
							<button
								key={p.id}
								type='button'
								className='provider-card'
								data-testid={`provider-card-${p.id}`}
								onClick={handleSelectXai}
								disabled={state.kind !== 'idle' && state.kind !== 'error'}
								style={{
									textAlign: 'left',
									padding: 16,
									borderRadius: 12,
									border: `1px solid ${isXaiSelected ? 'var(--cyan, #06b6d4)' : 'var(--line)'}`,
									background: 'var(--surface)',
									color: 'var(--fg)',
									cursor:
										state.kind !== 'idle' && state.kind !== 'error'
											? 'default'
											: 'pointer',
									display: 'flex',
									flexDirection: 'column',
									gap: 4,
									outline: isXaiSelected
										? '2px solid var(--cyan, #06b6d4)'
										: undefined,
								}}
							>
								<div style={{fontSize: 15, fontWeight: 600}}>{p.name}</div>
								<div style={{fontSize: 13, color: 'var(--fg-mute)'}}>{p.subtitle}</div>
							</button>
						)
					}
					// Disabled cards — T-196-03-01 mitigation: NO onClick prop.
					return (
						<button
							key={p.id}
							type='button'
							className='provider-card is-disabled'
							data-testid={`provider-card-${p.id}`}
							aria-disabled='true'
							style={{
								textAlign: 'left',
								padding: 16,
								borderRadius: 12,
								border: '1px solid var(--line)',
								background: 'var(--surface)',
								color: 'var(--fg)',
								opacity: 0.5,
								cursor: 'not-allowed',
								position: 'relative',
								display: 'flex',
								flexDirection: 'column',
								gap: 4,
								pointerEvents: 'auto',
							}}
						>
							<span
								className='provider-card-badge'
								style={{
									position: 'absolute',
									top: 8,
									right: 8,
									fontSize: 11,
									padding: '2px 8px',
									borderRadius: 999,
									background: 'var(--surface)',
									border: '1px solid var(--line)',
									color: 'var(--fg-mute)',
								}}
							>
								{p.badge}
							</span>
							<div style={{fontSize: 15, fontWeight: 600}}>{p.name}</div>
							<div style={{fontSize: 13, color: 'var(--fg-mute)'}}>{p.subtitle}</div>
						</button>
					)
				})}
			</div>

			{/* Inline xAI auth panel — only visible after user picks xAI (Phase 196.1). */}
			{state.kind !== 'idle' && (
				<div
					className='field-card fade-up d2'
					style={{padding: 24}}
					data-testid='inline-auth-panel'
				>
					{state.kind === 'starting' && (
						<div
							style={{display: 'flex', alignItems: 'center', gap: 10}}
							data-testid='xai-starting'
						>
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
								<div style={{fontSize: 14, fontWeight: 500}}>
									Approve the sign-in in the new tab
								</div>
							</div>
							<div style={{fontSize: 13, color: 'var(--fg-mute)'}}>
								Finish authorizing OpenCode in the browser tab that just opened.
								We&apos;ll detect it automatically.
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
										background: 'var(--green, #22c55e)',
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
							<div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
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
								<Icon
									name='shield'
									size={12}
									style={{marginRight: 6, verticalAlign: '-2px'}}
								/>
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
			)}

			<FooterBar
				onBack={onBack}
				onContinue={onContinue}
				onSkip={onSkip}
				continueLabel='Continue'
				continueDisabled={continueDisabled}
				hint={
					state.kind === 'connected'
						? '↵ to continue · esc for back'
						: 'Sign in with xAI above to continue'
				}
			/>
		</div>
	)
}
