import type {OnboardingData} from '../constants'
import {Confetti} from '../effects/confetti'
import {Icon} from '../icon'

const WALLPAPER_NAMES: Record<string, string> = {
	fluid: 'Fluid',
	graphite: 'Graphite',
	aurora: 'Aurora',
	sand: 'Sand',
	paper: 'Paper',
	mono: 'Mono',
}
type Props = {
	data: OnboardingData
	onEnter: () => void
	isActive: boolean
}

export function DoneStep({data, onEnter, isActive}: Props) {
	const firstName = (data.name || 'Bruce').trim().split(' ')[0]
	return (
		<div
			className='done'
			style={{
				display: 'flex',
				flexDirection: 'column',
				padding: '16px 0',
				textAlign: 'center',
				alignItems: 'center',
			}}
		>
			<Confetti active={isActive} />
			<div className='done-brand'>
				<span className='done-brand-welcome'>Welcome to</span>
				<span className='done-brand-mark' aria-hidden='true'></span>
				<span className='done-brand-word'>Livinity</span>
			</div>
			<div className='onb-eyebrow fade-up d1' style={{marginTop: 28}}>
				05 · You're all set
			</div>
			<h1 className='onb-title fade-up d2' style={{marginTop: 8}}>
				You're all set, <span className='done-name'>{firstName}</span>.
			</h1>
			<p className='onb-sub fade-up d3' style={{margin: '12px auto 0', maxWidth: '38ch'}}>
				Your Livinity server is ready. Liv is connected and listening for your first request.
			</p>

			<div className='done-summary fade-up d4'>
				<div className='done-row'>
					<div className='lbl'>Account</div>
					<div className='val'>
						{firstName} <span className='val-sub'>· password</span>
					</div>
				</div>
				<div className='done-row'>
					<div className='lbl'>Wallpaper</div>
					<div className='val'>{WALLPAPER_NAMES[data.wallpaper] || 'Fluid'}</div>
				</div>
				<div className='done-row'>
					<div className='lbl'>Engine</div>
					<div className='val'>Claude · connected</div>
				</div>
			</div>

			<div className='fade-up d5' style={{marginTop: 28}}>
				<button className='btn btn-primary btn-lg' onClick={onEnter}>
					Enter Dashboard <Icon name='arrow-right' size={14} />
				</button>
			</div>
		</div>
	)
}
