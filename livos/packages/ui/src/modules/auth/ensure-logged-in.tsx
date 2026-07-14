import {useEffect} from 'react'
import {useSearchParams} from 'react-router-dom'

import {BareCoverMessage} from '@/components/ui/cover-message'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {RedirectHome, RedirectLogin} from './redirects'

// IDENT-05 grace-period 2FA enrol prompt. The Settings surface is window-only
// (no /settings URL route since the v36 port), and the window-manager lives
// BELOW this auth gate — so this component cannot open the enrol window itself.
// Instead it raises a one-shot, per-session search-param signal (?setup2fa=1)
// that <Grace2faOpener/> (mounted inside WindowManagerProvider) consumes to open
// the Settings → 2FA enrol screen. This is a PROMPT, never a hard lockout: we
// never block render or navigation — the user can dismiss the window and keep
// working; requires2faSetup only drives the nudge.
const GRACE_2FA_SESSION_FLAG = 'liv:2fa-grace-prompted'

export function EnsureLoggedIn({children}: {children?: React.ReactNode}) {
	return (
		<EnsureLoggedInState loggedIn otherwise={<RedirectLogin />}>
			<Grace2faGate>{children}</Grace2faGate>
		</EnsureLoggedInState>
	)
}

/**
 * Reads user.requires2faSetup (true = org policy ON and this user has no TOTP)
 * and, once per browser session, raises the ?setup2fa=1 signal. Always renders
 * its children unchanged — enforcement is a grace-period nudge, not a lockout.
 */
function Grace2faGate({children}: {children?: React.ReactNode}) {
	const [searchParams, setSearchParams] = useSearchParams()
	const requires2faSetupQ = trpcReact.user.requires2faSetup.useQuery(undefined, {staleTime: 30_000})

	useEffect(() => {
		if (requires2faSetupQ.data !== true) return
		// One-shot per session so the prompt never loops or nags every render.
		if (sessionStorage.getItem(GRACE_2FA_SESSION_FLAG) === '1') return
		sessionStorage.setItem(GRACE_2FA_SESSION_FLAG, '1')
		const next = new URLSearchParams(searchParams)
		next.set('setup2fa', '1')
		setSearchParams(next, {replace: true})
	}, [requires2faSetupQ.data, searchParams, setSearchParams])

	return <>{children}</>
}

export function EnsureLoggedOut({children}: {children?: React.ReactNode}) {
	return (
		<EnsureLoggedInState loggedIn={false} otherwise={<RedirectHome />}>
			{children}
		</EnsureLoggedInState>
	)
}

/** Don't show children unless logged in */
function EnsureLoggedInState({
	loggedIn,
	otherwise,
	children,
}: {
	loggedIn: boolean
	otherwise: React.ReactNode
	children?: React.ReactNode
}) {
	const isLoggedInQ = trpcReact.user.isLoggedIn.useQuery(undefined)
	const isLoggedIn = isLoggedInQ.data ?? false
	const wantsLoggedIn = loggedIn

	// ---

	if (isLoggedInQ.isLoading) {
		return <BareCoverMessage delayed>{t('auth.checking-backend-for-user')}</BareCoverMessage>
	}

	if (isLoggedInQ.isError) {
		return <BareCoverMessage>{t('auth.failed-checking-if-user-logged-in')}</BareCoverMessage>
	}

	if (isLoggedIn === wantsLoggedIn) {
		return children
	} else {
		return otherwise
	}
}
