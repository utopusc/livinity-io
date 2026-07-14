import {TbCpu, TbInfoCircle, TbLoader2, TbAlertTriangle, TbCheck} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

/**
 * Phase 330-03 (GPU-04, D-1) — guided, vendor/WSL2-branched GPU install card for
 * the Software Update settings section. Extracted from 316's app-settings
 * `gpu-access-section.tsx` so the two guided-install surfaces never drift.
 *
 * Branches on the GPU-03 `system.detectGpu` payload (`vendor` + `wsl2`):
 * - NVIDIA + WSL2  → toolkit-ONLY (`install-toolkit-wsl`), no Linux driver, no
 *   reboot (D-4 — the Windows driver is already in place on WSL2).
 * - NVIDIA bare-metal → 316's toolkit + driver set, with a reboot-confirm that
 *   reuses the EXISTING `system.restart` primitive after a driver install.
 * - AMD bare-metal → a single ROCm access button (`install-amd-rocm`).
 * - AMD on WSL2 / Intel / unknown → informational only (FLAG 2 — never wire the
 *   ROCm install on WSL2).
 * - vendor `none` / no GPU present → renders nothing.
 *
 * WR-02: `installNvidiaGpu` is `adminProcedure` — a non-admin sees the detection
 * info but never a host-mutating control that would 403 on click. All copy flows
 * through `t('software-update.gpu.*')` / `t('gpu-access.*')` (en + tr at parity).
 */
export function GpuInstallSection() {
	// WR-02 — host-mutating controls render for admins only (mirror gpu-access-section.tsx).
	const {isAdmin} = useCurrentUser()

	// GPU-03 — WSL2-aware, vendor-aware detection gates the whole card.
	const detectGpuQuery = trpcReact.system.detectGpu.useQuery()
	const onInstallSuccess = () => {
		// Re-probe so a successful install collapses the install affordance.
		void detectGpuQuery.refetch()
	}
	// IN-01: distinct actions with distinct post-conditions (only the bare-metal
	// driver install needs a reboot) → distinct mutation instances so a failed or
	// abandoned driver install can never leave a stale reboot banner rendering
	// over a later successful toolkit install.
	const installToolkitWslMut = trpcReact.system.installNvidiaGpu.useMutation({onSuccess: onInstallSuccess})
	const installToolkitMut = trpcReact.system.installNvidiaGpu.useMutation({onSuccess: onInstallSuccess})
	const installDriverMut = trpcReact.system.installNvidiaGpu.useMutation({onSuccess: onInstallSuccess})
	const installAmdMut = trpcReact.system.installNvidiaGpu.useMutation({onSuccess: onInstallSuccess})
	// Reboot-confirm reuses the EXISTING system.restart primitive — no new control.
	const restartMut = trpcReact.system.restart.useMutation()

	const gpu = detectGpuQuery.data
	const vendor = gpu?.vendor ?? 'none'
	const wsl2 = gpu?.wsl2 ?? false
	const toolkitConfigured = gpu?.toolkitConfigured ?? false
	// Reboot is required ONLY after a SUCCESSFUL bare-metal driver install.
	const driverInstalledOk = installDriverMut.data?.ok === true
	const installPending =
		installToolkitWslMut.isPending ||
		installToolkitMut.isPending ||
		installDriverMut.isPending ||
		installAmdMut.isPending
	// Surface the failure of whichever of the four actions last failed.
	const installFailure =
		installToolkitWslMut.data && installToolkitWslMut.data.ok === false
			? installToolkitWslMut.data
			: installToolkitMut.data && installToolkitMut.data.ok === false
				? installToolkitMut.data
				: installDriverMut.data && installDriverMut.data.ok === false
					? installDriverMut.data
					: installAmdMut.data && installAmdMut.data.ok === false
						? installAmdMut.data
						: null

	// vendor:'none' / no GPU → render nothing (the majority of boxes see no change).
	if (vendor === 'none' || !gpu?.present) return null

	const header = (
		<div className='flex items-center gap-2'>
			<TbCpu className='h-5 w-5 text-text-primary' />
			<div>
				<span className='text-body-sm font-medium text-text-primary'>{t('software-update.gpu.title')}</span>
				<p className='text-caption text-text-tertiary'>
					{t('software-update.gpu.detected', {vendor, env: wsl2 ? 'WSL2' : 'Linux'})}
				</p>
			</div>
		</div>
	)

	// WR-02 — no host-mutating controls for non-admins; show detection + a note.
	if (!isAdmin) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('gpu-access.admin-only')}</p>
			</div>
		)
	}

	const failureNote = installFailure ? (
		<p role='alert' className='text-caption text-red-400'>
			{t('gpu-access.install-failed', {reason: installFailure.reason})}
		</p>
	) : null

	return (
		<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
			{header}

			{/* NVIDIA + WSL2 → toolkit-only (D-4): never the Linux driver, no reboot. */}
			{vendor === 'nvidia' && wsl2 && !toolkitConfigured ? (
				<div className='space-y-2'>
					<p className='text-caption text-text-secondary'>{t('software-update.gpu.wsl2-toolkit-desc')}</p>
					<Button
						size='sm'
						variant='default'
						onClick={() => installToolkitWslMut.mutate({action: 'install-toolkit-wsl'})}
						disabled={installPending}
					>
						{installToolkitWslMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{installToolkitWslMut.isPending
							? t('gpu-access.installing')
							: t('software-update.gpu.wsl2-toolkit-button')}
					</Button>
					{failureNote}
				</div>
			) : null}

			{/* NVIDIA bare-metal → 316's toolkit + driver set + reboot-confirm. */}
			{vendor === 'nvidia' && !wsl2 && !toolkitConfigured ? (
				<div className='space-y-2'>
					<p className='text-caption text-text-secondary'>{t('gpu-access.install-description')}</p>
					<div className='flex flex-wrap gap-2'>
						<Button
							size='sm'
							variant='default'
							onClick={() => installToolkitMut.mutate({action: 'install-toolkit'})}
							disabled={installPending}
						>
							{installToolkitMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{installToolkitMut.isPending ? t('gpu-access.installing') : t('gpu-access.install-button')}
						</Button>
						<Button
							size='sm'
							variant='ghost'
							onClick={() => installDriverMut.mutate({action: 'install-driver'})}
							disabled={installPending}
						>
							{installDriverMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{t('gpu-access.install-driver-button')}
						</Button>
					</div>
					{failureNote}

					{/* Reboot-required confirm — only after a SUCCESSFUL driver install; reuses system.restart. */}
					{driverInstalledOk ? (
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
			) : null}

			{/* NVIDIA toolkit already configured → ready state. */}
			{vendor === 'nvidia' && toolkitConfigured ? (
				<div className='flex items-center gap-2'>
					<TbCheck className='h-4 w-4 text-green-400' />
					<p className='text-caption text-text-tertiary'>{t('gpu-access.toolkit-ready')}</p>
				</div>
			) : null}

			{/* AMD bare-metal → single ROCm access button (FLAG 2: NEVER on WSL2). */}
			{vendor === 'amd' && !wsl2 ? (
				<div className='space-y-2'>
					<p className='text-caption text-text-secondary'>{t('software-update.gpu.amd-desc')}</p>
					<Button
						size='sm'
						variant='default'
						onClick={() => installAmdMut.mutate({action: 'install-amd-rocm'})}
						disabled={installPending}
					>
						{installAmdMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{installAmdMut.isPending ? t('gpu-access.installing') : t('software-update.gpu.amd-button')}
					</Button>
					{failureNote}
				</div>
			) : null}

			{/* AMD on WSL2 → informational only; ROCm passthrough is unsupported here. */}
			{vendor === 'amd' && wsl2 ? (
				<div className='flex items-start gap-3'>
					<TbInfoCircle className='mt-0.5 h-5 w-5 text-yellow-400' />
					<p className='text-caption text-text-secondary'>{t('software-update.gpu.amd-wsl2-unsupported')}</p>
				</div>
			) : null}

			{/* Intel → detection info only (used automatically for media via /dev/dri). */}
			{vendor === 'intel' ? (
				<div className='flex items-start gap-3'>
					<TbInfoCircle className='mt-0.5 h-5 w-5 text-text-secondary' />
					<p className='text-caption text-text-secondary'>{t('software-update.gpu.intel-info')}</p>
				</div>
			) : null}

			{/* Unknown vendor (WSL2 non-NVIDIA) → informational only; no guided install. */}
			{vendor === 'unknown' ? (
				<div className='flex items-start gap-3'>
					<TbInfoCircle className='mt-0.5 h-5 w-5 text-text-secondary' />
					<p className='text-caption text-text-secondary'>{t('software-update.gpu.unknown-info')}</p>
				</div>
			) : null}
		</div>
	)
}
