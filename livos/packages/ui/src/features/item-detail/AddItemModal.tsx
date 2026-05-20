// Phase 175-01 / 175-02 — AddItemModal.
//
// 175-01 — Scaffold: Radix Dialog shell + 3 type-picker cards + parent
//   dropdown populated from vault.items.list (Main Liv pinned first).
//
// 175-02 — Per-type forms + vault.items.create mutation.
//   After pickType(type), the modal swaps the picker for a per-type form:
//     project → name (required), cwd (optional), template select (client-only)
//     agent   → name (required), system prompt (optional, client-only for now),
//               schedule cron (optional)
//     chat    → name (optional — auto-generated `Chat YYYY-MM-DD HH:mm` when blank)
//   Submit fires trpcReact.vault.items.create.useMutation. On success, sonner
//   toast.success + onItemCreated(item) + onClose. On error, sonner toast.error
//   and the modal STAYS open (user can correct + retry).
//
// CROSS-TYPE FIELD GATING — the server (vault-items-router.ts lines 155-169)
// BAD_REQUESTs if cwd is on a non-project, schedule on a non-agent, or
// ccSessionId on a non-chat. The form-step branches per selectedType
// ensure we never send a forbidden field.
//
// PARENT ID TRANSLATION — the parent dropdown uses MAIN_LIV_ID ('main-liv')
// for the synthetic root. Real Item ids are ≥20 chars (nanoid); 'main-liv'
// is 8 chars and the server's Zod ID_RE would reject it. Translate
// MAIN_LIV_ID → null before sending.

import * as Dialog from '@radix-ui/react-dialog'
import {Bot, FolderKanban, MessageSquare} from 'lucide-react'
import {useState, type FormEvent} from 'react'
import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'

import {MAIN_LIV_ID, type ItemType} from '@/features/sidebar-tree/tree-shape'

type Step = 'pick' | 'form'

export interface AddItemModalProps {
	open: boolean
	onClose: () => void
	onTypeSelected?: (type: ItemType) => void
	onItemCreated?: (item: {id: string; name: string; type: string}) => void
	initialParentId?: string
}

function defaultChatName(now: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0')
	return `Chat ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
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

export function AddItemModal({
	open,
	onClose,
	onTypeSelected,
	onItemCreated,
	initialParentId,
}: AddItemModalProps) {
	const [step, setStep] = useState<Step>('pick')
	const [selectedType, setSelectedType] = useState<ItemType | null>(null)
	const [parentId, setParentId] = useState<string>(initialParentId ?? MAIN_LIV_ID)
	const [formError, setFormError] = useState<string | null>(null)

	// Per-type form state — kept isolated so type-switch never carries
	// forbidden fields (server cross-type gate).
	const [projectName, setProjectName] = useState('')
	const [projectCwd, setProjectCwd] = useState('')
	const [projectTemplate, setProjectTemplate] = useState<'blank' | 'git-clone' | '.planning'>(
		'blank',
	)
	const [agentName, setAgentName] = useState('')
	const [agentSystemPrompt, setAgentSystemPrompt] = useState('')
	const [agentSchedule, setAgentSchedule] = useState('')
	const [chatName, setChatName] = useState('')

	const list = trpcReact.vault.items.list.useQuery()
	const liveItems = (list.data?.items ?? []).filter(
		(it: {archivedAt: number | null}) => it.archivedAt === null,
	)

	const createMutation = trpcReact.vault.items.create.useMutation({
		onSuccess: (data: {item?: any}) => {
			const item = data.item as {id: string; name: string; type: string}
			toast.success(`Created: ${item.name}`)
			onItemCreated?.(item)
			// Reset local state so a reopen starts fresh.
			setStep('pick')
			setSelectedType(null)
			setProjectName('')
			setProjectCwd('')
			setProjectTemplate('blank')
			setAgentName('')
			setAgentSystemPrompt('')
			setAgentSchedule('')
			setChatName('')
			setFormError(null)
			onClose()
		},
		onError: (err: {message?: string}) => {
			toast.error(err?.message ?? 'Failed to create item')
			// Modal stays open — caller can correct + retry.
		},
	})

	const handlePick = (type: ItemType) => {
		setSelectedType(type)
		setStep('form')
		setFormError(null)
		onTypeSelected?.(type)
	}

	const handleBack = () => {
		setStep('pick')
		setSelectedType(null)
		setFormError(null)
	}

	const serverParentId = parentId === MAIN_LIV_ID ? null : parentId

	const submitProject = (e: FormEvent) => {
		e.preventDefault()
		if (projectName.trim().length === 0) {
			setFormError('Name is required')
			return
		}
		setFormError(null)
		const payload: {
			type: 'project'
			name: string
			parentId: string | null
			cwd?: string
		} = {
			type: 'project',
			name: projectName.trim(),
			parentId: serverParentId,
		}
		if (projectCwd.trim().length > 0) {
			payload.cwd = projectCwd.trim()
		}
		// NOTE: `template` is client-only for now — server scaffolding lands in
		// a future plan (176+). Not sent to vault.items.create.
		createMutation.mutate(payload)
	}

	const submitAgent = (e: FormEvent) => {
		e.preventDefault()
		if (agentName.trim().length === 0) {
			setFormError('Name is required')
			return
		}
		setFormError(null)
		const payload: {
			type: 'agent'
			name: string
			parentId: string | null
			schedule?: string
		} = {
			type: 'agent',
			name: agentName.trim(),
			parentId: serverParentId,
		}
		if (agentSchedule.trim().length > 0) {
			payload.schedule = agentSchedule.trim()
		}
		// NOTE: `systemPrompt` is client-only for now — 175-04 AgentDetail will
		// plumb it via a separate update mutation. Not sent to vault.items.create.
		createMutation.mutate(payload)
	}

	const submitChat = (e: FormEvent) => {
		e.preventDefault()
		const finalName = chatName.trim().length > 0 ? chatName.trim() : defaultChatName()
		setFormError(null)
		createMutation.mutate({
			type: 'chat',
			name: finalName,
			parentId: serverParentId,
		})
	}

	return (
		<Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
			<Dialog.Portal>
				<Dialog.Overlay className='fixed inset-0 bg-bg/60' />
				<Dialog.Content
					data-testid='add-item-modal'
					className='fixed left-1/2 top-1/2 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-bg-secondary p-6 shadow-lg'
				>
					<Dialog.Title className='mb-4 text-base font-semibold'>
						{step === 'pick' ? 'Add new item' : `New ${selectedType ?? ''}`}
					</Dialog.Title>

					{step === 'pick' && (
						<>
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
						</>
					)}

					{step === 'form' && selectedType === 'project' && (
						<form
							data-testid='form-step-project'
							onSubmit={submitProject}
							className='flex flex-col gap-3'
						>
							<div>
								<label className='mb-1 block text-xs font-medium text-text-secondary'>
									Name
								</label>
								<input
									data-testid='project-name-input'
									type='text'
									value={projectName}
									onChange={(e) => setProjectName(e.target.value)}
									maxLength={200}
									className='w-full rounded border border-line bg-bg p-2 text-sm'
								/>
							</div>
							<div>
								<label className='mb-1 block text-xs font-medium text-text-secondary'>
									Working directory (cwd)
								</label>
								<input
									data-testid='project-cwd-input'
									type='text'
									value={projectCwd}
									onChange={(e) => setProjectCwd(e.target.value)}
									className='w-full rounded border border-line bg-bg p-2 text-sm'
								/>
							</div>
							<div>
								<label className='mb-1 block text-xs font-medium text-text-secondary'>
									Template
								</label>
								<select
									data-testid='project-template-select'
									value={projectTemplate}
									onChange={(e) =>
										setProjectTemplate(
											e.target.value as 'blank' | 'git-clone' | '.planning',
										)
									}
									className='w-full rounded border border-line bg-bg p-2 text-sm'
								>
									<option value='blank'>blank</option>
									<option value='git-clone'>git-clone</option>
									<option value='.planning'>.planning</option>
								</select>
								<span data-testid='project-template-selected' className='hidden'>
									{projectTemplate}
								</span>
							</div>
							{formError && (
								<div data-testid='form-error' className='text-xs text-accent-red'>
									{formError}
								</div>
							)}
							<div className='flex justify-between'>
								<button
									type='button'
									data-testid='form-back'
									onClick={handleBack}
									className='text-xs text-text-secondary hover:underline'
								>
									← Back
								</button>
								<button
									type='submit'
									data-testid='form-submit'
									className='rounded bg-accent-blue px-3 py-1 text-sm text-bg'
								>
									Create project
								</button>
							</div>
						</form>
					)}

					{step === 'form' && selectedType === 'agent' && (
						<form
							data-testid='form-step-agent'
							onSubmit={submitAgent}
							className='flex flex-col gap-3'
						>
							<div>
								<label className='mb-1 block text-xs font-medium text-text-secondary'>
									Name
								</label>
								<input
									data-testid='agent-name-input'
									type='text'
									value={agentName}
									onChange={(e) => setAgentName(e.target.value)}
									maxLength={200}
									className='w-full rounded border border-line bg-bg p-2 text-sm'
								/>
							</div>
							<div>
								<label className='mb-1 block text-xs font-medium text-text-secondary'>
									System prompt (optional)
								</label>
								<textarea
									data-testid='agent-system-prompt-input'
									value={agentSystemPrompt}
									onChange={(e) => setAgentSystemPrompt(e.target.value)}
									rows={3}
									className='w-full rounded border border-line bg-bg p-2 text-sm'
								/>
							</div>
							<div>
								<label className='mb-1 block text-xs font-medium text-text-secondary'>
									Schedule (cron, optional)
								</label>
								<input
									data-testid='agent-schedule-input'
									type='text'
									placeholder='e.g. 0 9 * * *'
									value={agentSchedule}
									onChange={(e) => setAgentSchedule(e.target.value)}
									className='w-full rounded border border-line bg-bg p-2 text-sm'
								/>
							</div>
							{formError && (
								<div data-testid='form-error' className='text-xs text-accent-red'>
									{formError}
								</div>
							)}
							<div className='flex justify-between'>
								<button
									type='button'
									data-testid='form-back'
									onClick={handleBack}
									className='text-xs text-text-secondary hover:underline'
								>
									← Back
								</button>
								<button
									type='submit'
									data-testid='form-submit'
									className='rounded bg-accent-blue px-3 py-1 text-sm text-bg'
								>
									Create agent
								</button>
							</div>
						</form>
					)}

					{step === 'form' && selectedType === 'chat' && (
						<form
							data-testid='form-step-chat'
							onSubmit={submitChat}
							className='flex flex-col gap-3'
						>
							<div>
								<label className='mb-1 block text-xs font-medium text-text-secondary'>
									Name (optional — auto-generated if blank)
								</label>
								<input
									data-testid='chat-name-input'
									type='text'
									value={chatName}
									onChange={(e) => setChatName(e.target.value)}
									maxLength={200}
									className='w-full rounded border border-line bg-bg p-2 text-sm'
								/>
							</div>
							{formError && (
								<div data-testid='form-error' className='text-xs text-accent-red'>
									{formError}
								</div>
							)}
							<div className='flex justify-between'>
								<button
									type='button'
									data-testid='form-back'
									onClick={handleBack}
									className='text-xs text-text-secondary hover:underline'
								>
									← Back
								</button>
								<button
									type='submit'
									data-testid='form-submit'
									className='rounded bg-accent-blue px-3 py-1 text-sm text-bg'
								>
									Create chat
								</button>
							</div>
						</form>
					)}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	)
}
