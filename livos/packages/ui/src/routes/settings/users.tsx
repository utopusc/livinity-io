import {motion} from 'motion/react'
import {useState} from 'react'
import {
	TbCheck,
	TbCopy,
	TbDatabase,
	TbLoader2,
	TbPlus,
	TbShieldCheck,
	TbTrash,
	TbUser,
	TbUserOff,
	TbUserPlus,
} from 'react-icons/tb'
import {toast} from 'sonner'

import {useIsMobile} from '@/hooks/use-is-mobile'
// Phase 334 STEPUP-01 — re-auth wrapper for the step-up-gated deleteUser.
import {isStepUpRequired, useStepUp} from '@/providers/step-up'
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
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {formatBytes} from '@/utils/pretty-bytes'

type UserRow = {
	id: string
	username: string
	display_name: string
	avatar_color: string
	role: string
	is_active: boolean
	created_at: string
	updated_at: string
	// Phase 325 STOR-02 — per-user soft quota (bytes; null/<=0 = unlimited) +
	// last-scanned used bytes (null until the user-quota-scan job first runs).
	quota_bytes?: number | null
	used_bytes?: number | null
}

// Bytes per gigabyte using the decimal convention that pretty-bytes renders (GB = 1e9),
// so the editor input round-trips against what the used/limit cell displays.
const BYTES_PER_GB = 1_000_000_000
// Past this fraction of the limit, the used/limit cell warns (mirrors the backend
// QUOTA_SOFT_RATIO soft-warn threshold in files.ts / jobs.ts).
const QUOTA_SOFT_RATIO = 0.9

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
			{/* Multi-user mode toggle — temporarily DISABLED 2026-05-17.
			    Toggle currently writes Caddyfile entries that require wildcard
			    DNS + wildcard CF Tunnel public hostname pre-provisioned in
			    Cloudflare. Without those, clicking the toggle puts the system
			    into a redirect loop (recovered by hand). Re-enable once
			    wildcard provisioning is automated. Button kept visible but
			    inert + clearly labeled "coming soon". */}
			<div className='flex items-center justify-between rounded-radius-md border border-border-default bg-surface-base p-4 opacity-60'>
				<div className='flex-1'>
					<div className='text-body-sm font-medium text-text-primary'>
						Multi-User Mode <span className='ml-2 rounded bg-surface-1 px-2 py-0.5 text-caption font-normal text-text-tertiary'>coming soon</span>
					</div>
					<div className='text-caption text-text-tertiary'>
						Enable per-user app instances and subdomain routing. Disabled — requires wildcard DNS + Cloudflare Tunnel route provisioning (planned).
					</div>
				</div>
				<div className='flex items-center justify-center min-h-[44px] min-w-[44px]'>
					<button
						disabled
						title='Multi-user mode is temporarily disabled — wildcard subdomain provisioning is on the roadmap.'
						className='relative flex h-6 w-11 shrink-0 items-center rounded-full bg-white/10 px-0.5 cursor-not-allowed'
					>
						<div className='h-5 w-5 rounded-full bg-white/40 shadow translate-x-0' />
					</button>
				</div>
			</div>

			<div className='flex flex-wrap items-center justify-between gap-2'>
				<p className='text-body-sm text-text-secondary'>
					Manage users who can access your Livinity device. Invite new users or change existing user roles.
				</p>
				<Button variant='primary' size='sm' className='h-11' onClick={() => setShowInviteDialog(true)}>
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
	const isMobile = useIsMobile()
	const utils = trpcReact.useUtils()

	const [showQuotaDialog, setShowQuotaDialog] = useState(false)

	// Phase 325 STOR-02 — a null/<=0 quota is unlimited (no ceiling); otherwise show
	// "used of limit" with a warning tint once past the soft ratio.
	const hasQuota = user.quota_bytes != null && user.quota_bytes > 0
	const overSoft = hasQuota && user.used_bytes != null && user.used_bytes >= (user.quota_bytes as number) * QUOTA_SOFT_RATIO
	const quotaLabel = hasQuota
		? t('settings.users.quota.used', {used: formatBytes(user.used_bytes), limit: formatBytes(user.quota_bytes)})
		: t('settings.users.quota.unlimited')

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

	// Phase 334 STEPUP-01 — deleting a user is step-up-gated server-side. The
	// first attempt's STEP_UP_REQUIRED denial opens the re-auth modal (via
	// withStepUp below); it must never surface as an error toast.
	const {withStepUp} = useStepUp()
	const deleteMut = trpcReact.user.deleteUser.useMutation({
		onSuccess: () => {
			utils.user.listAllUsers.invalidate()
			toast.success(`${user.display_name} has been deleted`)
		},
		onError: (error) => {
			if (isStepUpRequired(error)) return
			toast.error(error.message)
		},
	})

	const handleRoleChange = (role: string) => {
		roleMut.mutate({userId: user.id, role: role as 'admin' | 'member' | 'guest'})
	}

	const handleToggleActive = () => {
		toggleActiveMut.mutate({userId: user.id, isActive: !user.is_active})
	}

	const handleDelete = () => {
		if (window.confirm(`Are you sure you want to delete ${user.display_name}? This cannot be undone.`)) {
			// Step-up wrapper: retries once after the re-auth modal mints the grant;
			// a dismissed modal (StepUpCancelledError) is a silent no-op, and any
			// real failure was already toasted by the mutation's onError.
			void withStepUp(() => deleteMut.mutateAsync({userId: user.id})).catch(() => {})
		}
	}

	return (
		<div
			className={cn(
				'rounded-radius-md border p-4 transition-colors',
				user.is_active ? 'border-border-default bg-surface-base' : 'border-border-default/50 bg-surface-base/50 opacity-60'
			)}
		>
			{/* Top row: Avatar + Info */}
			<div className='flex items-center gap-3'>
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
							<span className='shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-caption text-accent-red'>Disabled</span>
						)}
					</div>
					<div className='text-caption text-text-tertiary'>@{user.username}</div>
					{/* Phase 325 STOR-02 — used/limit quota cell */}
					<div className={cn('text-caption', overSoft ? 'text-accent-red' : 'text-text-tertiary')}>{quotaLabel}</div>
				</div>

				{/* Quota editor — admin action, allowed on any user (incl. self) */}
				<Button
					variant='default'
					size='sm'
					className={cn(isMobile ? 'h-11 shrink-0 px-2.5' : 'shrink-0')}
					onClick={() => setShowQuotaDialog(true)}
					title={t('settings.users.quota.edit')}
					aria-label={t('settings.users.quota.edit')}
				>
					<TbDatabase className='h-4 w-4' />
					{!isMobile && <span className='ml-1.5'>{t('settings.users.quota.edit')}</span>}
				</Button>

				{/* Desktop-only: role select + actions inline */}
				{!isMobile && (
					<>
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

						{!isCurrentUser && (
							<div className='flex items-center gap-1.5'>
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
								<Button
									variant='destructive'
									size='sm'
									onClick={handleDelete}
									disabled={deleteMut.isPending}
								>
									{deleteMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : <TbTrash className='h-4 w-4' />}
								</Button>
							</div>
						)}
					</>
				)}
			</div>

			{/* Mobile: role select + actions on second row */}
			{isMobile && !isCurrentUser && (
				<div className='mt-3 flex items-center gap-2 pl-[52px]'>
					<Select
						value={user.role}
						onValueChange={handleRoleChange}
						disabled={isCurrentUser || roleMut.isPending}
					>
						<SelectTrigger className='h-11 flex-1'>
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
					<Button
						variant={user.is_active ? 'default' : 'primary'}
						size='sm'
						className='h-11'
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
					<Button
						variant='destructive'
						size='sm'
						className='h-11'
						onClick={handleDelete}
						disabled={deleteMut.isPending}
					>
						{deleteMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : <TbTrash className='h-4 w-4' />}
					</Button>
				</div>
			)}

			{/* Mobile: read-only role badge for current user */}
			{isMobile && isCurrentUser && (
				<div className='mt-2 pl-[52px]'>
					<span className='text-caption text-text-tertiary capitalize'>{user.role}</span>
				</div>
			)}

			<QuotaDialog open={showQuotaDialog} onOpenChange={setShowQuotaDialog} user={user} />
		</div>
	)
}

// Phase 325 STOR-02 — per-user storage quota editor. Cloned from InviteDialog:
// a numeric GB input, Save calls setUserQuota (0 = unlimited, matching the backend's
// quota <= 0 == no-ceiling rule) then invalidates the users list. Enforcement is
// soft/approximate (refreshed by the user-quota-scan job) — see 325-01 D-05.
function QuotaDialog({
	open,
	onOpenChange,
	user,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	user: UserRow
}) {
	const utils = trpcReact.useUtils()

	// Seed from the current quota, rounded to whole GB for a friendly editor value.
	const initialGb = user.quota_bytes != null && user.quota_bytes > 0 ? String(Math.round(user.quota_bytes / BYTES_PER_GB)) : ''
	const [gb, setGb] = useState(initialGb)

	const setQuotaMut = trpcReact.user.setUserQuota.useMutation({
		onSuccess: () => {
			utils.user.listAllUsers.invalidate()
			toast.success(t('settings.users.quota.save'))
			onOpenChange(false)
		},
		onError: (error) => {
			toast.error(error.message)
		},
	})

	const handleClose = (isOpen: boolean) => {
		if (!isOpen) {
			// Reset the editor to the row's current value when closing.
			setGb(initialGb)
			setQuotaMut.reset()
		}
		onOpenChange(isOpen)
	}

	const handleSave = () => {
		// Empty or non-positive input = unlimited (send 0, the backend's no-ceiling value).
		const parsed = Number.parseFloat(gb)
		const quotaBytes = !Number.isFinite(parsed) || parsed <= 0 ? 0 : Math.round(parsed * BYTES_PER_GB)
		setQuotaMut.mutate({userId: user.id, quotaBytes})
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogPortal>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('settings.users.quota.label')}</DialogTitle>
					</DialogHeader>

					<div className='space-y-4'>
						<p className='text-body-sm text-text-secondary'>
							{t('settings.users.quota.help', {name: user.display_name})}
						</p>
						<div className='space-y-2'>
							<label className='text-caption text-text-secondary' htmlFor='quota-gb-input'>
								{t('settings.users.quota.label')}
							</label>
							<input
								id='quota-gb-input'
								type='number'
								min={0}
								step={1}
								inputMode='decimal'
								value={gb}
								onChange={(e) => setGb(e.target.value)}
								placeholder={t('settings.users.quota.placeholder')}
								className='w-full rounded-radius-md border border-border-default bg-surface-base px-3 py-2 text-body-sm text-text-primary outline-none focus:border-brand'
							/>
						</div>
					</div>

					<DialogFooter>
						<Button size='dialog' variant='primary' onClick={handleSave} disabled={setQuotaMut.isPending}>
							{setQuotaMut.isPending ? (
								<>
									<TbLoader2 className='h-4 w-4 animate-spin' />
									{t('settings.users.quota.save')}
								</>
							) : (
								<>
									<TbDatabase className='h-4 w-4' />
									{t('settings.users.quota.save')}
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
									{copied ? <TbCheck className='h-4 w-4 text-accent-green' /> : <TbCopy className='h-4 w-4' />}
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
