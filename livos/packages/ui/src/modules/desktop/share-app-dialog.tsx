import {useState} from 'react'

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
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {PublicAccessSection} from './public-access-section'

// 323-07 (IDENT-04, D-09): the share dialog is a convenience layer over the
// authoritative 323-06 server contract. `none` maps to unshareApp; `readonly`/
// `full` map to shareApp(accessType). The server still gates who may set what
// (full-only management gate) — the client selector is NOT the authority.
type AccessLevel = 'none' | 'readonly' | 'full'
const LEVELS: AccessLevel[] = ['none', 'readonly', 'full']

function LevelSelector({
	value,
	disabled,
	onChange,
}: {
	value: AccessLevel
	disabled?: boolean
	onChange: (level: AccessLevel) => void
}) {
	return (
		<div className='flex shrink-0 items-center gap-0.5 rounded-lg bg-white/5 p-0.5'>
			{LEVELS.map((level) => (
				<button
					key={level}
					onClick={() => {
						if (level !== value) onChange(level)
					}}
					disabled={disabled}
					title={t(`app-share-group.level.${level}-description`)}
					className={cn(
						'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
						value === level ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80',
						disabled && 'cursor-not-allowed opacity-50',
					)}
				>
					{t(`app-share-group.level.${level}`)}
				</button>
			))}
		</div>
	)
}

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

	// 323-06 route pair: allUsers/allGroups populate the pickers; sharedPrincipals
	// returns the CURRENT grants (users AND groups) with their access level.
	const allUsersQ = trpcReact.apps.allUsers.useQuery()
	const allGroupsQ = trpcReact.apps.allGroups.useQuery()
	const sharedPrincipalsQ = trpcReact.apps.sharedPrincipals.useQuery({appId})
	const shareMutation = trpcReact.apps.shareApp.useMutation()
	const unshareMutation = trpcReact.apps.unshareApp.useMutation()
	const utils = trpcReact.useUtils()

	const [pendingId, setPendingId] = useState<string | null>(null)

	const allUsers = allUsersQ.data || []
	const allGroups = allGroupsQ.data || []
	const sharedUsers = sharedPrincipalsQ.data?.users || []
	const sharedGroups = sharedPrincipalsQ.data?.groups || []

	// Drive the current-level display from sharedPrincipals (D-09). A principal
	// with no grant resolves to 'none'.
	const userLevel = (id: string): AccessLevel =>
		(sharedUsers.find((u) => u.userId === id)?.accessType as AccessLevel) || 'none'
	const groupLevel = (id: string): AccessLevel =>
		(sharedGroups.find((g) => g.groupId === id)?.accessType as AccessLevel) || 'none'

	// Never offer to share the app with its owner.
	const shareableUsers = allUsers.filter((u) => u.id !== currentUserId)

	const setLevel = async (principalId: string, principalType: 'user' | 'group', level: AccessLevel) => {
		setPendingId(principalId)
		try {
			if (level === 'none') {
				await unshareMutation.mutateAsync({appId, principalId, principalType})
			} else {
				// A user principal picking 'full' reproduces today's share behaviour.
				await shareMutation.mutateAsync({appId, principalId, principalType, accessType: level})
			}
			await utils.apps.sharedPrincipals.invalidate({appId})
		} finally {
			setPendingId(null)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('app-share-group.title', {appName})}</DialogTitle>
					<DialogDescription>{t('app-share-group.description')}</DialogDescription>
				</DialogHeader>

				<div className='flex max-h-[50vh] flex-col gap-4 overflow-y-auto py-2'>
					{/* Users */}
					<div className='flex flex-col gap-1'>
						<div className='px-1 text-xs font-semibold uppercase tracking-wide text-white/40'>
							{t('app-share-group.users-heading')}
						</div>

						{allUsersQ.isLoading && (
							<div className='py-3 text-center text-sm text-white/50'>{t('app-share-group.loading')}</div>
						)}

						{!allUsersQ.isLoading && shareableUsers.length === 0 && (
							<div className='py-3 text-center text-sm text-white/50'>{t('app-share-group.no-users')}</div>
						)}

						{shareableUsers.map((user) => {
							const level = userLevel(user.id)
							return (
								<div
									key={user.id}
									className={cn(
										'flex items-center gap-3 rounded-lg px-3 py-2.5',
										level !== 'none' && 'bg-white/5',
									)}
								>
									{/* Avatar circle */}
									<div
										className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white'
										style={{backgroundColor: user.avatarColor || '#6366f1'}}
									>
										{user.displayName?.charAt(0)?.toUpperCase() || user.username.charAt(0).toUpperCase()}
									</div>

									<div className='min-w-0 flex-1'>
										<div className='truncate text-sm font-medium text-white'>
											{user.displayName || user.username}
										</div>
										<div className='truncate text-xs text-white/50'>
											@{user.username} · {user.role}
										</div>
									</div>

									<LevelSelector
										value={level}
										disabled={pendingId === user.id}
										onChange={(l) => setLevel(user.id, 'user', l)}
									/>
								</div>
							)
						})}
					</div>

					{/* Groups */}
					<div className='flex flex-col gap-1'>
						<div className='px-1 text-xs font-semibold uppercase tracking-wide text-white/40'>
							{t('app-share-group.groups-heading')}
						</div>

						{allGroupsQ.isLoading && (
							<div className='py-3 text-center text-sm text-white/50'>{t('app-share-group.loading')}</div>
						)}

						{!allGroupsQ.isLoading && allGroups.length === 0 && (
							<div className='py-3 text-center text-sm text-white/50'>{t('app-share-group.no-groups')}</div>
						)}

						{allGroups.map((group) => {
							const level = groupLevel(group.id)
							return (
								<div
									key={group.id}
									className={cn(
										'flex items-center gap-3 rounded-lg px-3 py-2.5',
										level !== 'none' && 'bg-white/5',
									)}
								>
									{/* Group badge circle */}
									<div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white'>
										{group.name.charAt(0).toUpperCase()}
									</div>

									<div className='min-w-0 flex-1'>
										<div className='flex items-center gap-2'>
											<div className='truncate text-sm font-medium text-white'>{group.name}</div>
											<span className='shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/60'>
												{t('app-share-group.group-badge')}
											</span>
										</div>
										{group.description && (
											<div className='truncate text-xs text-white/50'>{group.description}</div>
										)}
									</div>

									<LevelSelector
										value={level}
										disabled={pendingId === group.id}
										onChange={(l) => setLevel(group.id, 'group', l)}
									/>
								</div>
							)
						})}
					</div>
				</div>

				<PublicAccessSection appId={appId} />

				<DialogFooter>
					<button
						onClick={() => onOpenChange(false)}
						className='rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20'
					>
						{t('app-share-group.done')}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
