import {BarePage} from '@/layouts/bare/bare-page'
import FailedLayout from '@/modules/bare/failed-layout'
import {ProgressLayout} from '@/modules/bare/progress-layout'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

export function useUpdate({onMutate, onSuccess}: {onMutate?: () => void; onSuccess?: (didWork: boolean) => void}) {
	const utils = trpcReact.useUtils()
	const updateVersionMut = trpcReact.system.update.useMutation({
		onMutate,
		onSuccess: (didWork) => {
			// Phase 30 hot-patch: invalidate checkUpdate so the bottom-right
			// `<UpdateNotification />` and Settings sub-pages refetch the new
			// `.deployed-sha` (written by update.sh near the end of its run) and
			// hide themselves once available === false. Without this, the card
			// would persist until the next 1-hour refetchInterval tick.
			utils.system.checkUpdate.invalidate()
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
