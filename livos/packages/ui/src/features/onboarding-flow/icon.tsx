import type {SVGProps} from 'react'

export type IconName =
	| 'arrow-right'
	| 'arrow-left'
	| 'check'
	| 'chevron-down'
	| 'eye'
	| 'eye-off'
	| 'copy'
	| 'x'
	| 'shield'
	| 'cpu'
	| 'disk'
	| 'wifi'
	| 'globe'
	| 'alert'
	| 'key'
	| 'lock'
	| 'sparkle'

type Props = SVGProps<SVGSVGElement> & {name: IconName; size?: number}

/**
 * 1.6px-stroke monochrome icon set used throughout the onboarding flow.
 * Ported from reference onboarding.jsx Icon. All glyphs inherit
 * currentColor so they pick up the surrounding text color.
 */
export function Icon({name, size = 16, ...rest}: Props) {
	const p: SVGProps<SVGSVGElement> = {
		width: size,
		height: size,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 1.6,
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
		...rest,
	}
	switch (name) {
		case 'arrow-right':
			return (
				<svg {...p}>
					<path d='M5 12h14M13 5l7 7-7 7' />
				</svg>
			)
		case 'arrow-left':
			return (
				<svg {...p}>
					<path d='M19 12H5M11 19l-7-7 7-7' />
				</svg>
			)
		case 'check':
			return (
				<svg {...p}>
					<path d='M4 12l5 5 11-11' />
				</svg>
			)
		case 'chevron-down':
			return (
				<svg {...p}>
					<path d='M6 9l6 6 6-6' />
				</svg>
			)
		case 'eye':
			return (
				<svg {...p}>
					<path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z' />
					<circle cx='12' cy='12' r='3' />
				</svg>
			)
		case 'eye-off':
			return (
				<svg {...p}>
					<path d='M9.9 4.24A10 10 0 0 1 22 12s-1 2-3 4M6.6 6.6C3.5 8.6 2 12 2 12s3.5 7 10 7c2 0 3.6-.5 5-1.3M3 3l18 18' />
				</svg>
			)
		case 'copy':
			return (
				<svg {...p}>
					<rect x='9' y='9' width='11' height='11' rx='2' />
					<path d='M5 15V5a2 2 0 0 1 2-2h10' />
				</svg>
			)
		case 'x':
			return (
				<svg {...p}>
					<path d='M6 6l12 12M18 6L6 18' />
				</svg>
			)
		case 'shield':
			return (
				<svg {...p}>
					<path d='M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' />
					<path d='M9 12l2 2 4-4' />
				</svg>
			)
		case 'cpu':
			return (
				<svg {...p}>
					<rect x='6' y='6' width='12' height='12' rx='2' />
					<path d='M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3' />
				</svg>
			)
		case 'disk':
			return (
				<svg {...p}>
					<rect x='3' y='6' width='18' height='12' rx='2' />
					<path d='M7 10h10M7 14h6' />
				</svg>
			)
		case 'wifi':
			return (
				<svg {...p}>
					<path d='M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19h0' />
				</svg>
			)
		case 'globe':
			return (
				<svg {...p}>
					<circle cx='12' cy='12' r='9' />
					<path d='M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18' />
				</svg>
			)
		case 'alert':
			return (
				<svg {...p}>
					<path d='M12 9v4M12 17h.01M10.3 4l-8 13.4A2 2 0 0 0 4 20h16a2 2 0 0 0 1.7-2.6L13.7 4a2 2 0 0 0-3.4 0z' />
				</svg>
			)
		case 'key':
			return (
				<svg {...p}>
					<circle cx='8' cy='14' r='4' />
					<path d='M11 11l9-9M16 6l3 3M19 3l2 2' />
				</svg>
			)
		case 'lock':
			return (
				<svg {...p}>
					<rect x='4' y='11' width='16' height='10' rx='2' />
					<path d='M8 11V7a4 4 0 0 1 8 0v4' />
				</svg>
			)
		case 'sparkle':
			return (
				<svg {...p}>
					<path d='M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8' />
				</svg>
			)
		default:
			return null
	}
}
