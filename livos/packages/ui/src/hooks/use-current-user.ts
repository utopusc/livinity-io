import {trpcReact} from '@/trpc/trpc'

/**
 * Hook to get the current logged-in user's multi-user info.
 * Returns user data including role for permission checks.
 */
export function useCurrentUser() {
	const userQ = trpcReact.user.get.useQuery()
	// Phase 335 (ROLE-01) — the caller's delegated admin scopes (server-side
	// enforced; this list only drives UI affordances, never authority). []
	// for admins too: admin power derives from role, not scopes.
	const scopesQ = trpcReact.adminScopes.my.useQuery(undefined, {staleTime: 60_000})

	const user = userQ.data
	const role = user?.role
	// In legacy single-user mode (no role set), treat as admin
	const isAdmin = !role || role === 'admin'
	const isMember = role === 'member' || isAdmin
	const isGuest = role === 'guest'
	const scopes = scopesQ.data ?? []

	return {
		user,
		isLoading: userQ.isLoading,
		isAdmin,
		isMember,
		isGuest,
		role: role ?? 'admin',
		userId: user?.id,
		username: user?.username,
		scopes,
		hasScope: (scope: string) => isAdmin || scopes.includes(scope as never),
	}
}
