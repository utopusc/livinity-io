import {Icon} from './icon'

type Props = {
	onBack?: () => void
	onContinue: () => void
	onSkip?: () => void
	continueLabel?: string
	/** Overridable so a step can localise it (368.7); defaults to the English label. */
	skipLabel?: string
	continueDisabled?: boolean
	hint?: string
}

/**
 * Bottom action bar of every wizard step. Three-column grid:
 *   [ Back ] · [ keyboard hint ] · [ Skip | Continue → ]
 */
export function FooterBar({
	onBack,
	onContinue,
	onSkip,
	continueLabel = 'Continue',
	skipLabel = 'Skip for now',
	continueDisabled = false,
	hint,
}: Props) {
	return (
		<div className='onb-foot fade-up d4' style={{marginTop: 'auto', paddingTop: 12}}>
			{onBack ? (
				<button className='btn btn-text' onClick={onBack}>
					<Icon name='arrow-left' size={14} /> Back
				</button>
			) : (
				<span></span>
			)}
			<div className='onb-foot-mid'>{hint && <span className='onb-foot-hint'>{hint}</span>}</div>
			<div className='onb-foot-actions'>
				{onSkip && (
					<button className='btn btn-text' onClick={onSkip}>
						{skipLabel}
					</button>
				)}
				<button className='btn btn-primary' onClick={onContinue} disabled={continueDisabled}>
					{continueLabel} <Icon name='arrow-right' size={14} />
				</button>
			</div>
		</div>
	)
}
