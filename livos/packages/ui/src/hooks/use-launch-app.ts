import {useNavigate} from 'react-router-dom'

import {isHostReady} from '@/hooks/use-app-open-ready'
import {useApps} from '@/providers/apps'
import {trpcReact} from '@/trpc/trpc'
import {useLinkToDialog} from '@/utils/dialog'
import {t} from '@/utils/i18n'
import {appToUrl, appToUrlWithAppPath, urlJoin} from '@/utils/misc'

interface LaunchOptions {
	/** Optional sub-path to append to the app URL */
	path?: string
	/** Skip the credentials dialog even if the app has default credentials */
	direct?: boolean
}

/**
 * Hook that returns a function to launch installed apps.
 * Handles credential dialogs, Tor-only restrictions, usage tracking,
 * native app auto-start, and opens the app in a new browser tab.
 */
export function useLaunchApp() {
	const {userAppsKeyed} = useApps()
	const navigate = useNavigate()
	const linkToDialog = useLinkToDialog()
	const utils = trpcReact.useUtils()

	const trackOpen = trpcReact.apps.trackOpen.useMutation({
		onSuccess: () => utils.apps.recentlyOpened.invalidate(),
	})

	const nativeStartMut = trpcReact.apps.nativeStart.useMutation()

	return async (appId: string, opts?: LaunchOptions) => {
		const app = userAppsKeyed?.[appId]
		if (!app) throw new Error(t('app-not-found', {app: appId}))

		// 287 GUARD: do NOT add an unconditional window.open / <a href> / <link rel=preconnect|dns-prefetch|prefetch> / <iframe src> / auto-open toast / server-side host probe for the per-app host. Any of these forms a DNS query before the client confirms the record resolves and silently re-introduces NXDOMAIN negative-cache poisoning (Phase 287). Gate every open on useAppOpenReady / isHostReady.
		const openInTab = (subPath?: string) => {
			// Phase 287 verify-live gate. useLaunchApp returns a per-invocation async
			// function, so the useAppOpenReady hook cannot be called here (rules of
			// hooks). Instead read readiness imperatively against the SAME signals the
			// hook uses: the backend `subdomainReady` flag on the apps.list payload
			// (Plan 02) AND the synchronous module-level readyHosts cache populated by
			// the client favicon probe (Plan 04 `isHostReady`). If the host is not
			// client-confirmed ready, do NOT window.open — surfacing the provisioning
			// state (the "Hazırlanıyor…" overlay + Open-anyway escape) is the
			// app-icon's job (Plan 05 Task 2). The non-negotiable here: NO DNS query
			// is formed for an unconfirmed host.
			const subdomainReady = Boolean((app as {subdomainReady?: boolean}).subdomainReady)
			let host: string | undefined
			try {
				host = new URL(appToUrl(app)).host
			} catch {
				host = undefined
			}
			if (!subdomainReady || !host || !isHostReady(host)) {
				// Not yet confirmed live from the operator's OWN resolver. Refuse to
				// open (forming the DNS query now is what poisons the negative cache).
				// The app-icon overlay renders the provisioning UI / Open-anyway escape.
				console.warn(`[287] withholding open for ${appId}: host not client-confirmed ready (subdomainReady=${subdomainReady}, host=${host ?? 'n/a'})`)
				return
			}
			trackOpen.mutate({appId})
			const target = subPath ? urlJoin(appToUrl(app), subPath) : appToUrlWithAppPath(app)
			window.open(target, '_blank')?.focus()
		}

		// Show credentials dialog before first open (unless bypassed)
		if (app.credentials?.showBeforeOpen && !opts?.direct) {
			navigate(linkToDialog('default-credentials', {for: appId, direct: 'true'}))
			return
		}

		// Auto-start native app stream before opening URL
		if (app.native) {
			try {
				await nativeStartMut.mutateAsync({appId})
			} catch (error) {
				console.error('Failed to start native app stream:', error)
				// Continue to open anyway — stream might already be running
			}
		}

		openInTab(opts?.path)
	}
}
