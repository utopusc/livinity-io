import {useCallback, useState} from 'react'

import {toast} from '@/components/ui/toast'
import {trpcReact} from '@/trpc/trpc'
import {MS_PER_HOUR} from '@/utils/date-time'
import {t} from '@/utils/i18n'

export type UpdateState = 'initial' | 'checking' | 'at-latest' | 'update-available' | 'upgrading'

export function useSoftwareUpdate() {
	const utils = trpcReact.useUtils()
	const latestVersionQ = trpcReact.system.checkUpdate.useQuery(undefined, {
		retry: false,
		// Phase 30 hot-patch round 7: aggressive freshness so the bottom-right
		// UpdateNotification card disappears immediately after an update without
		// requiring a hard refresh. Was: refetchOnWindowFocus=false, no staleTime.
		// After: every mount + every window focus refetches; data is always stale.
		// Cost: ~1 GitHub call per tab focus instead of ~1/hour. Quota fine
		// (60/hr unauth, focus events are rare).
		staleTime: 0,
		refetchOnMount: 'always',
		refetchOnReconnect: true,
		refetchOnWindowFocus: true,
		refetchInterval: MS_PER_HOUR, // hourly background poll while idle
	})
	const osVersionQ = trpcReact.system.version.useQuery()

	const currentVersion = osVersionQ.data
	const latestVersion = latestVersionQ.data

	// Feedback a180731e: the GitHub check often resolves in <100ms (cached), so
	// isRefetching flips true→false in a flash and the spinner just twitches.
	// Hold a manual "checking" window for a minimum ~1.6s so the spin reads as a
	// smooth, deliberate action.
	const [minChecking, setMinChecking] = useState(false)
	const MIN_CHECK_MS = 1600

	const checkLatest = useCallback(async () => {
		setMinChecking(true)
		const floor = new Promise((r) => setTimeout(r, MIN_CHECK_MS))
		try {
			utils.system.checkUpdate.invalidate()
			const latestVersion = await utils.system.checkUpdate.fetch()

			if (!latestVersion) {
				throw new Error(t('software-update.failed-to-check'))
			}
		} catch (error) {
			toast.error(t('software-update.failed-to-check'))
		} finally {
			await floor
			setMinChecking(false)
		}
	}, [utils.system.checkUpdate])

	let state: UpdateState = 'initial'
	if (latestVersionQ.isLoading) {
		state = 'initial'
	} else if (latestVersionQ.isRefetching || minChecking) {
		state = 'checking'
	} else if (latestVersionQ.error) {
		state = 'initial'
	} else if (!latestVersionQ.data?.available) {
		state = 'at-latest'
	} else {
		state = 'update-available'
	}

	return {
		state,
		currentVersion,
		latestVersion,
		checkLatest,
	}
}
