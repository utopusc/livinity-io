// Phase 352-02 (VMAPP-02) — the VM list: maps vms → staggered VmListItem rows and
// owns the single delete-confirm dialog's open-state (one dialog for the whole
// list; each row's delete button just selects the pending VM). The motion stagger
// mirrors users.tsx's list.
import {motion} from 'motion/react'
import {useState} from 'react'

import type {RouterOutput} from '@/trpc/trpc'

import {DeleteVmDialog} from './delete-vm-dialog'
import {VmListItem} from './vm-list-item'

type VmView = RouterOutput['vm']['list'][number]

export function VmList({vms}: {vms: VmView[]}) {
	const [vmPendingDelete, setVmPendingDelete] = useState<VmView | null>(null)

	return (
		<div className='flex flex-col gap-2 p-4'>
			{vms.map((vm, i) => (
				<motion.div
					key={vm.id}
					initial={{opacity: 0, y: 8}}
					animate={{opacity: 1, y: 0}}
					transition={{delay: i * 0.04, duration: 0.25}}
				>
					<VmListItem vm={vm} onDelete={() => setVmPendingDelete(vm)} />
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
