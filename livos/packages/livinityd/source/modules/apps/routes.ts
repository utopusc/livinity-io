import z from 'zod'

import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
import {BUILTIN_APPS, getBuiltinApp, searchBuiltinApps} from './builtin-apps.js'
import {
	grantAppAccess,
	revokeAppAccess,
	listAppAccessUsers,
	hasAppAccess,
	listUsers,
	listUserAppInstances,
	getUserAppInstance,
	getPool,
} from '../database/index.js'
// Phase 157 — v37 install dispatcher service (section-aware install path
// for webapp/native/ai/plugin). The dispatcher is wired at livinityd boot
// via `initV37InstallService()`; these procedures resolve it via getter.
import {
	getDispatcher,
	buildInstallContext,
	recordProgress,
	getProgress,
	clearProgress,
} from './v37-install-service.js'
import type {InstallProgressEvent} from './install-contracts.js'

export const appStore = router({
	// Returns builtin apps (priority apps with official Docker images)
	builtinApps: privateProcedure.query(() => BUILTIN_APPS),

	// Search builtin apps
	searchBuiltin: privateProcedure
		.input(z.object({ query: z.string() }))
		.query(({input}) => searchBuiltinApps(input.query)),

	// Returns the app store registry
	registry: privateProcedure.query(async ({ctx}) => ctx.appStore.registry()),

	// Add a repository to the app store
	addRepository: privateProcedure
		.input(
			z.object({
				url: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.appStore.addRepository(input.url)),

	// Remove a repository to the app store
	removeRepository: privateProcedure
		.input(
			z.object({
				url: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.appStore.removeRepository(input.url)),
})

export const apps = router({
	// List all apps
	list: privateProcedure.query(async ({ctx}) => {
		const apps = ctx.apps.instances
		const torEnabled = await ctx.livinityd.store.get('torEnabled')

		// Get all subdomain configs to include in app data
		// Phase 141-03: also expose the optional canonical FQDN `host` minted
		// by Server5 (Phase 140 hyphen-pattern) so the UI can render the
		// correct public URL without recomputing `${subdomain}.${mainDomain}`.
		const allSubdomains = await ctx.apps.getAllSubdomains()
		const subdomainMap = new Map(allSubdomains.map(s => [s.appId, {subdomain: s.subdomain, host: s.host}]))

		const appData = await Promise.all(
			apps.map(async (app) => {
				try {
					let [
						{
							name,
							version,
							icon,
							port,
							path,
							widgets,
							defaultUsername,
							defaultPassword,
							deterministicPassword,
							dependencies,
							implements: implements_,
							torOnly,
						},
						selectedDependencies,
					] = await Promise.all([app.readManifest(), app.getSelectedDependencies()])

					const hiddenService = torEnabled ? await app.readHiddenService() : ''
					if (deterministicPassword) {
						defaultPassword = await app.deriveDeterministicPassword()
					}
					const hasCredentials = !!defaultUsername || !!defaultPassword
					const showCredentialsBeforeOpen = hasCredentials && !(await app.store.get('hideCredentialsBeforeOpen'))
					// Check if this is a builtin app, use our icon from GitHub gallery
					const builtinApp = getBuiltinApp(app.id)
					const appIcon = icon ?? builtinApp?.icon ?? `https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/${app.id}/icon.svg`

					// Get subdomain for this app (if configured)
					// Phase 141-03: `host` carries the canonical FQDN (e.g.
					// `n8n-socinity.livinity.io`) for Phase-140 hyphen-pattern
					// entries; absent for legacy entries (UI falls back to
					// `${subdomain}.${mainDomain}` compute path).
					const sdEntry = subdomainMap.get(app.id)
					const subdomain = sdEntry?.subdomain || app.id
					const host = sdEntry?.host

					return {
						id: app.id,
						name,
						version,
						icon: appIcon,
						port,
						path,
						state: app.state,
						subdomain,
						host,
						native: false as const,
						credentials: {
							defaultUsername,
							defaultPassword,
							showBeforeOpen: showCredentialsBeforeOpen,
						},
						hiddenService,
						widgets,
						dependencies,
						selectedDependencies,
						implements: implements_,
						torOnly,
					}
				} catch (error) {
					ctx.apps.logger.error(`Failed to read manifest for app ${app.id}`, error)
					return {id: app.id, error: (error as Error).message}
				}
			}),
		)

		// Add native apps to the list
		for (const nativeApp of ctx.apps.nativeInstances) {
			const builtinApp = getBuiltinApp(nativeApp.id)
			if (builtinApp) {
				appData.push({
					id: nativeApp.id,
					name: builtinApp.name,
					version: builtinApp.version,
					icon: builtinApp.icon,
					port: builtinApp.port,
					path: '',
					state: nativeApp.state === 'ready' ? 'ready' : nativeApp.state === 'stopped' ? 'stopped' : nativeApp.state,
					subdomain: builtinApp.installOptions?.subdomain || nativeApp.id,
					native: true as const,
					credentials: {defaultUsername: undefined, defaultPassword: undefined, showBeforeOpen: false},
					hiddenService: '',
					widgets: undefined,
					dependencies: undefined,
					selectedDependencies: undefined,
					implements: undefined,
					torOnly: undefined,
				})
			}
		}

		const appDataSortedByNames = appData.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

		return appDataSortedByNames
	}),

	// Install an app (or create per-user instance if already installed)
	install: privateProcedure
		.input(
			z.object({
				appId: z.string(),
				alternatives: z.record(z.string()).optional(),
				environmentOverrides: z.record(z.string()).optional(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const alreadyInstalled = await ctx.apps.isInstalled(input.appId)
			if (alreadyInstalled && ctx.currentUser?.id) {
				// Non-admin: create per-user Docker instance
				if (ctx.currentUser?.role && ctx.currentUser.role !== 'admin') {
					const existing = await getUserAppInstance(ctx.currentUser.id, input.appId)
					if (existing) {
						// Already has per-user instance, just return
						return {alreadyInstalled: true, perUserInstance: true}
					}
					await ctx.apps.installForUser(input.appId, ctx.currentUser.id)
					// Register per-user subdomain in Caddy
					const inst = await getUserAppInstance(ctx.currentUser.id, input.appId)
					if (inst) {
						const user = ctx.currentUser
						const perUserSubdomain = `${input.appId}-${user.username || user.id.slice(0, 8)}`
						await ctx.apps.registerAppSubdomain(`${input.appId}:user:${ctx.currentUser.id}`, inst.port, perUserSubdomain)
					}
					return {alreadyInstalled: true, perUserInstance: true}
				}
				// Admin: grant shared access to global instance + auto-heal
				// post-install config (re-inject broker for pre-fix installs and
				// re-register subdomain with canonical port). This makes a second
				// "Install" click on a broken app a recovery action.
				await grantAppAccess(ctx.currentUser.id, input.appId, ctx.currentUser.id)
				await ctx.apps.reapplyAppConfig(input.appId).catch((err) => {
					ctx.apps.logger.error(`reapplyAppConfig failed for ${input.appId}`, err)
				})
				return {alreadyInstalled: true, reapplied: true}
			}

			const result = await ctx.apps.install(input.appId, input.alternatives, input.environmentOverrides)
			// Auto-grant access to the installing user
			if (ctx.currentUser?.id) {
				await grantAppAccess(ctx.currentUser.id, input.appId, ctx.currentUser.id)
			}
			return result
		}),

	// Get state (checks native app first, then per-user instance, then global app)
	state: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.query(async ({ctx, input}) => {
			// Check native app first
			const nativeApp = ctx.apps.getNativeApp(input.appId)
			if (nativeApp) {
				const state = await nativeApp.getStatus()
				return {state, progress: 0}
			}

			// Check per-user instance first
			if (ctx.currentUser?.id) {
				const inst = await getUserAppInstance(ctx.currentUser.id, input.appId)
				if (inst) {
					// Check Docker container state for per-user instance
					try {
						const {$} = await import('execa')
						const result = await $`docker inspect --format={{.State.Status}} ${inst.containerName}`
						const status = result.stdout.trim()
						const stateMap: Record<string, string> = {running: 'running', exited: 'stopped', created: 'ready', paused: 'stopped'}
						return {state: (stateMap[status] || 'ready') as any, progress: 0}
					} catch {
						return {state: 'ready' as const, progress: 0}
					}
				}
			}

			if (!(await ctx.apps.isInstalled(input.appId))) {
				return {
					state: 'not-installed' as const,
					progress: 0,
				}
			}

			const app = ctx.apps.getApp(input.appId)

			return {
				state: app.state,
				progress: app.stateProgress,
			} as const
		}),

	// Uninstall an app (handles per-user instances for non-admin)
	uninstall: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Non-admin: uninstall per-user instance
			if (ctx.currentUser?.id && ctx.currentUser.role && ctx.currentUser.role !== 'admin') {
				const inst = await getUserAppInstance(ctx.currentUser.id, input.appId)
				if (inst) {
					await ctx.apps.uninstallForUser(input.appId, ctx.currentUser.id)
					// Remove per-user subdomain
					await ctx.apps.removeAppSubdomain(`${input.appId}:user:${ctx.currentUser.id}`)
					return
				}
			}
			return ctx.apps.uninstall(input.appId)
		}),

	// Restart an app (handles per-user instances)
	restart: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			if (ctx.currentUser?.id) {
				const inst = await getUserAppInstance(ctx.currentUser.id, input.appId)
				if (inst) {
					const {$} = await import('execa')
					await $`docker restart ${inst.containerName}`
					return
				}
			}
			return ctx.apps.restart(input.appId)
		}),

	// Start an app (handles native apps and per-user instances)
	start: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Handle native apps
			const nativeApp = ctx.apps.getNativeApp(input.appId)
			if (nativeApp) {
				await nativeApp.start()
				return true
			}

			if (ctx.currentUser?.id) {
				const inst = await getUserAppInstance(ctx.currentUser.id, input.appId)
				if (inst) {
					const {$} = await import('execa')
					await $`docker start ${inst.containerName}`
					return
				}
			}
			return ctx.apps.getApp(input.appId).start()
		}),

	// Stop an app (handles native apps and per-user instances)
	stop: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Handle native apps
			const nativeApp = ctx.apps.getNativeApp(input.appId)
			if (nativeApp) {
				await nativeApp.stop()
				return true
			}

			if (ctx.currentUser?.id) {
				const inst = await getUserAppInstance(ctx.currentUser.id, input.appId)
				if (inst) {
					const {$} = await import('execa')
					await $`docker stop ${inst.containerName}`
					return
				}
			}
			return ctx.apps.getApp(input.appId).stop({persistState: true})
		}),

	// Update an app
	update: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.apps.update(input.appId)),

	// Get logs for an app
	logs: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.query(async ({ctx, input}) => ctx.apps.getApp(input.appId).getLogs()),

	trackOpen: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.apps.trackOpen(input.appId)),

	recentlyOpened: privateProcedure.query(({ctx}) => ctx.apps.recentlyOpened()),

	setTorEnabled: privateProcedure.input(z.boolean()).mutation(({ctx, input}) => ctx.apps.setTorEnabled(input)),
	getTorEnabled: privateProcedure.query(({ctx}) => ctx.apps.getTorEnabled()),

	setSelectedDependencies: privateProcedure
		.input(
			z.object({
				appId: z.string(),
				dependencies: z.record(z.string()),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.apps.setSelectedDependencies(input.appId, input.dependencies)),

	dependents: privateProcedure.input(z.string()).query(async ({ctx, input}) => ctx.apps.getDependents(input)),

	hideCredentialsBeforeOpen: privateProcedure
		.input(
			z.object({
				appId: z.string(),
				value: z.boolean(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.apps.setHideCredentialsBeforeOpen(input.appId, input.value)),

	isBackupIgnored: privateProcedure
		.input(z.object({appId: z.string()}))
		.query(async ({ctx, input}) => ctx.apps.getApp(input.appId).isBackupIgnored()),

	backupIgnore: privateProcedure
		.input(z.object({appId: z.string(), value: z.boolean()}))
		.mutation(async ({ctx, input}) => ctx.apps.getApp(input.appId).setBackupIgnored(input.value)),

	// Get backupIgnored paths for an app
	getBackupIgnoredPaths: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.query(async ({ctx, input}) => ctx.apps.getApp(input.appId).getBackupIgnoredFilePaths()),

	// ─── Multi-User & Sharing ──────────────────────────────────────

	// Check if multi-user mode is enabled
	isMultiUserEnabled: privateProcedure.query(async ({ctx}) => ctx.apps.isMultiUserEnabled()),

	// Toggle multi-user mode (admin only)
	setMultiUserEnabled: adminProcedure
		.input(z.boolean())
		.mutation(async ({ctx, input}) => {
			await ctx.apps.setMultiUserEnabled(input)
			return {success: true, enabled: input}
		}),

	// Share an app with a user (grant access)
	shareApp: privateProcedure
		.input(z.object({
			appId: z.string(),
			userId: z.string(),
		}))
		.mutation(async ({ctx, input}) => {
			const grantedBy = ctx.currentUser?.id
			if (!grantedBy) throw new Error('Authentication required')
			await grantAppAccess(input.userId, input.appId, grantedBy)
			return {success: true}
		}),

	// Revoke a user's access to an app
	unshareApp: privateProcedure
		.input(z.object({
			appId: z.string(),
			userId: z.string(),
		}))
		.mutation(async ({ctx, input}) => {
			await revokeAppAccess(input.userId, input.appId)
			return {success: true}
		}),

	// List users who have access to an app (for share dialog)
	sharedUsers: privateProcedure
		.input(z.object({appId: z.string()}))
		.query(async ({ctx, input}) => listAppAccessUsers(input.appId)),

	// List all users (for share dialog user picker)
	allUsers: privateProcedure.query(async () => {
		const users = await listUsers()
		return users.map((u) => ({id: u.id, username: u.username, displayName: u.displayName, role: u.role, avatarColor: u.avatarColor}))
	}),

	// Install an app for a specific user (admin only)
	installForUser: adminProcedure
		.input(z.object({
			appId: z.string(),
			userId: z.string(),
		}))
		.mutation(async ({ctx, input}) => ctx.apps.installForUser(input.appId, input.userId)),

	// Uninstall a per-user app instance (admin only)
	uninstallForUser: adminProcedure
		.input(z.object({
			appId: z.string(),
			userId: z.string(),
		}))
		.mutation(async ({ctx, input}) => ctx.apps.uninstallForUser(input.appId, input.userId)),

	// List a user's per-user app instances
	userInstances: privateProcedure
		.input(z.object({userId: z.string()}))
		.query(async ({ctx, input}) => listUserAppInstances(input.userId)),

	// Get apps accessible to the current user (own + shared)
	myApps: privateProcedure.query(async ({ctx}) => {
		const userId = ctx.currentUser?.id
		if (!userId) {
			// Legacy single-user mode: return all installed apps
			return {globalApps: true, sharedAppIds: [] as string[], userInstances: [] as any[]}
		}

		// Get user's per-user instances
		const instances = await listUserAppInstances(userId)

		// Enrich per-user instances with app metadata (name, icon, path)
		const enrichedInstances = await Promise.all(
			instances.map(async (inst) => {
				const globalApp = ctx.apps.instances.find((a) => a.id === inst.appId)
				let name = inst.appId
				let icon = ''
				let path = ''
				if (globalApp) {
					try {
						const manifest = await globalApp.readManifest()
						name = manifest.name || inst.appId
						icon = manifest.icon || ''
						path = manifest.path || ''
						// Use builtin icon if available
						const builtinApp = getBuiltinApp(inst.appId)
						if (!icon && builtinApp?.icon) icon = builtinApp.icon
						if (!icon) icon = `https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/${inst.appId}/icon.svg`
					} catch { /* use defaults */ }
				}
				// Check Docker container state
				let state = 'ready'
				try {
					const {$} = await import('execa')
					const result = await $`docker inspect --format={{.State.Status}} ${inst.containerName}`
					const status = result.stdout.trim()
					const stateMap: Record<string, string> = {running: 'running', exited: 'stopped', created: 'ready', paused: 'stopped'}
					state = stateMap[status] || 'ready'
				} catch { /* default to ready */ }

				return {
					...inst,
					name,
					icon,
					path,
					state,
				}
			}),
		)

		// Get apps shared with / owned by this user
		const allInstalledApps = ctx.apps.instances
		const sharedAppIds: string[] = []
		for (const app of allInstalledApps) {
			const access = await hasAppAccess(userId, app.id)
			if (access) {
				sharedAppIds.push(app.id)
			} else if (ctx.currentUser?.role === 'admin') {
				// Auto-grant legacy apps (no access entries at all) to admin
				const accessUsers = await listAppAccessUsers(app.id)
				if (accessUsers.length === 0) {
					await grantAppAccess(userId, app.id, userId)
					sharedAppIds.push(app.id)
				}
			}
		}

		return {
			globalApps: false,
			sharedAppIds,
			userInstances: enrichedInstances,
		}
	}),

	// ─── Native App Management ──────────────────────────────────────

	// Start a native app (e.g., Chrome browser stream)
	nativeStart: privateProcedure
		.input(z.object({ appId: z.string() }))
		.mutation(async ({ctx, input}) => {
			const nativeApp = ctx.apps.getNativeApp(input.appId)
			if (!nativeApp) throw new Error(`Native app ${input.appId} not found`)
			await nativeApp.start()
			return {state: nativeApp.state}
		}),

	// Stop a native app
	nativeStop: privateProcedure
		.input(z.object({ appId: z.string() }))
		.mutation(async ({ctx, input}) => {
			const nativeApp = ctx.apps.getNativeApp(input.appId)
			if (!nativeApp) throw new Error(`Native app ${input.appId} not found`)
			await nativeApp.stop()
			return {state: nativeApp.state}
		}),

	// Get native app status (also resets idle timer — acts as heartbeat)
	nativeStatus: privateProcedure
		.input(z.object({ appId: z.string() }))
		.query(async ({ctx, input}) => {
			const nativeApp = ctx.apps.getNativeApp(input.appId)
			if (!nativeApp) throw new Error(`Native app ${input.appId} not found`)
			const state = await nativeApp.getStatus()
			// Reset idle timer on status check (acts as keepalive from UI)
			if (state === 'ready') nativeApp.resetIdleTimer()
			return {state, port: nativeApp.port}
		}),

	// ─── v37 install dispatch (Phase 157) ─────────────────────────────
	//
	// Section-aware install for the new v37 surfaces (webapp/native/ai/
	// plugin). The bridge fetches the catalog row from Vercel
	// (`/api/apps/:id`) and passes the resolved manifest in. livinityd
	// hands off to the InstallDispatcher registered at boot.
	//
	// Legacy `section='app'` continues to flow through `apps.install`
	// above — Docker compose handler is unchanged.

	installV37: privateProcedure
		.input(
			z.object({
				appId: z.string(),
				section: z.enum(['app', 'webapp', 'native', 'ai', 'plugin']),
				name: z.string(),
				category: z.string(),
				manifest: z.unknown(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const d = getDispatcher()
			if (!d) {
				return {
					ok: false as const,
					code: 'not_implemented' as const,
					message: 'v37 install dispatcher not initialised',
				}
			}
			const pool = getPool()
			if (!pool) {
				return {
					ok: false as const,
					code: 'dependency_missing' as const,
					message: 'PostgreSQL pool unavailable',
				}
			}
			const userId = ctx.currentUser?.id ?? 'admin'
			const installCtx = buildInstallContext({
				userId,
				redis: ctx.livinityd.ai.redis,
				pg: pool,
				logger: {
					info: (m: string) => ctx.logger?.log(m),
					warn: (m: string) => ctx.logger?.error(m),
					error: (m: string, extra?: unknown) =>
						ctx.logger?.error(m, extra as Error | undefined),
				},
			})
			// Seed an opening progress event so the bridge poll sees us
			// before the handler emits its first internal event.
			recordProgress({
				appId: input.appId,
				section: input.section,
				pct: 0,
				message: 'Starting install',
				done: false,
			})
			const emit = (e: InstallProgressEvent) => recordProgress(e)
			const outcome = await d.install(
				{
					id: input.appId,
					name: input.name,
					section: input.section,
					category: input.category,
					manifest: input.manifest,
				},
				installCtx,
				emit,
			)
			// Final tick so the bridge stops polling promptly.
			recordProgress({
				appId: input.appId,
				section: input.section,
				pct: 100,
				message: outcome.ok ? 'Installed' : `Failed: ${outcome.message}`,
				done: true,
				...(outcome.ok ? {} : {error: outcome.message}),
			})
			return outcome
		}),

	uninstallV37: privateProcedure
		.input(
			z.object({
				appId: z.string(),
				section: z.enum(['app', 'webapp', 'native', 'ai', 'plugin']),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const d = getDispatcher()
			if (!d) {
				return {
					ok: false as const,
					code: 'not_implemented' as const,
					message: 'v37 install dispatcher not initialised',
				}
			}
			const pool = getPool()
			if (!pool) {
				return {
					ok: false as const,
					code: 'dependency_missing' as const,
					message: 'PostgreSQL pool unavailable',
				}
			}
			const userId = ctx.currentUser?.id ?? 'admin'
			const installCtx = buildInstallContext({
				userId,
				redis: ctx.livinityd.ai.redis,
				pg: pool,
				logger: {
					info: (m: string) => ctx.logger?.log(m),
					warn: (m: string) => ctx.logger?.error(m),
					error: (m: string, extra?: unknown) =>
						ctx.logger?.error(m, extra as Error | undefined),
				},
			})
			const emit = (e: InstallProgressEvent) => recordProgress(e)
			const outcome = await d.uninstall(
				input.appId,
				input.section,
				installCtx,
				emit,
			)
			clearProgress(input.appId)
			return outcome
		}),

	v37Progress: privateProcedure
		.input(z.object({appId: z.string()}))
		.query(({input}) => getProgress(input.appId)),

	// Phase 157 follow-up — return installed catalog appIds across v37
	// sections so the store iframe can keep showing "Installed" after
	// the per-install postMessage round-trip clears. Without this the
	// next sendStatusToIframe (apps.list) drops MCP/native entries and
	// the card reverts to the "Install" button.
	v37List: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		// AI section: native key is `liv:apps:ai:${appId}` (ai-installer
		// writes this on every install path — mcp/agent/gsd).
		const aiKeys = await redis.keys('liv:apps:ai:*').catch(() => [] as string[])
		const ai = aiKeys.map((k: string) => k.slice('liv:apps:ai:'.length))

		// Native section: catalog-appId mapping written by
		// native-installer.install (Phase 157 follow-up).
		const nativeKeys = await redis
			.keys('liv:apps:native-catalog:*')
			.catch(() => [] as string[])
		const native = nativeKeys.map((k: string) =>
			k.slice('liv:apps:native-catalog:'.length),
		)

		// Webapp section: catalog-appId mapping written by
		// apps.markWebappCatalog (called by the bridge after
		// webapp.create succeeds for a curated webapp install).
		const webappKeys = await redis
			.keys('liv:apps:webapp-catalog:*')
			.catch(() => [] as string[])
		const webapp = webappKeys.map((k: string) =>
			k.slice('liv:apps:webapp-catalog:'.length),
		)

		return {ai, native, webapp}
	}),

	// Phase 157 round 4 — bridge writes the catalog mapping here after
	// webapp.create succeeds so v37List can report the install. Idempotent.
	markWebappCatalog: privateProcedure
		.input(z.object({catalogAppId: z.string(), webappId: z.string()}))
		.mutation(async ({ctx, input}) => {
			await ctx.livinityd.ai.redis.set(
				`liv:apps:webapp-catalog:${input.catalogAppId}`,
				input.webappId,
			)
			return {ok: true as const}
		}),

	unmarkWebappCatalog: privateProcedure
		.input(z.object({catalogAppId: z.string()}))
		.mutation(async ({ctx, input}) => {
			await ctx.livinityd.ai.redis.del(`liv:apps:webapp-catalog:${input.catalogAppId}`)
			return {ok: true as const}
		}),

	// Phase 157 round 4 — operator emergency: stop ALL alive streams for
	// the current user. The native-app cap can leak to 10 if Phase 102-08
	// close lifecycle gaps trap streams alive without an owner. Until the
	// close lifecycle is plumbed, this gives the user a recovery path
	// without `systemctl restart livos`.
	stopAllStreams: privateProcedure.mutation(async ({ctx}) => {
		const sm = ctx.livinityd.streamManager
		if (!sm) return {stopped: 0, total: 0}
		const userId = ctx.currentUser?.id ?? 'admin'
		const owned = sm.listStreams({userId})
		let stopped = 0
		for (const s of owned) {
			try {
				await sm.stopStream(s.streamId)
				stopped++
			} catch {
				// best-effort
			}
		}
		return {stopped, total: owned.length}
	}),
})
