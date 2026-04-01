import {useEffect, useState} from 'react'

/** Returns true when the app is running in standalone PWA mode (installed to home screen) */
export function useIsStandalone(): boolean {
	const [isStandalone, setIsStandalone] = useState(() => {
		// iOS Safari standalone check
		if ('standalone' in navigator && (navigator as {standalone?: boolean}).standalone) {
			return true
		}
		// Android / Chrome / other browsers
		if (window.matchMedia('(display-mode: standalone)').matches) {
			return true
		}
		return false
	})

	useEffect(() => {
		const mql = window.matchMedia('(display-mode: standalone)')
		const handler = (e: MediaQueryListEvent) => setIsStandalone(e.matches)
		mql.addEventListener('change', handler)
		return () => mql.removeEventListener('change', handler)
	}, [])

	return isStandalone
}
