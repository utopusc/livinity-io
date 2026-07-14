import {useState} from 'react'
import {TbCpu, TbInfoCircle, TbLoader2, TbAlertTriangle, TbCheck} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Switch} from '@/shadcn-components/ui/switch'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

interface GpuAccessSectionProps {
	appId: string
	appName: string
	/**
	 * The effective initial toggle state, computed by the caller from the app's
	 * persisted override falling back to its manifest GPU permission
	 * (`app.gpuAccess ?? appRequestsGpu`) — mirrors patchComposeFile's server logic.
	 */
	initialEnabled: boolean
}

/**
 * Phase 316-06 (GPU-02 + GPU-01) — GPU access section for the app settings dialog.
 *
 * Clone of public-access-section.tsx: a Switch row bound to
 * `apps.setGpuAccess`, plus a NON-BLOCKING exclusivity WARN banner sourced from
 * `apps.listAppsWithGpuAccess` (TbInfoCircle / text-yellow-400) — the warning
 * never disables the toggle. A guided NVIDIA install affordance (GPU-01) is
 * gated behind `system.detectGpu`: it renders ONLY when an NVIDIA card is
 * detected, offers a one-click toolkit/driver install via
 * `system.installNvidiaGpu`, and — after a driver install — surfaces a
 * reboot-required confirm that reuses the EXISTING `system.restart` primitive
 * (never a new reboot mechanism).
 *
 * All copy flows through `t('gpu-access.*')` against public/locales/{en,tr}.json.
 */
export function GpuAccessSection({appId, appName, initialEnabled}: GpuAccessSectionProps) {
	const utils = trpcReact.useUtils()
	const [enabled, setEnabled] = useState(initialEnabled)
	const [rebootPending, setRebootPending] = useState(false)

	// GPU-02 — per-app toggle. Restarts the app container server-side (T-316-03).
	const setGpuAccessMut = trpcReact.apps.setGpuAccess.useMutation({
		onSuccess: () => {
			utils.apps.state.invalidate({appId})
			utils.apps.list.invalidate()
			utils.apps.listAppsWithGpuAccess.invalidate()
		},
	})

	// GPU-02 exclusivity — ids of OTHER apps currently claiming the GPU (override === true).
	const gpuAppsQuery = trpcReact.apps.listAppsWithGpuAccess.useQuery()
	const otherGpuApps = (gpuAppsQuery.data ?? []).filter((id) => id !== appId)

	// GPU-01 — unprivileged detection gates the whole guided-install block.
	const detectGpuQuery = trpcReact.system.detectGpu.useQuery()
	const installNvidiaGpuMut = trpcReact.system.installNvidiaGpu.useMutation({
		onSuccess: () => {
			// Re-probe so a successful toolkit install collapses the install affordance.
			void detectGpuQuery.refetch()
		},
	})
	// Reboot-confirm reuses the EXISTING system.restart primitive — no new reboot control.
	const restartMut = trpcReact.system.restart.useMutation()

	const handleToggle = (next: boolean) => {
		setEnabled(next)
		setGpuAccessMut.mutate({appId, enabled: next})
	}

	const hasNvidia = detectGpuQuery.data?.hasNvidia ?? false
	const toolkitConfigured = detectGpuQuery.data?.toolkitConfigured ?? false
	const installResult = installNvidiaGpuMut.data

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbCpu className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('gpu-access.title')}</span>
			</div>

			{/* GPU-02 toggle — never disabled by the exclusivity warning below. */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-3'>
					<Switch checked={enabled} onCheckedChange={handleToggle} disabled={setGpuAccessMut.isPending} />
					<p className='text-caption text-text-tertiary'>{t('gpu-access.description', {app: appName})}</p>
				</div>
				{setGpuAccessMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin text-text-secondary' /> : null}
			</div>

			{/* GPU-02 exclusivity — a WARN banner (does NOT block the toggle). */}
			{otherGpuApps.length > 0 ? (
				<div className='rounded-radius-sm border border-border-default bg-surface-base p-4'>
					<div className='flex items-start gap-3'>
						<TbInfoCircle className='mt-0.5 h-5 w-5 text-yellow-400' />
						<p className='text-caption text-text-secondary'>
							{t('gpu-access.exclusivity-warning', {app: otherGpuApps.join(', ')})}
						</p>
					</div>
				</div>
			) : null}

			{setGpuAccessMut.isError ? (
				<p role='alert' className='text-caption text-red-400'>
					{setGpuAccessMut.error?.message ?? 'Failed to update GPU access — try again.'}
				</p>
			) : null}

			{/* GPU-01 guided NVIDIA install — rendered ONLY when an NVIDIA card is detected. */}
			{hasNvidia && !toolkitConfigured ? (
				<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
					<div className='flex items-start gap-3'>
						<TbInfoCircle className='mt-0.5 h-5 w-5 text-yellow-400' />
						<div>
							<p className='text-body-sm font-medium text-text-primary'>{t('gpu-access.install-title')}</p>
							<p className='mt-1 text-caption text-text-secondary'>{t('gpu-access.install-description')}</p>
						</div>
					</div>

					<div className='flex flex-wrap gap-2'>
						<Button
							size='sm'
							variant='default'
							onClick={() => installNvidiaGpuMut.mutate({action: 'install-toolkit'})}
							disabled={installNvidiaGpuMut.isPending}
						>
							{installNvidiaGpuMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{installNvidiaGpuMut.isPending ? t('gpu-access.installing') : t('gpu-access.install-button')}
						</Button>
						<Button
							size='sm'
							variant='ghost'
							onClick={() => {
								installNvidiaGpuMut.mutate({action: 'install-driver'})
								setRebootPending(true)
							}}
							disabled={installNvidiaGpuMut.isPending}
						>
							{t('gpu-access.install-driver-button')}
						</Button>
					</div>

					{installResult && installResult.ok === false ? (
						<p role='alert' className='text-caption text-red-400'>
							{t('gpu-access.install-failed', {reason: installResult.reason})}
						</p>
					) : null}

					{/* Reboot-required confirm — only after a driver install; reuses system.restart. */}
					{rebootPending && installResult?.ok ? (
						<div className='flex items-center gap-2'>
							<TbAlertTriangle className='h-4 w-4 text-yellow-400' />
							<p className='text-caption text-text-secondary'>{t('gpu-access.reboot-required')}</p>
							<Button size='sm' variant='ghost' onClick={() => restartMut.mutate()} disabled={restartMut.isPending}>
								{restartMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
								{t('gpu-access.reboot-button')}
							</Button>
						</div>
					) : null}
				</div>
			) : hasNvidia && toolkitConfigured ? (
				<div className='flex items-center gap-2'>
					<TbCheck className='h-4 w-4 text-green-400' />
					<p className='text-caption text-text-tertiary'>{t('gpu-access.toolkit-ready')}</p>
				</div>
			) : null}
		</div>
	)
}
