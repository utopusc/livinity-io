import {useEffect, useRef, useCallback, useState} from 'react'
import {TbArrowLeft, TbExternalLink, TbLoader2} from 'react-icons/tb'

import {useAppInstall} from '@/hooks/use-app-install'
import {useWindowRouter} from '@/providers/window-router'

// Build-time constant defined in vite.config.ts
declare const __MARKETPLACE_URL__: string
const MARKETPLACE_URL = __MARKETPLACE_URL__

type MarketplaceAppWindowProps = {
	appId: string
}

export default function MarketplaceAppWindow({appId}: MarketplaceAppWindowProps) {
	const {goBack} = useWindowRouter()
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const appInstall = useAppInstall(appId)
	const [isLoading, setIsLoading] = useState(true)

	// Handle install messages from marketplace iframe
	const handleMessage = useCallback(
		(event: MessageEvent) => {
			// Only accept messages from marketplace origin
			const marketplaceOrigin = new URL(MARKETPLACE_URL).origin
			if (event.origin !== marketplaceOrigin) return

			if (event.data?.type === 'INSTALL_APP') {
				const {appId: requestedAppId} = event.data.payload

				// Verify the appId matches
				if (requestedAppId === appId) {
					// Start installation
					appInstall.install()
				}
			}
		},
		[appId, appInstall],
	)

	useEffect(() => {
		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [handleMessage])

	// Send install status updates to iframe
	useEffect(() => {
		if (!iframeRef.current?.contentWindow) return

		const state = appInstall.state
		const progress = appInstall.progress

		if (state === 'installing' || state === 'ready' || state === 'running') {
			iframeRef.current.contentWindow.postMessage(
				{
					type: 'INSTALL_STATUS',
					state: state,
					progress: progress,
					appId,
				},
				MARKETPLACE_URL,
			)
		}
	}, [appInstall.state, appInstall.progress, appId])

	// Handle iframe load
	const handleIframeLoad = () => {
		setIsLoading(false)
	}

	return (
		<div className='flex h-full flex-col bg-black/20'>
			{/* Header */}
			<div className='flex items-center justify-between border-b border-border-subtle bg-black/30 px-4 py-2.5'>
				<button
					onClick={goBack}
					className='flex items-center gap-2 rounded-radius-sm px-2 py-1 text-text-secondary transition-colors hover:bg-surface-base hover:text-white'
				>
					<TbArrowLeft className='h-4 w-4' />
					<span className='text-body-sm'>Back</span>
				</button>

				<a
					href={`${MARKETPLACE_URL}/app/${appId}`}
					target='_blank'
					rel='noopener noreferrer'
					className='flex items-center gap-1.5 rounded-radius-sm px-2 py-1 text-caption text-text-tertiary transition-colors hover:bg-surface-base hover:text-text-secondary'
				>
					Open in browser
					<TbExternalLink className='h-3.5 w-3.5' />
				</a>
			</div>

			{/* Marketplace iframe */}
			<div className='relative flex-1'>
				{isLoading && (
					<div className='absolute inset-0 flex items-center justify-center bg-black/50'>
						<TbLoader2 className='h-8 w-8 animate-spin text-text-secondary' />
					</div>
				)}
				<iframe
					ref={iframeRef}
					src={`${MARKETPLACE_URL}/app/${appId}?embed=true`}
					className='absolute inset-0 h-full w-full border-0'
					title='LivOS Marketplace'
					allow='clipboard-read; clipboard-write'
					onLoad={handleIframeLoad}
				/>
			</div>
		</div>
	)
}
