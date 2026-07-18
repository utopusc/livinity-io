import {useRef, useState} from 'react'

import {Loading} from '@/components/ui/loading'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useAppStoreBridge} from '@/hooks/use-app-store-bridge'
import {EnvironmentOverridesDialog} from '@/modules/app-store/environment-overrides-dialog'
// Phase 341-03 (REPO-01/02) — native "Community · Unverified" federated browse
// section rendered BELOW the official iframe (the iframe itself is untouched).
import {FederatedAppsSection, type FederatedApp} from '@/modules/app-store/federated-apps-section'
import {trpcReact} from '@/trpc/trpc'

type EnvOverride = {
	name: string
	label: string
	type: 'string' | 'password'
	default?: string
	required?: boolean
}

// Phase 330 (GPU-05) — the detectGpu vendor union threaded through to the dialog.
type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'unknown' | 'none' | null

type PendingPrompt = {
	appId: string
	overrides: EnvOverride[]
	// Phase 330 (GPU-05) — host-supplied GPU context; present only when the app is
	// gpu-capable AND a GPU is detected (the bridge decides this host-side).
	gpuCapable?: boolean
	gpuVendor?: GpuVendor
	gpuWsl2?: boolean
	otherGpuApps?: string[]
	// The resolve now carries BOTH the env values and the (optional) GPU choice.
	resolve: (result: {envValues: Record<string, string>; gpuAccess?: boolean}) => void
	reject: (err: Error) => void
}

export default function AppStoreWindowContent() {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const apiKeyQ = trpcReact.domain.platform.getApiKey.useQuery()
	const domainQ = trpcReact.domain.getStatus.useQuery()
	const [pending, setPending] = useState<PendingPrompt | null>(null)

	const apiKey = apiKeyQ.data?.apiKey ?? null
	const hostname = domainQ.data?.domain || window.location.hostname

	// Phase 341-03 (D-341-6) — federated catalog is adminProcedure; gate the query
	// on isAdmin so a non-admin never fires a 403 and always sees the unchanged
	// official store. Empty/absent → the section renders nothing.
	const {isAdmin} = useCurrentUser()
	const fedQ = trpcReact.appStore.federatedCatalog.useQuery(undefined, {enabled: isAdmin})
	const federatedApps = (fedQ.data ?? []) as FederatedApp[]
	const showFederated = federatedApps.length > 0
	useAppStoreBridge(iframeRef, {
		apiKey,
		instanceName: hostname,
		// Phase 43.7: when the bridge encounters an app with required env
		// overrides (ZEP_API_KEY for MiroFish, N8N_BASIC_AUTH_PASSWORD for n8n,
		// etc.), defer to this callback. Returns a promise that resolves to
		// the user-supplied values or rejects on cancel.
		// Phase 330 (GPU-05): the bridge also invokes this for gpu-capable apps with
		// a GPU present (even with zero env overrides) and passes GPU context; the
		// resolved value now carries the folded GPU choice alongside the env values.
		onEnvOverridesNeeded: (appId, overrides, gpuCtx) =>
			new Promise<{envValues: Record<string, string>; gpuAccess?: boolean}>((resolve, reject) => {
				setPending({
					appId,
					overrides,
					gpuCapable: gpuCtx?.gpuCapable,
					gpuVendor: gpuCtx?.gpuVendor,
					gpuWsl2: gpuCtx?.gpuWsl2,
					otherGpuApps: gpuCtx?.otherGpuApps,
					resolve,
					reject,
				})
			}),
	})

	if (apiKeyQ.isLoading || domainQ.isLoading) {
		return (
			<div className='flex h-full items-center justify-center'>
				<Loading />
			</div>
		)
	}

	if (!apiKey) {
		return <NoApiKeyMessage />
	}

	const storeUrl = `https://livinity.io/store?token=${encodeURIComponent(apiKey)}&instance=${encodeURIComponent(hostname)}`

	return (
		<div className='flex h-full flex-col'>
			{/* The official iframe stays the trusted default. When federated apps
			    exist it shares the window with the native section below (flex-1);
			    with none, it keeps its full-height behavior (unchanged store). */}
			<div className={showFederated ? 'min-h-0 flex-1' : 'h-full'}>
				<iframe
					ref={iframeRef}
					src={storeUrl}
					// Phase 295 — render the embedded store LIGHT even when the OS
					// theme is dark. color-scheme is inherited from the
					// `.livos-app-light` wrapper too, but Chromium needs it on the
					// iframe element itself to propagate prefers-color-scheme:light
					// into the embedded document on some versions (belt-and-suspenders).
					style={{width: '100%', height: '100%', border: 'none', colorScheme: 'light'}}
					allow='clipboard-write'
					title='App Store'
				/>
			</div>
			{showFederated && (
				<div className='max-h-[45%] shrink-0 overflow-y-auto'>
					<FederatedAppsSection apps={federatedApps} />
				</div>
			)}
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
					gpuCapable={pending.gpuCapable}
					gpuVendor={pending.gpuVendor}
					gpuWsl2={pending.gpuWsl2}
					otherGpuApps={pending.otherGpuApps}
					onNext={(values, gpuAccess) => {
						pending.resolve({envValues: values, gpuAccess})
						setPending(null)
					}}
				/>
			)}
		</div>
	)
}

function NoApiKeyMessage() {
	return (
		<div className='flex h-full flex-col items-center justify-center gap-3 p-8 text-center'>
			<div className='text-4xl'>🔗</div>
			{/* Phase 295 — the App Store window is force-lit (.livos-app-light),
			    so the card surface is white; hardcoded text-white here was
			    near-invisible. Use the semantic text tokens (light inside the
			    force-light wrapper) so this no-API-key state stays legible. */}
			<h2 className='text-lg font-semibold text-text-primary'>Connect to Livinity Platform</h2>
			<p className='max-w-md text-sm text-text-secondary'>
				To access the App Store, connect your LivOS instance to the Livinity platform. Go to Settings and enter
				your API key to get started.
			</p>
		</div>
	)
}
