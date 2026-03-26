import {useEffect, useRef, useState} from 'react'

type ChromeWindowProps = {
	url?: string
}

export default function ChromeWindowContent({url}: ChromeWindowProps) {
	const [state, setState] = useState<'launching' | 'ready' | 'error'>('launching')
	const [error, setError] = useState<string | null>(null)
	const launched = useRef(false)

	useEffect(() => {
		if (launched.current) return
		launched.current = true

		// Launch Chrome on the server's X11 display
		fetch('/api/chrome/launch', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			credentials: 'include',
			body: JSON.stringify({url: url || undefined}),
		})
			.then((res) => res.json())
			.then((data) => {
				if (data.success) {
					// Give Chrome a moment to render on the display
					setTimeout(() => setState('ready'), data.already_running ? 200 : 1500)
				} else {
					setError(data.error || 'Failed to launch Chrome')
					setState('error')
				}
			})
			.catch((err) => {
				setError(err.message)
				setState('error')
			})
	}, [url])

	if (state === 'error') {
		return (
			<div className='flex h-full items-center justify-center bg-neutral-900'>
				<div className='text-center'>
					<p className='text-lg font-medium text-red-400'>Chrome</p>
					<p className='mt-2 text-sm text-neutral-400'>{error}</p>
					<p className='mt-1 text-xs text-neutral-500'>Google Chrome must be installed on the server</p>
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

	// Show the remote desktop stream — Chrome is visible on the X11 display
	return (
		<iframe
			src='/desktop-viewer'
			className='h-full w-full border-0'
			allow='clipboard-read; clipboard-write; fullscreen'
		/>
	)
}
