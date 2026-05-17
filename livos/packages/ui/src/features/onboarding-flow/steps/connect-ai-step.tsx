import {FooterBar} from '../footer-bar'
import {Icon} from '../icon'

/* =========================================================
   ConnectAiStep — honest version per user feedback 2026-05-17:
     "bana soru sormadan bağlandı" (it connected without
     asking me anything — pointing out the fake animation)

   The reference's CLAUDE_SCRIPT animated terminal pretended to
   walk through an Anthropic OAuth device flow, but the wizard
   doesn't actually invoke `claude /login`. Showing a fake
   "connected" sequence is dishonest UX.

   Real Claude broker auth lives at /root/.config/anthropic
   on the host (per memory `[[reference-anthropic-subscription-state]]`).
   The Mini PC's broker subscription is set up via the host
   `claude /login` CLI step that the operator already ran
   (otherwise the AI features wouldn't work at all). The
   wizard's job is to acknowledge that, not re-do it.

   Phase 136 will replace this static panel with a real PTY
   pipe to `claude /login` for first-time setups where Claude
   isn't yet configured. Until then this step is informational.
   ========================================================= */
type Props = {
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
}

export function ConnectAiStep({onContinue, onSkip, onBack}: Props) {
	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>05 · Connect AI</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Sign in with <em>Claude</em>
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Liv uses Anthropic's Claude as its reasoning engine. The broker subscription on this
					Livinity is preconfigured during install — no extra action is needed today.
				</p>
			</div>

			<div className='field-card fade-up d2' style={{padding: 24}}>
				<div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
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
							<div style={{fontSize: 15, fontWeight: 600}}>Claude is connected</div>
							<div style={{fontSize: 13, color: 'var(--fg-mute)'}}>
								claude-sonnet-4.5 · via Livinity broker subscription
							</div>
						</div>
					</div>

					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
							padding: 12,
							background: 'var(--surface)',
							border: '1px solid var(--line)',
							borderRadius: 10,
							fontSize: 13,
							color: 'var(--fg-mute)',
						}}
					>
						<div>
							<strong style={{color: 'var(--fg)'}}>Coming soon:</strong> a one-click way to sign in to
							your own Anthropic account from inside this wizard. Right now, swapping providers happens
							from Settings → AI.
						</div>
					</div>
				</div>
			</div>

			<div className='warn-note fade-up d3'>
				<Icon name='shield' size={12} style={{marginRight: 6, verticalAlign: '-2px'}} />
				Your data stays on this Livinity. The broker only forwards your requests to Anthropic — no
				history is stored upstream.
			</div>

			<FooterBar
				onBack={onBack}
				onContinue={onContinue}
				onSkip={onSkip}
				continueLabel='Continue'
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}
