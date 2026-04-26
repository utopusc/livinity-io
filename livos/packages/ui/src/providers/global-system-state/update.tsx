import {BarePage} from '@/layouts/bare/bare-page'
import FailedLayout from '@/modules/bare/failed-layout'
import {ProgressLayout} from '@/modules/bare/progress-layout'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

export function useUpdate({onMutate, onSuccess}: {onMutate?: () => void; onSuccess?: (didWork: boolean) => void}) {
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
	})

	const update = () => updateVersionMut.mutate()

	return update
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
