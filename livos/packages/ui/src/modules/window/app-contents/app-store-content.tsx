import {useRef} from 'react'

import {Loading} from '@/components/ui/loading'
import {useAppStoreBridge} from '@/hooks/use-app-store-bridge'
import {trpcReact} from '@/trpc/trpc'

export default function AppStoreWindowContent() {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const apiKeyQ = trpcReact.domain.platform.getApiKey.useQuery()
	const domainQ = trpcReact.domain.getStatus.useQuery()
	useAppStoreBridge(iframeRef)

	if (apiKeyQ.isLoading || domainQ.isLoading) {
		return (
			<div className='flex h-full items-center justify-center'>
				<Loading />
			</div>
		)
	}

	const apiKey = apiKeyQ.data?.apiKey
	if (!apiKey) {
		return <NoApiKeyMessage />
	}

	const hostname = domainQ.data?.domain || window.location.hostname
	const storeUrl = `https://livinity.io/store?token=${encodeURIComponent(apiKey)}&instance=${encodeURIComponent(hostname)}`

	return (
		<iframe
			ref={iframeRef}
			src={storeUrl}
			style={{width: '100%', height: '100%', border: 'none'}}
			allow='clipboard-write'
			title='App Store'
		/>
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
