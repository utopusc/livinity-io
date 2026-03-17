// This must be in it's own file otherwise the frontend tries to import
// loads of stuff from the backend and blows up.

// Export the router type for use in clients in other packages
export type {AppRouter} from './index.js'

// RPCs that MUST use HTTP (cookie/header semantics). Clients use this list for split-link routing.
export const httpOnlyPaths = [
	// sets cookie
	'user.login',
	// reads Authorization header
	'user.isLoggedIn',
	// renews cookie
	'user.renewToken',
	// clears cookie
	'user.logout',
	// public user list for login screen (no auth needed, use HTTP to avoid WS auth requirement)
	'user.listUsers',
	// public invite acceptance (no auth needed)
	'user.acceptInvite',
	// system.status doesn't use cookies/headers, but the UI polls it across restarts to detect when livinityd is back online; we force HTTP to avoid WS reconnect handshake
	'system.status',
	// Multi-user management routes — use HTTP to avoid WS connection dependency
	'user.createInvite',
	'user.listAllUsers',
	'user.updateUserRole',
	'user.toggleUserActive',
	'apps.isMultiUserEnabled',
	'apps.setMultiUserEnabled',
	'apps.shareApp',
	'apps.unshareApp',
	'apps.sharedUsers',
	'apps.allUsers',
	'apps.myApps',
	// Tunnel management routes — use HTTP to avoid WS connection dependency
	'domain.tunnel.getStatus',
	'domain.tunnel.configure',
	'domain.tunnel.remove',
] as const
