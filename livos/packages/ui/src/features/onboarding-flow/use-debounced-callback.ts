import {useCallback, useEffect, useRef} from 'react'

/**
 * Small useDebouncedCallback — fires the callback only after `delay`ms of
 * inactivity. Used by 137-03 to debounce tone-slider drags so we don't
 * spam `preferences.set` on every pixel of movement.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
	cb: (...args: TArgs) => void,
	delay: number,
): (...args: TArgs) => void {
	const cbRef = useRef(cb)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		cbRef.current = cb
	}, [cb])

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [])

	return useCallback(
		(...args: TArgs) => {
			if (timerRef.current) clearTimeout(timerRef.current)
			timerRef.current = setTimeout(() => cbRef.current(...args), delay)
		},
		[delay],
	)
}
