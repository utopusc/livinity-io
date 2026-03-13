import {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useAllAvailableApps} from '@/providers/available-apps'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {cn} from '@/shadcn-lib/utils'

export function ShareAppDialog({
	open,
	onOpenChange,
	appId,
}: {
	appId: string
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const {appsKeyed} = useAllAvailableApps()
	const app = appsKeyed?.[appId]
	const appName = app?.name || appId
	const {userId: currentUserId} = useCurrentUser()

	// Fetch all users and current share state
	const allUsersQ = trpcReact.apps.allUsers.useQuery()
	const sharedUsersQ = trpcReact.apps.sharedUsers.useQuery({appId})
	const shareMutation = trpcReact.apps.shareApp.useMutation()
	const unshareMutation = trpcReact.apps.unshareApp.useMutation()
	const utils = trpcReact.useUtils()

	const [pendingUserId, setPendingUserId] = useState<string | null>(null)

	const allUsers = allUsersQ.data || []
	const sharedUserIds = new Set((sharedUsersQ.data || []).map((u) => u.userId))

	// Filter out the current user from the share list
	const shareableUsers = allUsers.filter((u) => u.id !== currentUserId)

	const toggleShare = async (userId: string) => {
		setPendingUserId(userId)
		try {
			if (sharedUserIds.has(userId)) {
				await unshareMutation.mutateAsync({appId, userId})
			} else {
				await shareMutation.mutateAsync({appId, userId})
			}
			await utils.apps.sharedUsers.invalidate({appId})
		} finally {
			setPendingUserId(null)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Share {appName}</DialogTitle>
					<DialogDescription>
						Choose which users can access this app. Shared apps appear automatically in the user's app list.
					</DialogDescription>
				</DialogHeader>

				<div className='flex flex-col gap-1 py-2'>
					{allUsersQ.isLoading && (
						<div className='py-4 text-center text-sm text-white/50'>Loading users...</div>
					)}

					{shareableUsers.length === 0 && !allUsersQ.isLoading && (
						<div className='py-4 text-center text-sm text-white/50'>No other users to share with</div>
					)}

					{shareableUsers.map((user) => {
						const isShared = sharedUserIds.has(user.id)
						const isPending = pendingUserId === user.id

						return (
							<button
								key={user.id}
								onClick={() => toggleShare(user.id)}
								disabled={isPending}
								className={cn(
									'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
									'hover:bg-white/10',
									isShared && 'bg-white/5',
									isPending && 'opacity-50',
								)}
							>
								{/* Avatar circle */}
								<div
									className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white'
									style={{backgroundColor: user.avatarColor || '#6366f1'}}
								>
									{user.displayName?.charAt(0)?.toUpperCase() || user.username.charAt(0).toUpperCase()}
								</div>

								{/* User info */}
								<div className='flex-1 min-w-0'>
									<div className='truncate text-sm font-medium text-white'>
										{user.displayName || user.username}
									</div>
									<div className='truncate text-xs text-white/50'>
										@{user.username} · {user.role}
									</div>
								</div>

								{/* Toggle indicator */}
								<div
									className={cn(
										'flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors',
										isShared ? 'bg-green-500' : 'bg-white/20',
									)}
								>
									<div
										className={cn(
											'h-4 w-4 rounded-full bg-white shadow transition-transform',
											isShared ? 'translate-x-4' : 'translate-x-0',
										)}
									/>
								</div>
							</button>
						)
					})}
				</div>

				<DialogFooter>
					<button
						onClick={() => onOpenChange(false)}
						className='rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20'
					>
						Done
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
