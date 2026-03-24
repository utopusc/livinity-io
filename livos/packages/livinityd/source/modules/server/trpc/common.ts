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
	'user.deleteUser',
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
	// Platform relay tunnel routes — use HTTP to avoid WS connection dependency
	'domain.platform.setApiKey',
	'domain.platform.disconnect',
	// File operations — use HTTP for reliability through relay tunnel
	'files.createDirectory',
	'files.copy',
	'files.move',
	'files.rename',
	'files.delete',
	'files.emptyTrash',
	// Native app management routes — use HTTP to avoid WS connection dependency
	'apps.nativeStart',
	'apps.nativeStop',
	'apps.nativeStatus',
	// Docker management — use HTTP for reliability through relay tunnel
	'docker.manageContainer',
	'docker.bulkManageContainers',
	// Container creation -- use HTTP for reliability
	'docker.createContainer',
	// Container edit/recreate -- use HTTP for reliability
	'docker.recreateContainer',
	'docker.renameContainer',
	// Docker image/volume management -- use HTTP for reliability
	'docker.removeImage',
	'docker.pruneImages',
	'docker.pullImage',
	'docker.tagImage',
	'docker.removeVolume',
	'docker.createVolume',
	// Network management -- use HTTP for reliability
	'docker.createNetwork',
	'docker.removeNetwork',
	'docker.disconnectNetwork',
	// Stack management -- use HTTP for reliability
	'docker.deployStack',
	'docker.editStack',
	'docker.controlStack',
	'docker.removeStack',
	// PM2 management -- use HTTP for reliability through relay tunnel
	'pm2.manage',
	// Device management -- use HTTP for reliability through relay tunnel
	'devices.rename',
	'devices.remove',
] as const
