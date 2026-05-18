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
	| {type: 'install'; appId: string; section?: Section; composeUrl?: string}
	| {type: 'uninstall'; appId: string}
	| {type: 'open'; appId: string}
	| {type: 'updateSubdomain'; appId: string; subdomain: string}
	// Phase 151-B — Custom URL form on /store?section=webapp.
	| {
			type: 'installCustomWebapp'
			url: string
			title: string
			faviconUrl?: string | null
		}

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
			const [apps, domainStatus, version, device, memory, disk, userData] = await Promise.all([
				trpcClient.apps.list.query(),
				trpcClient.domain.getStatus.query(),
				trpcClient.system.version.query(),
				trpcClient.system.device.query().catch(() => null),
				trpcClient.system.systemMemoryUsage.query().catch(() => null),
				trpcClient.system.systemDiskUsage.query().catch(() => null),
				trpcClient.user.get.query().catch(() => null),
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

	// Phase 157 — remember the most-recent iframe origin so v37 install
	// flows can fetch catalog rows from the SAME store the user is
	// browsing. Defaults to https://livinity.io when no iframe has
	// posted yet (handlers tolerate fetch errors and fall back to a
	// minimal manifest).
	const catalogOriginRef = useRef<string>('https://livinity.io')

	// Phase 157 — fetch a full catalog row (with manifest) for sections
	// other than 'app'. Used by handleInstall to feed apps.installV37 the
	// section/manifest it cannot infer from {appId} alone.
	const fetchCatalogApp = useCallback(
		async (appId: string): Promise<{id: string; name: string; section: Section; category: string; manifest: unknown} | null> => {
			const {apiKey} = optionsRef.current
			if (!apiKey) return null
			const origin = catalogOriginRef.current
			try {
				const res = await fetch(`${origin}/api/apps/${encodeURIComponent(appId)}`, {
					headers: {'X-Api-Key': apiKey},
				})
				if (!res.ok) return null
				const row = (await res.json()) as {
					id: string
					name: string
					section?: Section
					category: string
					manifest?: unknown
				}
				return {
					id: row.id,
					name: row.name,
					section: row.section ?? 'app',
					category: row.category,
					manifest: row.manifest ?? {},
				}
			} catch {
				return null
			}
		},
		[],
	)

	// Phase 157 — section='webapp' curated entries (e.g. Notion). Reads
	// manifest.url and pins as a dock window via existing webapp.create.
	const handleInstallWebappFromCatalog = useCallback(
		async (appId: string) => {
			const row = await fetchCatalogApp(appId)
			if (!row) {
				sendToIframe({
					type: 'installed',
					appId,
					success: false,
					error: 'Failed to fetch catalog row for webapp install',
				})
				return
			}
			const m = (row.manifest ?? {}) as {
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
				await trpcClient.webapp.create.mutate({
					url: m.url,
					title: m.defaultTitle ?? row.name,
					faviconUrl: m.iconOverride ?? null,
				})
				sendToIframe({type: 'installed', appId, success: true})
				reportEvent(appId, 'install')
			} catch (err) {
				const message = err instanceof Error ? err.message : 'webapp install failed'
				sendToIframe({type: 'installed', appId, success: false, error: message})
			}
		},
		[fetchCatalogApp, reportEvent, sendToIframe],
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

	// Phase 157 — section in {native, ai, plugin}. Fetch catalog row,
	// hand off to apps.installV37, then poll v37Progress until done.
	const handleInstallV37 = useCallback(
		async (appId: string, section: Section) => {
			const row = await fetchCatalogApp(appId)
			if (!row) {
				sendToIframe({
					type: 'installed',
					appId,
					success: false,
					error: `Failed to fetch catalog row for ${section} install`,
				})
				return
			}
			sendToIframe({type: 'progress', appId, progress: 0})
			sendToIframe({type: 'status', apps: [{id: appId, status: 'installing', progress: 0}]})

			const pollInterval = setInterval(async () => {
				try {
					const ev = await trpcClient.apps.v37Progress.query({appId})
					if (ev && ev.pct > 0) {
						sendToIframe({type: 'progress', appId, progress: Math.round(ev.pct)})
					}
					if (ev && ev.done) clearInterval(pollInterval)
				} catch {
					// ignore polling errors
				}
			}, 2000)

			try {
				const outcome = await trpcClient.apps.installV37.mutate({
					appId: row.id,
					section,
					name: row.name,
					category: row.category,
					manifest: row.manifest,
				})
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
			} catch (err) {
				clearInterval(pollInterval)
				const message = err instanceof Error ? err.message : 'install failed'
				sendToIframe({type: 'installed', appId, success: false, error: message})
			}
			await sendStatusToIframe()
			utilsRef.current.apps.list.invalidate()
		},
		[fetchCatalogApp, reportEvent, sendStatusToIframe, sendToIframe],
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
			utilsRef.current.apps.state.invalidate()
		},
		[sendToIframe, sendStatusToIframe, reportEvent],
	)

	const handleUninstall = useCallback(
		async (appId: string) => {
			// Send uninstalling status immediately so UI shows feedback
			sendToIframe({type: 'status', apps: [{id: appId, status: 'uninstalling'}]})
			try {
				await trpcClient.apps.uninstall.mutate({appId})
				reportEvent(appId, 'uninstall')
				sendToIframe({type: 'uninstalled', appId, success: true})
			} catch {
				sendToIframe({type: 'uninstalled', appId, success: false})
			}
			// Always send updated status and invalidate queries after uninstall attempt
			await sendStatusToIframe()
			utilsRef.current.apps.list.invalidate()
			utilsRef.current.apps.state.invalidate()
		},
		[sendToIframe, sendStatusToIframe, reportEvent],
	)

	const handleOpen = useCallback(async (appId: string) => {
		const domain = domainRef.current?.domain
		if (domain) {
			// Use actual subdomain from config (e.g. jellyfin uses "media" not "jellyfin")
			try {
				const domainStatus = await trpcClient.domain.getStatus.query()
				const sub = (domainStatus.subdomains || []).find((s: {appId: string}) => s.appId === appId)
				const subdomain = sub?.subdomain ?? appId
				window.open(`https://${subdomain}.${domain}`, '_blank')
			} catch {
				window.open(`https://${appId}.${domain}`, '_blank')
			}
		} else {
			window.open(`${window.location.origin}/${appId}`, '_blank')
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

			// Phase 157 — remember the latest known store origin so the
			// v37 install path knows where to fetch catalog rows from.
			catalogOriginRef.current = event.origin

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
						handleInstallWebappFromCatalog(data.appId)
					} else {
						handleInstallV37(data.appId, section)
					}
					break
				}
				case 'installCustomWebapp':
					handleInstallCustomWebapp(data.url, data.title, data.faviconUrl)
					break
				case 'uninstall':
					handleUninstall(data.appId)
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
