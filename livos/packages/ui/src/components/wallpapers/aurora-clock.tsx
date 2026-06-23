import {memo, useEffect, useState} from 'react'

import {cn} from '@/shadcn-lib/utils'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

import {AuroraWallpaper} from './aurora'

// ─────────────────────────────────────────────────────────────────────────────
// Aurora Clock wallpaper — the Aurora background with a large live clock centred
// on it (the user asked for the clock "in the middle, instead of Acme").
//
// Composes <AuroraWallpaper> (pure-CSS aurora, very light) + a centred HH:MM
// clock + date. The clock is the only moving part beyond the CSS aurora and it
// re-renders ~once a second (trivial). Theme-aware text (dark text on light,
// light text on dark). The aurora itself is already theme-aware.
// ─────────────────────────────────────────────────────────────────────────────

function pad2(n: number): string {
	return String(n).padStart(2, '0')
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Clock() {
	const [now, setNow] = useState(() => new Date())
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 1000)
		return () => clearInterval(t)
	}, [])

	const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
	const date = `${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`

	return (
		<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
			<div
				className="font-semibold leading-none tabular-nums text-zinc-900/85 dark:text-white/90"
				style={{fontSize: 'clamp(48px, 12vw, 220px)', fontVariantNumeric: 'tabular-nums'}}
			>
				{time}
			</div>
			<div
				className="mt-[2vh] font-medium uppercase tracking-[0.25em] text-zinc-800/70 dark:text-white/70"
				style={{fontSize: 'clamp(11px, 1.6vw, 22px)'}}
			>
				{date}
			</div>
		</div>
	)
}

export const AuroraClockWallpaper = memo(function AuroraClockWallpaper({paused, speed, className}: AnimatedWallpaperProps) {
	const wrapperClass = className
		? cn('overflow-hidden', className)
		: 'pointer-events-none fixed inset-0 h-lvh w-full overflow-hidden'

	return (
		<div className={wrapperClass}>
			<AuroraWallpaper paused={paused} speed={speed} className="absolute inset-0 h-full w-full" />
			<Clock />
		</div>
	)
})
