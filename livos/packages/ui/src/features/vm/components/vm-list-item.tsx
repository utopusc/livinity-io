// Phase 352-02 (VMAPP-02) — one VM row: OS icon + name, an HONEST live-state
// badge, a resources summary, and the lifecycle controls (start/stop/restart/
// rename/open-screen/delete).
//
// The users.tsx UserListItem idiom, applied to every mutation: onSuccess →
// utils.vm.list.invalidate(); onError → toast.error(error.message). No step-up
// branch (VM lifecycle is not step-up-gated) and NO error-mapping layer — the
// server's message is already honest (a CONFLICT "...already in progress" from
// the single-flight guard, a BAD_REQUEST resource reason) so it surfaces
// verbatim through the toast.
//
// Honesty invariants (T-352-05): the badge switches on vm.state; an 'error' VM
// renders a destructive badge AND its raw lastError, and is NEVER shown as
// running. 'creating'/'installing-os' show a spinner and gate the controls.
// "Open screen" (353-02) calls onOpenScreen(vm) to open the state-aware VmScreen
// view; the honesty of that view (never a blank frame as working) lives there.
import {useState} from 'react'
import {TbDeviceDesktop, TbDotsVertical, TbLoader2, TbPencil, TbPin, TbPinnedOff, TbPlayerPlay, TbPlayerStop, TbRefresh, TbSettings, TbTrash} from 'react-icons/tb'
import {toast} from 'sonner'

import {LOADING_DASH} from '@/constants'
import {useVmStats} from '@/hooks/use-vm-stats'
import {useDesktopPins} from '@/modules/desktop/use-desktop-pins'
import {useDockPins} from '@/modules/desktop/use-dock-pins'

import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'
import {Input, Labeled} from '@/shadcn-components/ui/input'
import type {RouterOutput} from '@/trpc/trpc'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {maybePrettyBytes} from '@/utils/pretty-bytes'

import {OsIcon} from './os-icon'
import {VmSettingsDialog} from './vm-settings-dialog'

// Consumed from vm.list — never redefined (interfaces block of 352-02-PLAN).
type VmView = RouterOutput['vm']['list'][number]

/** MiB → GiB for display (4096 → 4, 1536 → 1.5); the form/store speak MiB. */
function ramGiB(ramMiB: number): number {
	return Math.round((ramMiB / 1024) * 10) / 10
}

/** Honest live-state badge — switches on vm.state; 'error' is destructive, never running. */
function StateBadge({state}: {state: VmView['state']}) {
	switch (state) {
		case 'running':
			return <Badge variant='liv-status-running'>{t('vm.state.running')}</Badge>
		case 'stopped':
			return <Badge variant='outline'>{t('vm.state.stopped')}</Badge>
		case 'creating':
			return (
				<Badge variant='default'>
					<TbLoader2 className='mr-1 h-3 w-3 animate-spin' />
					{t('vm.state.creating')}
				</Badge>
			)
		case 'installing-os':
			return (
				<Badge variant='default'>
					<TbLoader2 className='mr-1 h-3 w-3 animate-spin' />
					{t('vm.state.installing-os')}
				</Badge>
			)
		case 'error':
			return <Badge variant='destructive'>{t('vm.state.error')}</Badge>
		default:
			return <Badge variant='outline'>{state}</Badge>
	}
}

export function VmListItem({
	vm,
	onDelete,
	onOpenScreen,
}: {
	vm: VmView
	onDelete: () => void
	onOpenScreen: (vm: VmView) => void
}) {
	const utils = trpcReact.useUtils()

	// Desktop shortcut (354): pin/unpin rides the SAME client-only useDockPins
	// mechanism as every other Dock pin. This handler NEVER touches a vm.*
	// mutation — unpin removes only the Dock tile, never the VM (unpin ≠ delete).
	const {isPinned, pin, unpin} = useDockPins()
	const pinnedToDesktop = isPinned('vm', vm.id)

	// Desktop surface (357): an INDEPENDENT second pin — useDesktopPins, own
	// storage keys, never the 354 dock list. Like the dock pin above, its
	// unpin NEVER touches a vm.* mutation (unpin ≠ delete, extended to the
	// desktop surface).
	const {isPinned: isDesktopPinned, pin: pinDesktop, unpin: unpinDesktop} = useDesktopPins()
	const pinnedToDesktopSurface = isDesktopPinned('vm', vm.id)

	// Compact live-usage readout (363, reuses 362's running-gated hook verbatim —
	// a stopped VM issues ZERO polls). Only the CPU/RAM 3s stats are read here; the
	// heavier disk du and the full Gauge cards stay in the Settings dialog.
	const {stats} = useVmStats(vm.id, vm.state === 'running')

	const startMut = trpcReact.vm.start.useMutation({
		onSuccess: () => utils.vm.list.invalidate(),
		onError: (error) => toast.error(error.message),
	})
	const stopMut = trpcReact.vm.stop.useMutation({
		onSuccess: () => utils.vm.list.invalidate(),
		onError: (error) => toast.error(error.message),
	})
	const restartMut = trpcReact.vm.restart.useMutation({
		onSuccess: () => utils.vm.list.invalidate(),
		onError: (error) => toast.error(error.message),
	})

	// Rename (edit-where-safe: a name is registry-only metadata — Task 2.5). A
	// small non-destructive Dialog mirroring the delete-confirm structure.
	const [renameOpen, setRenameOpen] = useState(false)
	const [renameValue, setRenameValue] = useState(vm.name)

	// Settings (359-02): a row-local, non-destructive edit surface (like rename,
	// NOT list-owned like delete). Always available — settings is not gated on a
	// transitional/busy VM. The heavy form lives in its own <VmSettingsDialog>.
	const [settingsOpen, setSettingsOpen] = useState(false)
	const renameMut = trpcReact.vm.rename.useMutation({
		onSuccess: () => {
			utils.vm.list.invalidate()
			setRenameOpen(false)
		},
		onError: (error) => toast.error(error.message),
	})
	const openRename = () => {
		setRenameValue(vm.name)
		setRenameOpen(true)
	}
	const submitRename = () => {
		const name = renameValue.trim()
		if (!name || name === vm.name) {
			setRenameOpen(false)
			return
		}
		renameMut.mutate({id: vm.id, name})
	}

	// A VM mid-transition (creating/installing-os) has no stable container to act
	// on; any lifecycle mutation in flight also blocks the others (server is
	// single-flight — a second op would just 409). Reflect that as disabled.
	const transitional = vm.state === 'creating' || vm.state === 'installing-os'
	const busy = startMut.isPending || stopMut.isPending || restartMut.isPending
	const controlsDisabled = transitional || busy
	// Start-vs-stop gates on state: offer Start when down (stopped/error), Stop +
	// Restart when up (running).
	const isUp = vm.state === 'running'

	return (
		<div className='rounded-radius-md border border-border-default bg-surface-base p-4 transition-colors'>
			<div className='flex items-center gap-3'>
				<OsIcon kind={vm.kind} className='h-8 w-8 shrink-0 text-text-secondary' />

				<div className='min-w-0 flex-1'>
					<div className='flex items-center gap-2'>
						<span className='truncate text-body-sm font-medium text-text-primary'>{vm.name}</span>
						<StateBadge state={vm.state} />
					</div>
					<div className='mt-0.5 text-caption text-text-tertiary'>
						{vm.kind === 'windows' ? 'Windows' : 'Linux'} ·{' '}
						{t('vm.resources.summary', {
							cpus: vm.resources.cpus,
							ram: ramGiB(vm.resources.ramMiB),
							disk: vm.resources.diskGiB,
						})}
					</div>
					{/* Line 3 — compact live readout, running-gated (362). Absent when
					    stopped so the allocated caption above stands alone (no dead line). */}
					{vm.state === 'running' && stats ? (
						<div
							className='mt-1 flex items-center gap-3 text-caption tabular-nums text-text-tertiary'
							aria-label={t('vm.usage.summary')}
						>
							<span>
								{t('cpu')} {stats.cpuPercent !== undefined ? `${Math.round(stats.cpuPercent)}%` : LOADING_DASH}
							</span>
							<span>
								{t('memory')}{' '}
								{stats.ramUsedMiB !== undefined ? maybePrettyBytes(stats.ramUsedMiB * 1024 * 1024) : LOADING_DASH} /{' '}
								{ramGiB(stats.ramAllocMiB)} GB
							</span>
						</div>
					) : null}
					{/* Errored VM: surface the honest reason; NEVER render as healthy. */}
					{vm.state === 'error' && vm.lastError ? (
						<div className='mt-1 text-caption text-destructive2'>{vm.lastError}</div>
					) : null}
				</div>

				<div className='flex shrink-0 items-center gap-1.5'>
					{/* PRIMARY affordance — Open screen (356 window). Filled (not ghost) =
					    the clear hierarchy signal; the callback is unchanged from 353. */}
					<Button size='sm' variant='primary' onClick={() => onOpenScreen(vm)}>
						<TbDeviceDesktop className='h-4 w-4' />
						{t('vm.controls.open-screen')}
					</Button>

					{/* OVERFLOW — every other action, consolidated (app-icon idiom). A
					    VISIBLE DropdownMenu (NOT a right-click ContextMenu) so the row stays
					    touch-usable on the mobile VM list. Delete last + destructive. */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size='sm' variant='ghost' aria-label={t('vm.controls.more')}>
								<TbDotsVertical className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							{/* Lifecycle — state-gated, disabled while transitional/busy. */}
							{isUp ? (
								<>
									<DropdownMenuItem disabled={controlsDisabled} onSelect={() => stopMut.mutate({id: vm.id})}>
										<TbPlayerStop className='mr-2 h-4 w-4' />
										{t('vm.controls.stop')}
									</DropdownMenuItem>
									<DropdownMenuItem disabled={controlsDisabled} onSelect={() => restartMut.mutate({id: vm.id})}>
										<TbRefresh className='mr-2 h-4 w-4' />
										{t('vm.controls.restart')}
									</DropdownMenuItem>
								</>
							) : (
								<DropdownMenuItem disabled={controlsDisabled} onSelect={() => startMut.mutate({id: vm.id})}>
									<TbPlayerPlay className='mr-2 h-4 w-4' />
									{t('vm.controls.start')}
								</DropdownMenuItem>
							)}

							<DropdownMenuSeparator />

							{/* Pin/unpin to the desktop Dock — client-only (useDockPins), no vm.* mutation. */}
							<DropdownMenuItem
								onSelect={() => (pinnedToDesktop ? unpin('vm', vm.id) : pin({kind: 'vm', id: vm.id}))}
							>
								{pinnedToDesktop ? <TbPinnedOff className='mr-2 h-4 w-4' /> : <TbPin className='mr-2 h-4 w-4' />}
								{pinnedToDesktop ? t('vm.controls.unpin') : t('vm.controls.pin')}
							</DropdownMenuItem>

							{/* Pin/unpin to the desktop surface — client-only (useDesktopPins), no vm.* mutation. */}
							<DropdownMenuItem
								onSelect={() =>
									pinnedToDesktopSurface ? unpinDesktop('vm', vm.id) : pinDesktop({kind: 'vm', id: vm.id})
								}
							>
								{pinnedToDesktopSurface ? (
									<TbPinnedOff className='mr-2 h-4 w-4' />
								) : (
									<TbPin className='mr-2 h-4 w-4' />
								)}
								{pinnedToDesktopSurface ? t('vm.controls.unpin-desktop') : t('vm.controls.pin-desktop')}
							</DropdownMenuItem>

							<DropdownMenuItem disabled={renameMut.isPending} onSelect={openRename}>
								<TbPencil className='mr-2 h-4 w-4' />
								{t('vm.controls.rename')}
							</DropdownMenuItem>

							{/* Settings — non-destructive, always available (359-02). Opens the
							    row-local <VmSettingsDialog> for THIS vm. */}
							<DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
								<TbSettings className='mr-2 h-4 w-4' />
								{t('vm.controls.settings')}
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							{/* Delete — LAST + destructive (mirrors app-icon uninstall placement).
							    Reuses the shared destructive tokens inline (dropdownClasses has no
							    rootDestructive); still the list-owned onDelete confirm dialog. */}
							<DropdownMenuItem
								className='text-destructive2-lightest focus:text-destructive2-lightest'
								onSelect={onDelete}
							>
								<TbTrash className='mr-2 h-4 w-4' />
								{t('vm.controls.delete')}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Rename dialog (non-destructive edit-where-safe) */}
			<Dialog open={renameOpen} onOpenChange={setRenameOpen}>
				<DialogPortal>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('vm.rename.title', {name: vm.name})}</DialogTitle>
							<DialogDescription>{t('vm.rename.description')}</DialogDescription>
						</DialogHeader>
						<Labeled label={t('vm.rename.label')}>
							<Input
								value={renameValue}
								onValueChange={setRenameValue}
								autoFocus
								onKeyDown={(e) => {
									if (e.key === 'Enter') submitRename()
								}}
							/>
						</Labeled>
						<DialogFooter>
							<Button size='dialog' onClick={() => setRenameOpen(false)} disabled={renameMut.isPending}>
								{t('cancel')}
							</Button>
							<Button
								size='dialog'
								variant='primary'
								onClick={submitRename}
								disabled={renameMut.isPending || renameValue.trim().length === 0}
							>
								{renameMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : t('vm.rename.submit')}
							</Button>
						</DialogFooter>
					</DialogContent>
				</DialogPortal>
			</Dialog>

			{/* Settings dialog (row-local, non-destructive edit-where-safe — 359-02) */}
			<VmSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} vm={vm} />
		</div>
	)
}
