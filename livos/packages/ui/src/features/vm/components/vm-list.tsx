// Phase 352-02 (VMAPP-02) — the VM list: maps vms → staggered VmListItem rows and
// owns the single delete-confirm dialog's open-state (one dialog for the whole
// list; each row's delete button just selects the pending VM). The motion stagger
// mirrors users.tsx's list.
//
// Phase 353-02 (VMVIEW-01) — also owns the list<->screen view state. Opening a
// VM's screen swaps the list for <VmScreen> WITHIN this app window (no window
// registration plumbing); the screen keeps reading LIVE state from the SAME
// vm.list polling (we re-resolve the row by id every render, so a state change
// while viewing is reflected honestly), then Back returns to the list.
import {motion} from 'motion/react'
import {useState} from 'react'

import type {RouterOutput} from '@/trpc/trpc'

import {DeleteVmDialog} from './delete-vm-dialog'
import {VmListItem} from './vm-list-item'
import {VmScreen} from './vm-screen'

type VmView = RouterOutput['vm']['list'][number]

export function VmList({vms, initialScreenVmId}: {vms: VmView[]; initialScreenVmId?: string}) {
	const [vmPendingDelete, setVmPendingDelete] = useState<VmView | null>(null)
	const [screenVmId, setScreenVmId] = useState<string | null>(initialScreenVmId ?? null)

	// Re-resolve the viewed VM from the live list every render so its state stays
	// honest while the screen is open (no parallel query). If it vanished (deleted
	// elsewhere), fall back to the list.
	const screenVm = screenVmId ? (vms.find((v) => v.id === screenVmId) ?? null) : null
	if (screenVm) {
		return <VmScreen vm={screenVm} onBack={() => setScreenVmId(null)} />
	}

	return (
		<div className='flex flex-col gap-2 p-4'>
			{vms.map((vm, i) => (
				<motion.div
					key={vm.id}
					initial={{opacity: 0, y: 8}}
					animate={{opacity: 1, y: 0}}
					transition={{delay: i * 0.04, duration: 0.25}}
				>
					<VmListItem
						vm={vm}
						onDelete={() => setVmPendingDelete(vm)}
						onOpenScreen={(v) => setScreenVmId(v.id)}
					/>
				</motion.div>
			))}

			<DeleteVmDialog
				open={!!vmPendingDelete}
				vm={vmPendingDelete}
				onOpenChange={(open) => {
					if (!open) setVmPendingDelete(null)
				}}
			/>
		</div>
	)
}
