// Phase 175-01 — AddItemModal scaffold.
//
// - Anchored modal (Radix Dialog with Portal) — opens from the sidebar
//   "+ Add" trigger. Preserves LivOS window logic per memory feedback
//   (no full-screen / no URL route); Dialog gives us Escape-to-close +
//   click-outside + focus trap for free.
// - Type picker: 3 cards (Project / Agent / Chat) — lucide icons match
//   ItemTreeRow.tsx (FolderKanban / Bot / MessageSquare) and D-V38-O
//   token colours (text-accent-amber / text-accent-blue / text-text-
//   secondary). Clicking a card emits onTypeSelected(type).
// - Parent dropdown: native <select> populated from
//   trpcReact.vault.items.list. Main Liv synthetic root is always the
//   first option AND the default selection. Archived items
//   (archivedAt !== null) are filtered out (matches tree-shape.ts).
//
// Plan 175-02 will add the per-type form step + tRPC mutation. This
// scaffold establishes the shell + testid surface only.

import * as Dialog from '@radix-ui/react-dialog'
import {Bot, FolderKanban, MessageSquare} from 'lucide-react'
import {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {MAIN_LIV_ID, type ItemType} from '@/features/sidebar-tree/tree-shape'

export interface AddItemModalProps {
	/** Controls modal visibility. */
	open: boolean
	/** Fired on Escape / click-outside / programmatic close. */
	onClose: () => void
	/** Fired when the user picks a type card. Plan 175-02 advances to the
	 * per-type form step on this callback. */
	onTypeSelected?: (type: ItemType) => void
	/** Optional initial parent id — defaults to MAIN_LIV_ID. Plan 175-02
	 * threads this through to the create mutation. */
	initialParentId?: string
}

interface TypeCardProps {
	testId: string
	type: ItemType
	label: string
	description: string
	Icon: typeof FolderKanban
	iconClass: string
	onClick: () => void
}

function TypeCard({testId, label, description, Icon, iconClass, onClick}: TypeCardProps) {
	return (
		<button
			type='button'
			data-testid={testId}
			onClick={onClick}
			className='flex flex-col items-start gap-2 rounded-lg border border-line p-4 text-left hover:bg-surface-2'
		>
			<Icon size={24} className={iconClass} />
			<span className='text-sm font-semibold'>{label}</span>
			<span className='text-xs text-text-secondary'>{description}</span>
		</button>
	)
}

export function AddItemModal({open, onClose, onTypeSelected, initialParentId}: AddItemModalProps) {
	const [parentId, setParentId] = useState<string>(initialParentId ?? MAIN_LIV_ID)
	const list = trpcReact.vault.items.list.useQuery()

	const liveItems = (list.data?.items ?? []).filter(
		(it: {archivedAt: number | null}) => it.archivedAt === null,
	)

	const handlePick = (type: ItemType) => {
		onTypeSelected?.(type)
	}

	return (
		<Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
			<Dialog.Portal>
				<Dialog.Overlay className='fixed inset-0 bg-bg/60' />
				<Dialog.Content
					data-testid='add-item-modal'
					className='fixed left-1/2 top-1/2 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-bg-secondary p-6 shadow-lg'
				>
					<Dialog.Title className='mb-4 text-base font-semibold'>Add new item</Dialog.Title>

					<div className='mb-4 grid grid-cols-3 gap-3'>
						<TypeCard
							testId='type-card-project'
							type='project'
							label='Project'
							description='Folder with README + tasks'
							Icon={FolderKanban}
							iconClass='lucide-folder-kanban text-accent-amber'
							onClick={() => handlePick('project')}
						/>
						<TypeCard
							testId='type-card-agent'
							type='agent'
							label='Agent'
							description='Scheduled or on-demand'
							Icon={Bot}
							iconClass='lucide-bot text-accent-blue'
							onClick={() => handlePick('agent')}
						/>
						<TypeCard
							testId='type-card-chat'
							type='chat'
							label='Chat'
							description='Quick CC PTY session'
							Icon={MessageSquare}
							iconClass='lucide-message-square text-text-secondary'
							onClick={() => handlePick('chat')}
						/>
					</div>

					<label className='mb-1 block text-xs font-medium text-text-secondary'>
						Parent
					</label>
					<select
						data-testid='parent-select'
						value={parentId}
						onChange={(e) => setParentId(e.target.value)}
						className='w-full rounded border border-line bg-bg p-2 text-sm'
					>
						<option value={MAIN_LIV_ID}>Main Liv</option>
						{liveItems.map((it: {id: string; name: string}) => (
							<option key={it.id} value={it.id}>
								{it.name}
							</option>
						))}
					</select>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	)
}
