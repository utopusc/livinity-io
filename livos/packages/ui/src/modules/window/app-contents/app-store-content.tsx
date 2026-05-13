import {useRef, useState} from 'react'

import {Loading} from '@/components/ui/loading'
import {useAppStoreBridge} from '@/hooks/use-app-store-bridge'
import {EnvironmentOverridesDialog} from '@/modules/app-store/environment-overrides-dialog'
import {trpcReact} from '@/trpc/trpc'

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
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const apiKeyQ = trpcReact.domain.platform.getApiKey.useQuery()
	const domainQ = trpcReact.domain.getStatus.useQuery()
	const [pending, setPending] = useState<PendingPrompt | null>(null)

	const apiKey = apiKeyQ.data?.apiKey ?? null
	const hostname = domainQ.data?.domain || window.location.hostname
	useAppStoreBridge(iframeRef, {
		apiKey,
		instanceName: hostname,
		// Phase 43.7: when the bridge encounters an app with required env
		// overrides (ZEP_API_KEY for MiroFish, N8N_BASIC_AUTH_PASSWORD for n8n,
		// etc.), defer to this callback. Returns a promise that resolves to
		// the user-supplied values or rejects on cancel.
		onEnvOverridesNeeded: (appId, overrides) =>
			new Promise<Record<string, string>>((resolve, reject) => {
				setPending({appId, overrides, resolve, reject})
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

function NoApiKeyMessage() {
	return (
		<div className='flex h-full flex-col items-center justify-center gap-3 p-8 text-center'>
			<div className='text-4xl'>🔗</div>
			<h2 className='text-lg font-semibold text-white'>Connect to Livinity Platform</h2>
			<p className='max-w-md text-sm text-white/60'>
				To access the App Store, connect your LivOS instance to the Livinity platform. Go to Settings and enter
				your API key to get started.
			</p>
		</div>
	)
}
