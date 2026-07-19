import {useState} from 'react'
import {TbBolt, TbLoader2, TbAlertTriangle, TbPlayerPlay, TbClockBolt, TbCpu, TbMoon} from 'react-icons/tb'

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

/**
 * Phase 329-10 (HW-02) — power management (HDD spin-down / scheduled shutdown +
 * RTC wake / Wake-on-LAN) from Settings → Power management. Clones
 * `network-section.tsx`'s admin-gate + WSL2 hard-hide + never-throw degrade shape
 * and `power-section.tsx`'s AlertDialog confirm. Wraps the 329-06 `power*`
 * adminProcedures, which reach hdparm/rtcwake/systemctl/ethtool ONLY through
 * `sudo -n livos-power.sh` (329-03); every positional value is zod-constrained
 * server-side (device /^sd[a-z]$/, timeout 0-255, HH:MM, iface name).
 *
 * WSL2 HARD-HIDE (D-20): when `powerStatus.isWsl2` is true the ENTIRE card is
 * hidden — host shutdown / spin-down / WoL are meaningless under a
 * Windows-managed WSL2 VM, so the wrapper is never invoked there.
 *
 * LOCKOUT-SAFE scheduling (D-18): scheduled shutdown/wake is DEFAULT OFF. Arming
 * opens an AlertDialog that spells out the no-software-revert lockout risk (box
 * off + a failed wake means physical access is required) and only proceeds by
 * sending `lockoutAcknowledged:true`; a Test Wake action is surfaced and strongly
 * recommended BEFORE arming. All copy flows through `t('power-mgmt.*')`.
 */
export function PowerManagementSection() {
	const {isAdmin} = useCurrentUser()

	const statusQ = trpcReact.system.powerStatus.useQuery()
	const refetch = () => void statusQ.refetch()

	const spindownSetMut = trpcReact.system.powerSpindownSet.useMutation({onSuccess: refetch})
	const spindownClearMut = trpcReact.system.powerSpindownClear.useMutation({onSuccess: refetch})
	const scheduleSetMut = trpcReact.system.powerScheduleSet.useMutation({onSuccess: refetch})
	const scheduleClearMut = trpcReact.system.powerScheduleClear.useMutation({onSuccess: refetch})
	const testWakeMut = trpcReact.system.powerTestWake.useMutation()
	const wolEnableMut = trpcReact.system.powerWolEnable.useMutation({onSuccess: refetch})
	const wolDisableMut = trpcReact.system.powerWolDisable.useMutation({onSuccess: refetch})
	// PWR-01 (347-01, D-347-2) — power profiles are fully REVERSIBLE, so no lockout gate.
	const profileSetMut = trpcReact.system.powerProfileSet.useMutation({onSuccess: refetch})

	// HDD spin-down form.
	const [device, setDevice] = useState('')
	const [timeout, setTimeoutVal] = useState('')
	// Scheduled shutdown/wake form (DEFAULT OFF — empty until the admin arms it).
	const [shutdown, setShutdown] = useState('')
	const [wake, setWake] = useState('')
	const [armOpen, setArmOpen] = useState(false)
	const [armTriggered, setArmTriggered] = useState(false)
	// Wake-on-LAN form.
	const [iface, setIface] = useState('')

	const busy =
		spindownSetMut.isPending ||
		spindownClearMut.isPending ||
		scheduleSetMut.isPending ||
		scheduleClearMut.isPending ||
		testWakeMut.isPending ||
		wolEnableMut.isPending ||
		wolDisableMut.isPending ||
		profileSetMut.isPending

	const status = statusQ.data?.status
	const isWsl2 = statusQ.data?.isWsl2 === true

	// PWR-01 (347-01) — parse the honest active-profile + hibernate-eligibility lines the
	// wrapper's `status` action now emits (under `-- power profile --` / `-- hibernate
	// eligibility --`). Tolerant of absence: an undeployed/older wrapper yields undefined.
	const statusText = status && status.ok ? status.stdout : ''
	const activeProfile = statusText.match(/active:\s*(.+)/)?.[1]?.trim()
	const hibernateState = statusText.match(/hibernate:\s*(.+)/)?.[1]?.trim()
	const knownProfiles = ['balanced', 'power-saver', 'performance'] as const
	const activeProfileKnown = knownProfiles.includes(activeProfile as (typeof knownProfiles)[number])

	// Map the wrapper's raw hibernate line to a localized honest sentence where practical,
	// else fall back to the raw explanatory text. NEVER an arm affordance (D-347-1).
	const hibernateHonest = (() => {
		if (!hibernateState) return undefined
		if (/WSL2/i.test(hibernateState)) return t('power-mgmt.hibernate.na-wsl2')
		if (/needs persistent swap/i.test(hibernateState)) return t('power-mgmt.hibernate.needs-swap')
		if (/no suspend-to-disk|lacks 'disk'/i.test(hibernateState)) return t('power-mgmt.hibernate.na-no-unit')
		return hibernateState
	})()

	// Client-side guards mirror the server-side zod.
	const deviceValid = /^sd[a-z]$/.test(device)
	const timeoutNum = Number(timeout)
	const timeoutValid = Number.isInteger(timeoutNum) && timeoutNum >= 0 && timeoutNum <= 255
	const hhmm = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
	const shutdownValid = hhmm.test(shutdown)
	const wakeValid = hhmm.test(wake)
	const scheduleValid = shutdownValid && wakeValid
	const ifaceValid = /^[a-z0-9]([a-z0-9._-]{0,13}[a-z0-9])?$/i.test(iface)

	const header = (
		<div className='flex items-center gap-2'>
			<TbBolt className='h-5 w-5 text-text-primary' />
			<div>
				<span className='text-body-sm font-medium text-text-primary'>{t('power-mgmt.title')}</span>
				<p className='text-caption text-text-tertiary'>{t('power-mgmt.description')}</p>
			</div>
		</div>
	)

	// Host-mutating controls render for admins only.
	if (!isAdmin) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('power-mgmt.admin-only')}</p>
			</div>
		)
	}

	// D-20 — WSL2 HARD-HIDE: the entire card is hidden; host power controls are
	// meaningless under a Windows-managed WSL2 VM.
	if (isWsl2) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('power-mgmt.wsl2-note')}</p>
			</div>
		)
	}

	// runPower never throws → not-ok = wrapper not deployed; degrade to a note.
	if (status && status.ok === false) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('power-mgmt.unavailable')}</p>
			</div>
		)
	}

	return (
		<div className='space-y-4 rounded-radius-sm border border-border-default bg-surface-base p-4'>
			{header}

			{/* HDD spin-down — opt-in per-drive. NVMe drives are not applicable. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('power-mgmt.spindown-heading')}</label>
				<p className='text-caption-sm text-text-tertiary'>{t('power-mgmt.nvme-note')}</p>
				<div className='flex flex-wrap items-center gap-2'>
					<Input
						value={device}
						onChange={(e) => setDevice(e.target.value)}
						placeholder={t('power-mgmt.spindown-device-placeholder')}
						disabled={busy}
						className='w-32'
					/>
					<Input
						value={timeout}
						onChange={(e) => setTimeoutVal(e.target.value)}
						placeholder={t('power-mgmt.spindown-timeout-placeholder')}
						disabled={busy}
						inputMode='numeric'
						className='w-40'
					/>
					<Button
						size='sm'
						variant='default'
						onClick={() => spindownSetMut.mutate({device, timeout: timeoutNum})}
						disabled={busy || !deviceValid || !timeoutValid}
					>
						{spindownSetMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('power-mgmt.spindown-set')}
					</Button>
					<Button
						size='sm'
						variant='default'
						onClick={() => spindownClearMut.mutate({device})}
						disabled={busy || !deviceValid}
					>
						{spindownClearMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('power-mgmt.spindown-clear')}
					</Button>
				</div>
			</div>

			{/* Scheduled shutdown + RTC wake — DEFAULT OFF, lockout-ack gated (D-18). */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('power-mgmt.schedule-heading')}</label>
				<p className='text-caption-sm text-text-tertiary'>{t('power-mgmt.schedule-off-note')}</p>

				{/* Test Wake — non-destructive ~180s RTC pre-flight, RECOMMENDED before arming. */}
				<div className='flex items-start gap-2 rounded-radius-sm border border-border-default bg-surface-1 p-3'>
					<TbPlayerPlay className='mt-0.5 h-4 w-4 shrink-0 text-text-tertiary' />
					<div className='space-y-2'>
						<p className='text-caption text-text-tertiary'>{t('power-mgmt.test-wake-hint')}</p>
						<Button
							size='sm'
							variant='default'
							onClick={() => testWakeMut.mutate()}
							disabled={busy}
						>
							{testWakeMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : <TbClockBolt className='mr-1 h-4 w-4' />}
							{t('power-mgmt.test-wake')}
						</Button>
						{testWakeMut.data && testWakeMut.data.ok === false ? (
							<p role='alert' className='text-caption text-red-400'>
								{testWakeMut.data.reason}
							</p>
						) : null}
					</div>
				</div>

				<div className='flex flex-wrap items-center gap-2'>
					<div className='flex flex-col gap-1'>
						<span className='text-caption-sm text-text-tertiary'>{t('power-mgmt.schedule-shutdown')}</span>
						<Input
							type='time'
							value={shutdown}
							onChange={(e) => setShutdown(e.target.value)}
							disabled={busy}
							className='w-36'
						/>
					</div>
					<div className='flex flex-col gap-1'>
						<span className='text-caption-sm text-text-tertiary'>{t('power-mgmt.schedule-wake')}</span>
						<Input
							type='time'
							value={wake}
							onChange={(e) => setWake(e.target.value)}
							disabled={busy}
							className='w-36'
						/>
					</div>
				</div>

				<div className='flex flex-wrap items-center gap-2'>
					{/* Arm — the AlertDialog spells out the irreversible lockout risk and only
					    proceeds with an explicit acknowledgment (lockoutAcknowledged:true). */}
					<AlertDialog open={armOpen} onOpenChange={setArmOpen}>
						<Button
							size='sm'
							variant='destructive'
							onClick={() => setArmOpen(true)}
							disabled={busy || !scheduleValid}
						>
							{t('power-mgmt.schedule-arm')}
						</Button>
						<AlertDialogContent>
							<AlertDialogHeader icon={TbAlertTriangle}>
								<AlertDialogTitle>{t('power-mgmt.lockout-title')}</AlertDialogTitle>
								<AlertDialogDescription>{t('power-mgmt.lockout-body')}</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogAction
									variant='destructive'
									className='px-6'
									onClick={(e) => {
										// Keep the dialog open while the mutation is in flight.
										e.preventDefault()
										setArmTriggered(true)
										scheduleSetMut.mutate(
											{shutdown, wake, lockoutAcknowledged: true},
											{
												onSettled: () => {
													setArmTriggered(false)
													setArmOpen(false)
												},
											},
										)
									}}
									disabled={armTriggered || !scheduleValid}
								>
									{armTriggered ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
									{t('power-mgmt.lockout-confirm')}
								</AlertDialogAction>
								<AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>

					<Button
						size='sm'
						variant='default'
						onClick={() => scheduleClearMut.mutate()}
						disabled={busy}
					>
						{scheduleClearMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('power-mgmt.schedule-clear')}
					</Button>
				</div>

				{scheduleSetMut.data && scheduleSetMut.data.ok === false ? (
					<div className='flex items-start gap-2'>
						<TbAlertTriangle className='mt-0.5 h-4 w-4 text-red-400' />
						<p role='alert' className='text-caption text-red-400'>
							{scheduleSetMut.data.reason}
						</p>
					</div>
				) : null}
			</div>

			{/* Power profiles — reversible CPU/platform power profile (D-347-2). NO lockout. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<div className='flex items-center gap-2'>
					<TbCpu className='h-4 w-4 text-text-tertiary' />
					<label className='text-caption font-medium text-text-secondary'>{t('power-mgmt.profile.heading')}</label>
				</div>
				<div className='flex flex-wrap items-center gap-2'>
					{knownProfiles.map((p) => {
						const isActive = activeProfileKnown && activeProfile === p
						return (
							<Button
								key={p}
								size='sm'
								variant={isActive ? 'primary' : 'default'}
								onClick={() => profileSetMut.mutate({profile: p})}
								disabled={busy}
							>
								{profileSetMut.isPending && profileSetMut.variables?.profile === p ? (
									<TbLoader2 className='mr-1 h-4 w-4 animate-spin' />
								) : null}
								{t(`power-mgmt.profile.${p}`)}
							</Button>
						)
					})}
				</div>
				{activeProfileKnown ? (
					<p className='text-caption-sm text-text-tertiary'>
						{t('power-mgmt.profile.active')}: {t(`power-mgmt.profile.${activeProfile}`)}
					</p>
				) : (
					<p className='text-caption-sm text-text-tertiary'>{t('power-mgmt.profile.unavailable')}</p>
				)}
				{profileSetMut.data && profileSetMut.data.ok === false ? (
					<p role='alert' className='text-caption text-red-400'>
						{profileSetMut.data.reason}
					</p>
				) : null}
			</div>

			{/* Hibernate — READ-ONLY honest state ONLY (D-347-1). NEVER an arm affordance. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<div className='flex items-center gap-2'>
					<TbMoon className='h-4 w-4 text-text-tertiary' />
					<label className='text-caption font-medium text-text-secondary'>{t('power-mgmt.hibernate.heading')}</label>
				</div>
				<p className='text-caption text-text-tertiary'>{hibernateHonest ?? t('power-mgmt.hibernate.na-no-unit')}</p>
				<p className='text-caption-sm text-text-tertiary'>{t('power-mgmt.hibernate.note')}</p>
			</div>

			{/* Wake-on-LAN — per interface. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<label className='text-caption font-medium text-text-secondary'>{t('power-mgmt.wol-heading')}</label>
				<div className='flex flex-wrap items-center gap-2'>
					<Input
						value={iface}
						onChange={(e) => setIface(e.target.value)}
						placeholder={t('power-mgmt.wol-iface-placeholder')}
						disabled={busy}
						className='w-40'
					/>
					<Button
						size='sm'
						variant='default'
						onClick={() => wolEnableMut.mutate({iface})}
						disabled={busy || !ifaceValid}
					>
						{wolEnableMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('power-mgmt.wol-enable')}
					</Button>
					<Button
						size='sm'
						variant='default'
						onClick={() => wolDisableMut.mutate({iface})}
						disabled={busy || !ifaceValid}
					>
						{wolDisableMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
						{t('power-mgmt.wol-disable')}
					</Button>
				</div>
			</div>

			{/* Status panel — the wrapper's own authoritative probe output. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<span className='text-caption font-medium text-text-secondary'>{t('power-mgmt.status-heading')}</span>
				{status && status.ok ? (
					<pre className='max-h-64 overflow-auto whitespace-pre-wrap rounded-radius-sm bg-surface-base p-2 text-caption text-text-tertiary'>
						{status.stdout}
					</pre>
				) : (
					<p className='text-caption text-text-tertiary'>{t('power-mgmt.unavailable')}</p>
				)}
			</div>
		</div>
	)
}
