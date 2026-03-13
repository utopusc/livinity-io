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
} from '../database/index.js'

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
		const allSubdomains = await ctx.apps.getAllSubdomains()
		const subdomainMap = new Map(allSubdomains.map(s => [s.appId, s.subdomain]))

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
					const subdomain = subdomainMap.get(app.id) || app.id

					return {
						id: app.id,
						name,
						version,
						icon: appIcon,
						port,
						path,
						state: app.state,
						subdomain,
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
				if (ctx.currentUser.role && ctx.currentUser.role !== 'admin') {
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
				// Admin: grant shared access to global instance
				await grantAppAccess(ctx.currentUser.id, input.appId, ctx.currentUser.id)
				return {alreadyInstalled: true}
			}

			const result = await ctx.apps.install(input.appId, input.alternatives, input.environmentOverrides)
			// Auto-grant access to the installing user
			if (ctx.currentUser?.id) {
				await grantAppAccess(ctx.currentUser.id, input.appId, ctx.currentUser.id)
			}
			return result
		}),

	// Get state (checks per-user instance first, then global app)
	state: privateProcedure
		.input(
			z.object({
				appId: z.string(),
			}),
		)
		.query(async ({ctx, input}) => {
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

	// Start an app (handles per-user instances)
	start: privateProcedure
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
					await $`docker start ${inst.containerName}`
					return
				}
			}
			return ctx.apps.getApp(input.appId).start()
		}),

	// Stop an app (handles per-user instances)
	stop: privateProcedure
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
})
