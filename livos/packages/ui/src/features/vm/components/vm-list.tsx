// Phase 352-02 (VMAPP-02) — the VM list: maps vms → staggered VmListItem rows and
// owns the single delete-confirm dialog's open-state (one dialog for the whole
// list; each row's delete button just selects the pending VM). The motion stagger
// mirrors users.tsx's list.
//
// Phase 353-02 (VMVIEW-01) — also owns the list<->screen view state; the screen
// keeps reading LIVE state from the SAME vm.list polling (we re-resolve the row
// by id every render, so a state change while viewing is reflected honestly),
// then Back returns to the list.
//
// Phase 356-01 (VMWIN-01) — the app-list "Open screen" button now opens a
// DEDICATED first-class LivOS window (windowManager.openWindow, converging with
// the 354 dock pin) instead of swapping <VmScreen> in-place. The internal
// `screenVmId` machinery is NOT dead: `initialScreenVmId` seeds a freshly-opened
// /vm/<id> window so it renders <VmScreen> on mount, and Back (onBack ->
// setScreenVmId(null)) falls back to the list WITHIN that same window.
//
// Phase 356 review (M-01) — the WindowManagerProvider is mounted unconditionally
// (router.tsx), so `windowManager` is NON-null on mobile too; only
// WindowsContainer returns null on mobile (windows-container.tsx:22). Opening a
// desktop window on a phone therefore accretes an UNRENDERED window. So on mobile
// we fall back to the pre-356 in-panel <VmScreen> swap (353 behavior), reusing the
// SAME useIsMobile signal WindowsContainer gates on so the two can never disagree.
// Desktop keeps the first-class-window path.
import {motion} from 'motion/react'
import {useState} from 'react'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useWindowManagerOptional} from '@/providers/window-manager'
import type {RouterOutput} from '@/trpc/trpc'

import {DeleteVmDialog} from './delete-vm-dialog'
import {VmListItem} from './vm-list-item'
import {VmScreen} from './vm-screen'

type VmView = RouterOutput['vm']['list'][number]

export function VmList({vms, initialScreenVmId, pure}: {vms: VmView[]; initialScreenVmId?: string; pure?: boolean}) {
	const windowManager = useWindowManagerOptional()
	const isMobile = useIsMobile()
	const [vmPendingDelete, setVmPendingDelete] = useState<VmView | null>(null)
	const [screenVmId, setScreenVmId] = useState<string | null>(initialScreenVmId ?? null)

	// Re-resolve the viewed VM from the live list every render so its state stays
	// honest while the screen is open (no parallel query). If it vanished (deleted
	// elsewhere), fall back to the list.
	const screenVm = screenVmId ? (vms.find((v) => v.id === screenVmId) ?? null) : null
	if (screenVm) {
		return <VmScreen vm={screenVm} onBack={() => setScreenVmId(null)} pure={pure} />
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
						onOpenScreen={(v) =>
							isMobile
								? setScreenVmId(v.id) // mobile: in-panel <VmScreen> swap (353 behavior — WindowsContainer renders nothing on mobile)
								: windowManager?.openWindow('LIVINITY_vm', `/vm/${v.id}`, v.name, '') // desktop: first-class window
						}
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
