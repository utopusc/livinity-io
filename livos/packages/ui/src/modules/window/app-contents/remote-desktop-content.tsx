import {useState} from 'react'

export default function RemoteDesktopContent() {
	const [error, setError] = useState<string | null>(null)

	// Build the pc.{domain} URL for the desktop viewer
	const host = window.location.hostname
	const proto = window.location.protocol
	const parts = host.split('.')

	let desktopUrl: string
	if (parts.length >= 2) {
		// e.g., bruce.livinity.io → pc.bruce.livinity.io
		desktopUrl = `${proto}//pc.${host}/`
	} else {
		// localhost fallback — direct to the viewer route
		desktopUrl = `${proto}//${host}:8080/`
	}

	if (error) {
		return (
			<div className='flex h-full items-center justify-center bg-neutral-900'>
				<div className='text-center'>
					<p className='text-lg font-medium text-red-400'>Remote Desktop</p>
					<p className='mt-2 text-sm text-neutral-400'>{error}</p>
				</div>
			</div>
		)
	}

	return (
		<iframe
			src={desktopUrl}
			className='h-full w-full border-0'
			allow='clipboard-read; clipboard-write; fullscreen'
			onError={() => setError('Failed to connect to desktop stream')}
		/>
	)
}
