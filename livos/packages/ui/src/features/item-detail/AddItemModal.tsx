// Phase 188-01 — AddItemModal 2-step minimal flow.
//
// Replaces the Phase 175-01/02 multi-step form (type → cwd / system-prompt /
// tools / schedule) with a 2-step flow:
//   Step 1: Pick type — two large cards (Agent | Project)
//   Step 2: Enter name + pick a lucide icon → "Kur" submits
//
// Chat type is retained in the tRPC contract but hidden in this UI.
// Icon is stored in settings.json (server side, Phase 188-02 wires it).
//
// Phase 188-03 — z-index + portal fix:
//   Dialog.Overlay className contains z-50
//   Dialog.Content className contains z-50
//   Dialog.Portal has explicit container={document.body}

import * as Dialog from '@radix-ui/react-dialog'
import {
	User,
	Bot,
	Folder,
	FolderOpen,
	Code,
	Terminal,
	Book,
	Brain,
	Sparkles,
	Wrench,
	Calendar,
	Mail,
	Search,
	Database,
	Globe,
	Settings,
	FolderOpen as FolderOpenIcon,
} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'
import {MAIN_LIV_ID, type ItemType} from '@/features/sidebar-tree/tree-shape'

type Step = 'pick-type' | 'name-icon'

export interface AddItemModalProps {
	open: boolean
	onClose: () => void
	onTypeSelected?: (type: ItemType) => void
	onItemCreated?: (item: {id: string; name: string; type: string}) => void
	initialParentId?: string
}

const ICONS = [
	{name: 'User', Icon: User},
	{name: 'Bot', Icon: Bot},
	{name: 'Folder', Icon: Folder},
	{name: 'FolderOpen', Icon: FolderOpen},
	{name: 'Code', Icon: Code},
	{name: 'Terminal', Icon: Terminal},
	{name: 'Book', Icon: Book},
	{name: 'Brain', Icon: Brain},
	{name: 'Sparkles', Icon: Sparkles},
	{name: 'Wrench', Icon: Wrench},
	{name: 'Calendar', Icon: Calendar},
	{name: 'Mail', Icon: Mail},
	{name: 'Search', Icon: Search},
	{name: 'Database', Icon: Database},
	{name: 'Globe', Icon: Globe},
	{name: 'Settings', Icon: Settings},
]

export function AddItemModal({
	open,
	onClose,
	onTypeSelected,
	onItemCreated,
	initialParentId,
}: AddItemModalProps) {
	const [step, setStep] = useState<Step>('pick-type')
	const [selectedType, setSelectedType] = useState<'agent' | 'project' | null>(null)
	const [name, setName] = useState('')
	const [iconName, setIconName] = useState<string | null>(null)
	const [parentId] = useState<string>(initialParentId ?? MAIN_LIV_ID)

	const createMutation = trpcReact.vault.items.create.useMutation({
		onSuccess: (data) => {
			const item = data.item as {id: string; name: string; type: string}
			toast.success(`Oluşturuldu: ${item.name}`)
			onItemCreated?.(item)
			// reset
			setStep('pick-type')
			setSelectedType(null)
			setName('')
			setIconName(null)
			onClose()
		},
		onError: (err) => {
			toast.error((err as {message?: string})?.message ?? 'Öğe oluşturulamadı')
		},
	})

	const handlePickType = (t: 'agent' | 'project') => {
		setSelectedType(t)
		setStep('name-icon')
		onTypeSelected?.(t)
	}

	const handleBack = () => {
		setStep('pick-type')
		setSelectedType(null)
		setIconName(null)
	}

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (!selectedType || name.trim().length === 0 || !iconName) return
		const serverParentId = parentId === MAIN_LIV_ID ? null : parentId
		createMutation.mutate({
			type: selectedType,
			name: name.trim(),
			parentId: serverParentId,
			icon: iconName,
		} as any) // icon field added to server schema in 188-02
	}

	return (
		<Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
			{/* v38.2 hotfix — render Dialog in-tree (no Portal) so it scopes to the
			    AI Chat window content, not document.body. Phase 188-03 used
			    container={document.body} which broke z-index relative to the LivOS
			    window manager (windows are dynamic-zIndex 100+, our z-50 was hidden
			    behind the window chrome). absolute positioning + parent
			    must-be-relative makes the overlay cover only the AI Chat surface. */}
			{/* v38.2 hotfix — opaque backdrop (bg-bg/60 was semi-transparent and
			    operator saw sidebar content bleeding through). Use 95% opacity for
			    a strong block; modal card itself is bg-bg-secondary (fully opaque). */}
			<Dialog.Overlay className='absolute inset-0 z-50 bg-bg/95 backdrop-blur-sm' />
			<Dialog.Content
				data-testid='add-item-modal'
				className='absolute left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-bg-secondary p-6 shadow-2xl'
			>
					<Dialog.Title className='mb-4 text-base font-semibold'>
						{step === 'pick-type' ? 'Yeni öğe ekle' : `Yeni ${selectedType === 'agent' ? 'Agent' : 'Proje'}`}
					</Dialog.Title>

					{step === 'pick-type' && (
						<div data-testid='step-pick-type' className='grid grid-cols-2 gap-4'>
							<button
								type='button'
								data-testid='type-card-agent'
								onClick={() => handlePickType('agent')}
								className='flex h-40 flex-col items-center gap-3 rounded-xl border-2 border-line p-6 text-center hover:border-primary hover:bg-surface-2 cursor-pointer'
							>
								<Bot size={32} className='text-accent-blue' />
								<span className='text-sm font-semibold'>Agent</span>
								<span className='text-xs text-text-secondary'>Senin için iş yapan AI asistan</span>
							</button>
							<button
								type='button'
								data-testid='type-card-project'
								onClick={() => handlePickType('project')}
								className='flex h-40 flex-col items-center gap-3 rounded-xl border-2 border-line p-6 text-center hover:border-primary hover:bg-surface-2 cursor-pointer'
							>
								<FolderOpenIcon size={32} className='text-accent-amber' />
								<span className='text-sm font-semibold'>Proje</span>
								<span className='text-xs text-text-secondary'>İlgili öğeler ve görevler için klasör</span>
							</button>
						</div>
					)}

					{step === 'name-icon' && (
						<form data-testid='step-name-icon' onSubmit={handleSubmit} className='flex flex-col gap-4'>
							<input
								data-testid='name-input'
								autoFocus
								type='text'
								maxLength={128}
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={selectedType === 'agent' ? 'Agent adı...' : 'Proje adı...'}
								className='w-full rounded border border-line bg-bg p-2 text-sm'
							/>

							<div className='grid grid-cols-8 gap-1'>
								{ICONS.map((ic) => (
									<button
										type='button'
										key={ic.name}
										data-testid={`icon-btn-${ic.name}`}
										onClick={() => setIconName(ic.name)}
										className={`rounded-lg p-2 hover:bg-surface-2 ${iconName === ic.name ? 'ring-2 ring-primary bg-surface-2' : ''}`}
										aria-label={ic.name}
									>
										<ic.Icon size={20} />
									</button>
								))}
							</div>

							<div className='flex items-center justify-between'>
								<button
									type='button'
									data-testid='back-btn'
									onClick={handleBack}
									className='text-xs text-text-secondary hover:underline'
								>
									← Geri
								</button>
								<button
									type='submit'
									data-testid='submit-btn'
									disabled={name.trim().length === 0 || iconName === null || createMutation.isPending}
									className='rounded bg-accent-blue px-4 py-1.5 text-sm text-bg disabled:opacity-40'
								>
									{createMutation.isPending ? '...' : 'Kur'}
								</button>
							</div>
						</form>
					)}
			</Dialog.Content>
		</Dialog.Root>
	)
}
