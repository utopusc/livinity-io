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
	// Custom domain management — use HTTP for reliability
	'domain.platform.listCustomDomains',
	'domain.platform.updateAppMapping',
	'domain.platform.removeCustomDomain',
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
	// Phase 19 vuln scan -- mutation can take 30-90s; HTTP avoids WS-hang on disconnect
	'docker.scanImage',
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
	// Container file browser mutations (Phase 18) -- use HTTP for reliability;
	// otherwise mutations silently hang on disconnected WS.
	'docker.containerWriteFile',
	'docker.containerDeleteFile',
	// PM2 management -- use HTTP for reliability through relay tunnel
	'pm2.manage',
	// Device management -- use HTTP for reliability through relay tunnel
	'devices.rename',
	'devices.remove',
	// Device audit log (Phase 15 AUDIT-02) -- admin-only query; HTTP so failures surface immediately
	'audit.listDeviceEvents',
	// Device admin overrides (Phase 16 ADMIN-01/02) -- admin-only; HTTP so failures surface immediately
	'devicesAdmin.adminListAll',
	'devicesAdmin.adminForceDisconnect',
	// Computer use session control -- use HTTP for reliability
	'ai.pauseComputerUse',
	'ai.resumeComputerUse',
	'ai.stopComputerUse',
	// Computer use consent -- use HTTP for reliability
	'ai.grantConsent',
	'ai.denyConsent',
	// Claude auth and provider management -- use HTTP to avoid WS connection dependency
	'ai.setClaudeApiKey',
	'ai.claudeStartLogin',
	'ai.claudeSubmitCode',
	'ai.claudeLogout',
	'ai.setPrimaryProvider',
	'ai.setComputerUseAutoConsent',
	// Subagent execution -- use HTTP for reliability (can take 10-60s)
	'ai.executeSubagent',
	// Marketplace install -- use HTTP for mutation reliability
	'ai.installMarketplaceCapability',
	// Loop management -- use HTTP to avoid WS connection dependency
	'ai.startLoop',
	'ai.stopLoop',
	// Conversation feedback -- use HTTP for mutation reliability
	'ai.rateConversation',
	// WhatsApp management -- use HTTP to proxy to Nexus REST endpoints
	'ai.whatsappConnect',
	'ai.whatsappDisconnect',
	// Memory management -- use HTTP for mutation reliability
	'ai.memoryDelete',
	'ai.conversationTurnsDelete',
	// Preferences -- use HTTP so they work with legacy single-user tokens
	'preferences.getAll',
	'preferences.get',
	'preferences.set',
	'preferences.delete',
] as const
