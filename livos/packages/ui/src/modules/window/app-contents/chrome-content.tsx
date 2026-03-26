import {useEffect, useState} from 'react'

type ChromeWindowProps = {
	url?: string
}

export default function ChromeWindowContent({url}: ChromeWindowProps) {
	const [state, setState] = useState<'launching' | 'ready' | 'error'>('launching')
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 15000)

		// Fire and don't wait — show stream immediately
		fetch('/api/chrome/launch', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			credentials: 'include',
			body: JSON.stringify({url: url || undefined}),
			signal: controller.signal,
		}).catch(() => {})

		clearTimeout(timeout)

		// Show desktop viewer after a short delay regardless of API response
		// Chrome is either already running or will start in background
		setTimeout(() => setState('ready'), 500)

		return () => controller.abort()
	}, [])

	if (state === 'error') {
		return (
			<div className='flex h-full items-center justify-center bg-neutral-900'>
				<div className='text-center'>
					<p className='text-lg font-medium text-red-400'>Chrome</p>
					<p className='mt-2 text-sm text-neutral-400'>{error}</p>
				</div>
			</div>
		)
	}

	if (state === 'launching') {
		return (
			<div className='flex h-full items-center justify-center bg-neutral-900'>
				<div className='text-center'>
					<div className='mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent' />
					<p className='mt-4 text-sm text-neutral-400'>Launching Chrome...</p>
				</div>
			</div>
		)
	}

	return (
		<iframe
			src='/desktop-viewer'
			className='h-full w-full border-0'
			allow='clipboard-read; clipboard-write; fullscreen'
		/>
	)
}
