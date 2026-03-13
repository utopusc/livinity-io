import {trpcReact} from '@/trpc/trpc'

/**
 * Hook to get the current logged-in user's multi-user info.
 * Returns user data including role for permission checks.
 */
export function useCurrentUser() {
	const userQ = trpcReact.user.get.useQuery()

	const user = userQ.data
	const role = user?.role
	// In legacy single-user mode (no role set), treat as admin
	const isAdmin = !role || role === 'admin'
	const isMember = role === 'member' || isAdmin
	const isGuest = role === 'guest'

	return {
		user,
		isLoading: userQ.isLoading,
		isAdmin,
		isMember,
		isGuest,
		role: role ?? 'admin',
		userId: user?.id,
		username: user?.username,
	}
}
