import {useState, useEffect} from 'react'

/** Returns the estimated keyboard height in px (0 when keyboard is closed).
 *  Uses the Visual Viewport API to detect iOS keyboard in standalone PWA mode. */
export function useKeyboardHeight(): number {
	const [keyboardHeight, setKeyboardHeight] = useState(0)

	useEffect(() => {
		const vv = window.visualViewport
		if (!vv) return // No Visual Viewport API (old browsers) -- keyboard height stays 0

		const handleResize = () => {
			// When keyboard opens, visualViewport.height shrinks below window.innerHeight
			const diff = window.innerHeight - vv.height
			// Only count as keyboard if diff > 100px (avoid small rounding differences)
			setKeyboardHeight(diff > 100 ? diff : 0)
		}

		vv.addEventListener('resize', handleResize)
		vv.addEventListener('scroll', handleResize)
		return () => {
			vv.removeEventListener('resize', handleResize)
			vv.removeEventListener('scroll', handleResize)
		}
	}, [])

	return keyboardHeight
}
