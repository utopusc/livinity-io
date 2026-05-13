import {useRef, useState} from 'react'
import {Navigate} from 'react-router-dom'

import {Loading} from '@/components/ui/loading'
import {useAppStoreBridge} from '@/hooks/use-app-store-bridge'
import {EnvironmentOverridesDialog} from '@/modules/app-store/environment-overrides-dialog'
import {trpcReact} from '@/trpc/trpc'

// Phase 108 (App Store Local Mode — D-108-NO-API-KEY-FOR-LOCAL):
//
// The App Store dock icon used to render an iframe of
// https://livinity.io/store gated behind an API key from livinity.io. On
// fresh-VPS installs the API key is null, so the window showed a
// platform-connection dead-end prompt.
//
// The /app-store/* React-Router tree already provides a fully native
// Discover/Category/AppPage UI driven by `trpcReact.appStore.registry`
// (see providers/available-apps.tsx + routes/app-store/*). The registry
// is served from /opt/livos/data/app-stores/*/livinity-app.yml — the
// gallery cache populated by scripts/install/deploy-livinityd.sh's
// `_dld_update_gallery_cache` helper (Phase 105-02 G5).
//
// Behaviour now:
//   • No API key (fresh install)  → <Navigate to="/app-store" replace />
//     — defers to the native route. Zero outbound calls to livinity.io.
//   • API key set (platform opt-in) → load the iframe + bridge as before.
//
// The legacy platform-connection prompt has been removed.

type EnvOverride = {
	name: string
	label: string
	type: 'string' | 'password'
	default?: string
	required?: boolean
}

type PendingPrompt = {
	appId: string
	overrides: EnvOverride[]
	resolve: (values: Record<string, string>) => void
	reject: (err: Error) => void
}

export default function AppStoreWindowContent() {
	const apiKeyQ = trpcReact.domain.platform.getApiKey.useQuery()
	const domainQ = trpcReact.domain.getStatus.useQuery()

	if (apiKeyQ.isLoading || domainQ.isLoading) {
		return (
			<div className='flex h-full items-center justify-center'>
				<Loading />
			</div>
		)
	}

	const apiKey = apiKeyQ.data?.apiKey ?? null

	// Phase 108: local-mode default. When no API key is configured the
	// window delegates to the native /app-store route which is powered by
	// AvailableAppsProvider + trpcReact.appStore.registry (gallery cache).
	if (!apiKey) {
		return <Navigate to='/app-store' replace />
	}

	// Platform mode (opt-in) — preserved unchanged for users who have
	// explicitly registered their instance with livinity.io.
	return <PlatformModeIframe apiKey={apiKey} hostname={domainQ.data?.domain || window.location.hostname} />
}

function PlatformModeIframe({apiKey, hostname}: {apiKey: string; hostname: string}) {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [pending, setPending] = useState<PendingPrompt | null>(null)

	useAppStoreBridge(iframeRef, {
		apiKey,
		instanceName: hostname,
		// Phase 43.7: when the bridge encounters an app with required env
		// overrides (ZEP_API_KEY for MiroFish, N8N_BASIC_AUTH_PASSWORD for
		// n8n, etc.), defer to this callback.
		onEnvOverridesNeeded: (appId, overrides) =>
			new Promise<Record<string, string>>((resolve, reject) => {
				setPending({appId, overrides, resolve, reject})
			}),
	})

	const storeUrl = `https://livinity.io/store?token=${encodeURIComponent(apiKey)}&instance=${encodeURIComponent(hostname)}`

	return (
		<>
			<iframe
				ref={iframeRef}
				src={storeUrl}
				style={{width: '100%', height: '100%', border: 'none'}}
				allow='clipboard-write'
				title='App Store'
			/>
			{pending && (
				<EnvironmentOverridesDialog
					open={true}
					onOpenChange={(open) => {
						if (!open) {
							pending.reject(new Error('Install cancelled — env overrides dialog dismissed'))
							setPending(null)
						}
					}}
					appName={pending.appId}
					overrides={pending.overrides}
					onNext={(values) => {
						pending.resolve(values)
						setPending(null)
					}}
				/>
			)}
		</>
	)
}
