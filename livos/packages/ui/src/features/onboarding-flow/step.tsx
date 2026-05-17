import type {ReactNode} from 'react'

import type {StepperDir} from './use-stepper'

type Props = {
	stepIndex: number
	current: number
	prev: number | null
	dir: StepperDir
	children: ReactNode
}

/**
 * Step wrapper — composes the .onb-step transition classes based on whether
 * the step is the active one, the one we just left, or neither (in which
 * case it renders nothing).
 */
export function Step({stepIndex, current, prev, dir, children}: Props) {
	let cls = 'onb-step'
	if (stepIndex === current) {
		cls += ' is-active'
		if (dir === 'back') cls += ' is-back-in'
	} else if (stepIndex === prev) {
		cls += dir === 'forward' ? ' is-leaving-forward' : ' is-leaving-back'
	} else {
		return null
	}
	return <div className={cls}>{children}</div>
}
