// Phase 322-02 (IDENT-01) — Settings > Groups admin UI. First-class settings
// destination beside Users. Backed entirely by the adminProcedure groups.*
// router (322-02 groups-routes.ts). Every mutation is server-gated; this UI is
// a convenience surface. All copy flows through t('settings.groups.*') with an
// en/tr twin per key (parity gate).

import {motion} from 'motion/react'
import {useState} from 'react'
import {TbLoader2, TbPencil, TbPlus, TbTrash, TbUserPlus, TbUsersGroup, TbX} from 'react-icons/tb'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

type GroupRow = {
	id: string
	name: string
	description: string | null
	createdAt: string
	updatedAt: string
}

export function GroupsSection() {
	const [showCreate, setShowCreate] = useState(false)
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

	const groupsQ = trpcReact.groups.list.useQuery()
	const groups: GroupRow[] = groupsQ.data ?? []
	const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null

	return (
		<div className='space-y-4'>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<p className='text-body-sm text-text-secondary'>{t('settings.groups.description')}</p>
				<Button variant='primary' size='sm' className='h-11' onClick={() => setShowCreate(true)}>
					<TbPlus className='h-4 w-4' />
					{t('settings.groups.create')}
				</Button>
			</div>

			{/* Groups list */}
			<div className='space-y-2'>
				{groupsQ.isLoading ? (
					<div className='flex items-center justify-center py-8'>
						<TbLoader2 className='h-5 w-5 animate-spin text-text-tertiary' />
					</div>
				) : groups.length === 0 ? (
					<div className='py-8 text-center text-body-sm text-text-tertiary'>{t('settings.groups.empty')}</div>
				) : (
					groups.map((group, i) => (
						<motion.div
							key={group.id}
							initial={{opacity: 0, y: 8}}
							animate={{opacity: 1, y: 0}}
							transition={{delay: i * 0.04, duration: 0.25}}
						>
							<GroupListItem
								group={group}
								isSelected={group.id === selectedGroupId}
								onToggleSelect={() =>
									setSelectedGroupId((prev) => (prev === group.id ? null : group.id))
								}
							/>
						</motion.div>
					))
				)}
			</div>

			{/* Member management panel for the selected group */}
			{selectedGroup && <MembersPanel group={selectedGroup} />}

			<CreateGroupDialog open={showCreate} onOpenChange={setShowCreate} />
		</div>
	)
}

function GroupListItem({
	group,
	isSelected,
	onToggleSelect,
}: {
	group: GroupRow
	isSelected: boolean
	onToggleSelect: () => void
}) {
	const utils = trpcReact.useUtils()
	const [showRename, setShowRename] = useState(false)

	const deleteMut = trpcReact.groups.delete.useMutation({
		onSuccess: () => {
			utils.groups.list.invalidate()
			toast.success(t('settings.groups.deleted'))
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	const handleDelete = () => {
		if (window.confirm(t('settings.groups.delete-confirm', {name: group.name}))) {
			deleteMut.mutate({id: group.id})
		}
	}

	return (
		<div
			className={cn(
				'rounded-radius-md border p-4 transition-colors',
				isSelected ? 'border-brand bg-surface-1' : 'border-border-default bg-surface-base',
			)}
		>
			<div className='flex items-center gap-3'>
				<div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand'>
					<TbUsersGroup className='h-5 w-5' />
				</div>

				<div className='min-w-0 flex-1'>
					<div className='truncate text-body-sm font-medium text-text-primary'>{group.name}</div>
					{group.description && (
						<div className='truncate text-caption text-text-tertiary'>{group.description}</div>
					)}
				</div>

				<div className='flex items-center gap-1.5'>
					<Button variant='default' size='sm' onClick={onToggleSelect}>
						<TbUserPlus className='h-4 w-4' />
						{t('settings.groups.members')}
					</Button>
					<Button variant='default' size='sm' onClick={() => setShowRename(true)}>
						<TbPencil className='h-4 w-4' />
						{t('settings.groups.rename-button')}
					</Button>
					<Button variant='destructive' size='sm' onClick={handleDelete} disabled={deleteMut.isPending}>
						{deleteMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : <TbTrash className='h-4 w-4' />}
					</Button>
				</div>
			</div>

			<RenameGroupDialog group={group} open={showRename} onOpenChange={setShowRename} />
		</div>
	)
}

function MembersPanel({group}: {group: GroupRow}) {
	const utils = trpcReact.useUtils()
	const [pendingUserId, setPendingUserId] = useState<string>('')

	const membersQ = trpcReact.groups.listMembers.useQuery({groupId: group.id})
	const members = membersQ.data ?? []

	const usersQ = trpcReact.user.listAllUsers.useQuery()
	const allUsers = usersQ.data ?? []

	// Only offer users that are not already members.
	const memberIds = new Set(members.map((m) => m.userId))
	const addableUsers = allUsers.filter((u) => !memberIds.has(u.id))

	const addMut = trpcReact.groups.addMember.useMutation({
		onSuccess: () => {
			utils.groups.listMembers.invalidate({groupId: group.id})
			setPendingUserId('')
			toast.success(t('settings.groups.member-added'))
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	const removeMut = trpcReact.groups.removeMember.useMutation({
		onSuccess: () => {
			utils.groups.listMembers.invalidate({groupId: group.id})
			toast.success(t('settings.groups.member-removed'))
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	const handleAdd = () => {
		if (!pendingUserId) return
		addMut.mutate({groupId: group.id, userId: pendingUserId})
	}

	return (
		<div className='space-y-3 rounded-radius-md border border-border-default bg-surface-base p-4'>
			<div className='text-body-sm font-medium text-text-primary'>
				{t('settings.groups.members-of', {name: group.name})}
			</div>

			{/* Add member row */}
			<div className='flex items-center gap-2'>
				<Select value={pendingUserId} onValueChange={setPendingUserId}>
					<SelectTrigger className='flex-1'>
						<SelectValue placeholder={t('settings.groups.add-member')} />
					</SelectTrigger>
					<SelectContent>
						{addableUsers.map((u) => (
							<SelectItem key={u.id} value={u.id}>
								{u.display_name} (@{u.username})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant='primary'
					size='sm'
					className='h-11'
					onClick={handleAdd}
					disabled={!pendingUserId || addMut.isPending}
				>
					{addMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : <TbUserPlus className='h-4 w-4' />}
					{t('settings.groups.add-member')}
				</Button>
			</div>

			{/* Members list */}
			{membersQ.isLoading ? (
				<div className='flex items-center justify-center py-4'>
					<TbLoader2 className='h-5 w-5 animate-spin text-text-tertiary' />
				</div>
			) : members.length === 0 ? (
				<div className='py-4 text-center text-caption text-text-tertiary'>{t('settings.groups.no-members')}</div>
			) : (
				<div className='space-y-1.5'>
					{members.map((m) => (
						<div
							key={m.userId}
							className='flex items-center justify-between rounded-radius-md border border-border-default/50 bg-surface-1 px-3 py-2'
						>
							<span className='truncate text-body-sm text-text-primary'>@{m.username}</span>
							<Button
								variant='default'
								size='sm'
								onClick={() => removeMut.mutate({groupId: group.id, userId: m.userId})}
								disabled={removeMut.isPending}
								title={t('settings.groups.remove-member')}
							>
								<TbX className='h-4 w-4' />
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

function CreateGroupDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
	const utils = trpcReact.useUtils()
	const [name, setName] = useState('')
	const [description, setDescription] = useState('')

	const createMut = trpcReact.groups.create.useMutation({
		onSuccess: () => {
			utils.groups.list.invalidate()
			toast.success(t('settings.groups.created'))
			handleClose(false)
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	const handleClose = (isOpen: boolean) => {
		if (!isOpen) {
			setName('')
			setDescription('')
			createMut.reset()
		}
		onOpenChange(isOpen)
	}

	const handleCreate = () => {
		const trimmed = name.trim()
		if (!trimmed) return
		createMut.mutate({name: trimmed, description: description.trim() || undefined})
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogPortal>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('settings.groups.create')}</DialogTitle>
					</DialogHeader>

					<div className='space-y-4'>
						<div className='space-y-2'>
							<label className='text-caption text-text-secondary'>{t('settings.groups.name')}</label>
							<Input
								value={name}
								onValueChange={setName}
								placeholder={t('settings.groups.name-placeholder')}
								autoFocus
							/>
						</div>
						<div className='space-y-2'>
							<label className='text-caption text-text-secondary'>{t('settings.groups.description-label')}</label>
							<Input value={description} onValueChange={setDescription} />
						</div>
					</div>

					<DialogFooter>
						<Button
							size='dialog'
							variant='primary'
							onClick={handleCreate}
							disabled={!name.trim() || createMut.isPending}
						>
							{createMut.isPending ? (
								<>
									<TbLoader2 className='h-4 w-4 animate-spin' />
									{t('settings.groups.create-button')}
								</>
							) : (
								<>
									<TbPlus className='h-4 w-4' />
									{t('settings.groups.create-button')}
								</>
							)}
						</Button>
						<Button size='dialog' onClick={() => handleClose(false)}>
							{t('cancel')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}

function RenameGroupDialog({
	group,
	open,
	onOpenChange,
}: {
	group: GroupRow
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const utils = trpcReact.useUtils()
	const [name, setName] = useState(group.name)
	const [description, setDescription] = useState(group.description ?? '')

	const renameMut = trpcReact.groups.rename.useMutation({
		onSuccess: () => {
			utils.groups.list.invalidate()
			toast.success(t('settings.groups.renamed'))
			onOpenChange(false)
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	// Reset the fields to the group's current values whenever the dialog opens.
	const handleOpenChange = (isOpen: boolean) => {
		if (isOpen) {
			setName(group.name)
			setDescription(group.description ?? '')
		}
		onOpenChange(isOpen)
	}

	const handleRename = () => {
		const trimmed = name.trim()
		if (!trimmed) return
		renameMut.mutate({id: group.id, name: trimmed, description: description.trim() || undefined})
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogPortal>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('settings.groups.rename')}</DialogTitle>
					</DialogHeader>

					<div className='space-y-4'>
						<div className='space-y-2'>
							<label className='text-caption text-text-secondary'>{t('settings.groups.name')}</label>
							<Input value={name} onValueChange={setName} placeholder={t('settings.groups.name-placeholder')} autoFocus />
						</div>
						<div className='space-y-2'>
							<label className='text-caption text-text-secondary'>{t('settings.groups.description-label')}</label>
							<Input value={description} onValueChange={setDescription} />
						</div>
					</div>

					<DialogFooter>
						<Button
							size='dialog'
							variant='primary'
							onClick={handleRename}
							disabled={!name.trim() || renameMut.isPending}
						>
							{renameMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : <TbPencil className='h-4 w-4' />}
							{t('settings.groups.rename-button')}
						</Button>
						<Button size='dialog' onClick={() => onOpenChange(false)}>
							{t('cancel')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
