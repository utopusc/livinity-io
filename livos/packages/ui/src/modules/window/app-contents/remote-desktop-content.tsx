export default function RemoteDesktopContent() {
	// Serve desktop viewer from same origin via /desktop-viewer route
	// This avoids cross-origin subdomain issues with Cloudflare Tunnel
	return (
		<iframe
			src='/desktop-viewer'
			className='h-full w-full border-0'
			allow='clipboard-read; clipboard-write; fullscreen'
		/>
	)
}
