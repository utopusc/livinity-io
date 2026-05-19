// Phase 157 round 6 — Dock glyph SVGs, ported verbatim from
// `.planning/design-system/v37-store-claude-design/dock-icons.html`.
//
// Tabler React icons (TbFolder / TbApps / etc.) ship with extra
// flourishes (drawer tabs, dots, decorations) that didn't match the
// claude-design mock. These hand-written glyphs are the exact paths
// from dock-icons.html — Lucide-style, 1.5px stroke, currentColor —
// so the rendered dock matches the design pixel-for-pixel.
//
// All glyphs share the same SVG shell so callers can pass a single
// `className` for sizing + stroke-color. `strokeWidth` is per-glyph
// because the design uses slightly heavier strokes on Analytics +
// Terminal (1.7) to balance their thinner shapes against the chunkier
// Folder / Server.

import type {SVGProps} from 'react'

type GlyphProps = SVGProps<SVGSVGElement>

const base: SVGProps<SVGSVGElement> = {
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeLinecap: 'round',
	strokeLinejoin: 'round',
}

export function IconFiles(props: GlyphProps) {
	return (
		<svg {...base} strokeWidth={1.5} {...props}>
			<path d='M5 4h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' />
		</svg>
	)
}

export function IconSettings(props: GlyphProps) {
	return (
		<svg {...base} strokeWidth={1.5} {...props}>
			<path d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' />
			<circle cx='12' cy='12' r='3' />
		</svg>
	)
}

export function IconAnalytics(props: GlyphProps) {
	return (
		<svg {...base} strokeWidth={1.7} {...props}>
			<path d='M5 19V11' />
			<path d='M10 19V6' />
			<path d='M15 19V14' />
			<path d='M20 19V9' />
		</svg>
	)
}

// App Store hero glyph — rounded square + plus inside, slightly heavier
// stroke (1.8 on the frame, 2.4 on the plus per dock-icons.html).
export function IconAppStore(props: GlyphProps) {
	return (
		<svg {...base} {...props}>
			<rect x='3.5' y='3.5' width='17' height='17' rx='5' strokeWidth={1.8} />
			<path d='M12 8.5v7M8.5 12h7' strokeWidth={2.4} />
		</svg>
	)
}

// Liv — Lucide message bubble (currently in the design's dock).
export function IconLiv(props: GlyphProps) {
	return (
		<svg {...base} strokeWidth={1.6} {...props}>
			<path d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' />
		</svg>
	)
}

// Server — two stacked racks with status LEDs + ports.
export function IconServer(props: GlyphProps) {
	return (
		<svg {...base} strokeWidth={1.5} {...props}>
			<rect x='3' y='4' width='18' height='6' rx='1.5' />
			<rect x='3' y='14' width='18' height='6' rx='1.5' />
			<path d='M7 7h.01M7 17h.01' />
			<path d='M16 7h2' />
			<path d='M16 17h2' />
		</svg>
	)
}

// Devices — single phone outline + home button hint.
export function IconDevices(props: GlyphProps) {
	return (
		<svg {...base} strokeWidth={1.5} {...props}>
			<rect x='7' y='3' width='10' height='18' rx='2.5' />
			<path d='M11 18h2' />
		</svg>
	)
}

// Terminal — chevron caret + horizontal dash (cleaner than the Tabler
// box variant; matches the design's "mono prompt" feel).
export function IconTerminal(props: GlyphProps) {
	return (
		<svg {...base} strokeWidth={1.7} {...props}>
			<path d='M7 8l4 4-4 4' />
			<path d='M13 16h5' />
		</svg>
	)
}
