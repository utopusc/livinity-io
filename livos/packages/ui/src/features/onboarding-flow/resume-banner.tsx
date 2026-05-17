type Props = {
	onResume: () => void
	onStartOver: () => void
}

/**
 * Shown on mount if a saved onboarding state exists. Backend-backed
 * (not localStorage) so resume survives device switches.
 */
export function ResumeBanner({onResume, onStartOver}: Props) {
	return (
		<div className='resume-banner'>
			<div className='resume-content'>
				<div className='resume-eyebrow'>Welcome back</div>
				<div className='resume-text'>We saved your setup progress. Pick up where you left off?</div>
			</div>
			<div className='resume-actions'>
				<button className='btn btn-text' onClick={onStartOver}>
					Start over
				</button>
				<button className='btn btn-primary btn-sm' onClick={onResume}>
					Resume
				</button>
			</div>
		</div>
	)
}
