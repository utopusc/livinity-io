// Phase 218 T7 — small refresh prompt that surfaces when the UI bundle
// the operator is staring at has been superseded by an update.sh run.
//
// Wire shape: at build time vite.config.ts freezes
// `__LIVOS_BUILD_VERSION__` (Date.now() string) into the bundle AND writes
// the same value into `dist/version.txt`. After update.sh rebuilds the UI,
// the file changes but every already-open tab still has the old constant
// in memory. This component polls the file every 30s; when the two
// diverge it pins a corner banner offering a one-click reload.
//
// Stays out of the way: no-store fetch, AbortController on unmount, fails
// closed (network error → no banner, no console spam), idempotent (won't
// show twice once dismissed within a session).

import {useEffect, useState} from 'react'

declare const __LIVOS_BUILD_VERSION__: string

const POLL_INTERVAL_MS = 30_000
const VERSION_URL = '/version.txt'

async function fetchServerVersion(signal: AbortSignal): Promise<string | null> {
	try {
		const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
			cache: 'no-store',
			signal,
		})
		if (!res.ok) return null
		const text = (await res.text()).trim()
		return text || null
	} catch {
		return null
	}
}

export function LivosVersionBanner() {
	const [latestVersion, setLatestVersion] = useState<string | null>(null)
	const [dismissed, setDismissed] = useState(false)

	useEffect(() => {
		const controller = new AbortController()
		let cancelled = false

		const tick = async () => {
			if (cancelled) return
			const v = await fetchServerVersion(controller.signal)
			if (cancelled) return
			if (v && v !== __LIVOS_BUILD_VERSION__) {
				setLatestVersion(v)
			}
		}

		// Skip the very first tick by 10s so we don't race with initial render.
		const initial = window.setTimeout(tick, 10_000)
		const interval = window.setInterval(tick, POLL_INTERVAL_MS)

		return () => {
			cancelled = true
			controller.abort()
			window.clearTimeout(initial)
			window.clearInterval(interval)
		}
	}, [])

	if (!latestVersion || dismissed) return null

	return (
		<div
			role='status'
			aria-live='polite'
			style={{
				position: 'fixed',
				bottom: 16,
				right: 16,
				zIndex: 9999,
				padding: '10px 14px',
				borderRadius: 8,
				background: 'rgba(20, 20, 28, 0.96)',
				color: '#fff',
				fontSize: 13,
				lineHeight: 1.4,
				boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
				display: 'flex',
				alignItems: 'center',
				gap: 12,
				maxWidth: 360,
			}}
		>
			<span>LivOS UI updated — refresh to see the latest.</span>
			<button
				type='button'
				onClick={() => window.location.reload()}
				style={{
					padding: '4px 10px',
					borderRadius: 6,
					background: '#3b82f6',
					color: '#fff',
					border: 'none',
					fontSize: 12,
					cursor: 'pointer',
				}}
			>
				Refresh
			</button>
			<button
				type='button'
				onClick={() => setDismissed(true)}
				aria-label='Dismiss'
				style={{
					padding: '2px 6px',
					borderRadius: 6,
					background: 'transparent',
					color: 'rgba(255,255,255,0.6)',
					border: 'none',
					fontSize: 16,
					cursor: 'pointer',
					lineHeight: 1,
				}}
			>
				×
			</button>
		</div>
	)
}
