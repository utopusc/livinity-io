import {TbBattery, TbLoader2, TbAlertTriangle, TbPlugConnected, TbBatteryOff} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

/**
 * Phase 326-08 (HW-01) — NUT UPS status/config card for Settings → Software
 * Update, mounted next to the OS-patch + GPU install cards (D-13: host power/UPS
 * lives beside "Update LivOS"). Clone of `os-patching-section.tsx` /
 * `gpu-install-section.tsx`.
 *
 * Wraps the FLAT `system.ups*` routes (326-08 Task 1), which reach NUT ONLY
 * through `sudo -n livos-ups.sh <action>` — livinityd never runs apt/systemctl or
 * writes /etc/nut directly. The install/configure/remove action is z.enum
 * constrained server-side; the UI carries no trust.
 *
 * The critical power-loss ALERT + clean shutdown are already handled by 326-05
 * (ups-watch job) and 326-03 (upsmon SHUTDOWNCMD) — this card is the visible
 * status/config surface: live `upsc` status (OL/OB/LB, battery charge, runtime)
 * parsed from the `status` stdout, plus detect/install/configure/remove.
 *
 * T-326-26: `ups*` are all `adminProcedure`. A non-admin sees the header + a note
 * but never a host-mutating control that would 403 on click (WR-02 pattern).
 * `runUps` never throws, so a box where the wrapper is not yet deployed — or one
 * with no UPS attached — degrades to `{ok:false}` / `UNAVAILABLE`: the card
 * renders a "no UPS" state instead of 500-ing the whole Settings page. All copy
 * flows through `t('ups-status.*')`.
 */
export function UpsStatusSection() {
	// T-326-26 — host-mutating controls render for admins only.
	const {isAdmin} = useCurrentUser()

	// Poll every 30s so the badge tracks OL→OB→LB transitions while the card is open.
	const statusQ = trpcReact.system.upsStatus.useQuery(undefined, {refetchInterval: 30_000})
	const refetchStatus = () => void statusQ.refetch()
	const detectMut = trpcReact.system.upsDetect.useMutation()
	const upsMut = trpcReact.system.ups.useMutation({onSuccess: refetchStatus})

	const busy = detectMut.isPending || upsMut.isPending

	const statusData = statusQ.data
	const statusStdout = statusData && statusData.ok ? statusData.stdout : ''
	// runUps never throws → not-ok = wrapper not yet deployed (degrade to no-UPS).
	// The wrapper prints "ups.status: UNAVAILABLE" when NUT is not configured or no
	// UPS is attached — treat that identically to the not-ok case.
	const unavailable = !statusData || statusData.ok === false || /UNAVAILABLE/i.test(statusStdout)

	// Parse the labeled upsc lines the wrapper's `status` action emits.
	const stateMatch = statusStdout.match(/ups\.status:\s*(.+)/)
	const chargeMatch = statusStdout.match(/battery\.charge:\s*(\d+)/)
	const runtimeMatch = statusStdout.match(/battery\.runtime:\s*(\d+)/)
	const stateLine = stateMatch ? stateMatch[1].trim() : ''
	// upsc reports flags space-joined (e.g. "OB LB") — check each independently and
	// let the most severe state win the badge (LB > OB > OL).
	const isLowBattery = /\bLB\b/.test(stateLine)
	const isOnBattery = /\bOB\b/.test(stateLine)
	const isOnMains = /\bOL\b/.test(stateLine)
	const charge = chargeMatch ? Number(chargeMatch[1]) : null
	const runtimeMinutes = runtimeMatch ? Math.round(Number(runtimeMatch[1]) / 60) : null

	const header = (
		<div className='flex items-center gap-2'>
			<TbBattery className='h-5 w-5 text-text-primary' />
			<div>
				<span className='text-body-sm font-medium text-text-primary'>{t('ups-status.title')}</span>
				<p className='text-caption text-text-tertiary'>{t('ups-status.description')}</p>
			</div>
		</div>
	)

	// T-326-26 — no host-mutating controls for non-admins; show header + a note.
	if (!isAdmin) {
		return (
			<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
				{header}
				<p className='text-caption text-text-tertiary'>{t('ups-status.admin-only')}</p>
			</div>
		)
	}

	const mutationFailure = upsMut.data && upsMut.data.ok === false ? upsMut.data.reason : null
	const detectResult = detectMut.data && detectMut.data.ok === true ? detectMut.data.stdout : null

	// Badge for a configured UPS: LB (red / low battery) > OB (amber / on battery) > OL (green / on mains).
	const badge = isLowBattery ? (
		<span className='inline-flex items-center gap-1 rounded-radius-sm bg-red-500/15 px-2 py-0.5 text-caption font-medium text-red-400'>
			<TbBatteryOff className='h-4 w-4' />
			{t('ups-status.low-battery')}
		</span>
	) : isOnBattery ? (
		<span className='inline-flex items-center gap-1 rounded-radius-sm bg-yellow-500/15 px-2 py-0.5 text-caption font-medium text-yellow-400'>
			<TbBattery className='h-4 w-4' />
			{t('ups-status.on-battery')}
		</span>
	) : isOnMains ? (
		<span className='inline-flex items-center gap-1 rounded-radius-sm bg-green-500/15 px-2 py-0.5 text-caption font-medium text-green-400'>
			<TbPlugConnected className='h-4 w-4' />
			{t('ups-status.on-mains')}
		</span>
	) : null

	return (
		<div className='space-y-4 rounded-radius-sm border border-border-default bg-surface-base p-4'>
			{header}

			{unavailable ? (
				// No UPS detected / NUT not configured → detect + install/configure flow.
				<div className='space-y-3'>
					<p className='text-caption text-text-secondary'>{t('ups-status.unavailable')}</p>
					<div className='flex flex-wrap gap-2'>
						<Button size='sm' variant='ghost' onClick={() => detectMut.mutate()} disabled={busy}>
							{detectMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{detectMut.isPending ? t('ups-status.detecting') : t('ups-status.detect')}
						</Button>
						<Button size='sm' variant='ghost' onClick={() => upsMut.mutate({action: 'install'})} disabled={busy}>
							{upsMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{t('ups-status.install')}
						</Button>
						<Button size='sm' variant='default' onClick={() => upsMut.mutate({action: 'configure'})} disabled={busy}>
							{upsMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{t('ups-status.configure')}
						</Button>
					</div>

					{/* Detect output — the nut-scanner / lsusb hints. */}
					{detectResult ? (
						<div className='space-y-1 border-t border-border-default pt-3'>
							<span className='text-caption font-medium text-text-secondary'>{t('ups-status.detect-heading')}</span>
							<pre className='max-h-64 overflow-auto whitespace-pre-wrap rounded-radius-sm bg-surface-base p-2 text-caption text-text-tertiary'>
								{detectResult}
							</pre>
						</div>
					) : null}
				</div>
			) : (
				// Configured UPS → live status badge, charge %, estimated runtime + remove.
				<div className='space-y-3'>
					<div className='flex flex-wrap items-center gap-3'>
						{badge}
						{charge !== null ? (
							<span className='text-caption text-text-secondary'>
								{t('ups-status.battery-charge', {charge})}
							</span>
						) : null}
						{runtimeMinutes !== null ? (
							<span className='text-caption text-text-secondary'>
								{t('ups-status.runtime', {minutes: runtimeMinutes})}
							</span>
						) : null}
					</div>

					<div className='flex flex-wrap gap-2 border-t border-border-default pt-3'>
						<Button
							size='sm'
							variant='ghost'
							onClick={() => {
								if (window.confirm(t('ups-status.remove-confirm'))) upsMut.mutate({action: 'remove'})
							}}
							disabled={busy}
						>
							{upsMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
							{upsMut.isPending ? t('ups-status.removing') : t('ups-status.remove')}
						</Button>
					</div>
				</div>
			)}

			{mutationFailure ? (
				<div className='flex items-start gap-2'>
					<TbAlertTriangle className='mt-0.5 h-4 w-4 text-red-400' />
					<p role='alert' className='text-caption text-red-400'>
						{mutationFailure}
					</p>
				</div>
			) : null}
		</div>
	)
}
