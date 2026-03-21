import {useEffect, useRef, useState} from 'react'
import {trpcReact} from '@/trpc/trpc'

type ChromeWindowProps = {
	url?: string // optional URL to open in Chrome via CDP
}

export default function ChromeWindowContent({url}: ChromeWindowProps) {
	const [streamUrl, setStreamUrl] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const started = useRef(false)

	// Check if Chrome app is running
	const statusQ = trpcReact.apps.state.useQuery(undefined, {
		refetchInterval: streamUrl ? false : 3000,
	})

	useEffect(() => {
		if (started.current || !statusQ.data) return

		// Find the chromium app in the app list
		const chromeApp = statusQ.data.find((a: any) => a.id === 'chromium')

		if (!chromeApp) {
			setError('Chrome is not installed. Install it from the App Store first.')
			return
		}

		if (chromeApp.status === 'running' || chromeApp.status === 'ready') {
			started.current = true
			// Chrome is running — build the KasmVNC URL
			// KasmVNC runs on the app's subdomain via Caddy reverse proxy
			const subdomain = 'chrome'
			const host = window.location.hostname
			const proto = window.location.protocol
			// Subdomain pattern: chrome.{main-domain}
			const parts = host.split('.')
			let kasmUrl: string
			if (parts.length >= 2) {
				// e.g., bolcay.livinity.io → chrome.bolcay.livinity.io
				kasmUrl = `${proto}//${subdomain}.${host}/`
			} else {
				// localhost fallback
				kasmUrl = `${proto}//${host}:3000/`
			}
			setStreamUrl(kasmUrl)

			// If a URL was requested, open it in Chrome via CDP after a short delay
			if (url) {
				setTimeout(() => openUrlInChrome(url), 2000)
			}
		}
	}, [statusQ.data, url])

	if (error) {
		return (
			<div className='flex h-full items-center justify-center bg-neutral-900'>
				<div className='text-center'>
					<p className='text-lg font-medium text-red-400'>Chrome</p>
					<p className='mt-2 text-sm text-neutral-400'>{error}</p>
				</div>
			</div>
		)
	}

	if (!streamUrl) {
		return (
			<div className='flex h-full items-center justify-center bg-neutral-900'>
				<div className='text-center'>
					<div className='mx-auto h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent' />
					<p className='mt-4 text-sm text-neutral-400'>Connecting to Chrome...</p>
				</div>
			</div>
		)
	}

	return (
		<iframe
			src={streamUrl}
			className='h-full w-full border-0'
			allow='clipboard-read; clipboard-write'
		/>
	)
}

// Open a URL in Chrome via CDP (Chrome DevTools Protocol)
async function openUrlInChrome(url: string) {
	try {
		// CDP is accessible via the app's proxy on port 9222
		const cdpBase = `${window.location.protocol}//${window.location.hostname}:9222`
		const res = await fetch(`${cdpBase}/json/new?${url}`, {method: 'PUT'}).catch(() => null)
		if (!res) {
			// Fallback: try via tRPC or just let the user navigate manually
			console.log('CDP not reachable, user will navigate manually')
		}
	} catch {
		// Silent fail — user can navigate manually in Chrome
	}
}
