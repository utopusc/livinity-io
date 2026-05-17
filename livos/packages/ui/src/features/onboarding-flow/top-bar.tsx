import {STEP_NAMES, TOTAL, fmtEta} from './constants'
import {SoundToggle} from './effects/sound-provider'
import type {Stepper} from './use-stepper'

type Props = {
	stepper: Stepper
	labelChanging: boolean
	eta: number
}

/**
 * Top bar: brand · segmented progress (with step name + counter + ETA) · sound toggle.
 * Earlier steps are clickable (jump back); later steps are disabled.
 */
export function TopBar({stepper, labelChanging, eta}: Props) {
	return (
		<div className='onb-top'>
			<div className='onb-top-brand'>
				<span className='onb-top-mark'></span>
				<span>Livinity</span>
			</div>
			<div className='onb-progress' aria-label='Onboarding progress'>
				<div className='onb-progress-bar' role='tablist'>
					{Array.from({length: TOTAL}, (_, i) => (
						<button
							key={i}
							className={`seg ${i < stepper.idx ? 'done' : i === stepper.idx ? 'active' : ''} ${
								i <= stepper.idx ? 'clickable' : ''
							}`}
							onClick={() => {
								if (i < stepper.idx) stepper.go(i)
							}}
							aria-label={`Step ${i + 1}: ${STEP_NAMES[i]}`}
							aria-current={i === stepper.idx ? 'step' : undefined}
							aria-disabled={i > stepper.idx ? true : undefined}
							role='tab'
							disabled={i > stepper.idx}
						>
							<span className='seg-fill'></span>
						</button>
					))}
				</div>
				<div className='onb-progress-label'>
					<span className={`name ${labelChanging ? 'is-changing' : ''}`}>
						{STEP_NAMES[stepper.idx]}
					</span>
					<span className='sep'>·</span>
					<span className='counter'>
						{String(stepper.idx + 1).padStart(2, '0')} of {String(TOTAL).padStart(2, '0')}
					</span>
					<span className='sep'>·</span>
					<span className='eta'>{fmtEta(eta)}</span>
				</div>
			</div>
			<div className='onb-top-meta'>
				<SoundToggle />
			</div>
		</div>
	)
}
