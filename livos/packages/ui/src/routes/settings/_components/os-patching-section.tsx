import {useState} from 'react'
import {TbRefresh, TbLoader2, TbAlertTriangle} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Switch} from '@/shadcn-components/ui/switch'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

/**
 * Phase 326-07 (OS-01) — unattended-upgrades managed from Settings → Software
 * Update, mounted next to the GPU install card (D-13: host patching lives beside
 * "Update LivOS"). Clone of `gpu-install-section.tsx`.
 *
 * Wraps the FLAT `system.osPatch*` routes (326-07 Task 1), which reach the host
 * package updater ONLY through `sudo -n livos-os-patch.sh <action>` — livinityd
 * never touches /etc/apt directly. Every mutation is z.enum / z.regex constrained
 * server-side; the UI carries no trust.
 *
 * T-326-23: `osPatch*` are all `adminProcedure`. A non-admin sees the header + a
 * note but never a host-mutating control that would 403 on click (WR-02 pattern).
 * `runOsPatch` never throws, so a box where the wrapper is not yet deployed
 * degrades to `{ok:false}` — the card renders an "unavailable" note instead of
 * 500-ing the whole Settings page. All copy flows through `t('os-patching.*')`.
 */
export function OsPatchingSection() {
	// T-326-23 — host-mutating controls render for admins only.
	const {isAdmin} = useCurrentUser()

	const statusQ = trpcReact.system.osPatchStatus.useQuery()
	const refetchStatus = () => void statusQ.refetch()
	const osPatchMut = trpcReact.system.osPatch.useMutation({onSuccess: refetchStatus})
	const setOptionsMut = trpcReact.system.osPatchSetOptions.useMutation({onSuccess: refetchStatus})

	// Local options form state. The status panel below shows the wrapper's own
	// authoritative view; these are the values the admin is about to write.
	const [autoReboot, setAutoReboot] = useState(false)
	const [rebootTime, setRebootTime] = useState('02:00')
	const [removeUnused, setRemoveUnused] = useState(true)
	const [onlyOnACPower, setOnlyOnACPower] = useState(true)

	const busy = osPatchMut.isPending || setOptionsMut.isPending
	const status = statusQ.data?.status
	const report = statusQ.data?.report
	// HH:MM guard mirrors the server-side z.regex so a malformed field never fires
	// a mutation that would round-trip only to 400.
	const rebootTimeValid = /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(rebootTime)

	const header = (
		<div className='flex items-center gap-2'>
			<TbRefresh className='h-5 w-5 text-text-primary' />
			<div>
				<span className='text-body-sm font-medium text-text-primary'>{t('os-patching.title')}</span>
				<p className='text-caption text-text-tertiary'>{t('os-patching.description')}</p>
			</div>
		</div>
	)

	// T-326-23 — no host-mutating controls for non-admins; show header + a note.
	if (!isAdmin) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('os-patching.admin-only')}</p>
			</div>
		)
	}

	const lastMutation = osPatchMut.data
	const mutationFailure = lastMutation && lastMutation.ok === false ? lastMutation.reason : null

	return (
		<div className='space-y-4 rounded-radius-sm border border-border-default bg-surface-base p-4'>
			{header}

			{/* Enable / disable the unattended-upgrades timer. */}
			<div className='flex flex-wrap gap-2'>
				<Button
					size='sm'
					variant='default'
					onClick={() => osPatchMut.mutate({action: 'enable'})}
					disabled={busy}
				>
					{osPatchMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
					{t('os-patching.enable')}
				</Button>
				<Button
					size='sm'
					variant='ghost'
					onClick={() => osPatchMut.mutate({action: 'disable'})}
					disabled={busy}
				>
					{t('os-patching.disable')}
				</Button>
			</div>

			{/* Options form → set-options wrapper action. */}
			<div className='space-y-3 border-t border-border-default pt-3'>
				<label className='flex items-center justify-between gap-3'>
					<span className='text-caption text-text-secondary'>{t('os-patching.auto-reboot')}</span>
					<Switch checked={autoReboot} onCheckedChange={setAutoReboot} disabled={busy} />
				</label>
				<label className='flex items-center justify-between gap-3'>
					<span className='text-caption text-text-secondary'>{t('os-patching.reboot-time')}</span>
					<Input
						type='time'
						value={rebootTime}
						onChange={(e) => setRebootTime(e.target.value)}
						disabled={busy || !autoReboot}
						className='w-32'
					/>
				</label>
				<label className='flex items-center justify-between gap-3'>
					<span className='text-caption text-text-secondary'>{t('os-patching.remove-unused')}</span>
					<Switch checked={removeUnused} onCheckedChange={setRemoveUnused} disabled={busy} />
				</label>
				<label className='flex items-center justify-between gap-3'>
					<span className='text-caption text-text-secondary'>{t('os-patching.only-on-ac')}</span>
					<Switch checked={onlyOnACPower} onCheckedChange={setOnlyOnACPower} disabled={busy} />
				</label>
				<Button
					size='sm'
					variant='default'
					onClick={() => setOptionsMut.mutate({autoReboot, rebootTime, removeUnused, onlyOnACPower})}
					disabled={busy || !rebootTimeValid}
				>
					{setOptionsMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
					{t('os-patching.save-options')}
				</Button>
			</div>

			{/* Dry-run + run-now. run-now can be slow (the wrapper caps apt at 900s). */}
			<div className='flex flex-wrap gap-2 border-t border-border-default pt-3'>
				<Button
					size='sm'
					variant='ghost'
					onClick={() => osPatchMut.mutate({action: 'dry-run'})}
					disabled={busy}
				>
					{osPatchMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
					{t('os-patching.dry-run')}
				</Button>
				<Button
					size='sm'
					variant='default'
					onClick={() => osPatchMut.mutate({action: 'run-now'})}
					disabled={busy}
				>
					{osPatchMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
					{osPatchMut.isPending ? t('os-patching.running') : t('os-patching.run-now')}
				</Button>
			</div>

			{mutationFailure ? (
				<div className='flex items-start gap-2'>
					<TbAlertTriangle className='mt-0.5 h-4 w-4 text-red-400' />
					<p role='alert' className='text-caption text-red-400'>
						{mutationFailure}
					</p>
				</div>
			) : null}

			{/* Surface the last mutation's stdout (dry-run / run-now output). */}
			{lastMutation && lastMutation.ok === true && lastMutation.stdout ? (
				<div className='space-y-1 border-t border-border-default pt-3'>
					<span className='text-caption font-medium text-text-secondary'>{t('os-patching.output-heading')}</span>
					<pre className='max-h-64 overflow-auto whitespace-pre-wrap rounded-radius-sm bg-surface-base p-2 text-caption text-text-tertiary'>
						{lastMutation.stdout}
					</pre>
				</div>
			) : null}

			{/* Status + report panel. runOsPatch never throws → not-ok = wrapper not
			    deployed / apt busy; degrade to a note instead of a broken card. */}
			<div className='space-y-2 border-t border-border-default pt-3'>
				<span className='text-caption font-medium text-text-secondary'>{t('os-patching.status-heading')}</span>
				{status && status.ok ? (
					<pre className='max-h-64 overflow-auto whitespace-pre-wrap rounded-radius-sm bg-surface-base p-2 text-caption text-text-tertiary'>
						{status.stdout}
					</pre>
				) : (
					<p className='text-caption text-text-tertiary'>{t('os-patching.unavailable')}</p>
				)}
				{report && report.ok && report.stdout ? (
					<>
						<span className='text-caption font-medium text-text-secondary'>{t('os-patching.report-heading')}</span>
						<pre className='max-h-64 overflow-auto whitespace-pre-wrap rounded-radius-sm bg-surface-base p-2 text-caption text-text-tertiary'>
							{report.stdout}
						</pre>
					</>
				) : null}
			</div>
		</div>
	)
}
