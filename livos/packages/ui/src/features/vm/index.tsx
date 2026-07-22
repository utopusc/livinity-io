// Phase 352-01 (VMAPP-01, VMAPP-03) — native Virtual Machine app root.
//
// Whole-surface admin gate (decideVmVisibility): the vm.* API is
// adminProcedure, so this component switches the ENTIRE window content on
// {isLoading, isAdmin}. Non-admins get an honest admin-only note and fire
// ZERO vm.* requests (useVmList gates the query on enabled: isAdmin).
// Admins with no VMs get the empty-state + prominent "Create VM" button.
//
// Deferred to later 352 plans: the VM list branch (352-02) and the
// CreateVmDialog wiring (352-03). This scaffold intentionally does not
// reference those yet — importing not-yet-existing components would break
// the build.
import {useState} from 'react'

import {Loading} from '@/components/ui/loading'
import {Button} from '@/shadcn-components/ui/button'
import {t} from '@/utils/i18n'

import {CreateVmDialog} from './components/create-vm-dialog'
import {VmEmptyState} from './components/vm-empty-state'
import {VmList} from './components/vm-list'
import {decideVmVisibility} from './decide-vm-visibility'
import {useVmList} from './hooks/use-vm-list'

export default function VmApp({initialRoute, windowed}: {initialRoute?: string; windowed?: boolean}) {
	const {isAdmin, isLoading, error, vms} = useVmList()
	const [createOpen, setCreateOpen] = useState(false)
	const visibility = decideVmVisibility({isLoading, isAdmin})
	// Deep-link from a pinned VM Dock tile: /vm/<id> seeds the list straight into
	// that VM's 353 screen (parse once here, thread the id down — no new routing).
	const initialScreenVmId = initialRoute?.startsWith('/vm/') ? initialRoute.slice('/vm/'.length) : undefined
	// Phase 358-01 (VMPURE-01) — a WINDOWED screen (windowId present) whose
	// seeded VM resolves is a PURE stream: suppress VmApp's Create-VM header
	// AND VmScreen's own Back/title (threaded via `pure`). Resolved against
	// the SAME vms array VmList re-resolves against (no drift). Mobile
	// in-panel / 357-desktop-icon-on-mobile have windowId ABSENT → windowed
	// is false → pureScreen false → full chrome kept (no stranding).
	const initialScreenVm = initialScreenVmId ? vms.find((v) => v.id === initialScreenVmId) : undefined
	const pureScreen = !!windowed && !!initialScreenVm

	if (visibility === 'loading') {
		return <Loading />
	}

	if (visibility === 'non-admin-note') {
		return (
			<div className='flex h-full w-full items-center justify-center p-8'>
				<p className='max-w-md rounded-radius-md bg-surface-1 p-4 text-center text-body-sm leading-tight text-text-tertiary'>
					{t('vm.admin-only.note')}
				</p>
			</div>
		)
	}

	// visibility === 'vm-app' (admin)
	return (
		<div className='flex h-full w-full flex-col'>
			{error ? (
				<div className='flex h-full w-full items-center justify-center p-8'>
					<p className='max-w-md rounded-radius-md bg-destructive2/5 p-4 text-center text-body-sm leading-tight text-destructive2'>
						{t('vm.error.generic')}
					</p>
				</div>
			) : vms.length === 0 ? (
				<VmEmptyState onCreate={() => setCreateOpen(true)} />
			) : (
				<>
					{!pureScreen && (
						<div className='flex shrink-0 items-center justify-end border-b border-border-default p-3'>
							<Button size='sm' variant='primary' onClick={() => setCreateOpen(true)}>
								{t('vm.create.button')}
							</Button>
						</div>
					)}
					<div className='min-h-0 flex-1 overflow-y-auto'>
						<VmList vms={vms} initialScreenVmId={initialScreenVmId} pure={pureScreen} />
					</div>
				</>
			)}
			{createOpen && <CreateVmDialog open={createOpen} onOpenChange={setCreateOpen} />}
		</div>
	)
}
