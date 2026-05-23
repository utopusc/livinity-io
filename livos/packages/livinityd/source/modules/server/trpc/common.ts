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
	// v29.2 Phase 37 FR-BACKEND-01 — system.factoryReset is a long-running
	// mutation: returns 202-style {accepted, eventPath, snapshotPath} in <200ms,
	// but the wipe+reinstall spawn in a transient systemd-run scope can take
	// 5-10min. UI polls listUpdateHistory for progress (the JSON event row
	// extends Phase 33 OBS-01 schema with status:"factory-reset"). HTTP only —
	// the WS would 401 mid-wipe when livinityd is killed. Mirror system.update.
	'system.factoryReset',
	// Phase 135-F — 2FA enrollment from onboarding fires immediately after
	// loginMut.onSuccess closes the WS (so it can reconnect with the fresh
	// JWT). HTTP avoids the "Active connection is not open" race during that
	// reconnect window; PinInput → enable2fa likewise.
	'user.generateTotpUri',
	'user.enable2fa',
	'user.disable2fa',
	'user.is2faEnabled',
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
	// Phase 104 plan 104-03 — local-lan mode tRPC routes do systemctl reload + file I/O,
	// can take 1-5 seconds. Force HTTP transport (survives WS reconnect during
	// `systemctl restart livos`). Cluster with domain.* for namespace locality.
	// Phase 142-01 — `local.activate` + `local.getCaCert` removed alongside the
	// retired local-lan mode; only `getStatus` remains.
	'local.getStatus',
	// Phase 104 plan 104-04 — portal mode tRPC routes. Same WS-reconnect-survival
	// rationale as the local-lan trio above: activatePortal writes 4 Redis keys,
	// regenerates the Caddyfile, and reloads Caddy (1-5s wall-clock).
	// getPortalStatus also touches the filesystem (stat /etc/livos/secrets/cf-token
	// best-effort).
	// Phase 143-01 — renamed from `*Hybrid` → `*Portal` (carries the Phase
	// 142-02 user-facing rename to the wire). Legacy procedure-name aliases
	// (activateHybrid, getHybridStatus) kept on the router with the same
	// httpOnlyPaths entries below so cached UI bundles survive mid-flight.
	'local.activatePortal',
	'local.getPortalStatus',
	'local.activateHybrid',
	'local.getHybridStatus',
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
	// Phase 157 — v37 install dispatcher routes. apt / appimage / MCP /
	// plugin installs take 5-60s; force HTTP so the mutation survives a
	// `systemctl restart livos` mid-flight + WS reconnect.
	'apps.installV37',
	'apps.uninstallV37',
	'apps.v37Progress',
	'apps.v37List',
	'apps.markWebappCatalog',
	'apps.unmarkWebappCatalog',
	'apps.stopAllStreams',
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
	// v29.4 Phase 45 Plan 03 (FR-CF-03) — Phase 40 per-user Claude OAuth login
	// + Phase 44 usage dashboard queries. Long-running subscription/queries
	// that must survive WS reconnect after `systemctl restart livos` (precedent:
	// system.update at line 27, ai.claudeStartLogin at line 169). Without HTTP
	// transport, mutations/queries silently queue and drop during the ~5s WS
	// reconnect window — pitfall B-12 / X-04.
	'ai.claudePerUserStartLogin',
	'usage.getMine',
	'usage.getAll',
	// v29.4 Phase 46 — Fail2ban admin mutations. Same WS-reconnect-survival
	// reason as Phase 45's per-user Claude OAuth + usage queries: an admin
	// mid-recovery from SSH lockout is also likely to be on a half-broken WS
	// (livinityd may have just been restarted by ban activity). HTTP guarantees
	// delivery. Queries (listJails / getJailStatus / listEvents) stay on WS —
	// cheap, idempotent, retry-safe. Pitfall B-12 / X-04.
	'fail2ban.unbanIp',
	'fail2ban.banIp',
	// v29.4 Phase 47 Plan 05 — AI Diagnostics mutations. Atomic-swap registry
	// rebuild can take 5-10s during full resync (mirror docker.scanImage line
	// 100 precedent). App-health probe is a mutation timing-sensitive (returns
	// elapsed ms) and must survive WS reconnect (precedent: usage.getMine line
	// 181). Pitfall B-12 / X-04. Namespacing follows Option B per Phase 47
	// G-07: separate 'capabilities.*' (top-level admin namespace) and
	// 'apps.*' (merged into existing apps router via t.mergeRouters), mirroring
	// Phase 45/46's separate-namespace convention.
	'capabilities.flushAndResync',
	'apps.healthProbe',
	// v30.0 Phase 59 Plan 04 — apiKeys mutations + queries (FR-BROKER-B1-04).
	// Same WS-reconnect-survival reason as Phase 45/46/47 clusters above.
	// apiKeys.create returns plaintext ONCE — HTTP delivery prevents the
	// WS-reconnect-replay confusion where the cleartext token would be lost
	// if the WS reconnects mid-mutation. apiKeys.revoke must succeed even
	// mid-restart (admin revoking a leaked key under duress can't afford the
	// silent WS queue/drop window). list/listAll mirror the mutations for
	// transport consistency. Pitfall B-12 / X-04 / RESEARCH.md Pitfall 5.
	'apiKeys.create',
	'apiKeys.list',
	'apiKeys.revoke',
	'apiKeys.listAll',
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
	// v31.0 Phase 71-05 — Computer Use desktop session control (CU-FOUND-04).
	// Mutations may take 1-15s (upstream-bytebot container spawn budget) and must survive WS
	// reconnect after `systemctl restart livos` (precedent: usage.getMine
	// line 181, ai.executeSubagent line 214 — long-running mutation cluster).
	// Pitfall B-12 / X-04 / RESEARCH.md Pitfall 5.
	'computerUse.getStatus',
	'computerUse.startStandaloneSession',
	'computerUse.stopSession',
	// v31.0 Phase 72-native-04 — Computer Use takeScreenshot (CU-LOOP-05).
	// Returns base64 PNG (~50-200KB); mutations route via HTTP for body-size
	// reasons + WS reconnect resilience identical to siblings above.
	'computerUse.takeScreenshot',
	// v32 Phase 85 (UI slice) — agents.* tRPC router (Wave 2 — consumes Wave 1
	// agents-repo). All 8 paths route via HTTP because:
	//   - Mutations (create/update/delete/publish/unpublish/clone) include the
	//     500 ms debounced autosave path. Routing via WS would silently hang
	//     mutations on a half-broken WS after `systemctl restart livos` —
	//     pitfall B-12 / X-04 (precedent: apiKeys.create/revoke at lines 209-212).
	//   - Queries (list/get) are page-render dependencies; HTTP avoids the
	//     WS-handshake-delay flicker on first paint (precedent: apiKeys.list
	//     at line 210, usage.getMine at line 181).
	// Phase 202-03 supersedes the v32 P85 agents.* namespace (the old
	// marketplace publish/unpublish/clone surface). New routes:
	//   - agents.list / get / create / update / delete (CRUD)
	//   - agents.runOnce (manual scheduler dispatch)
	//   - agents.cronPreview (cronstrue human-readable preview)
	//   - agents.tasks.{create,list,get,cancel} (task lifecycle via Memory threads)
	// All 11 paths route via HTTP for the same WS-reconnect-survival reason
	// as the rest of the long-lived mutation cluster (memory pitfall
	// B-12 / X-04 — precedent: apiKeys.create line 209, conversations.appendMessage,
	// webapp.create). Queries are page-render dependencies for /agents,
	// /agents/[id], /agents/new (Plans 202-04..06) where the WS-handshake
	// flicker on first paint is undesirable.
	'agents.list',
	'agents.get',
	'agents.create',
	'agents.update',
	'agents.delete',
	'agents.runOnce',
	'agents.cronPreview',
	'agents.tasks.create',
	'agents.tasks.list',
	'agents.tasks.get',
	'agents.tasks.cancel',
	// v32 Phase 86 — Public marketplace browse + clone (V32-MKT-01..06).
	// list + tags are publicProcedure queries — they MUST work without a JWT
	// (D-PUBLIC-BROWSE: marketplace is reachable on the login screen / pre-
	// auth landing). The WS transport requires a token in the connect query
	// string, so a pre-auth client has no WS at all — HTTP is the only path
	// that works. cloneToLibrary is privateProcedure but routed via HTTP for
	// the same WS-reconnect-survival reasons as the rest of the long-lived
	// mutation cluster (memory pitfall B-12 / X-04).
	'marketplace.list',
	'marketplace.tags',
	'marketplace.cloneToLibrary',
	// v32 Phase 84 — MCP single-source-of-truth router (Wave 3). All 6 paths
	// route via HTTP because:
	//   - mcp.search / mcp.getServer hit external registries
	//     (registry.modelcontextprotocol.io OR server.smithery.ai); HTTP
	//     fetches can take seconds. WS handshake adds an extra round trip
	//     plus the WS-reconnect-survival cluster requirement (B-12 / X-04).
	//   - mcp.installToAgent / mcp.removeFromAgent are autosave-adjacent
	//     mutations that patch agents.configured_mcps JSONB. HTTP avoids
	//     the silent-hang failure mode after `systemctl restart livos`
	//     (precedent: agents.update at line 257, apiKeys.create at line 209).
	//   - mcp.smitheryConfigured is publicProcedure — must work pre-auth so
	//     the BrowseDialog can render the source toggle correctly when no
	//     JWT is present. HTTP is the only path the WS transport can't
	//     serve without a token query-param.
	//   - mcp.setSmitheryKey is adminProcedure — settings-page mutation
	//     consistency with the rest of the admin cluster.
	'mcp.search',
	'mcp.getServer',
	'mcp.installToAgent',
	'mcp.removeFromAgent',
	'mcp.smitheryConfigured',
	'mcp.setSmitheryKey',
	// Phase 202-07 — `mcp.config.*` CRUD over the Redis hash `liv:mcp:config`
	// (D-202-12). All five paths route via HTTP because:
	//   - list is a settings-page render dependency. HTTP avoids the
	//     WS-handshake-delay flicker on first paint (precedent: agents.list).
	//   - add / update / delete / toggle are settings-page mutations called
	//     immediately after admin clicks save. A WS half-broken after
	//     `systemctl restart livos` would silently drop the Redis hash
	//     mutation (memory pitfall B-12 / X-04 — same rationale as
	//     mcp.setSmitheryKey above + apiKeys.create).
	'mcp.config.list',
	'mcp.config.add',
	'mcp.config.update',
	'mcp.config.delete',
	'mcp.config.toggle',
	// v32-redo Stage 2b — conversations namespace (sidebar feed + thread view +
	// composer persistence path). All 6 paths route via HTTP because:
	//   - list / listMessages are page-render dependencies for the AI Chat
	//     window: HTTP avoids the WS-handshake-delay flicker on first paint
	//     (precedent: agents.list at line 254, usage.getMine at line 181).
	//   - create / delete / appendMessage are mutations called immediately
	//     before / after /api/agent/start. A WS half-broken after `systemctl
	//     restart livos` would silently drop the persisted user or assistant
	//     turn (memory pitfall B-12 / X-04 — same rationale as agents.create
	//     at line 256, apiKeys.create at line 209).
	//   - get is rare but kept on HTTP for transport consistency with the rest
	//     of the namespace.
	'conversations.list',
	'conversations.get',
	'conversations.create',
	'conversations.delete',
	'conversations.listMessages',
	'conversations.appendMessage',
	// v33 Phase 92 — webapp metadata extractor (V33-WEBAPP-01). Routes via HTTP
	// because:
	//   - On a clean cache miss the procedure does an outbound HTTP fetch (up
	//     to 8s wall-clock + 5 redirects + 2MB body) before returning. A
	//     half-broken WS after `systemctl restart livos` would silently drop
	//     the response (memory pitfall B-12 / X-04 — same rationale as
	//     docker.scanImage at line 100, ai.executeSubagent at line 214).
	//   - The procedure is a query but the latency profile is mutation-shaped;
	//     HTTP avoids the WS-handshake-delay flicker on first paint AND the
	//     reconnect-replay-confusion failure mode of long queries.
	'webapp.extractMetadata',
	// v33 Phase 93 — streaming subsystem + WebApp window manager.
	// All 7 paths route via HTTP because:
	//   - streams.start spawns a ChildProcess (ffmpeg/gst-launch). HTTP avoids
	//     the silent-hang failure mode after `systemctl restart livos` (memory
	//     pitfall B-12 / X-04 — same rationale as docker.scanImage line 100,
	//     ai.executeSubagent line 214).
	//   - streams.stop sends SIGTERM with up-to-2s SIGKILL escalation; mutation
	//     duration sits at the edge of the WS-reconnect window.
	//   - streams.list is a query but returns long-lived encoder state — kept
	//     on HTTP for transport consistency with the start/stop pair.
	//   - webapp.window.spawn launches Chrome --new-window + 5s xdotool poll;
	//     latency profile is mutation-shaped (P95 wires the UX to a "WebApp
	//     opening…" toast that needs explicit success/error).
	//   - webapp.window.{focus,close,list} cluster with .spawn for the same
	//     WS-reconnect-survival reason.
	'streams.start',
	'streams.stop',
	'streams.list',
	'webapp.window.spawn',
	'webapp.window.focus',
	'webapp.window.close',
	'webapp.window.list',
	// Phase 100-07 — input dispatch routes. HTTP-only (per the same
	// WS-reconnect-survival rationale as the rest of the webapp.* mutation
	// cluster). High call rate during interactive use is OK — each call is
	// a small POST.
	'webapp.input.click',
	'webapp.input.keypress',
	'webapp.input.type',
	'webapp.input.scroll',  // Phase 100-09-02 — wheel scroll events (deltaY/deltaX → button 4/5/6/7)
	// v33 Phase 94 — webapp CRUD on the persisted `webapps` Postgres table
	// (V33-WEBAPP-94-01). All four paths route via HTTP because:
	//   - Mutations (create/delete/update) are autosave-adjacent — the
	//     desktop "Add WebApp" dialog calls webapp.create, then immediately
	//     invalidates webapp.list. A half-broken WS after `systemctl restart
	//     livos` would silently drop the create response and the icon would
	//     never appear (memory pitfall B-12 / X-04 — same rationale as
	//     conversations.appendMessage line 312, agents.create line 256).
	//   - list is a page-render dependency (apps provider merges it with
	//     Docker apps on every desktop render). HTTP avoids the WS-handshake
	//     flicker on first paint (precedent: conversations.list line 307,
	//     agents.list line 254, usage.getMine line 181).
	//   - Transport consistency with the rest of the `webapp.*` namespace
	//     (extractMetadata at line 323, window.* at lines 342-345).
	'webapp.create',
	'webapp.list',
	'webapp.delete',
	'webapp.update',
	// v33 Phase 95 — per-WebApp agent session state (webapp_agent_sessions
	// table). Two procedures:
	//   - webapp.agent.session.get   — fetched on WebApp window mount; gates
	//     resume-vs-fresh in the agent panel (D-95-09).
	//   - webapp.agent.session.upsert — written after each sendMessage
	//     (runId persist) AND on each chunk processed (last_seen_idx
	//     debounced 500ms in the hook layer).
	// Both route via HTTP for the same WS-reconnect-survival reasons as the
	// rest of the long-lived mutation cluster (precedent: conversations.*
	// lines 307-312, webapp.create line 360).
	'webapp.agent.session.get',
	'webapp.agent.session.upsert',
	// v33 Phase 96 — Teach-mode skills (webapp_skills table). Six paths:
	//   - webapp.skills.uploadFrame — fired at frame rate (1Hz heartbeat +
	//     per-input-event captures). Half-broken WS after `systemctl
	//     restart livos` would silently drop recorder frames mid-session.
	//   - webapp.skills.create — single mutation called on Save; failure
	//     mode of a silent WS drop would leave the user thinking they
	//     saved when they didn't (memory pitfall B-12 / X-04).
	//   - webapp.skills.list — sidebar render dependency; HTTP avoids the
	//     WS-handshake-delay flicker (precedent: webapp.list line 361).
	//   - webapp.skills.get — scrubber render dependency; transport
	//     consistency with .list.
	//   - webapp.skills.delete — autosave-adjacent mutation; transport
	//     consistency with .create.
	//   - webapp.skills.discard — fired on Save-dialog cancel to free the
	//     on-disk session directory; cluster with the rest.
	'webapp.skills.create',
	'webapp.skills.list',
	'webapp.skills.get',
	'webapp.skills.delete',
	'webapp.skills.discard',
	'webapp.skills.uploadFrame',
	// Phase 101-03 — Native-app CRUD (Pillar B / D-101-NATIVE-APPS). All four
	// paths route via HTTP because:
	//   - Mutations (create/delete) are admin-gated (T-101-02). Same
	//     WS-reconnect-survival rationale as the rest of the admin mutation
	//     cluster (apiKeys.create/revoke lines 209/211, mcp.installToAgent
	//     line 291) — a half-broken WS after `systemctl restart livos` would
	//     silently drop the dock's "Add Native App" save.
	//   - Queries (list/get) are dock-render dependencies; HTTP avoids the
	//     WS-handshake-delay flicker on first paint (precedent: webapp.list
	//     line 369, agents.list line 254).
	//   - The legacy systemd-service native paths (apps.nativeStart/Stop/Status
	//     at lines 84-86) live in a separate namespace — these UUID-keyed
	//     CRUD routes are the Phase 101 dock-integration surface.
	'apps.native.list',
	'apps.native.get',
	'apps.native.create',
	'apps.native.delete',
	// Phase 101-05 — Native-app spawn orchestrator (D-101-NATIVE-APPS). The
	// dock-icon click handler hits this single route; backend chains
	// store.get → spawnNativeApp → bindNativeAppWindow → StreamManager.startStream.
	// Latency profile: 5s WM_CLASS poll deadline + x11vnc spawn. Routes via HTTP
	// because:
	//   - Mutation timing is mutation-shaped (1-5s) — same WS-reconnect-survival
	//     rationale as apps.native.create above and streams.start at line 339
	//     (precedent: agents.create line 256, apiKeys.create line 209).
	//   - The response carries a fresh streamId + wsUrl the dock UI needs to
	//     subscribe to immediately; a silent WS-drop after `systemctl restart
	//     livos` would lose the connection token (memory pitfall B-12 / X-04).
	'apps.native.spawn',
	// Phase 157 round 5 — native-app close (was admin, now privateProcedure
	// so the stream-window unmount cleanup runs for regular users).
	'apps.native.close',
	// Phase 102-07 - Chrome Master Login tRPC routes (D-102-MASTER-LOGIN-UI).
	// chromeMaster.startLogin spawns master Chrome on bruce's :0 display.
	// chromeMaster.reset / .restoreBackup touch /opt/livos/data/chrome-master
	// under privileged adminProcedure-gated caller (T-102-07). All three
	// mutations must survive `systemctl restart livos` mid-call (memory
	// pitfall B-12 / X-04). chromeMaster.status is a query kept on HTTP for
	// transport consistency with the mutation cluster.
	'chromeMaster.startLogin',
	'chromeMaster.reset',
	'chromeMaster.restoreBackup',
	'chromeMaster.status',
	// Phase 103-01/02 - Chrome Master Xvfb pipeline + embedded noVNC viewer.
	// chromeMaster.stopLogin tears down the Xvfb + x11vnc + StreamManager
	// cascade and clears currentMaster. chromeMaster.input.{click,key,type,
	// scroll} dispatch xdotool against currentMaster.display (display NOT
	// caller-controlled — T-103-01-03). Same admin-mid-restart resilience
	// guarantee as the 102-07 cluster — HTTP keeps the request/response
	// semantics needed to survive a `systemctl restart livos` mid-call.
	'chromeMaster.stopLogin',
	'chromeMaster.input.click',
	'chromeMaster.input.key',
	'chromeMaster.input.type',
	'chromeMaster.input.scroll',
	// Phase 131-02 V36-PIN-02 — pinned_windows namespace (D-131-A).
	// All three paths route via HTTP for the same WS-reconnect-survival
	// reason as the rest of the user-scoped CRUD cluster (precedent:
	// preferences.* lines 233-236, webapp.create line 360, agents.create
	// line 256). list is a page-render dependency on every desktop
	// mount — HTTP avoids the WS-handshake-delay flicker. upsert /
	// delete are autosave-adjacent (fired immediately after every
	// drag-to-pin gesture or chip click). Pitfall B-12 / X-04.
	'pinnedWindows.list',
	'pinnedWindows.upsert',
	'pinnedWindows.delete',
	// Phase 165-02 — Settings UI surface for v34.x autonomous agents +
	// chat backend selector. autonomous.* mutations write to vault files +
	// bump the in-memory scheduler state; chatConfig.* mutations write Redis
	// + bump AiModule in-place. All 9 paths route via HTTP for the standard
	// WS-reconnect-survival reason (memory pitfall B-12 / X-04 — same cluster
	// as agents.* line 282, chromeMaster.* line 474, marketplace.* line 299).
	'autonomous.list',
	'autonomous.toggle',
	'autonomous.runNow',
	'autonomous.getDailySpend',
	'autonomous.setDailyBudgetCap',
	'chatConfig.getBackend',
	'chatConfig.setBackend',
	'chatConfig.getModel',
	'chatConfig.setModel',
	// Phase 171-04 — Vault Items lifecycle namespace (v38 D-V38-A/B/C/E).
	// 7 procedures wrap the Phase 171-02 ItemStore + Phase 171-03 tree-resolver.
	// All 7 paths route via HTTP for the standard WS-reconnect-survival reason
	// (memory pitfall B-12 / X-04 — same cluster as agents.* line 282,
	// marketplace.* line 299). create / update / move / archive / delete are
	// autosave-adjacent admin mutations; list / get are page-render
	// dependencies for the Phase 174 SidebarTree where the WS-handshake-delay
	// flicker is undesirable. (Phase 175-05 removed the legacy ccPty.* cluster
	// — superseded by vault.items.* + Phase 175 detail views.)
	'vault.items.list',
	'vault.items.get',
	'vault.items.create',
	'vault.items.update',
	'vault.items.move',
	'vault.items.archive',
	'vault.items.delete',
	// Phase 176-02 / 177 — Liv agent scheduler (future tRPC namespace; pre-registered
	// so Phase 177 mutations don't require a common.ts re-edit).
	'liv.runAgent',
	// Phase 177-03 — vault.inbox.* routes. All 4 paths route via HTTP:
	//   listByAgent/listGlobal are page-render dependencies for AgentDetail + GlobalInboxWindow;
	//   markRead/get are mutations/queries that must survive WS reconnect.
	'vault.inbox.listByAgent',
	'vault.inbox.listGlobal',
	'vault.inbox.markRead',
	'vault.inbox.get',
	// Phase 182-03 — CC PTY session configuration (ccPty.getConfig/setConfig/validatePaths).
	// getConfig is a page-render dependency for AiChatSettingsPage.
	// setConfig is a mutation that must survive WS reconnect after systemctl restart livos.
	// validatePaths does filesystem reads that can take 100-500ms — route via HTTP.
	'ccPty.getConfig',
	'ccPty.setConfig',
	'ccPty.validatePaths',
	// Phase 195 — xAI OAuth onboarding router (auth.xai.*). All 4 paths route via
	// HTTP because: (a) waitForCompletion is a long-poll mutation that can run up to
	// 10 minutes — WS reconnect would silently drop the response (memory pitfall
	// B-12 / X-04); (b) start spawns an `opencode auth login` child process (5-30s
	// wall-clock) — same long-mutation cluster rationale as `system.update` line 27
	// and `docker.scanImage` line 137; (c) status is a page-render dependency for
	// the onboarding step where the WS-handshake-delay flicker is undesirable
	// (precedent: `webapp.list` line 406, `agents.list` line 291); (d) disconnect is
	// an autosave-adjacent mutation kept on HTTP for transport consistency with the
	// namespace.
	'auth.xai.start',
	'auth.xai.status',
	'auth.xai.waitForCompletion',
	'auth.xai.disconnect',
	// Phase 196-04 — `setup.setRegion` onboarding mutation. Persists the
	// operator's region selection (and optionally a country sub-pick) to
	// Redis. HTTP-only so the mutation survives a WS reconnect mid-
	// onboarding (memory pitfall B-12 / X-04 cluster — same rationale as
	// the auth.xai.* family directly above).
	'setup.setRegion',
	// Phase 196-05 — `setup.setLocaleTimezone` onboarding mutation.
	// Invokes systemd timedatectl via the narrow sudoers TIMEDATECTL
	// Cmnd_Alias + double-writes liv:user:timezone + liv:user:locale.
	// The execFile call can take 1-3s on a cold Mini PC; HTTP-only so
	// the mutation survives WS reconnect (memory pitfall B-12 / X-04
	// cluster — same rationale as setup.setRegion directly above).
	'setup.setLocaleTimezone',
	// Phase 196.1 — `setup.setLocation` merged Country+City onboarding mutation.
	// Same systemd timedatectl propagation as setLocaleTimezone plus 5-key
	// Redis batch persist. HTTP-only for the same reason — survives WS
	// reconnect across systemctl restart livos windows.
	'setup.setLocation',
	// Phase 197-05 — Liv AI Mastra tRPC namespace. 5 adminProcedure routes
	// (mastra.agent.stream / approve / cancel / threads.list / threads.delete).
	// All 5 paths route via HTTP because:
	//   - mastra.agent.stream is a long-lived SSE/subscription where a half-
	//     broken WS after `systemctl restart livos` would silently drop the
	//     stream mid-response (memory pitfall B-12 / X-04 — same cluster as
	//     auth.xai.waitForCompletion and ai.executeSubagent).
	//   - mastra.agent.approve / cancel are mutations called from the chat
	//     window in real time; HTTP avoids the silent-hang failure mode.
	//   - threads.list / threads.delete are page-render dependencies for the
	//     thread sidebar; transport consistency with the rest of the namespace.
	'mastra.agent.stream',
	'mastra.agent.approve',
	'mastra.agent.cancel',
	'mastra.agent.threads.list',
	'mastra.agent.threads.delete',
	// Phase 199-02 — Liv AI model picker. listAvailableModels is a read-only
	// privateProcedure query returning the static ALLOWED_XAI_MODELS catalogue
	// (D-199-11). Route via HTTP for the same WS-reconnect-survival reason as
	// the rest of the mastra.agent.* cluster directly above (memory pitfall
	// B-12 / X-04) AND because the UI hydrates the picker on first paint —
	// the WS-handshake-delay flicker on first paint is undesirable (precedent:
	// agents.list line 291, webapp.list line 406). T-199-02-03 mitigation.
	'mastra.agent.listAvailableModels',
	// Phase 199-07 — Liv AI active-model persistence. getActiveModel hydrates
	// the header-bar picker on first paint (same WS-handshake-delay-flicker
	// rationale as mastra.agent.listAvailableModels directly above);
	// setActiveModel is an admin mutation writing `liv:config:active_model`
	// in Redis (D-199-10), and silent WS drop during `systemctl restart livos`
	// would lose the operator's saved model choice (memory pitfall B-12 / X-04).
	// D-199-12 — both routes MUST be in httpOnlyPaths.
	'mastra.agent.getActiveModel',
	'mastra.agent.setActiveModel',
	// Phase 201-05 (D-201-13) — read-only built-in tool catalog for the MCP
	// panel "Built-in tools" group. Same WS-handshake-delay-flicker rationale
	// as mastra.agent.listAvailableModels (the panel hydrates on first mount).
	'mastra.agent.listBuiltInTools',
	// Phase 203-04 — openclawos.apps.* namespace consumed by the rebranded
	// liv-claw plugin (loopback HTTP fetch from `liv-claw-gateway.service`
	// to livinityd `:8080`). All 6 paths MUST be HTTP — the plugin process
	// has no WS pipe to livinityd, and mutations on a half-broken WS hang
	// silently (memory pitfall B-12). Same rationale as mastra.config.*
	// + agents.* clusters above.
	'openclawos.apps.list',
	'openclawos.apps.get',
	'openclawos.apps.create',
	'openclawos.apps.update',
	'openclawos.apps.delete',
	'openclawos.apps.version',
] as const
