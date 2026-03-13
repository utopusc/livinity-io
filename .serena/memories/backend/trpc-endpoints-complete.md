# Complete tRPC API Endpoints - LivOS Backend

## Router Structure
Main tRPC router combines all modules in `/livos/packages/livinityd/source/modules/server/trpc/index.ts`:
- migration, system, wifi, user, appStore, apps, widget, files, notifications, eventBus, backups, ai, domain

---

## 1. USER ROUTES (`user/routes.ts`)
Base: `user.`

### Authentication
- `user.register` [PUBLIC] - Register new user
  - Input: `{name: string, password: string (6+ chars), language?: string}`
  - Output: User object
  
- `user.exists` [PUBLIC] - Check if user registered
  - Input: none
  - Output: boolean
  
- `user.login` [PUBLIC] - Login with password + optional 2FA
  - Input: `{password: string, totpToken?: string}`
  - Output: JWT token
  
- `user.isLoggedIn` [PUBLIC] - Verify token validity
  - Input: Authorization header
  - Output: boolean
  
- `user.renewToken` [PRIVATE] - Get new JWT token
  - Input: none
  - Output: JWT token
  
- `user.logout` [PRIVATE] - Clear proxy token cookie
  - Input: none
  - Output: true

### Password Management
- `user.changePassword` [PRIVATE]
  - Input: `{oldPassword: string, newPassword: string (6+ chars)}`
  - Output: true

### 2FA/TOTP
- `user.generateTotpUri` [PRIVATE] - Generate QR code URI for 2FA setup
  - Input: none
  - Output: TOTP URI string
  
- `user.enable2fa` [PRIVATE] - Enable TOTP 2FA
  - Input: `{totpUri: string, totpToken: string}`
  - Output: true
  
- `user.is2faEnabled` [PUBLIC] - Check 2FA status
  - Input: none
  - Output: boolean
  
- `user.disable2fa` [PRIVATE] - Disable 2FA
  - Input: `{totpToken: string}`
  - Output: true

### User Settings
- `user.get` [PRIVATE] - Get current user (non-sensitive)
  - Input: none
  - Output: `{name, wallpaper, language, temperatureUnit}`
  
- `user.set` [PRIVATE] - Update user properties
  - Input: `{name?, wallpaper?, language?, temperatureUnit?, accentColor?}`
  - Output: true
  
- `user.accentColor` [PRIVATE] - Get custom accent color
  - Input: none
  - Output: string or null
  
- `user.wallpaper` [PUBLIC] - Get wallpaper (for login screen)
  - Input: none
  - Output: string
  
- `user.language` [PUBLIC] - Get preferred language (for login screen)
  - Input: none
  - Output: string or null

---

## 2. SYSTEM ROUTES (`system/routes.ts`)
Base: `system.`

### Status & Info
- `system.online` [PUBLIC] - Health check
  - Output: true
  
- `system.version` [PUBLIC] - Get version info
  - Output: `{version: string, name: string}`
  
- `system.status` [PUBLIC] - System status (online/updating/shutting-down/restarting/migrating/resetting/restoring)
  - Output: string
  
- `system.uptime` [PRIVATE]
  - Output: number (seconds)
  
- `system.device` [PRIVATE] - Detect device type
  - Output: device info object
  
- `system.getIpAddresses` [PRIVATE]
  - Output: IP addresses array

### Updates
- `system.checkUpdate` [PRIVATE] - Check for available updates
  - Output: `{available: boolean, version: string, name: string, releaseNotes: string}`
  
- `system.updateStatus` [PRIVATE] - Get update progress status
  - Output: ProgressStatus object
  
- `system.getReleaseChannel` [PRIVATE] - Get stable/beta channel
  - Output: 'stable' | 'beta'
  
- `system.setReleaseChannel` [PRIVATE]
  - Input: `{channel: 'stable' | 'beta'}`
  - Output: true
  
- `system.update` [PRIVATE] - Perform system update
  - Output: boolean (triggers reboot)

### DNS Settings
- `system.isExternalDns` [PRIVATE]
  - Output: boolean
  
- `system.setExternalDns` [PRIVATE]
  - Input: `boolean`
  - Output: true

### Hardware Monitoring
- `system.cpuTemperature` [PRIVATE]
  - Output: temperature value
  
- `system.cpuUsage` [PRIVATE]
  - Output: CPU usage percentage
  
- `system.memoryUsage` [PRIVATE]
  - Output: Memory usage info
  
- `system.systemMemoryUsage` [PRIVATE]
  - Output: System memory info
  
- `system.diskUsage` [PRIVATE]
  - Output: Disk usage for data directory
  
- `system.systemDiskUsage` [PRIVATE]
  - Output: System disk usage

### Logs
- `system.logs` [PRIVATE] - Get system or livos logs
  - Input: `{type: 'livos' | 'system'}`
  - Output: log string (1500 lines)
  
- `system.hiddenService` [PRIVATE] - Get Tor hidden service address
  - Output: string (hostname)

### Power Management
- `system.shutdown` [PRIVATE] - Shutdown system
  - Output: true (then reboots)
  
- `system.restart` [PRIVATE] - Restart system
  - Output: true (then reboots)

### Factory Reset
- `system.factoryReset` [PRIVATE] - Factory reset
  - Input: `{password: string}`
  - Output: boolean
  
- `system.getFactoryResetStatus` [PUBLIC] - Get reset progress
  - Output: ProgressStatus or undefined

---

## 3. APP STORE ROUTES (`apps/routes.ts`)
Base: `appStore.` and `apps.`

### App Store (Catalog)
- `appStore.builtinApps` [PRIVATE] - List builtin apps with official Docker images
  - Output: array of builtin app objects
  
- `appStore.searchBuiltin` [PRIVATE] - Search builtin apps
  - Input: `{query: string}`
  - Output: filtered app array
  
- `appStore.registry` [PRIVATE] - Get app store registry
  - Output: registry object
  
- `appStore.addRepository` [PRIVATE] - Add custom repository
  - Input: `{url: string}`
  - Output: result object
  
- `appStore.removeRepository` [PRIVATE] - Remove custom repository
  - Input: `{url: string}`
  - Output: result object

### App Management
- `apps.list` [PRIVATE] - List all installed apps with metadata
  - Output: array of app objects with: id, name, version, icon, port, path, state, subdomain, credentials, hiddenService, widgets, dependencies, selectedDependencies, implements, torOnly
  
- `apps.install` [PRIVATE] - Install an app
  - Input: `{appId: string, alternatives?: Record<string>, environmentOverrides?: Record<string>}`
  - Output: installation result
  
- `apps.state` [PRIVATE] - Get app state and progress
  - Input: `{appId: string}`
  - Output: `{state: string, progress: number}`
  
- `apps.uninstall` [PRIVATE] - Uninstall app
  - Input: `{appId: string}`
  
- `apps.restart` [PRIVATE] - Restart app
  - Input: `{appId: string}`
  
- `apps.start` [PRIVATE] - Start app
  - Input: `{appId: string}`
  
- `apps.stop` [PRIVATE] - Stop app
  - Input: `{appId: string}`
  
- `apps.update` [PRIVATE] - Update app
  - Input: `{appId: string}`
  
- `apps.logs` [PRIVATE] - Get app logs
  - Input: `{appId: string}`
  - Output: log string
  
- `apps.trackOpen` [PRIVATE] - Track when app is opened
  - Input: `{appId: string}`
  
- `apps.recentlyOpened` [PRIVATE] - Get recently opened apps
  - Output: app array
  
- `apps.getTorEnabled` [PRIVATE]
  - Output: boolean
  
- `apps.setTorEnabled` [PRIVATE]
  - Input: boolean
  
- `apps.setSelectedDependencies` [PRIVATE] - Set which optional dependencies to use
  - Input: `{appId: string, dependencies: Record<string>}`
  
- `apps.dependents` [PRIVATE] - Get apps that depend on an app
  - Input: appId string
  - Output: dependent apps array
  
- `apps.hideCredentialsBeforeOpen` [PRIVATE] - Hide/show default credentials prompt
  - Input: `{appId: string, value: boolean}`
  
- `apps.isBackupIgnored` [PRIVATE] - Check if app is excluded from backups
  - Input: `{appId: string}`
  - Output: boolean
  
- `apps.backupIgnore` [PRIVATE] - Exclude/include app in backups
  - Input: `{appId: string, value: boolean}`
  
- `apps.getBackupIgnoredPaths` [PRIVATE] - Get paths ignored in backups
  - Input: `{appId: string}`
  - Output: paths array

---

## 4. FILES ROUTES (`files/routes.ts`)
Base: `files.`

### Directory Operations
- `files.list` [PUBLIC-IF-NO-USER] - List directory contents
  - Input: `{path: string, sortBy: 'name'|'type'|'modified'|'size', sortOrder: 'ascending'|'descending', lastFile?: string, limit?: number}`
  - Output: `{...listing, files: paginated, totalFiles, hasMore}`
  
- `files.createDirectory` [PRIVATE]
  - Input: `{path: string}`
  
- `files.copy` [PRIVATE] - Copy file/directory
  - Input: `{path: string, toDirectory: string, collision: 'error'|'keep-both'|'replace'}`
  
- `files.move` [PRIVATE] - Move file/directory
  - Input: `{path: string, toDirectory: string, collision: 'error'|'keep-both'|'replace'}`
  
- `files.rename` [PRIVATE] - Rename file/directory
  - Input: `{path: string, newName: string}`
  
- `files.operationProgress` [PRIVATE] - Get file operation progress
  - Output: operations in progress

### Trash & Deletion
- `files.trash` [PRIVATE] - Move to trash
  - Input: `{path: string}`
  
- `files.restore` [PRIVATE] - Restore from trash
  - Input: `{path: string, collision: 'error'|'keep-both'|'replace'}`
  
- `files.emptyTrash` [PRIVATE] - Empty trash bin
  
- `files.delete` [PRIVATE] - Permanently delete
  - Input: `{path: string}`

### Favorites & Recents
- `files.favorites` [PRIVATE] - List favorite paths
  - Output: paths array
  
- `files.addFavorite` [PRIVATE]
  - Input: `{path: string}`
  
- `files.removeFavorite` [PRIVATE]
  - Input: `{path: string}`
  
- `files.recents` [PRIVATE] - Get recently accessed files
  - Output: files array

### View Preferences
- `files.viewPreferences` [PUBLIC-IF-NO-USER] - Get view settings
  - Output: `{view, sortBy, sortOrder}`
  
- `files.updateViewPreferences` [PRIVATE]
  - Input: `{view?: 'icons'|'list', sortBy?: '...', sortOrder?: '...'}`

### Archives
- `files.archive` [PRIVATE] - Create zip archive
  - Input: `{paths: string[]}`
  
- `files.unarchive` [PRIVATE] - Extract archive
  - Input: `{path: string}`

### Thumbnails
- `files.getThumbnail` [PRIVATE] - Generate/get thumbnail
  - Input: `{path: string}`

### Shares (Samba)
- `files.sharePassword` [PRIVATE] - Get Samba share password
  - Output: password string
  
- `files.shares` [PRIVATE] - List shared directories
  - Output: shares array
  
- `files.addShare` [PRIVATE] - Share directory via Samba
  - Input: `{path: string}`
  
- `files.removeShare` [PRIVATE] - Stop sharing directory
  - Input: `{path: string}`

### External Storage
- `files.externalDevices` [PUBLIC-IF-NO-USER] - List connected external drives
  - Output: devices array
  
- `files.formatExternalDevice` [PRIVATE] - Format external drive
  - Input: `{deviceId: string, filesystem: 'ext4'|'exfat', label: string}`
  
- `files.unmountExternalDevice` [PRIVATE]
  - Input: `{deviceId: string}`
  
- `files.isExternalDeviceConnectedOnUnsupportedDevice` [PRIVATE]
  - Output: boolean

### Search
- `files.search` [PRIVATE] - Search for files
  - Input: `{query: string, maxResults?: number (max 1000, default 250)}`
  - Output: matching files array

### Network Shares (SMB)
- `files.listNetworkShares` [PUBLIC-IF-NO-USER] - List mounted network shares
  - Output: shares array
  
- `files.addNetworkShare` [PUBLIC-IF-NO-USER] - Mount SMB share
  - Input: `{host: string, share: string, username: string, password: string}`
  
- `files.removeNetworkShare` [PRIVATE]
  - Input: `{mountPath: string}`
  
- `files.discoverNetworkShareServers` [PUBLIC-IF-NO-USER] - Find available SMB servers
  - Output: servers array
  
- `files.discoverNetworkSharesOnServer` [PUBLIC-IF-NO-USER] - List shares on server
  - Input: `{host: string, username: string, password: string}`
  
- `files.isServerAnLivinityDevice` [PRIVATE] - Check if server is LivOS
  - Input: `{address: string}`

---

## 5. AI ROUTES (`ai/routes.ts`)
Base: `ai.` - Comprehensive AI/agent system with Nexus integration

### Configuration
- `ai.getConfig` [PRIVATE] - Get masked API keys and primary provider
  - Output: `{geminiApiKey (masked), hasGeminiKey, anthropicApiKey (masked), hasAnthropicKey, primaryProvider}`
  
- `ai.setConfig` [PRIVATE] - Save API keys and provider
  - Input: `{geminiApiKey?: string, anthropicApiKey?: string, primaryProvider?: 'claude'|'gemini'}`
  
- `ai.validateKey` [PRIVATE] - Test API key validity
  - Input: `{provider: 'claude'|'gemini', apiKey: string}`
  - Output: `{valid: boolean, error?: string}`

### Claude CLI / SDK Auth
- `ai.getClaudeCliStatus` [PRIVATE] - Check Claude CLI installation + auth method
  - Output: `{installed, authenticated, user?, authMethod: 'api-key'|'sdk-subscription'}`
  
- `ai.startClaudeLogin` [PRIVATE] - Start OAuth flow
  - Output: `{url?: string, error?: string, alreadyAuthenticated?: boolean}`
  
- `ai.submitClaudeLoginCode` [PRIVATE] - Complete OAuth with code
  - Input: `{code: string}`
  - Output: `{success: boolean, error?: string}`
  
- `ai.claudeLogout` [PRIVATE] - Delete Claude credentials
  - Output: `{success: boolean, error?: string}`
  
- `ai.setClaudeAuthMethod` [PRIVATE]
  - Input: `{method: 'api-key'|'sdk-subscription'}`

### Nexus Configuration
- `ai.getNexusConfig` [PRIVATE] - Get Nexus AI config
  - Output: `{config: {...}}`
  
- `ai.updateNexusConfig` [PRIVATE] - Update Nexus AI settings
  - Input: NexusConfigSchema with retry, agent, subagents, session, logging, heartbeat, response configs
  - Output: `{success, errors?}`
  
- `ai.resetNexusConfig` [PRIVATE] - Reset to defaults
  - Output: `{success: boolean}`

### Chat
- `ai.getChatStatus` [PRIVATE] - Get live processing status for conversation
  - Input: `{conversationId: string}`
  - Output: status object or null
  
- `ai.send` [PRIVATE] - Send message and get response (non-streaming)
  - Input: `{conversationId: string (1-100 chars, alphanumeric_-), message: string (1-50000)}`
  - Output: response object
  
- `ai.stream` [PRIVATE, SUBSCRIPTION] - Stream chat response as it processes
  - Input: `{conversationId: string, message: string}`
  - Output: observable of `{type: string, data: unknown}`
  - Types: step, tool_call, final_answer, done, error
  
- `ai.getConversation` [PRIVATE] - Get single conversation
  - Input: `{id: string}`
  - Output: conversation object
  
- `ai.listConversations` [PRIVATE] - List all conversations
  - Output: conversations array
  
- `ai.deleteConversation` [PRIVATE]
  - Input: `{id: string}`

### Tools
- `ai.listTools` [PRIVATE] - List registered AI tools
  - Output: array of `{name, description, parameters}`

### Subagents (via Nexus)
- `ai.listSubagents` [PRIVATE]
  - Output: subagents array
  
- `ai.createSubagent` [PRIVATE]
  - Input: `{id: string (alphanumeric_-), name: string, description: string, skills: string[] (default ['*']), systemPrompt?: string, schedule?: string, scheduledTask?: string, tier: 'flash'|'sonnet'|'opus' (default 'sonnet'), maxTurns: number (default 10)}`
  
- `ai.updateSubagent` [PRIVATE]
  - Input: `{id: string, updates: {name?, description?, skills?, systemPrompt?, schedule?, scheduledTask?, tier?, maxTurns?, status?}}`
  
- `ai.deleteSubagent` [PRIVATE]
  - Input: `{id: string}`
  
- `ai.executeSubagent` [PRIVATE] - Run subagent with a message
  - Input: `{id: string (alphanumeric_-), message: string (1-50000)}`
  - Output: `{content: string}`

### Schedules / Cron
- `ai.listSchedules` [PRIVATE]
  - Output: schedules array
  
- `ai.addSchedule` [PRIVATE]
  - Input: `{subagentId: string, task: string (1-5000), cron: string (cron format, 9-100 chars), timezone?: string}`
  
- `ai.removeSchedule` [PRIVATE]
  - Input: `{subagentId: string}`

### Messaging Integrations (Telegram, Discord, Slack, Matrix)
- `ai.getChannels` [PRIVATE] - Get status of all channels
  - Output: `{channels: [...{id, type, enabled, connected, config, error}]}`
  
- `ai.updateChannel` [PRIVATE] - Legacy channel update
  - Input: `{type: 'telegram'|'discord', config: Record<any>}`
  
- `ai.getIntegrationConfig` [PRIVATE] - Get channel config
  - Input: `{channel: 'discord'|'telegram'|'slack'|'matrix'}`
  
- `ai.getIntegrationStatus` [PRIVATE] - Get channel status
  - Input: `{channel: ...}`
  - Output: `{enabled, connected, error, lastConnect, lastMessage, botName, botId}`
  
- `ai.saveIntegrationConfig` [PRIVATE]
  - Input: `{channel: string, config: {enabled?, token?, appToken?, webhookUrl?, webhookSecret?, homeserverUrl?, roomId?}}`
  
- `ai.testIntegration` [PRIVATE] - Test connection
  - Input: `{channel: string}`

### Docker
- `ai.listDockerContainers` [PRIVATE] - List all containers
  - Output: array of `{id, name, image, state, status}`
  
- `ai.manageDockerContainer` [PRIVATE] - Start/stop/restart container
  - Input: `{name: string (alphanumeric[]._-), operation: 'start'|'stop'|'restart'}`

### DM Pairing
- `ai.getDmPairingPending` [PRIVATE] - Get pending pairing requests
  - Output: `{pending: [{channel, userId, userName, code, createdAt, channelChatId}]}`
  
- `ai.getDmPairingAllowlist` [PRIVATE]
  - Input: `{channel: string}`
  - Output: `{channel, users: []}`
  
- `ai.getDmPairingPolicy` [PRIVATE]
  - Input: `{channel: string}`
  - Output: `{channel, policy: 'pairing'|'allowlist'|'open'|'disabled'}`
  
- `ai.setDmPairingPolicy` [PRIVATE]
  - Input: `{channel: string, policy: ...}`
  
- `ai.approveDmPairing` [PRIVATE]
  - Input: `{channel: string, userId: string}`
  
- `ai.denyDmPairing` [PRIVATE]
  - Input: `{channel: string, userId: string}`
  
- `ai.removeDmPairingAllowlist` [PRIVATE]
  - Input: `{channel: string, userId: string}`

### Usage Tracking
- `ai.getUsageOverview` [PRIVATE]
  - Output: `{totalInputTokens, totalOutputTokens, totalSessions, totalTurns, estimatedCostUsd, activeUsers}`
  
- `ai.getUsageDaily` [PRIVATE]
  - Input: `{userId: string, days?: number (1-90, default 30)}`
  - Output: `{daily: [{date, userId, inputTokens, outputTokens, sessions, turns, toolCalls, avgTtfbMs, estimatedCostUsd}]}`
  
- `ai.getUsageSummary` [PRIVATE]
  - Input: `{userId: string}`
  - Output: `{currentSession, today, cumulative, displayMode}`

### Webhooks
- `ai.getWebhooks` [PRIVATE] - List webhooks (secrets stripped)
  - Output: `{webhooks: [{id, name, createdAt, lastUsed, deliveryCount}]}`
  
- `ai.createWebhook` [PRIVATE] - Create webhook
  - Input: `{name: string, secret?: string}`
  - Output: `{id, url, secret}` (secret shown only once)
  
- `ai.deleteWebhook` [PRIVATE]
  - Input: `{id: string (UUID)}`

### Voice
- `ai.getVoiceConfig` [PRIVATE] - Get voice pipeline config
  - Output: `{enabled, hasDeepgramKey, hasCartesiaKey, cartesiaVoiceId, sttLanguage, sttModel}`
  
- `ai.updateVoiceConfig` [PRIVATE]
  - Input: `{deepgramApiKey?, cartesiaApiKey?, cartesiaVoiceId?, sttLanguage?, sttModel?, enabled?}`

### Gmail OAuth
- `ai.getGmailStatus` [PRIVATE] - Check Gmail connection
  - Output: `{connected, enabled, configured, email, error, lastMessage}`
  
- `ai.startGmailOauth` [PRIVATE] - Start OAuth flow
  - Output: `{url: string}`
  
- `ai.disconnectGmail` [PRIVATE]
  - Output: `{ok, message}`

### Skills / LivHub Registry
- `ai.listRegistries` [PRIVATE]
  - Output: `{registries: string[]}`
  
- `ai.addRegistry` [PRIVATE]
  - Input: `{url: string (valid URL)}`
  
- `ai.removeRegistry` [PRIVATE]
  - Input: `{url: string}`
  
- `ai.refreshCatalog` [PRIVATE] - Refresh skill catalog

### Canvas Artifacts
- `ai.getCanvasArtifact` [PRIVATE] - Get artifact by ID
  - Input: `{id: string}`
  - Output: `{id, type, title, content, conversationId, createdAt, updatedAt, version}`
  
- `ai.listCanvasArtifacts` [PRIVATE] - List artifacts for conversation
  - Input: `{conversationId: string}`
  - Output: artifacts array
  
- `ai.deleteCanvasArtifact` [PRIVATE]
  - Input: `{id: string}`

---

## 6. WIDGETS ROUTES (`widgets/routes.ts`)
Base: `widget.`

- `widget.enabled` [PRIVATE] - Get enabled widget IDs
  - Output: string array (format: "appId:widgetName")
  
- `widget.enable` [PRIVATE] - Enable widget (max 3 widgets)
  - Input: `{widgetId: string}`
  
- `widget.disable` [PRIVATE] - Disable widget
  - Input: `{widgetId: string}`
  
- `widget.data` [PRIVATE] - Get live widget data
  - Input: `{widgetId: string}`
  - Output: widget data object with refresh interval in ms

---

## 7. NOTIFICATIONS ROUTES (`notifications/routes.ts`)
Base: `notifications.`

- `notifications.get` [PRIVATE] - Get all notifications
  - Output: notifications array
  
- `notifications.clear` [PRIVATE] - Remove notification
  - Input: notification ID string

---

## 8. BACKUPS ROUTES (`backups/routes.ts`)
Base: `backups.`

### Repository Management
- `backups.getRepositories` [PRIVATE] - List backup repositories
  - Output: array of `{id, path, lastBackup}`
  
- `backups.getRepositorySize` [PRIVATE]
  - Input: `{repositoryId: string}`
  
- `backups.createRepository` [PRIVATE] - Create new backup repo
  - Input: `{path: string, password: string}`
  
- `backups.forgetRepository` [PRIVATE] - Remove repository
  - Input: `{repositoryId: string}`
  
- `backups.connectToExistingRepository` [PUBLIC-IF-NO-USER] - Connect to existing repo
  - Input: `{path: string, password: string}`

### Backup Operations
- `backups.backup` [PRIVATE] - Run backup immediately
  - Input: `{repositoryId: string}`
  
- `backups.backupProgress` [PRIVATE] - Get backup progress
  - Output: backups in progress array
  
- `backups.listBackups` [PUBLIC-IF-NO-USER] - List backups in repository
  - Input: `{repositoryId: string}`
  
- `backups.listAllBackups` [PRIVATE] - List all backups across all repos
  
- `backups.listBackupFiles` [PRIVATE] - List files in backup (debug)
  - Input: `{backupId: string, path?: string}`

### Backup Mounting & Restore
- `backups.mountBackup` [PRIVATE] - Mount backup as directory
  - Input: `{backupId: string}`
  
- `backups.unmountBackup` [PRIVATE]
  - Input: `{directoryName: string}`
  
- `backups.restoreBackup` [PUBLIC-IF-NO-USER] - Restore from backup
  - Input: `{backupId: string}`
  
- `backups.restoreStatus` [PUBLIC-IF-NO-USER] - Get restore progress

### Ignore Paths
- `backups.getIgnoredPaths` [PRIVATE] - Get paths excluded from backups
  - Output: paths array
  
- `backups.addIgnoredPath` [PRIVATE]
  - Input: `{path: string}`
  
- `backups.removeIgnoredPath` [PRIVATE]
  - Input: `{path: string}`

---

## 9. EVENT BUS ROUTES (`event-bus/routes.ts`)
Base: `eventBus.`

- `eventBus.listen` [PRIVATE, SUBSCRIPTION] - Subscribe to system events
  - Input: `{event: string}` (one of defined events)
  - Output: observable streaming events
  - Event types: files:watcher:change, and others

---

## 10. WIFI ROUTES (`system/wifi-routes.ts`)
Base: `wifi.`

- `wifi.supported` [PRIVATE] - Check if WiFi is supported
  - Output: boolean
  
- `wifi.networks` [PRIVATE] - List available WiFi networks
  - Output: networks array
  
- `wifi.connect` [PRIVATE] - Connect to WiFi
  - Input: `{ssid: string, password?: string}`
  
- `wifi.connected` [PRIVATE] - Get current WiFi status
  - Output: `{status: 'connected'|'disconnected', ssid?, signal?, authenticated?}`
  
- `wifi.disconnect` [PRIVATE] - Disconnect from WiFi

---

## 11. DOMAIN ROUTES (`domain/routes.ts`)
Base: `domain.`

### Main Domain
- `domain.getPublicIp` [PRIVATE] - Get server's public IP
  - Output: `{ip: string}`
  
- `domain.getStatus` [PRIVATE] - Get domain configuration status
  - Output: `{configured, domain, active, activatedAt, subdomains}`
  
- `domain.setDomain` [PRIVATE] - Save domain name (doesn't activate yet)
  - Input: `{domain: string}`
  
- `domain.verifyDns` [PRIVATE] - Check DNS propagation
  - Output: `{verified, resolvedIp, ...}`
  
- `domain.activate` [PRIVATE] - Enable HTTPS (opens firewall, configures Caddy)
  - Output: `{success, domain, firewall: {...}}`
  
- `domain.remove` [PRIVATE] - Remove domain and revert to IP-only

### Subdomains
- `domain.listSubdomains` [PRIVATE] - Get all subdomains
  - Output: subdomains array
  
- `domain.getAppSubdomain` [PRIVATE] - Get subdomain for specific app
  - Input: `{appId: string}`
  - Output: `{subdomain, mainDomain, mainDomainActive}`
  
- `domain.setAppSubdomain` [PRIVATE] - Configure app subdomain
  - Input: `{appId: string, subdomain: string, port: number, enabled: boolean}`
  
- `domain.verifySubdomainDns` [PRIVATE] - Verify subdomain DNS
  - Input: `{subdomain: string}`
  - Output: `{verified, resolvedIp, fullDomain, ...}`
  
- `domain.toggleAppSubdomain` [PRIVATE] - Enable/disable subdomain
  - Input: `{appId: string, enabled: boolean}`
  
- `domain.removeAppSubdomain` [PRIVATE]
  - Input: `{appId: string}`

---

## 12. MIGRATION ROUTES (`migration/routes.ts`)
Base: `migration.`

- `migration.isLivinityHome` [PRIVATE] - Check if running on Livinity Home
  - Output: boolean
  
- `migration.isMigratingFromLivinityHome` [PRIVATE] - Check if currently migrating
  - Output: boolean (currently always false)
  
- `migration.canMigrate` [PRIVATE] - Pre-migration validation
  - Output: true or throws error
  
- `migration.migrationStatus` [PUBLIC-IF-NO-USER] - Get migration progress
  - Output: ProgressStatus object
  
- `migration.migrate` [PRIVATE] - Start data migration from external drive
  - Output: true

---

## Common Patterns

### Authentication
- Uses JWT tokens from login (Authorization: Bearer token header)
- `privateProcedure` = requires valid token
- `publicProcedure` = anyone
- `publicProcedureWhenNoUserExists` = public until user is registered, then requires auth

### Input Validation
- All inputs validated with Zod schemas
- Invalid input returns BAD_REQUEST with zodError details
- Examples: string length, enum values, regex patterns, number ranges

### Streaming
- `ai.stream` - SUBSCRIPTION for live chat/agent responses
- `eventBus.listen` - SUBSCRIPTION for system events
- Both use tRPC observables

### Error Handling
- TRPCError thrown for business logic errors
- HTTP status codes: 401 (UNAUTHORIZED), 404 (NOT_FOUND), 500 (INTERNAL_SERVER_ERROR)
- Error response includes zodError for validation failures

### API Key Masking
- Sensitive keys returned masked: first 4 + **** + last 4 chars
- Full keys only shown on creation (webhooks)

### Nexus Integration
- Many AI endpoints proxy to Nexus API at `NEXUS_API_URL` (env)
- Auth via `X-Api-Key` header if `LIV_API_KEY` set
- Fallback: `localhost:3200`

### Real-time Status
- Use polling (queries) for progress: app state, backup progress, migration status
- Use subscriptions for events: file watcher, eventBus
- Chat uses subscription for streaming responses, polling for status

---

## Notes
- All file paths are virtual paths (converted from system paths by files module)
- App IDs used throughout: "transmission", "chromium", "immich", etc.
- Widget IDs format: "appId:widgetName" or "livinity:widgetName" for builtin
- Conversation IDs: 1-100 char alphanumeric with underscores/hyphens
- Timestamps in milliseconds (Unix epoch)
- API key validation: test calls made to verify authenticity
