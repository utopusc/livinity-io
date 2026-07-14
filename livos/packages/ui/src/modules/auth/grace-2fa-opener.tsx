import {useEffect, useRef} from 'react'
import {useSearchParams} from 'react-router-dom'

import {systemAppsKeyed} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'

// IDENT-05 grace-period 2FA opener. Mounted INSIDE WindowManagerProvider so it
// can open windows (the auth gate above it cannot). It consumes the one-shot
// ?setup2fa=1 signal raised by <Grace2faGate/> (ensure-logged-in.tsx) and opens
// the Settings window deep-linked to the 2FA enrol section, then strips the
// param. Opening a window never blocks the desktop — the user can close it and
// keep working (grace period, not a lockout).
const SETTINGS_APP_ID = 'LIVINITY_settings'
const ENROL_ROUTE = '/settings/2fa'

export function Grace2faOpener() {
	const windowManager = useWindowManagerOptional()
	const [searchParams, setSearchParams] = useSearchParams()
	const openedRef = useRef(false)

	useEffect(() => {
		if (searchParams.get('setup2fa') !== '1') return
		// Guard against React StrictMode double-invoke / re-runs before the param
		// is stripped, so we open exactly one Settings window.
		if (openedRef.current) return
		openedRef.current = true

		if (windowManager) {
			const icon = systemAppsKeyed[SETTINGS_APP_ID]?.icon ?? ''
			windowManager.openWindow(SETTINGS_APP_ID, ENROL_ROUTE, 'Settings', icon)
		}

		const next = new URLSearchParams(searchParams)
		next.delete('setup2fa')
		setSearchParams(next, {replace: true})
	}, [searchParams, setSearchParams, windowManager])

	return null
}
