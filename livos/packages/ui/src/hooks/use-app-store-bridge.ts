import {useCallback, useEffect, useRef} from 'react'

import {trpcClient, trpcReact} from '@/trpc/trpc'

// --- postMessage Bridge Protocol Types ---
// Duplicated from platform/web store types since LivOS UI cannot import from that package

type StoreToLivOSMessage =
	| {type: 'ready'}
	| {type: 'install'; appId: string; composeUrl: string}
	| {type: 'uninstall'; appId: string}
	| {type: 'open'; appId: string}

type AppStatusEntry = {id: string; status: 'running' | 'stopped' | 'not_installed'}

type LivOSToStoreMessage =
	| {type: 'status'; apps: AppStatusEntry[]}
	| {type: 'installed'; appId: string; success: boolean; error?: string}
	| {type: 'uninstalled'; appId: string; success: boolean}

function isAllowedOrigin(origin: string): boolean {
	if (origin === 'https://livinity.io') return true
	if (origin === 'https://apps.livinity.io') return true
	if (/^https:\/\/[a-z0-9-]+\.livinity\.io$/.test(origin)) return true
	// Allow localhost in development
	if (import.meta.env.DEV && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
	return false
}

interface AppStoreBridgeOptions {
	apiKey: string | null
	instanceName: string
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

	// Use refs to avoid stale closures in the message event listener
	const iframeRefStable = useRef(iframeRef)
	iframeRefStable.current = iframeRef

	const utilsRef = useRef(utils)
	utilsRef.current = utils

	const domainRef = useRef(domainQ.data)
	domainRef.current = domainQ.data

	const optionsRef = useRef(options)
	optionsRef.current = options

	const reportEvent = useCallback((appId: string, action: 'install' | 'uninstall') => {
		const {apiKey, instanceName} = optionsRef.current
		if (!apiKey) return
		fetch('https://apps.livinity.io/api/install-event', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Api-Key': apiKey,
			},
			body: JSON.stringify({
				app_id: appId,
				action,
				instance_name: instanceName,
			}),
		}).catch(() => {}) // Fire-and-forget: silently ignore errors
	}, [])

	const sendToIframe = useCallback((message: LivOSToStoreMessage) => {
		const iframe = iframeRefStable.current?.current
		if (!iframe?.contentWindow) return
		iframe.contentWindow.postMessage(message, '*')
	}, [])

	const sendStatusToIframe = useCallback(async () => {
		try {
			const apps = await trpcClient.apps.list.query()
			const statusList: AppStatusEntry[] = apps.map((app) => {
				if ('error' in app) {
					return {id: app.id, status: 'not_installed' as const}
				}
				const state = app.state
				if (state === 'running' || state === 'ready') {
					return {id: app.id, status: 'running' as const}
				}
				if (state === 'stopped' || state === 'stopping') {
					return {id: app.id, status: 'stopped' as const}
				}
				return {id: app.id, status: 'not_installed' as const}
			})
			sendToIframe({type: 'status', apps: statusList})
		} catch {
			// If we can't fetch apps, send empty status
			sendToIframe({type: 'status', apps: []})
		}
	}, [sendToIframe])

	const handleInstall = useCallback(
		async (appId: string) => {
			try {
				await trpcClient.apps.install.mutate({appId})
				reportEvent(appId, 'install')
				sendToIframe({type: 'installed', appId, success: true})
			} catch (err) {
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

	const handleOpen = useCallback((appId: string) => {
		const domain = domainRef.current?.domain
		if (domain) {
			window.open(`https://${appId}.${domain}`, '_blank')
		} else {
			// Fallback: open on current origin with app subdomain-style path
			window.open(`${window.location.origin}/${appId}`, '_blank')
		}
	}, [])

	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			if (!isAllowedOrigin(event.origin)) return
			const data = event.data as StoreToLivOSMessage
			if (!data || typeof data.type !== 'string') return

			switch (data.type) {
				case 'ready':
					sendStatusToIframe()
					break
				case 'install':
					handleInstall(data.appId)
					break
				case 'uninstall':
					handleUninstall(data.appId)
					break
				case 'open':
					handleOpen(data.appId)
					break
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [sendStatusToIframe, handleInstall, handleUninstall, handleOpen])
}
