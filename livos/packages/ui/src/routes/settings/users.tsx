import {motion} from 'motion/react'
import {useState} from 'react'
import {
	TbCheck,
	TbCopy,
	TbLoader2,
	TbPlus,
	TbShieldCheck,
	TbUser,
	TbUserOff,
	TbUserPlus,
} from 'react-icons/tb'
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

type UserRow = {
	id: string
	username: string
	display_name: string
	avatar_color: string
	role: string
	is_active: boolean
	created_at: string
	updated_at: string
}

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.map((word) => word[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase()
}

export function UsersSection() {
	const [showInviteDialog, setShowInviteDialog] = useState(false)

	const usersQ = trpcReact.user.listAllUsers.useQuery()
	const users: UserRow[] = usersQ.data ?? []

	const currentUserQ = trpcReact.user.get.useQuery()
	const currentUserId = currentUserQ.data?.id

	const multiUserQ = trpcReact.apps.isMultiUserEnabled.useQuery()
	const multiUserMut = trpcReact.apps.setMultiUserEnabled.useMutation({
		onSuccess: (data) => {
			toast.success(`Multi-user mode ${data.enabled ? 'enabled' : 'disabled'}`)
			multiUserQ.refetch()
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	return (
		<div className='space-y-4'>
			{/* Multi-user mode toggle */}
			<div className='flex items-center justify-between rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='flex-1'>
					<div className='text-body-sm font-medium text-text-primary'>Multi-User Mode</div>
					<div className='text-caption text-text-tertiary'>
						Enable per-user app instances and subdomain routing. Caddy will use a wildcard certificate for all subdomains.
					</div>
				</div>
				<button
					onClick={() => multiUserMut.mutate(!multiUserQ.data)}
					disabled={multiUserMut.isPending}
					className={`relative flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
						multiUserQ.data ? 'bg-green-500' : 'bg-white/20'
					}`}
				>
					<div
						className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
							multiUserQ.data ? 'translate-x-5' : 'translate-x-0'
						}`}
					/>
				</button>
			</div>

			<div className='flex items-center justify-between'>
				<p className='text-body-sm text-text-secondary'>
					Manage users who can access your Livinity device. Invite new users or change existing user roles.
				</p>
				<Button variant='primary' size='sm' onClick={() => setShowInviteDialog(true)}>
					<TbUserPlus className='h-4 w-4' />
					Invite User
				</Button>
			</div>

			{/* User list */}
			<div className='space-y-2'>
				{usersQ.isLoading ? (
					<div className='flex items-center justify-center py-8'>
						<TbLoader2 className='h-5 w-5 animate-spin text-text-tertiary' />
					</div>
				) : users.length === 0 ? (
					<div className='py-8 text-center text-body-sm text-text-tertiary'>No users found</div>
				) : (
					users.map((user, i) => (
						<motion.div
							key={user.id}
							initial={{opacity: 0, y: 8}}
							animate={{opacity: 1, y: 0}}
							transition={{delay: i * 0.04, duration: 0.25}}
						>
							<UserListItem user={user} isCurrentUser={user.id === currentUserId} />
						</motion.div>
					))
				)}
			</div>

			<InviteDialog open={showInviteDialog} onOpenChange={setShowInviteDialog} />
		</div>
	)
}

function UserListItem({user, isCurrentUser}: {user: UserRow; isCurrentUser: boolean}) {
	const utils = trpcReact.useUtils()

	const roleMut = trpcReact.user.updateUserRole.useMutation({
		onSuccess: () => {
			utils.user.listAllUsers.invalidate()
			toast.success(`Role updated for ${user.display_name}`)
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	const toggleActiveMut = trpcReact.user.toggleUserActive.useMutation({
		onSuccess: () => {
			utils.user.listAllUsers.invalidate()
			toast.success(user.is_active ? `${user.display_name} has been disabled` : `${user.display_name} has been enabled`)
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	const handleRoleChange = (role: string) => {
		roleMut.mutate({userId: user.id, role: role as 'admin' | 'member' | 'guest'})
	}

	const handleToggleActive = () => {
		toggleActiveMut.mutate({userId: user.id, isActive: !user.is_active})
	}

	return (
		<div
			className={`flex items-center gap-4 rounded-radius-md border p-4 transition-colors ${
				user.is_active ? 'border-border-default bg-surface-base' : 'border-border-default/50 bg-surface-base/50 opacity-60'
			}`}
		>
			{/* Avatar */}
			<div
				className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-body-sm font-semibold text-white'
				style={{backgroundColor: user.avatar_color}}
			>
				{getInitials(user.display_name)}
			</div>

			{/* Info */}
			<div className='min-w-0 flex-1'>
				<div className='flex items-center gap-2'>
					<span className='truncate text-body-sm font-medium text-text-primary'>{user.display_name}</span>
					{isCurrentUser && (
						<span className='shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-caption text-brand'>You</span>
					)}
					{!user.is_active && (
						<span className='shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-caption text-red-600'>Disabled</span>
					)}
				</div>
				<div className='text-caption text-text-tertiary'>@{user.username}</div>
			</div>

			{/* Role selector */}
			<Select
				value={user.role}
				onValueChange={handleRoleChange}
				disabled={isCurrentUser || roleMut.isPending}
			>
				<SelectTrigger className='w-[120px]'>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value='admin'>
						<div className='flex items-center gap-1.5'>
							<TbShieldCheck className='h-3.5 w-3.5' />
							Admin
						</div>
					</SelectItem>
					<SelectItem value='member'>
						<div className='flex items-center gap-1.5'>
							<TbUser className='h-3.5 w-3.5' />
							Member
						</div>
					</SelectItem>
					<SelectItem value='guest'>
						<div className='flex items-center gap-1.5'>
							<TbUserOff className='h-3.5 w-3.5' />
							Guest
						</div>
					</SelectItem>
				</SelectContent>
			</Select>

			{/* Enable/Disable toggle */}
			{!isCurrentUser && (
				<Button
					variant={user.is_active ? 'default' : 'primary'}
					size='sm'
					onClick={handleToggleActive}
					disabled={toggleActiveMut.isPending}
				>
					{toggleActiveMut.isPending ? (
						<TbLoader2 className='h-4 w-4 animate-spin' />
					) : user.is_active ? (
						'Disable'
					) : (
						'Enable'
					)}
				</Button>
			)}
		</div>
	)
}

function InviteDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
	const [role, setRole] = useState<'member' | 'guest'>('member')
	const [inviteToken, setInviteToken] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)

	const createInviteMut = trpcReact.user.createInvite.useMutation({
		onSuccess: (data) => {
			setInviteToken(data.token)
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	const handleCreate = () => {
		createInviteMut.mutate({role})
	}

	const inviteUrl = inviteToken ? `${window.location.origin}/invite/${inviteToken}` : ''

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(inviteUrl)
			setCopied(true)
			toast.success('Invite link copied to clipboard')
			setTimeout(() => setCopied(false), 2000)
		} catch {
			toast.error('Failed to copy to clipboard')
		}
	}

	const handleClose = (isOpen: boolean) => {
		if (!isOpen) {
			// Reset state when closing
			setInviteToken(null)
			setCopied(false)
			createInviteMut.reset()
		}
		onOpenChange(isOpen)
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogPortal>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Invite New User</DialogTitle>
					</DialogHeader>

					{inviteToken ? (
						<div className='space-y-4'>
							<p className='text-body-sm text-text-secondary'>
								Share this invite link with the new user. It expires in 7 days and can only be used once.
							</p>
							<div className='flex items-center gap-2 overflow-hidden rounded-radius-md border border-border-default bg-surface-base p-3'>
								<code className='min-w-0 flex-1 truncate text-caption font-mono text-text-primary'>{inviteUrl}</code>
								<Button variant='default' size='sm' className='shrink-0' onClick={handleCopy}>
									{copied ? <TbCheck className='h-4 w-4 text-green-500' /> : <TbCopy className='h-4 w-4' />}
								</Button>
							</div>
						</div>
					) : (
						<div className='space-y-4'>
							<p className='text-body-sm text-text-secondary'>
								Create an invite link for a new user. Choose their role below.
							</p>
							<div className='space-y-2'>
								<label className='text-caption text-text-secondary'>Role</label>
								<Select value={role} onValueChange={(v) => setRole(v as 'member' | 'guest')}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='member'>
											<div className='flex items-center gap-1.5'>
												<TbUser className='h-3.5 w-3.5' />
												Member - Full access to apps and features
											</div>
										</SelectItem>
										<SelectItem value='guest'>
											<div className='flex items-center gap-1.5'>
												<TbUserOff className='h-3.5 w-3.5' />
												Guest - Limited access
											</div>
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					)}

					<DialogFooter>
						{inviteToken ? (
							<Button size='dialog' onClick={() => handleClose(false)}>
								Done
							</Button>
						) : (
							<>
								<Button size='dialog' variant='primary' onClick={handleCreate} disabled={createInviteMut.isPending}>
									{createInviteMut.isPending ? (
										<>
											<TbLoader2 className='h-4 w-4 animate-spin' />
											Creating...
										</>
									) : (
										<>
											<TbPlus className='h-4 w-4' />
											Create Invite
										</>
									)}
								</Button>
								<Button size='dialog' onClick={() => handleClose(false)}>
									{t('cancel')}
								</Button>
							</>
						)}
					</DialogFooter>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
