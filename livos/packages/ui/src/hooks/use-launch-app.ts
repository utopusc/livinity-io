import {useNavigate} from 'react-router-dom'

import {useApps} from '@/providers/apps'
import {trpcReact} from '@/trpc/trpc'
import {useLinkToDialog} from '@/utils/dialog'
import {t} from '@/utils/i18n'
import {appToUrl, appToUrlWithAppPath, isOnionPage, urlJoin} from '@/utils/misc'

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

		const openInTab = (subPath?: string) => {
			trackOpen.mutate({appId})
			const target = subPath ? urlJoin(appToUrl(app), subPath) : appToUrlWithAppPath(app)
			window.open(target, '_blank')?.focus()
		}

		// Show credentials dialog before first open (unless bypassed)
		if (app.credentials?.showBeforeOpen && !opts?.direct) {
			navigate(linkToDialog('default-credentials', {for: appId, direct: 'true'}))
			return
		}

		// Tor-only apps require .onion access
		if (app.torOnly && !isOnionPage()) {
			alert(t('app-only-over-tor', {app: app.name}))
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
