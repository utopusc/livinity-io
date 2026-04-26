import {toast} from '@/components/ui/toast'
import {BarePage} from '@/layouts/bare/bare-page'
import FailedLayout from '@/modules/bare/failed-layout'
import {ProgressLayout} from '@/modules/bare/progress-layout'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// v29.0 UX-01: classify mutation errors so the toast surface text actionable
// remediation (auth expired → re-login, disk full, GitHub unreachable, etc.).
// Pre-v29.0 the mutation had no onError at all and `update()` failures vanished
// silently (BACKLOG 999.6). Pattern: detect well-known prefixes/codes from the
// trpc error message; fall back to the raw message so unknown failures still
// reach the user.
function describeUpdateError(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error')
	const lower = raw.toLowerCase()
	if (lower.includes('unauthorized') || lower.includes('invalid token') || lower.includes('missing token')) {
		return 'Session expired — refresh the page and log in again, then retry the update.'
	}
	if (lower.includes('forbidden')) {
		return 'Only an admin can install updates. Switch to an admin account and retry.'
	}
	if (lower.includes('socket hang up') || lower.includes('econnreset') || lower.includes('econnrefused')) {
		return 'Lost connection to LivOS while starting the update. Refresh the page and retry.'
	}
	if (lower.includes('enospc') || lower.includes('no space')) {
		return 'Server is out of disk space. Free up a few GB on /opt/livos and retry.'
	}
	if (lower.includes('rate limit') || lower.includes('rate-limit') || lower.includes('forbidden') || lower.includes('429')) {
		return 'GitHub rate limit reached. Wait 5–10 minutes and retry.'
	}
	if (lower.includes('enotfound') || lower.includes('eai_again')) {
		return 'Cannot reach GitHub. Check the host network and retry.'
	}
	return raw.slice(0, 240) // cap so toast stays readable
}

export function useUpdate({
	onMutate,
	onSuccess,
	onError,
}: {
	onMutate?: () => void
	onSuccess?: (didWork: boolean) => void
	onError?: (err: unknown) => void
}) {
	const utils = trpcReact.useUtils()
	const updateVersionMut = trpcReact.system.update.useMutation({
		onMutate,
		onSuccess: async (didWork) => {
			// Phase 30 hot-patch round 1 + 7: force-refetch checkUpdate so the
			// bottom-right `<UpdateNotification />` (and Settings sub-pages)
			// pick up the new `.deployed-sha` immediately. invalidate alone
			// only marks the cache stale — refetch ensures the stale data is
			// replaced before the next render cycle. Without this, the card
			// would persist until the user reloaded or focused the window.
			await utils.system.checkUpdate.refetch()
			onSuccess?.(didWork)
		},
		// v29.0 UX-01: surface mutation failures so the user is never left
		// staring at an unchanged UI wondering whether anything happened
		// (BACKLOG 999.6 — "Install Update tıklandı, hiçbir şey olmadı").
		onError: (err) => {
			toast.error(describeUpdateError(err))
			onError?.(err)
		},
	})

	const update = () => updateVersionMut.mutate()

	return {
		update,
		isPending: updateVersionMut.isPending,
		error: updateVersionMut.error,
	}
}

export function UpdatingCover({onRetry}: {onRetry: () => void}) {
	const latestVersionQ = trpcReact.system.checkUpdate.useQuery()
	const updateStatusQ = trpcReact.system.updateStatus.useQuery(undefined, {
		refetchInterval: 500,
	})
	const latestVersion = latestVersionQ.data

	if (!latestVersion) {
		return null
	}

	const {progress, description, running, error} = updateStatusQ.data ?? {}
	const indeterminate = updateStatusQ.isLoading || !running

	return (
		<BarePage>
			{!error && (
				<ProgressLayout
					title={t('software-update.updating-to', {name: latestVersion.version || latestVersion.shortSha})}
					callout={t('software-update.callout')}
					progress={indeterminate ? undefined : progress}
					message={description}
					isRunning={!!running}
				/>
			)}
			{error && (
				<FailedLayout
					title={t('software-update.failed')}
					description={<>Error: {error}</>}
					buttonText={t('software-update.failed.retry')}
					buttonOnClick={onRetry}
				/>
			)}
		</BarePage>
	)
}
