import {useEffect, useState} from 'react'

type ChromeWindowProps = {
	url?: string
}

export default function ChromeWindowContent({url}: ChromeWindowProps) {
	const [state, setState] = useState<'launching' | 'ready' | 'error'>('launching')
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		setState('launching')

		fetch('/api/chrome/launch', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			credentials: 'include',
			body: JSON.stringify({url: url || undefined}),
		})
			.then((res) => res.json())
			.then((data) => {
				if (data.success) {
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
	}, []) // runs every mount (new window = new mount)

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
