import {useEffect, useRef} from 'react'

import {useMobileApp} from './mobile-app-context'

/**
 * Integrates MobileAppContext with the browser History API so that the
 * Android hardware back button and iOS swipe-back gesture close the active app.
 *
 * Call this hook inside MobileAppRenderer (not in the context provider).
 */
export function useMobileBack() {
	const {activeApp, closeApp} = useMobileApp()
	const prevAppRef = useRef(activeApp)

	// Push a history entry when an app opens (null -> non-null transition)
	useEffect(() => {
		const prev = prevAppRef.current
		prevAppRef.current = activeApp

		if (prev === null && activeApp !== null) {
			window.history.pushState({mobileApp: activeApp.appId}, '')
		}
	}, [activeApp])

	// Listen for popstate (hardware back / swipe-back) to close the active app
	useEffect(() => {
		function onPopState() {
			if (prevAppRef.current !== null) {
				closeApp()
			}
		}

		window.addEventListener('popstate', onPopState)
		return () => window.removeEventListener('popstate', onPopState)
	}, [closeApp])
}
