/* =========================================================
   ProviderStep — Phase 196 Plan 03.

   Rationale: xAI selection is the funnel; the three other
   providers (Claude / OpenAI / Anthropic API) ship as disabled
   placeholders for Phase 197+ work. Clicking the xAI card auto-routes
   to ConnectAiStep in a SINGLE synchronous handler (no setTimeout,
   no useEffect, no requestAnimationFrame) so the operator never has
   to click Continue separately. Other cards omit their onClick prop
   entirely (T-196-03-01 mitigation — not just an HTML `disabled`
   attribute, the click handler simply does not exist).

   Props contract mirrors AccountStep / WallpaperStep / PersonalizeStep:
     {data, setData, onContinue, onSkip, onBack}
   so the wizard's wave-navigation surface stays uniform.

   FooterBar Continue is intentionally inert (continueDisabled=true
   always). The only forward path is via the xAI card. Back still
   works so an operator can return to PersonalizeStep.
   ========================================================= */

import type {OnboardingData} from '../constants'
import {FooterBar} from '../footer-bar'

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

export function ProviderStep({data, setData, onContinue, onBack}: Props) {
	// Phase 196-03 — auto-route handler.
	// Verbatim per plan: setData({...data, provider: 'xai'}) THEN onContinue()
	// in the SAME synchronous handler — single tick, deterministic.
	const handleSelectXai = () => {
		setData({...data, provider: 'xai'} as OnboardingData)
		onContinue()
	}

	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>05 · Provider</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Choose your AI provider
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Liv runs on a single AI provider. Pick xAI to continue — additional providers will arrive
					in upcoming releases.
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
					if (p.enabled) {
						return (
							<button
								key={p.id}
								type='button'
								className='provider-card'
								data-testid={`provider-card-${p.id}`}
								onClick={handleSelectXai}
								style={{
									textAlign: 'left',
									padding: 16,
									borderRadius: 12,
									border: '1px solid var(--cyan, #06b6d4)',
									background: 'var(--surface)',
									color: 'var(--fg)',
									cursor: 'pointer',
									display: 'flex',
									flexDirection: 'column',
									gap: 4,
								}}
							>
								<div style={{fontSize: 15, fontWeight: 600}}>{p.name}</div>
								<div style={{fontSize: 13, color: 'var(--fg-mute)'}}>{p.subtitle}</div>
							</button>
						)
					}
					// Disabled cards — T-196-03-01 mitigation: NO onClick prop registered.
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

			<FooterBar
				onBack={onBack}
				onContinue={() => {
					/* footer Continue is intentionally inert — auto-route only */
				}}
				continueLabel='Continue'
				continueDisabled={true}
				hint='Pick xAI above to continue'
			/>
		</div>
	)
}
