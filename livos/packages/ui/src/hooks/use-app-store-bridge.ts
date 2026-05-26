import {useCallback, useEffect, useRef, useState} from 'react'

import {trpcClient, trpcReact} from '@/trpc/trpc'

// --- postMessage Bridge Protocol Types ---
// Duplicated from platform/web store types since LivOS UI cannot import from that package

// Phase 148/157 — v37 section enum mirrored from platform/web store types.
type Section = 'app' | 'webapp' | 'native' | 'ai' | 'plugin'

type StoreToLivOSMessage =
	| {type: 'ready'}
	// Phase 157 — install now carries section so the LivOS host dispatches
	// to the right installer. composeUrl is only meaningful for section='app'.
	// Old payloads without section default to 'app' (back-compat).
	| {
			type: 'install'
			appId: string
			section?: Section
			composeUrl?: string
			// Phase 157 follow-up — name/category/manifest travel WITH
			// the install message for non-Docker sections so the bridge
			// does not need a cross-origin fetch back to livinity.io.
			name?: string
			category?: string
			manifest?: unknown
		}
	| {type: 'uninstall'; appId: string; section?: Section}
	| {type: 'open'; appId: string}
	| {type: 'updateSubdomain'; appId: string; subdomain: string}
	// Phase 151-B — Custom URL form on /store?section=webapp.
	| {
			type: 'installCustomWebapp'
			url: string
			title: string
			faviconUrl?: string | null
		}

// Phase 157 follow-up — install message can carry the pre-fetched
// catalog row alongside section. Without it the bridge cannot resolve
// manifests for non-Docker sections (LivOS UI CSP blocks cross-origin
// fetch back to livinity.io apex).
type InstallPayload = {appId: string; section: Section; name?: string; category?: string; manifest?: unknown}

type AppStatusEntry = {id: string; status: 'running' | 'stopped' | 'not_installed' | 'installing' | 'uninstalling'; progress?: number; subdomain?: string; defaultUsername?: string; defaultPassword?: string}

type InstanceInfo = {
	hostname: string
	userName: string
	avatarColor: string
	version: string
	versionName: string
	cpu: string
	memory: {total: number; used: number}
	disk: {total: number; used: number}
}

type LivOSToStoreMessage =
	| {type: 'status'; apps: AppStatusEntry[]; instance?: InstanceInfo}
	| {type: 'installed'; appId: string; success: boolean; error?: string}
	| {type: 'uninstalled'; appId: string; success: boolean}
	| {type: 'progress'; appId: string; progress: number}
	| {type: 'credentials'; appId: string; username: string; password: string}
	| {type: 'reportEvent'; appId: string; action: 'install' | 'uninstall'; apiKey: string; instanceName: string}

function isAllowedOrigin(origin: string): boolean {
	if (origin === 'https://livinity.io') return true
	if (/^https:\/\/[a-z0-9-]+\.livinity\.io$/.test(origin)) return true
	// Allow localhost in development
	if (import.meta.env.DEV && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
	return false
}

type EnvOverride = {
	name: string
	label: string
	type: 'string' | 'password'
	default?: string
	required?: boolean
}

interface AppStoreBridgeOptions {
	apiKey: string | null
	instanceName: string
	/**
	 * Phase 43.7: optional async callback the bridge invokes BEFORE installing
	 * an app that declares `installOptions.environmentOverrides`. The callback
	 * should render a dialog, collect values from the user, and resolve to the
	 * `Record<string, string>` of values to pass through to the install
	 * mutation. Throwing/rejecting cancels the install (e.g. user dismissed).
	 *
	 * If unset, the bridge installs without overrides (legacy behavior — apps
	 * that need ZEP_API_KEY / N8N_BASIC_AUTH_PASSWORD will start mis-configured).
	 */
	onEnvOverridesNeeded?: (
		appId: string,
		overrides: EnvOverride[],
	) => Promise<Record<string, string>>
}

/**
 * Listens for postMessage commands from the App Store iframe and executes
 * install/uninstall/open operations via tRPC. Sends status updates and
 * operation results back to the iframe.
 */
export function useAppStoreBridge(
	iframeRef: React.RefObject<HTMLIFrameElement | null>,
	options: AppStoreBridgeOptions,
): void {
	const utils = trpcReact.useUtils()
	const domainQ = trpcReact.domain.getStatus.useQuery()
	// Watch apps list for changes (desktop installs/uninstalls trigger invalidation)
	const appsListQ = trpcReact.apps.list.useQuery(undefined, {refetchInterval: 10_000})

	// Use refs to avoid stale closures in the message event listener
	const iframeRefStable = useRef(iframeRef)
	iframeRefStable.current = iframeRef

	const utilsRef = useRef(utils)
	utilsRef.current = utils

	const domainRef = useRef(domainQ.data)
	domainRef.current = domainQ.data

	const optionsRef = useRef(options)
	optionsRef.current = options

	const sendToIframe = useCallback((message: LivOSToStoreMessage) => {
		const iframe = iframeRefStable.current?.current
		if (!iframe?.contentWindow) return
		iframe.contentWindow.postMessage(message, '*')
	}, [])

	const reportEvent = useCallback((appId: string, action: 'install' | 'uninstall') => {
		const {apiKey, instanceName} = optionsRef.current
		if (!apiKey) return
		// Send via iframe (same-origin to livinity.io) to avoid CORS issues
		sendToIframe({type: 'reportEvent', appId, action, apiKey, instanceName})
	}, [sendToIframe])

	const sendStatusToIframe = useCallback(async () => {
		try {
			// Phase 157 follow-up — pull v37 install state alongside the
			// legacy apps.list so MCP/native cards keep showing
			// "Installed" after the install round-trip completes (apps.
			// list doesn't include v37 surfaces).
			const [apps, domainStatus, version, device, memory, disk, userData, v37] = await Promise.all([
				trpcClient.apps.list.query(),
				trpcClient.domain.getStatus.query(),
				trpcClient.system.version.query(),
				trpcClient.system.device.query().catch(() => null),
				trpcClient.system.systemMemoryUsage.query().catch(() => null),
				trpcClient.system.systemDiskUsage.query().catch(() => null),
				trpcClient.user.get.query().catch(() => null),
				trpcClient.apps.v37List.query().catch(() => ({ai: [] as string[], native: [] as string[], webapp: [] as string[]})),
			])
			const subdomains = domainStatus.subdomains || []
			const statusList: AppStatusEntry[] = apps.map((app) => {
				if ('error' in app) {
					return {id: app.id, status: 'not_installed' as const}
				}
				const sub = subdomains.find((s: {appId: string}) => s.appId === app.id)
				const creds = 'credentials' in app && app.credentials ? app.credentials : null
				const credFields = creds?.defaultUsername || creds?.defaultPassword
					? {defaultUsername: creds.defaultUsername || '', defaultPassword: creds.defaultPassword || ''}
					: {}
				const state = app.state
				if (state === 'installing') {
					return {id: app.id, status: 'installing' as const, subdomain: sub?.subdomain, ...credFields}
				}
				if (state === 'running' || state === 'ready') {
					return {id: app.id, status: 'running' as const, subdomain: sub?.subdomain, ...credFields}
				}
				if (state === 'stopped' || state === 'stopping') {
					return {id: app.id, status: 'stopped' as const, subdomain: sub?.subdomain, ...credFields}
				}
				return {id: app.id, status: 'not_installed' as const}
			})

			// Phase 157 follow-up — merge v37 installed catalog appIds.
			// Use a Set to avoid duplicating an id that's also surfaced
			// in apps.list (defensive — should not happen for the v37
			// sections currently tracked but keeps merge safe).
			const seen = new Set(statusList.map((s) => s.id))
			const v37Webapp = (v37 as {webapp?: string[]}).webapp ?? []
			for (const appId of [...v37.ai, ...v37.native, ...v37Webapp]) {
				if (!seen.has(appId)) {
					statusList.push({id: appId, status: 'running' as const})
					seen.add(appId)
				}
			}

			const instance: InstanceInfo = {
				hostname: (device as any)?.hostname || 'LivOS Server',
				userName: (userData as any)?.name || (userData as any)?.displayName || '',
				avatarColor: (userData as any)?.avatarColor || '#6366f1',
				version: version.version,
				versionName: version.name,
				cpu: (device as any)?.id || 'Unknown',
				memory: {total: (memory as any)?.totalMemory || 0, used: (memory as any)?.usedMemory || 0},
				disk: {total: (disk as any)?.totalDisk || 0, used: (disk as any)?.usedDisk || 0},
			}
			sendToIframe({type: 'status', apps: statusList, instance})
		} catch {
			// If we can't fetch apps, send empty status
			sendToIframe({type: 'status', apps: []})
		}
	}, [sendToIframe])

	// Phase 157 follow-up — section='webapp' curated entries (e.g.
	// Notion). Reads manifest.url from the payload that travelled with
	// the install message (Vercel pre-fetched). No cross-origin fetch.
	const handleInstallWebappFromCatalog = useCallback(
		async (payload: InstallPayload) => {
			const {appId, manifest, name} = payload
			const m = (manifest ?? {}) as {
				url?: string
				defaultTitle?: string
				iconOverride?: string | null
			}
			if (!m.url) {
				sendToIframe({
					type: 'installed',
					appId,
					success: false,
					error: 'Curated webapp manifest missing required `url`',
				})
				return
			}
			try {
				const wa = await trpcClient.webapp.create.mutate({
					url: m.url,
					title: m.defaultTitle ?? name ?? appId,
					faviconUrl: m.iconOverride ?? null,
				})
				// Phase 157 round 4 — write the catalog mapping so
				// `apps.v37List` reports this install on the next status
				// refresh (otherwise the card reverts to "Add to desktop"
				// after the iframe's apps.list refetch).
				await trpcClient.apps.markWebappCatalog
					.mutate({catalogAppId: appId, webappId: wa.id})
					.catch(() => {})
				sendToIframe({type: 'installed', appId, success: true})
				reportEvent(appId, 'install')
			} catch (err) {
				const message = err instanceof Error ? err.message : 'webapp install failed'
				sendToIframe({type: 'installed', appId, success: false, error: message})
			}
		},
		[reportEvent, sendToIframe],
	)

	// Phase 151-B — Custom URL form ("Add to dock"). No catalog lookup;
	// the iframe already collected URL + title + favicon.
	const handleInstallCustomWebapp = useCallback(
		async (url: string, title: string, faviconUrl: string | null | undefined) => {
			try {
				const wa = await trpcClient.webapp.create.mutate({
					url,
					title,
					faviconUrl: faviconUrl ?? null,
				})
				// The iframe keys installed-state by the temporary "custom-<url>"
				// id its CustomUrlForm uses. Echo back as `installed` so its
				// optimistic UI clears.
				sendToIframe({type: 'installed', appId: wa.id, success: true})
			} catch (err) {
				const message = err instanceof Error ? err.message : 'webapp install failed'
				sendToIframe({type: 'installed', appId: url, success: false, error: message})
			}
		},
		[sendToIframe],
	)

	// Phase 157 follow-up — section in {native, ai, plugin}. Hand off
	// to apps.installV37 using the payload that travelled with the
	// install message, then poll v37Progress until done.
	const handleInstallV37 = useCallback(
		async (payload: InstallPayload) => {
			const {appId, section, name, category, manifest} = payload
			if (!name || !category || manifest === undefined) {
				sendToIframe({
					type: 'installed',
					appId,
					success: false,
					error: `Install message missing manifest payload for section "${section}"`,
				})
				return
			}
			sendToIframe({type: 'progress', appId, progress: 0})
			sendToIframe({type: 'status', apps: [{id: appId, status: 'installing', progress: 0}]})

			// Phase 157 round 3 — polling is independent of the mutation
			// outcome. apt-get install / sha256 verify can take 60–300s on
			// slower links; trpc/network can drop mid-flight even though
			// the server-side install keeps running. Polling stops on
			// v37Progress.done === true OR after a hard deadline.
			let resolved = false
			const POLL_DEADLINE_MS = 10 * 60_000
			const startedAt = Date.now()
			const pollInterval = setInterval(async () => {
				if (resolved) {
					clearInterval(pollInterval)
					return
				}
				if (Date.now() - startedAt > POLL_DEADLINE_MS) {
					clearInterval(pollInterval)
					return
				}
				try {
					const ev = await trpcClient.apps.v37Progress.query({appId})
					if (!ev) return
					if (ev.pct > 0) {
						sendToIframe({type: 'progress', appId, progress: Math.round(ev.pct)})
					}
					if (ev.done) {
						resolved = true
						clearInterval(pollInterval)
						if (ev.error) {
							sendToIframe({type: 'installed', appId, success: false, error: ev.error})
						} else {
							sendToIframe({type: 'progress', appId, progress: 100})
							sendToIframe({type: 'installed', appId, success: true})
							reportEvent(appId, 'install')
						}
						await sendStatusToIframe()
						utilsRef.current.apps.list.invalidate()
						utilsRef.current.apps.myApps.invalidate()
					}
				} catch {
					// ignore polling errors — server is source of truth
				}
			}, 2000)

			try {
				const outcome = await trpcClient.apps.installV37.mutate({
					appId,
					section,
					name,
					category,
					manifest,
				})
				if (resolved) return // polling already finalised
				resolved = true
				clearInterval(pollInterval)
				if (outcome.ok) {
					sendToIframe({type: 'progress', appId, progress: 100})
					sendToIframe({type: 'installed', appId, success: true})
					reportEvent(appId, 'install')
				} else {
					sendToIframe({
						type: 'installed',
						appId,
						success: false,
						error: outcome.message,
					})
				}
			} catch {
				// Mutation failed (network/timeout) — DO NOT clear polling.
				// The server-side install may still be running; let polling
				// detect the done state and report final outcome.
				return
			}
			await sendStatusToIframe()
			utilsRef.current.apps.list.invalidate()
			utilsRef.current.apps.myApps.invalidate()
		},
		[reportEvent, sendStatusToIframe, sendToIframe],
	)

	const handleInstall = useCallback(
		async (appId: string) => {
			// Phase 43.7: resolve env overrides for this app and prompt the user
			// BEFORE kicking off the install. Both BUILTIN_APPS and (post Phase 43.4)
			// registry-augmented manifests carry installOptions; the bridge resolves
			// from whichever is available and hands off to the dialog callback.
			let envValues: Record<string, string> | undefined
			try {
				const [registry, builtins] = await Promise.all([
					trpcClient.appStore.registry.query().catch(() => []),
					trpcClient.appStore.builtinApps.query().catch(() => []),
				])
				const allRegistryApps = (registry as Array<{apps: Array<any>}> | undefined)
					?.flatMap((r) => r?.apps ?? []) ?? []
				const registryApp = allRegistryApps.find((a) => a?.id === appId)
				const builtinApp = (builtins as Array<any>).find((b) => b?.id === appId)
				const overrides: EnvOverride[] | undefined =
					registryApp?.installOptions?.environmentOverrides ??
					builtinApp?.installOptions?.environmentOverrides
				if (overrides && overrides.length > 0 && optionsRef.current.onEnvOverridesNeeded) {
					envValues = await optionsRef.current.onEnvOverridesNeeded(appId, overrides)
				}
			} catch {
				// Best-effort prompt — fall through to install without overrides.
			}

			// Send installing status immediately
			sendToIframe({type: 'progress', appId, progress: 0})
			sendToIframe({type: 'status', apps: [{id: appId, status: 'installing', progress: 0}]})

			// Start polling for progress during install
			const pollInterval = setInterval(async () => {
				try {
					const stateResult = await trpcClient.apps.state.query({appId})
					if (stateResult.progress > 0) {
						sendToIframe({type: 'progress', appId, progress: Math.round(stateResult.progress)})
					}
					// Stop polling if no longer installing
					if (stateResult.state !== 'installing') {
						clearInterval(pollInterval)
					}
				} catch {
					// Ignore polling errors
				}
			}, 2000)

			try {
				await trpcClient.apps.install.mutate({
					appId,
					...(envValues ? {environmentOverrides: envValues} : {}),
				})
				clearInterval(pollInterval)
				sendToIframe({type: 'progress', appId, progress: 100})
				reportEvent(appId, 'install')

				// Fetch credentials for the newly installed app
				try {
					const appsList = await trpcClient.apps.list.query()
					const installedApp = appsList.find((a) => a.id === appId && !('error' in a))
					if (installedApp && 'credentials' in installedApp && installedApp.credentials) {
						const {defaultUsername, defaultPassword} = installedApp.credentials
						if (defaultUsername || defaultPassword) {
							sendToIframe({
								type: 'credentials',
								appId,
								username: defaultUsername || '',
								password: defaultPassword || '',
							})
						}
					}
				} catch {
					// Ignore credentials fetch errors
				}

				sendToIframe({type: 'installed', appId, success: true})
			} catch (err) {
				clearInterval(pollInterval)
				const message = err instanceof Error ? err.message : 'Install failed'
				sendToIframe({type: 'installed', appId, success: false, error: message})
			}
			// Always send updated status and invalidate queries after install attempt
			await sendStatusToIframe()
			utilsRef.current.apps.list.invalidate()
			utilsRef.current.apps.myApps.invalidate()
			utilsRef.current.apps.state.invalidate()
		},
		[sendToIframe, sendStatusToIframe, reportEvent],
	)

	const handleUninstall = useCallback(
		async (appId: string, section?: Section) => {
			// Send uninstalling status immediately so UI shows feedback
			sendToIframe({type: 'status', apps: [{id: appId, status: 'uninstalling'}]})
			try {
				// Phase 157 round 4 — webapp uninstall lives in the
				// webapps router (apps.uninstallV37 has no Webapp
				// handler). Look up the webappId via catalog mapping,
				// call webapp.delete, then clear the mapping.
				if (section === 'webapp') {
					// Find the persisted webapp row by its url/id. The
					// markWebappCatalog mapping stores `catalogAppId →
					// webappId`; webapp.list returns the user's rows so
					// we can match either way (defense if mapping
					// disappeared).
					const list = await trpcClient.webapp.list.query().catch(() => [])
					// Bridge has no direct way to read the mapping, but
					// webapp.delete is a no-op on missing rows so a
					// best-effort match is safe.
					const match = list.find((wa) => wa.id === appId)
					if (match) {
						await trpcClient.webapp.delete.mutate({id: match.id})
					}
					await trpcClient.apps.unmarkWebappCatalog
						.mutate({catalogAppId: appId})
						.catch(() => {})
					reportEvent(appId, 'uninstall')
					sendToIframe({type: 'uninstalled', appId, success: true})
				} else if (section && section !== 'app') {
					// native / ai / plugin → dispatcher path
					const outcome = await trpcClient.apps.uninstallV37.mutate({appId, section})
					if (!outcome.ok) {
						sendToIframe({type: 'uninstalled', appId, success: false})
					} else {
						reportEvent(appId, 'uninstall')
						sendToIframe({type: 'uninstalled', appId, success: true})
					}
				} else {
					await trpcClient.apps.uninstall.mutate({appId})
					reportEvent(appId, 'uninstall')
					sendToIframe({type: 'uninstalled', appId, success: true})
				}
			} catch {
				sendToIframe({type: 'uninstalled', appId, success: false})
			}
			// Always send updated status and invalidate queries after uninstall attempt
			await sendStatusToIframe()
			utilsRef.current.apps.list.invalidate()
			utilsRef.current.apps.myApps.invalidate()
			utilsRef.current.apps.state.invalidate()
		},
		[sendToIframe, sendStatusToIframe, reportEvent],
	)

	const handleOpen = useCallback(async (appId: string) => {
		const domain = domainRef.current?.domain
		if (!domain) {
			window.open(`${window.location.origin}/${appId}`, '_blank')
			return
		}

		// Phase 218 follow-up — store iframe bridge was emitting the legacy
		// dot-format `<slug>.<userdomain>` (e.g. `n8n.bruce.livinity.io`),
		// which is a sub-of-sub the CF wildcard cert doesn't cover and the
		// new state-derived Caddyfile doesn't route. Convert to the same
		// hyphen-pattern shape `appToUrl()` (utils/misc.ts) emits for dock
		// clicks: `<slug>-<userPart>.livinity.io` when running under the
		// livinity.io platform, dot pattern otherwise (custom domains).
		try {
			const domainStatus = await trpcClient.domain.getStatus.query()
			const sub = (domainStatus.subdomains || []).find((s: {appId: string}) => s.appId === appId)
			// Phase 141-03 canonical FQDN (Server5-minted) takes precedence
			// when present — same precedence appToUrl uses for app.host.
			if (sub?.host) {
				window.open(`https://${sub.host}`, '_blank')
				return
			}
			const subdomain = sub?.subdomain ?? appId
			const livinityIoSuffix = '.livinity.io'
			if (domain.endsWith(livinityIoSuffix)) {
				const userPart = domain.slice(0, -livinityIoSuffix.length)
				window.open(`https://${subdomain}-${userPart}.livinity.io`, '_blank')
			} else {
				window.open(`https://${subdomain}.${domain}`, '_blank')
			}
		} catch {
			const livinityIoSuffix = '.livinity.io'
			if (domain.endsWith(livinityIoSuffix)) {
				const userPart = domain.slice(0, -livinityIoSuffix.length)
				window.open(`https://${appId}-${userPart}.livinity.io`, '_blank')
			} else {
				window.open(`https://${appId}.${domain}`, '_blank')
			}
		}
	}, [])

	const handleUpdateSubdomain = useCallback(
		async (appId: string, subdomain: string) => {
			try {
				const domainStatus = await trpcClient.domain.getStatus.query()
				const existing = (domainStatus.subdomains || []).find((s: {appId: string}) => s.appId === appId)
				await trpcClient.domain.setAppSubdomain.mutate({
					appId,
					subdomain,
					port: existing?.port ?? 8080,
					enabled: true,
				})
				await sendStatusToIframe()
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Failed to update subdomain'
				sendToIframe({type: 'installed', appId, success: false, error: message})
			}
		},
		[sendToIframe, sendStatusToIframe],
	)

	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			if (!isAllowedOrigin(event.origin)) return
			const data = event.data as StoreToLivOSMessage
			if (!data || typeof data.type !== 'string') return

			switch (data.type) {
				case 'ready':
					sendStatusToIframe()
					break
				case 'install': {
					// Phase 157 — section-aware dispatch. Missing section
					// is treated as 'app' for back-compat with older builds.
					const section: Section = data.section ?? 'app'
					if (section === 'app') {
						handleInstall(data.appId)
					} else if (section === 'webapp') {
						handleInstallWebappFromCatalog({
							appId: data.appId,
							section,
							name: data.name,
							category: data.category,
							manifest: data.manifest,
						})
					} else {
						handleInstallV37({
							appId: data.appId,
							section,
							name: data.name,
							category: data.category,
							manifest: data.manifest,
						})
					}
					break
				}
				case 'installCustomWebapp':
					handleInstallCustomWebapp(data.url, data.title, data.faviconUrl)
					break
				case 'uninstall':
					handleUninstall(data.appId, data.section)
					break
				case 'open':
					handleOpen(data.appId)
					break
				case 'updateSubdomain':
					handleUpdateSubdomain(data.appId, data.subdomain)
					break
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [
		sendStatusToIframe,
		handleInstall,
		handleInstallV37,
		handleInstallWebappFromCatalog,
		handleInstallCustomWebapp,
		handleUninstall,
		handleOpen,
		handleUpdateSubdomain,
	])

	// Auto-sync status to iframe when apps list changes (covers desktop install/uninstall)
	const [iframeReady, setIframeReady] = useState(false)
	const prevAppsDataRef = useRef<string>('')
	useEffect(() => {
		if (!iframeReady || !appsListQ.data) return
		const key = appsListQ.data.map((a) => `${a.id}:${'state' in a ? a.state : 'err'}`).join(',')
		if (key !== prevAppsDataRef.current) {
			prevAppsDataRef.current = key
			sendStatusToIframe()
		}
	}, [appsListQ.data, iframeReady, sendStatusToIframe])

	// Track iframe ready state
	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (!isAllowedOrigin(event.origin)) return
			if (event.data?.type === 'ready') setIframeReady(true)
		}
		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
	}, [])
}
