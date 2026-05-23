/**
 * Phase 198-03 Task 2 — Geo Map tool-ui primitive (Next.js port).
 *
 * Renders an OpenStreetMap-backed Leaflet map with markers + popups.
 * Default zoom 13, center derived from the first marker.
 *
 * T-198-04 mitigation: zero raw HTML injection — popup content is
 * React children (text interpolation only).
 *
 * Phase 201-03 — Next.js SSR adapter (Rule 3 deviation from D-201-20):
 *   `react-leaflet` accesses `window` at module-evaluation time, which
 *   blows up Next.js's static prerender pass. To keep the rest of the
 *   port verbatim we split this file into:
 *     - A tiny client-only wrapper that uses next/dynamic({ssr: false})
 *       to defer the leaflet import to the browser.
 *     - The original implementation (verbatim from the Vite source) is
 *       housed in `./geo-map-impl.tsx` and only ever loads client-side.
 *   This is a Next.js-environment adapter — no behavior change, no
 *   render-logic change.
 */

'use client'

import dynamic from 'next/dynamic'

export type GeoMarker = {
	lat: number
	lng: number
	label: string
	description?: string
}

export type GeoMapProps = {
	markers: GeoMarker[]
	center?: {lat: number; lng: number}
	zoom?: number
	height?: number
}

export const GeoMap = dynamic<GeoMapProps>(
	() => import('./geo-map-impl').then((m) => m.GeoMapImpl),
	{
		ssr: false,
		loading: () => (
			<div className='rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm'>
				Loading map…
			</div>
		),
	},
)

export default GeoMap
