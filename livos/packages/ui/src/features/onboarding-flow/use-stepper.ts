import {useCallback, useEffect, useState} from 'react'

export type StepperDir = 'forward' | 'back'

export type Stepper = {
	idx: number
	prev: number | null
	dir: StepperDir
	next: () => void
	back: () => void
	go: (n: number) => void
}

/**
 * Directional step state with leaving-step bookkeeping. Mirrors the
 * reference useStepper hook: tracks `prev` for 700ms after each transition
 * so the leaving step can animate out, then clears it. `dir` flips based
 * on whether the new index is greater or less than the previous one.
 */
export function useStepper(total: number, initialIdx = 0): Stepper {
	const [idx, setIdx] = useState(initialIdx)
	const [prev, setPrev] = useState<number | null>(null)
	const [dir, setDir] = useState<StepperDir>('forward')

	const next = useCallback(() => {
		setIdx((i) => {
			if (i < total - 1) {
				setPrev(i)
				setDir('forward')
				return i + 1
			}
			return i
		})
	}, [total])

	const back = useCallback(() => {
		setIdx((i) => {
			if (i > 0) {
				setPrev(i)
				setDir('back')
				return i - 1
			}
			return i
		})
	}, [])

	const go = useCallback(
		(n: number) => {
			setIdx((i) => {
				if (n !== i && n >= 0 && n < total) {
					setPrev(i)
					setDir(n > i ? 'forward' : 'back')
					return n
				}
				return i
			})
		},
		[total],
	)

	useEffect(() => {
		if (prev === null) return
		const t = setTimeout(() => setPrev(null), 700)
		return () => clearTimeout(t)
	}, [prev, idx])

	return {idx, prev, dir, next, back, go}
}
