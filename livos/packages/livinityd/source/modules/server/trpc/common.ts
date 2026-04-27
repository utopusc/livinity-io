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
	// Phase 30 UPD-02 — system.update is a long-running mutation (60-90s
	// spawning bash /opt/livos/update.sh). system.updateStatus is polled every
	// 500ms during an active update. HTTP avoids WS-disconnect hangs (precedent:
	// docker.scanImage at line 71-72).
	'system.update',
	'system.updateStatus',
	// v29.0 UX-03 — system.checkUpdate moved off WS for the same reason
	// system.update was: post-restart the user's WS connection can be in a
	// half-broken state where queries fail silently with "Invalid token" or
	// "socket hang up" and the UI shows stale cached "no update" data
	// (BACKLOG 999.6 surface). HTTP delivery surfaces auth/network failures
	// to the trpc error surface immediately so useSoftwareUpdate.checkLatest()
	// can toast them via its existing try/catch.
	'system.checkUpdate',
	// Phase 33 OBS-02 / OBS-03 — admin-only filesystem reads of
	// /opt/livos/data/update-history/. Used in the "diagnose a just-failed
	// update" flow, where the user's WS may be in a half-broken state from the
	// deploy restart cycle. HTTP guarantees the query reaches livinityd and
	// any error surfaces to the toast handler.
	'system.listUpdateHistory',
	'system.readUpdateLog',
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
	// Phase 21 — Git credentials CRUD -- use HTTP for reliability
	'docker.listGitCredentials',
	'docker.createGitCredential',
	'docker.deleteGitCredential',
	// Phase 29 DOC-16 — Registry credentials CRUD + image search -- use HTTP
	// for reliability. searchImages is a query but routes via HTTP because the
	// underlying fetch to Docker Hub / private registry can take 5-30s and
	// disconnected WS would silently hang.
	'docker.createRegistryCredential',
	'docker.deleteRegistryCredential',
	'docker.searchImages',
	// Phase 22 MH-01 — Environments CRUD (mutations only; listEnvironments stays WS)
	'docker.createEnvironment',
	'docker.updateEnvironment',
	'docker.deleteEnvironment',
	// Phase 22 MH-04, MH-05 — docker_agents token CRUD (mutations only;
	// listAgents stays on WS — it's a query). generateAgentToken returns
	// the cleartext token ONCE, so HTTP delivery (no WS reconnect retry
	// surface) is preferred for reliability.
	'docker.generateAgentToken',
	'docker.revokeAgentToken',
	// Container file browser mutations (Phase 18) -- use HTTP for reliability;
	// otherwise mutations silently hang on disconnected WS.
	'docker.containerWriteFile',
	'docker.containerDeleteFile',
	// Phase 20 — Scheduler mutations -- use HTTP for reliability
	// (queries like scheduler.listJobs stay on WS — no need for HTTP)
	'scheduler.upsertJob',
	'scheduler.deleteJob',
	'scheduler.runNow',
	'scheduler.testBackupDestination',
	// Phase 23 — AI diagnostics mutations (long-running, can take 30-60s)
	'docker.diagnoseContainer',
	'docker.generateComposeFromPrompt',
	'docker.explainVulnerabilities',
	// Phase 23 AID-02 — AI Alerts dismissal mutations (listAiAlerts query stays on WS)
	'docker.dismissAiAlert',
	'docker.dismissAllAiAlerts',
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
