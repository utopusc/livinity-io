// Phase 359-02 (VMSET-01 / VMSET-03) — per-VM Settings dialog.
//
// Edits RAM / CPU / disk via the sanctioned 359-01 `vm.update` mutation, shows
// honest READ-ONLY facts (OS, state, resources, host ports), and re-homes the
// Windows RDP endpoint that 358 removed from the always-visible screen.
//
// Honesty invariants this dialog is required to hold (359 threat model):
//   - The disk field is GROW-ONLY in the UI (min = current diskGiB + an honest
//     hint) but the CLIENT bound is a UX affordance only — the server
//     (359-01 vmResizeVerdict) is the load-bearing gate and its BAD_REQUEST
//     grow-only / capacity refusal surfaces VERBATIM (inline + toast). (T-359-11)
//   - After a successful update the dialog shows a 'restart required to apply'
//     line IFF the server returned restartRequired — it NEVER claims the change
//     is already live/applied (restart-to-apply is a SEPARATE explicit
//     stop+start, per 359-01). (T-359-12)
//   - The re-homed RDP endpoint (host LAN IP + rdpPort) renders ONLY inside this
//     admin-gated dialog, windows + rdpPort + host-IP only — NEVER on the
//     always-visible list row or stream (358 removed it from the stream to shrink
//     the host-LAN-IP info-disclosure surface; this is a relocation, not a
//     regression). (T-359-10)
import {Cpu, HardDrive, MemoryStick} from 'lucide-react'
import {useState} from 'react'
import {TbLoader2} from 'react-icons/tb'
import {toast} from 'sonner'

import {useVmStats} from '@/hooks/use-vm-stats'
import {Gauge} from '@/modules/desktop/live-usage-popover'
import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input, Labeled} from '@/shadcn-components/ui/input'
import {useCurrentUser} from '@/hooks/use-current-user'
import type {RouterOutput} from '@/trpc/trpc'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {maybePrettyBytes} from '@/utils/pretty-bytes'

// Consumed from vm.list — never redefined (same import as vm-list-item.tsx:43).
type VmView = RouterOutput['vm']['list'][number]

/** MiB → GiB for display (4096 → 4, 1536 → 1.5); the form/store speak MiB. */
function ramGiB(ramMiB: number): number {
	return Math.round((ramMiB / 1024) * 10) / 10
}

const num = (v: string) => {
	const n = Number(v)
	return Number.isFinite(n) && n > 0 ? n : 0
}

export function VmSettingsDialog({
	open,
	onOpenChange,
	vm,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	vm: VmView
}) {
	const {isAdmin} = useCurrentUser()
	const utils = trpcReact.useUtils()

	// Phase 362 (VMSTATS-01): live per-VM usage — polled ONLY while this dialog is
	// open on a running VM (stopped → no poll, honest allocated-only facts below).
	const {stats, disk} = useVmStats(vm.id, vm.state === 'running')

	// Editable resources, seeded from the VM's current allocation. Re-seeded on
	// every open (handleOpenChange resets on close). cpus/ramMiB are freely
	// editable; diskGiB is grow-only (min-bound below).
	const [resources, setResources] = useState({
		cpus: vm.resources.cpus,
		ramMiB: vm.resources.ramMiB,
		diskGiB: vm.resources.diskGiB,
	})

	// An honest restart-to-apply hint, set ONLY when the server says the change
	// needs a stop+start. Never an "applied/live" claim.
	const [restartHint, setRestartHint] = useState<string | null>(null)

	// Apply-now phase machine (361 / VMAPPLY-01). Client-sequenced vm.stop → vm.start
	// (start() = composeUp re-reads the freshly-written compose and recreates the
	// container). Honest transitional states; 'done' — the ONLY honest "applied"
	// claim — is reached ONLY after startMut.mutateAsync resolves. Any failure lands
	// in 'error' with the verbatim server message, NEVER 'done'.
	type ApplyPhase = 'idle' | 'stopping' | 'starting' | 'done' | 'error'
	const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle')
	const [applyError, setApplyError] = useState<string | null>(null)
	const stopMut = trpcReact.vm.stop.useMutation()
	const startMut = trpcReact.vm.start.useMutation()
	const applying = applyPhase === 'stopping' || applyPhase === 'starting'

	const applyNow = async () => {
		setApplyError(null)
		setApplyPhase('stopping')
		try {
			await stopMut.mutateAsync({id: vm.id})
		} catch (e) {
			// VM is still running — honest error, the change was NOT applied.
			setApplyPhase('error')
			setApplyError((e as Error).message)
			return
		}
		setApplyPhase('starting')
		try {
			// start() = composeUp — recreates the container with the new compose.
			await startMut.mutateAsync({id: vm.id})
		} catch (e) {
			// VM is stopped and the compose is written, but start did NOT resolve —
			// honest error, NEVER an "applied" claim.
			setApplyPhase('error')
			setApplyError((e as Error).message)
			return
		}
		utils.vm.list.invalidate()
		setApplyPhase('done') // ONLY here — after start resolved — is the change live.
		setRestartHint(null)
	}

	const updateMut = trpcReact.vm.update.useMutation({
		onSuccess: (data) => {
			utils.vm.list.invalidate()
			if (data.restartRequired) {
				// Keep the dialog open to show the honest hint; the admin closes it.
				setRestartHint(t('vm.settings.restart-required'))
			} else {
				// A stopped VM makes no restart claim — just close on success.
				handleOpenChange(false)
			}
		},
		onError: (error) => toast.error(error.message), // BAD_REQUEST grow-only / capacity verbatim
	})

	const resetState = () => {
		setResources({cpus: vm.resources.cpus, ramMiB: vm.resources.ramMiB, diskGiB: vm.resources.diskGiB})
		setRestartHint(null)
		setApplyPhase('idle')
		setApplyError(null)
	}

	const handleOpenChange = (next: boolean) => {
		// Don't let an overlay/ESC close tear the dialog down mid-apply.
		if (!next && (applyPhase === 'stopping' || applyPhase === 'starting')) return
		onOpenChange(next)
		if (!next) {
			resetState()
			updateMut.reset()
		}
	}

	// The re-homed RDP endpoint (358 removed this from the screen). Windows-only,
	// admin-gated, only when an rdpPort exists — re-derived FRESH here (never a
	// resurrected vm.screen.* query). Host LAN IP is display-only inside this
	// admin dialog, never on the always-visible row/stream.
	const rdpEnabled = isAdmin && vm.kind === 'windows' && vm.rdpPort !== undefined
	const ipQ = trpcReact.system.getIpAddresses.useQuery(undefined, {enabled: rdpEnabled})
	const rdpIp = ipQ.data?.[0]

	// Grow-only + unchanged guards are UX affordances only — the server re-validates.
	const diskShrink = resources.diskGiB < vm.resources.diskGiB
	const changed =
		resources.cpus !== vm.resources.cpus ||
		resources.ramMiB !== vm.resources.ramMiB ||
		resources.diskGiB !== vm.resources.diskGiB
	const resourcesOk = resources.cpus > 0 && resources.ramMiB > 0 && resources.diskGiB > 0
	const canSubmit = changed && !diskShrink && resourcesOk && !updateMut.isPending

	const handleSubmit = () => {
		if (!canSubmit) return
		setRestartHint(null)
		updateMut.mutate({
			id: vm.id,
			resources: {cpus: resources.cpus, ramMiB: resources.ramMiB, diskGiB: resources.diskGiB},
		})
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogPortal>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('vm.settings.title', {name: vm.name})}</DialogTitle>
					</DialogHeader>

					<div className='flex flex-col gap-4'>
						{/* Editable resources. Disk is grow-only (min = current); cpus/ram free. */}
						<div className='grid grid-cols-3 gap-2'>
							<Labeled label={t('vm.create.cpus-label')}>
								<Input
									type='number'
									value={String(resources.cpus)}
									onValueChange={(v) => setResources((r) => ({...r, cpus: num(v)}))}
								/>
							</Labeled>
							<Labeled label={t('vm.create.ram-label')}>
								<Input
									type='number'
									value={String(resources.ramMiB)}
									onValueChange={(v) => setResources((r) => ({...r, ramMiB: num(v)}))}
								/>
							</Labeled>
							<Labeled label={t('vm.create.disk-label')}>
								<Input
									type='number'
									min={vm.resources.diskGiB}
									value={String(resources.diskGiB)}
									onValueChange={(v) => setResources((r) => ({...r, diskGiB: num(v)}))}
								/>
							</Labeled>
						</div>
						<p className='text-caption text-text-tertiary'>{t('vm.settings.disk-grow-only-hint')}</p>

						{/* Honest restart-to-apply hint — shown ONLY when the server said so.
						    NEVER an "applied/live" claim. Beside it, the Apply-now action
						    (361 / VMAPPLY-01): client-sequenced vm.stop → vm.start (=composeUp)
						    that actually applies the pending edits, with honest phases. It
						    NEVER routes through the in-place restart bounce (which does NOT
						    re-read the compose). */}
						{restartHint ? (
							<div className='flex flex-col gap-2'>
								<p className='text-caption text-text-secondary'>{restartHint}</p>
								{applyPhase === 'done' ? (
									<p className='text-caption text-text-secondary'>{t('vm.settings.apply-done')}</p>
								) : (
									<div className='flex flex-col gap-1'>
										<Button
											size='dialog'
											variant='primary'
											onClick={applyNow}
											disabled={updateMut.isPending || applying}
										>
											{applying ? (
												<span className='flex items-center gap-1.5'>
													<TbLoader2 className='h-4 w-4 animate-spin' />
													{applyPhase === 'stopping'
														? t('vm.settings.apply-stopping')
														: t('vm.settings.apply-starting')}
												</span>
											) : (
												t('vm.settings.apply-now')
											)}
										</Button>
										{applyPhase === 'error' ? (
											<p className='text-caption text-destructive2'>
												{t('vm.settings.apply-failed')} {applyError}
											</p>
										) : null}
									</div>
								)}
							</div>
						) : null}

						{/* Server refusal surfaces verbatim inline (in addition to the toast)
						    so a grow-only / capacity BAD_REQUEST stays visible. */}
						{updateMut.isError ? (
							<p className='text-caption text-destructive2'>{updateMut.error?.message}</p>
						) : null}

						{/* READ-ONLY facts — honest, no VNC jargon. */}
						<div className='flex flex-col gap-1 rounded-radius-md border border-border-default bg-surface-1 p-3'>
							<span className='text-caption font-medium text-text-secondary'>
								{t('vm.settings.facts-label')}
							</span>
							{/* Live used-vs-allocated gauges — rendered ONLY for a running VM
							    (T-362-08). A stopped VM shows the honest allocated-only text rows
							    below and issues no poll. Reuses the shared Gauge + jargon-free
							    cpu/memory/storage keys (no new locale keys minted). The RAM
							    denominator is the server-paired ramAllocMiB (registry), never a
							    cgroup value (T-362-10). */}
							{vm.state === 'running' && stats ? (
								<div className='flex flex-col gap-2'>
									<Gauge
										icon={Cpu}
										label={t('cpu')}
										value={stats.cpuPercent !== undefined ? `${Math.round(stats.cpuPercent)}%` : undefined}
										progress={(stats.cpuPercent ?? 0) / 100}
									/>
									<Gauge
										icon={MemoryStick}
										label={t('memory')}
										value={stats.ramUsedMiB !== undefined ? maybePrettyBytes(stats.ramUsedMiB * 1024 * 1024) : undefined}
										valueSub={`/ ${ramGiB(stats.ramAllocMiB)} GB`}
										progress={stats.ramUsedMiB !== undefined ? stats.ramUsedMiB / stats.ramAllocMiB : 0}
									/>
									<Gauge
										icon={HardDrive}
										label={t('storage')}
										value={disk?.diskUsedBytes !== undefined ? maybePrettyBytes(disk.diskUsedBytes) : undefined}
										valueSub={disk ? `/ ${disk.diskAllocGiB} GiB` : undefined}
										progress={disk?.diskUsedBytes !== undefined ? disk.diskUsedBytes / (disk.diskAllocGiB * 1024 ** 3) : 0}
									/>
								</div>
							) : null}
							<div className='flex justify-between text-caption text-text-tertiary'>
								<span>{t('vm.settings.facts-kind')}</span>
								<span>{vm.kind === 'windows' ? 'Windows' : 'Linux'}</span>
							</div>
							<div className='flex justify-between text-caption text-text-tertiary'>
								<span>{t('vm.settings.facts-state')}</span>
								<span>{t(`vm.state.${vm.state}` as never)}</span>
							</div>
							<div className='flex justify-between text-caption text-text-tertiary'>
								<span>{t('vm.settings.facts-resources')}</span>
								<span>
									{t('vm.resources.summary', {
										cpus: vm.resources.cpus,
										ram: ramGiB(vm.resources.ramMiB),
										disk: vm.resources.diskGiB,
									})}
								</span>
							</div>
							{/* Re-homed RDP endpoint — windows + rdpPort + host IP ONLY. */}
							{vm.kind === 'windows' && vm.rdpPort && rdpIp ? (
								<p className='text-caption text-text-tertiary'>
									{t('vm.settings.rdp-hint', {ip: rdpIp, port: vm.rdpPort})}
								</p>
							) : null}
						</div>
					</div>

					<DialogFooter>
						<Button
							size='dialog'
							onClick={() => handleOpenChange(false)}
							disabled={updateMut.isPending || applying}
						>
							{t('cancel')}
						</Button>
						<Button size='dialog' variant='primary' onClick={handleSubmit} disabled={!canSubmit}>
							{updateMut.isPending ? (
								<span className='flex items-center gap-1.5'>
									<TbLoader2 className='h-4 w-4 animate-spin' />
									{t('vm.settings.submit')}
								</span>
							) : (
								t('vm.settings.submit')
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
