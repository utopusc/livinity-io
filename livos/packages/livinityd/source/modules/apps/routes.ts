import z from 'zod'
import {TRPCError} from '@trpc/server'

import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
import {BUILTIN_APPS, getBuiltinApp, searchBuiltinApps} from './builtin-apps.js'
import {isPublicForbidden, type PublicForbiddenSignals} from './public-forbidden.js'
import {resolvePublicAccess} from './public-access.js'
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
// Phase 260-01 (SC1) — reconcile wedged transient app states against Docker.
import {isTransientAppState, reconcileTransientAppState} from './app-state-reconcile.js'
// Phase 262-02 (LIVOS-042) — pre-dispatch admin gate for the v37 install path
// (defense-in-depth under adminProcedure; keeps the path safe if the procedure
// declaration is ever downgraded).
import {assertInstallAllowed, InstallForbidden} from './install-admin-gate.js'

// 326-review (CR-01): admin-only gate for secret-bearing fields surfaced by the
// `apps.list` privateProcedure. `environmentOverrides` holds the raw install/
// Configure form values incl. type:'password' secrets (GF_SECURITY_ADMIN_PASSWORD,
// N8N_BASIC_AUTH_PASSWORD, NEXTCLOUD_ADMIN_PASSWORD, …). Non-admin callers must
// receive `undefined` (their Configure section is disabled anyway). Single-user
// (no currentUser) stays admin-equivalent — mirrors the install gate + the
// immichApiKeySet discretion in the same file.
export function gateAdminOnlyField<T>(value: T, currentUser?: {role?: string} | null): T | undefined {
	const isAdmin = currentUser ? currentUser.role === 'admin' : true
	return isAdmin ? value : undefined
}

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
	// WS-C (256-03, LIVOS-013, SC5): admin-only — a non-admin must not be able to
	// register an attacker-controlled repo that supplies arbitrary compose content.
	addRepository: adminProcedure
		.input(
			z.object({
				url: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.appStore.addRepository(input.url)),

	// Remove a repository to the app store
	// WS-C (256-03, LIVOS-013, SC5): admin-only (mirrors addRepository).
	removeRepository: adminProcedure
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

		// Get all subdomain configs to include in app data
		// Phase 141-03: also expose the optional canonical FQDN `host` minted
		// by Server5 (Phase 140 hyphen-pattern) so the UI can render the
		// correct public URL without recomputing `${subdomain}.${mainDomain}`.
		const allSubdomains = await ctx.apps.getAllSubdomains()
		// Phase 287: also carry the verify-live readiness so the UI can gate every
		// open affordance (show "Provisioning…" until the per-app host resolves)
		// instead of handing the operator a clickable link that NXDOMAINs.
		const subdomainMap = new Map(allSubdomains.map(s => [s.appId, {subdomain: s.subdomain, host: s.host, subdomainReady: s.subdomainReady, readySource: s.readySource}]))

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
							// 316-06 (GPU-02 UI): expose the manifest GPU-permission declaration so
							// app-settings-dialog can render the GPU toggle ONLY for apps that request
							// the GPU. `permissions` is the untyped z.array(z.string()) manifest field.
							permissions,
							// 322-05 (IDENT-02 UI): the manifest visibility flag so app-settings-dialog
							// (322-07) renders the "Enable SSO" toggle ONLY for the 4 oidcNative apps.
							installOptions,
						},
						selectedDependencies,
						// 316-06 (GPU-02 UI): the raw per-app override (boolean | undefined) so the
						// toggle reflects the real persisted state — `undefined` (no override) falls
						// back to the manifest default client-side, matching patchComposeFile's server logic.
						gpuAccess,
						// 322-05 (IDENT-02 UI): the raw per-app "Enable SSO" override (boolean |
						// undefined). Read via the typed store directly (the getOidcEnabled accessor
						// lands in the app.ts task); default OFF, NO manifest fallback (unlike GPU).
						oidcEnabled,
						// 322-05 (IDENT-02, Pitfall 7): PRESENCE of the DEK-encrypted Immich admin key.
						// The ciphertext itself NEVER leaves the server — only the boolean immichApiKeySet
						// below is surfaced (computed from `!= null`), never decrypting the blob.
						immichApiKeyEnc,
						// 326-01 (APPS-01/02/03 + MEDIA-01): the per-app Configure/policy/limits/dismissal
						// state so the later UI/scheduler plans read a stable apps.list contract. Each is
						// the raw persisted store value (undefined when never set); surfaced verbatim below
						// and mirrored as `undefined` on the native-app branch to keep the union uniform.
						environmentOverrides,
						autoUpdatePolicy,
						ignoredVersion,
						cpuLimit,
						memoryLimit,
						immichCardDismissed,
					] = await Promise.all([
						app.readManifest(),
						app.getSelectedDependencies(),
						app.getGpuAccess(),
						app.store.get('oidcEnabled'),
						app.store.get('immichApiKeyEnc'),
						app.store.get('environmentOverrides'),
						app.store.get('autoUpdatePolicy'),
						app.store.get('ignoredVersion'),
						app.store.get('cpuLimit'),
						app.store.get('memoryLimit'),
						app.store.get('immichCardDismissed'),
					])

					if (deterministicPassword) {
						defaultPassword = await app.deriveDeterministicPassword()
					}
					const hasCredentials = !!defaultUsername || !!defaultPassword
					const showCredentialsBeforeOpen = hasCredentials && !(await app.store.get('hideCredentialsBeforeOpen'))
					// Use the manifest icon, falling back to the builtin app's icon.
					// Phase 276: dropped the dead community-gallery synthesized
					// URL — a missing icon falls through to the box's onError
					// APP_ICON_PLACEHOLDER_SRC (LauncherIcon/app-icon).
					const builtinApp = getBuiltinApp(app.id)
					const appIcon = icon ?? builtinApp?.icon ?? undefined

					// Get subdomain for this app (if configured)
					// Phase 141-03: `host` carries the canonical FQDN (e.g.
					// `n8n-socinity.livinity.io`) for Phase-140 hyphen-pattern
					// entries; absent for legacy entries (UI falls back to
					// `${subdomain}.${mainDomain}` compute path).
					const sdEntry = subdomainMap.get(app.id)
					const subdomain = sdEntry?.subdomain || app.id
					const host = sdEntry?.host
					// Phase 287: undefined/false → UI treats the app as still-provisioning
					// (fail-safe). readySource encodes Tier-1 'platform-doh' vs the WEAK
					// Tier-2 'box-resolver' floor.
					const subdomainReady = sdEntry?.subdomainReady
					const readySource = sdEntry?.readySource

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
						subdomainReady,
						readySource,
						native: false as const,
						credentials: {
							defaultUsername,
							defaultPassword,
							showBeforeOpen: showCredentialsBeforeOpen,
						},
						widgets,
						dependencies,
						selectedDependencies,
						implements: implements_,
						// 316-06 (GPU-02 UI) — see destructure above.
						permissions,
						gpuAccess,
						// 322-05 (IDENT-02 UI) — see destructure above. oidcNative is the
						// visibility flag (default false so non-oidcNative docker apps hide the
						// toggle); oidcEnabled is the persisted per-app override (default OFF).
						oidcNative: installOptions?.oidcNative ?? false,
						oidcEnabled,
						// 322-05 (Pitfall 7): true ONLY for Immich when the admin key is stored.
						// Store-presence check — never decrypts, never returns the key.
						immichApiKeySet: app.id === 'immich' && immichApiKeyEnc != null,
						// 326-01 (APPS-01/02/03 + MEDIA-01): per-app Configure/policy/limits/dismissal state
						// (see destructure above). installOptions is the raw manifest install options — the
						// Configure dialog reads installOptions.environmentOverrides for its field spec.
						installOptions,
						// 326-review (CR-01): admin-only — non-admins get `undefined` so
						// app-page prefill secrets never cross the admin→member boundary.
						environmentOverrides: gateAdminOnlyField(environmentOverrides, ctx.currentUser),
						autoUpdatePolicy,
						ignoredVersion,
						cpuLimit,
						memoryLimit,
						immichCardDismissed,
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
					widgets: undefined,
					dependencies: undefined,
					selectedDependencies: undefined,
					implements: undefined,
					// 316-06 (GPU-02 UI): native builtins carry no manifest permissions/override —
					// keep the union shape uniform so `app.permissions`/`app.gpuAccess` stay typed.
					permissions: undefined,
					gpuAccess: undefined,
					// 322-05 (IDENT-02 UI): native builtins are never OIDC-native — keep the
					// union shape uniform (mirrors the gpuAccess:undefined native branch).
					oidcNative: false,
					oidcEnabled: undefined,
					immichApiKeySet: undefined,
					// 326-01 (APPS-01/02/03 + MEDIA-01): native builtins carry no per-app store state —
					// keep the union shape uniform (undefined on all), but surface the manifest
					// installOptions so the Configure gate stays consistent with the docker branch.
					installOptions: builtinApp?.installOptions,
					environmentOverrides: undefined,
					autoUpdatePolicy: undefined,
					ignoredVersion: undefined,
					cpuLimit: undefined,
					memoryLimit: undefined,
					immichCardDismissed: undefined,
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
				// 330 GPU-05: opt-in install-time GPU choice for gpuCapable apps
				// (Ollama). Persisted before the first container create so the compose
				// reservation lands on the first `up` (no double restart). Admin-gated
				// at the call site below (WR-02) — see the gpuAccess note there.
				gpuAccess: z.boolean().optional(),
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

			// WS-C (256-03, SC5): thread the caller's admin status into install so
			// the cred-bearing + new-non-builtin gate can reject non-admins. Legacy
			// single-user (no currentUser) stays admin-equivalent — WS-D (256-04)
			// tightens the no-currentUser case separately.
			const isAdmin = ctx.currentUser ? ctx.currentUser.role === 'admin' : true
			// 330 GPU-05 (WR-02): GPU passthrough is HOST-resource-affecting — the
			// sibling `setGpuAccess` route (above) is adminProcedure for exactly this
			// reason. `install` cannot become adminProcedure (non-admins install their
			// own per-user instances), so the install-time gpuAccess write is honored
			// ONLY for admins here; a non-admin's gpuAccess:true is silently dropped
			// (→ undefined) rather than 403-ing the whole install (T-330-10).
			const gpuAccess = input.gpuAccess === true && isAdmin ? true : undefined
			const result = await ctx.apps.install(input.appId, input.alternatives, input.environmentOverrides, isAdmin, gpuAccess)
			// Auto-grant access to the installing user
			if (ctx.currentUser?.id) {
				await grantAppAccess(ctx.currentUser.id, input.appId, ctx.currentUser.id)
			}
			return result
		}),

	// Phase 288: AI custom-app deploy. The AI-authored compose/image is UNTRUSTED —
	// ctx.apps.deployCustom forces isGeneratedTemplate=false so the non-builtin
	// sanitizer ALWAYS runs (no docker.sock / host-path bind / privileged). It
	// reuses the install tail for free Phase-287 verify-live DNS
	// ({slug}-{user}.livinity.io). MVP: deploys as the box owner (admin); per-user
	// isolation DEFERRED (see Apps.deployCustom).
	deployCustom: privateProcedure
		.input(
			z.object({
				slug: z.string().min(1),
				dockerCompose: z.string().optional(),
				image: z.string().optional(),
				port: z.number().int().min(1).max(65535),
				manifest: z.object({name: z.string(), icon: z.string().optional()}).optional(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Mirror routes.ts install: thread the caller's admin status (legacy
			// single-user with no currentUser stays admin-equivalent).
			const isAdmin = ctx.currentUser ? ctx.currentUser.role === 'admin' : true
			// privateProcedure guarantees ctx.apps at runtime (same as install);
			// assert it so this new procedure does not add a 51st 'ctx.apps possibly
			// undefined' to the 305 tsc baseline (the partial-ctx type is a known
			// structural artifact of this router — install() at the same call site
			// already emits the error, but the 288 gate requires staying <=305).
			const result = await ctx.apps!.deployCustom({...input, isAdmin})
			// Auto-grant access to the deploying user (slug as appId), mirroring install.
			if (ctx.currentUser?.id) {
				await grantAppAccess(ctx.currentUser.id, input.slug, ctx.currentUser.id)
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

			// Phase 260-01 (SC1): if the in-memory state is wedged on a transient
			// value ('restarting'/'uninstalling'/…) — e.g. a throw mid-lifecycle or
			// a livinityd restart — reconcile it against the real Docker container
			// status so the tile never stays un-clickable. Stable states bypass the
			// Docker call (no perf regression on the ~2s grid poll).
			if (isTransientAppState(app.state)) {
				let containerNames: string[] = []
				try {
					const compose = await app.readCompose()
					containerNames = Object.values(compose.services ?? {})
						.map((service) => service?.container_name)
						.filter((name): name is string => Boolean(name))
				} catch {
					// Compose unreadable (e.g. dir removed during uninstall) → no
					// containers; reconcile falls through to the stable fallback.
				}
				const reconciled = await reconcileTransientAppState(app.state, containerNames)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reconciled.state may be 'not-installed' (already a valid apps.state return) which is outside AppState; matches the per-user reconcile cast above.
				return {state: reconciled.state as any, progress: reconciled.progress} as const
			}

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

	setSelectedDependencies: privateProcedure
		.input(
			z.object({
				appId: z.string(),
				dependencies: z.record(z.string()),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.apps.setSelectedDependencies(input.appId, input.dependencies)),

	dependents: privateProcedure.input(z.string()).query(async ({ctx, input}) => ctx.apps.getDependents(input)),

	// 316-02 (GPU-02): toggle a single app's GPU-access override. adminProcedure
	// (WR-02): GPU passthrough is HOST-resource-affecting — it restarts the app
	// container (T-316-03) and, on an NVIDIA box, attaches an exclusive device
	// reservation that can force OOM/contention against another user's GPU app.
	// It therefore matches the sibling host-level GPU/system routes
	// (installNvidiaGpu / shutdown / restart), NOT the per-user
	// setSelectedDependencies precedent — a non-admin member must not be able to
	// flip GPU access on a shared global app by enumerating appIds.
	setGpuAccess: adminProcedure
		.input(
			z.object({
				appId: z.string(),
				enabled: z.boolean(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.apps!.setGpuAccess(input.appId, input.enabled)),

	// 326-01 APPS-01 (D-02/D-21): set post-install env overrides. adminProcedure — this
	// env-injects + restarts the shared global app (same host-affecting class as
	// setGpuAccess). The delegator re-runs the manifest allowlist so unknown keys are
	// rejected before they ever reach the compose/.env (D-02).
	setEnvironmentOverrides: adminProcedure
		.input(z.object({appId: z.string(), overrides: z.record(z.string())}))
		.mutation(async ({ctx, input}) => ctx.apps!.setEnvironmentOverrides(input.appId, input.overrides)),

	// 326-01 APPS-03 (D-07/D-21, T-326-03): set per-app CPU/RAM limits. adminProcedure —
	// resource contention on the shared host. .positive()/.int().positive() bound the DoS
	// surface; limits apply via patchComposeFile+restart, never a live-container update.
	setResourceLimits: adminProcedure
		.input(z.object({appId: z.string(), cpuLimit: z.number().positive().optional(), memoryLimit: z.number().int().positive().optional()}))
		.mutation(async ({ctx, input}) => ctx.apps!.setResourceLimits(input.appId, {cpuLimit: input.cpuLimit, memoryLimit: input.memoryLimit})),

	// 326-01 APPS-02 (D-04/D-21): set the per-app auto-update policy. adminProcedure —
	// governs the update state of the shared global app for all users.
	setUpdatePolicy: adminProcedure
		.input(z.object({appId: z.string(), policy: z.enum(['auto', 'manual'])}))
		.mutation(async ({ctx, input}) => ctx.apps!.setUpdatePolicy(input.appId, input.policy)),

	// 326-01 APPS-02 (D-05/D-21): pin/un-pin an exact ignored version. adminProcedure —
	// same shared-global-app update-governance class as setUpdatePolicy.
	setIgnoredVersion: adminProcedure
		.input(z.object({appId: z.string(), version: z.string().optional()}))
		.mutation(async ({ctx, input}) => ctx.apps!.setIgnoredVersion(input.appId, input.version)),

	// 326-01 MEDIA-01 (D-19/D-21): dismiss the Immich onboarding QR card. privateProcedure —
	// a per-UI onboarding-card dismissal with no host/security surface.
	setImmichCardDismissed: privateProcedure
		.input(z.object({appId: z.string(), dismissed: z.boolean()}))
		.mutation(async ({ctx, input}) => ctx.apps!.setImmichCardDismissed(input.appId, input.dismissed)),

	// 316-02 (GPU-02): ids of apps already claiming the GPU, for the exclusivity warning.
	listAppsWithGpuAccess: privateProcedure.query(async ({ctx}) => ctx.apps!.listAppsWithGpuAccess()),

	// 322-05 (IDENT-02, D-322-8, T-322-12): toggle a single app's "Enable SSO"
	// override. adminProcedure — OIDC client registration is a HOST-WIDE identity
	// surface (same admin-only class as the sibling setGpuAccess). Also server-gated
	// on a configured domain: with no stable HTTPS issuer there is no valid client to
	// register, so a no-domain box fails CLOSED (PRECONDITION_FAILED) rather than
	// registering a broken client. On EVERY toggle (Vaultwarden AND the CLI/REST apps)
	// it re-resolves the enabled-apps set and rebuilds the in-process OIDC provider so
	// the static clients array always reflects the current enabled set — a cheap
	// Provider re-instantiation, NO container restart for the CLI/REST apps.
	setOidcEnabled: adminProcedure
		.input(
			z.object({
				appId: z.string(),
				enabled: z.boolean(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const mainDomain = await ctx.server!.getActiveMainDomain()
			if (!mainDomain) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'OIDC SSO requires a configured domain'})
			}
			// WR-04 (322-review): the OIDC provider can be inactive even WITH a domain
			// configured — e.g. the domain was activated AFTER boot (initOidc only runs at
			// boot). getOidcService()?.rebuild(...) would then be a SILENT no-op (optional
			// chaining swallows the null) while /oidc was never mounted for this process,
			// so the toggle would report success yet every login against the client fails.
			// Fail CLOSED before persisting so the admin learns SSO can't be (de)registered.
			const {getOidcService} = await import('../oidc/index.js')
			const service = getOidcService()
			if (!service || !service.provider) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'OIDC provider is not active — restart LivOS after configuring a domain',
				})
			}
			const ok = await ctx.apps!.setOidcEnabled(input.appId, input.enabled)
			await service.rebuild(await ctx.apps!.listOidcEnabledApps())
			return ok
		}),

	// 322-05 (IDENT-02, Pitfall 7, T-322-21): store Immich's admin API key
	// DEK-encrypted. adminProcedure — a privileged app credential. WRITE-ONLY: the
	// route NEVER logs or echoes the key back; the only read surface is the boolean
	// immichApiKeySet in apps.list. 322-06's REST provisioning consumes it server-side
	// via getImmichApiKey().
	setImmichApiKey: adminProcedure
		.input(
			z.object({
				appId: z.literal('immich'),
				apiKey: z.string().trim().min(1).max(512),
			}),
		)
		.mutation(async ({ctx, input}) => ({success: await ctx.apps!.setImmichApiKey(input.appId, input.apiKey)})),

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

	// ─── Phase 258 WS-C (258-03) — public (login-bypassed) app access ──────
	//
	// setPublicAccess is the SECURITY SPINE: it rejects a public-forbidden app
	// (load-bearing: neverPublic/requiresLocalAiClis/the 256-04 daemon-bearer;
	// defense-in-depth: compose docker.sock/privileged/host-net) with a 403 TRPCError
	// BEFORE any persist/regen, and gates non-owner-non-admin callers. The UI lock
	// (258-04) is cosmetic — THIS is the real enforcement, re-asserted again at every
	// caddy regen in registerAppSubdomain (computeEffectivePublicAccess, fail-closed).
	setPublicAccess: privateProcedure
		.input(z.object({
			appId: z.string(),
			mode: z.enum(['none', 'whole-app', 'paths']),
			paths: z.array(z.string()).optional(),
		}))
		.mutation(async ({ctx, input}) => {
			const {appId, mode, paths} = input

			// (a) Authority — owner OR admin. Phase 262-05 (LIVOS-057 companion,
			// WS-A5 parity): an absent currentUser is admin-equivalent ONLY via the
			// EXPLICIT ctx.legacySingleUser flag (parity with the 256-04 requireRole
			// guard) — a legacy no-userId token over the /trpc WS must NOT infer
			// isAdmin=true in multi-user mode.
			const userId = ctx.currentUser?.id
			const isAdmin = ctx.currentUser
				? ctx.currentUser.role === 'admin'
				: ctx.legacySingleUser === true
			if (!isAdmin) {
				if (!userId) {
					throw new TRPCError({code: 'FORBIDDEN', message: 'Authentication required'})
				}
				const inst = await getUserAppInstance(userId, appId)
				if (!inst) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Only the app owner or an admin can change public access',
					})
				}
			}

			// (b) Forbidden gate (the spine) — reject server-side BEFORE persist/regen.
			// Disabling (mode 'none') is ALWAYS allowed (it removes public access).
			if (mode !== 'none') {
				const {signals} = await ctx.apps.getPublicForbiddenSignals(appId)
				const verdict = isPublicForbidden(signals)
				if (verdict.forbidden) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: `This app cannot be made public (${verdict.reason})`,
					})
				}
			}

			// (c) Persist the per-install setting, THEN re-register the subdomain so
			// the runtime Caddy regen picks up the new publicAccess field (no reinstall).
			// registerAppSubdomain re-asserts isPublicForbidden (fail-closed) as a
			// second line of defense.
			await ctx.apps.setPublicAccessSetting(appId, {mode, paths})

			const subs = await ctx.apps.getAllSubdomains()
			const existing = subs.find((s) => s.appId === appId)
			let publicUrl: string | undefined
			if (existing) {
				await ctx.apps.registerAppSubdomain(appId, existing.port, existing.subdomain, existing.host)
				publicUrl = existing.host ?? existing.subdomain
			}

			return {success: true, mode, publicUrl}
		}),

	// Read side for the 258-04 toggle: the resolved current config + whether the
	// app is forbidden (with reason) + the manifest's suggested default paths so the
	// UI can render the locked state and pre-fill the path list.
	getPublicAccess: privateProcedure
		.input(z.object({appId: z.string()}))
		.query(async ({ctx, input}) => {
			const {signals, manifest} = await ctx.apps.getPublicForbiddenSignals(input.appId)
			const verdict = isPublicForbidden(signals)
			const setting = await ctx.apps.getPublicAccessSetting(input.appId)
			const resolved = resolvePublicAccess(manifest, setting)
			const subs = await ctx.apps.getAllSubdomains()
			const existing = subs.find((s) => s.appId === input.appId)
			return {
				forbidden: verdict.forbidden,
				reason: verdict.reason,
				mode: resolved.mode,
				paths: resolved.paths,
				hasOwnAuth: resolved.hasOwnAuth,
				suggestedPaths: manifest?.publicAccess?.paths ?? [],
				publicUrl: existing ? (existing.host ?? existing.subdomain) : undefined,
			}
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
						// Use builtin icon if available; Phase 276 dropped the dead
						// gallery fallback (leave icon '' → LauncherIcon placeholder).
						const builtinApp = getBuiltinApp(inst.appId)
						if (!icon && builtinApp?.icon) icon = builtinApp.icon
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

	// Phase 262-02 (LIVOS-042): adminProcedure — native/script/apt-repo installs
	// are inherently privileged (sudo apt sinks, bash-as-bruce). LIV_API_KEY and
	// legacy single-user map to admin via requireRole's ctx.legacySingleUser
	// admit, so the operator flow is unaffected.
	installV37: adminProcedure
		.input(
			z.object({
				appId: z.string(),
				section: z.enum(['app', 'webapp', 'native', 'ai', 'plugin']),
				name: z.string(),
				category: z.string(),
				manifest: z.unknown(),
				// Phase 259 — hosted icon image URL from the store row, used by the
				// native desktop tile (optional; older store builds omit it).
				iconUrl: z.string().optional(),
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

			// Phase 262-02 (LIVOS-042) — privileged sections NEVER trust the client
			// manifest: re-fetch by appId from the trusted catalog; fail closed when
			// unresolvable. The 256-04 ctx-resolved admin pattern (legacy single-user
			// is admin-equivalent ONLY via the explicit legacySingleUser flag).
			const isAdmin = ctx.currentUser ? ctx.currentUser.role === 'admin' : ctx.legacySingleUser === true
			let manifest = input.manifest
			if (input.section === 'native') {
				const trusted = await ctx.apps.fetchPlatformAppManifest(input.appId)
				if (!trusted) {
					return {
						ok: false as const,
						code: 'manifest_unresolved' as const,
						message: `native install refused: no trusted catalog manifest for ${input.appId}`,
					}
				}
				manifest = trusted
			}
			// Defense-in-depth under adminProcedure (mirrors the apps.ts legacy-path
			// gate call): InstallForbidden surfaces as FORBIDDEN, not a 500.
			try {
				assertInstallAllowed({
					isAdmin,
					isGeneratedTemplate: false,
					manifest: manifest as {requiresLocalAiClis?: boolean; requiresAiProvider?: boolean},
				})
			} catch (err) {
				if (err instanceof InstallForbidden) {
					throw new TRPCError({code: 'FORBIDDEN', message: err.message})
				}
				throw err
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
					// LIVOS-042: the SERVER-resolved manifest (trusted catalog row for
					// native) — never input.manifest for privileged sections.
					manifest,
					iconUrl: input.iconUrl,
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

	// Phase 262-02 (LIVOS-042): adminProcedure (mirrors installV37) — uninstall
	// of privileged sections removes .desktop files / apt state as the OS user.
	uninstallV37: adminProcedure
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
