/**
 * Phase 201-03 — Verbatim port of livos/packages/ui/src/components/tool-ui/
 * geo-map.tsx render implementation. Split out from geo-map.tsx so it can
 * be loaded via next/dynamic({ssr: false}) — see geo-map.tsx for the
 * Rule-3 deviation note.
 *
 * Original Phase 198-03 Task 2 docstring:
 *   Renders an OpenStreetMap-backed Leaflet map with markers + popups.
 *   Default zoom 13, center derived from the first marker.
 *   T-198-04 mitigation: zero raw HTML injection — popup content is
 *   React children (text interpolation only).
 *   Leaflet ESM compat: DivIcon avoids the leaflet-image-asset Vite-ESM
 *   resolution dance.
 */

'use client'

import 'leaflet/dist/leaflet.css'

import {DivIcon} from 'leaflet'
import {MapContainer, Marker, Popup, TileLayer} from 'react-leaflet'

import type {GeoMapProps} from './geo-map'

const PIN_ICON = new DivIcon({
	className: 'aui-geo-pin',
	html: '<div style="width:18px;height:18px;border-radius:9999px;background:#0ea5e9;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.3)"></div>',
	iconSize: [18, 18],
	iconAnchor: [9, 9],
})

export function GeoMapImpl({markers, center, zoom = 13, height = 320}: GeoMapProps) {
	if (!markers || markers.length === 0) {
		return (
			<div className='rounded-lg border bg-muted/30 p-4 text-muted-foreground text-sm'>
				No locations returned.
			</div>
		)
	}

	const first = markers[0]!
	const mapCenter: [number, number] = center
		? [center.lat, center.lng]
		: [first.lat, first.lng]

	return (
		<div
			className='overflow-hidden rounded-lg border'
			style={{height}}
		>
			<MapContainer
				center={mapCenter}
				zoom={zoom}
				scrollWheelZoom={false}
				style={{height: '100%', width: '100%'}}
			>
				<TileLayer
					attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
					url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
				/>
				{markers.map((m, idx) => (
					<Marker key={`${m.lat}-${m.lng}-${idx}`} position={[m.lat, m.lng]} icon={PIN_ICON}>
						<Popup>
							<div className='space-y-1'>
								<div className='font-medium'>{m.label}</div>
								{m.description && (
									<div className='text-muted-foreground text-xs'>{m.description}</div>
								)}
							</div>
						</Popup>
					</Marker>
				))}
			</MapContainer>
		</div>
	)
}

export default GeoMapImpl
