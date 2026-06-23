import {memo, useEffect, useState} from 'react'

import {cn} from '@/shadcn-lib/utils'
import {useClockPrefs} from '@/hooks/use-clock-prefs'
import {formatClockParts} from '@/lib/intl'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

import {AuroraWallpaper} from './aurora'

// ─────────────────────────────────────────────────────────────────────────────
// Aurora Clock wallpaper — the Aurora background with a large live clock centred
// on it (the user asked for the clock "in the middle, instead of Acme").
//
// Composes <AuroraWallpaper> (pure-CSS aurora, very light) + a centred clock +
// date. The clock is the only moving part beyond the CSS aurora and it
// re-renders ~once a second (trivial). Theme-aware text (dark text on light,
// light text on dark). The aurora itself is already theme-aware.
//
// Phase 298 — the time now honors the operator's Clock-format preference
// (AM/PM 12-hour vs 24-hour) + selected timezone/locale, the SAME source the
// navbar clock uses (useClockPrefs → setup.getLocation). Previously it hardcoded
// `getHours()` (always 24-hour), so picking AM/PM never changed this centre clock.
// ─────────────────────────────────────────────────────────────────────────────

function Clock() {
	const [now, setNow] = useState(() => new Date())
	const {hourCycle, locale, timezone} = useClockPrefs()
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 1000)
		return () => clearInterval(t)
	}, [])

	// HH:MM in the selected timezone + an AM/PM badge ONLY when hourCycle==='h12'.
	const {time, dayPeriod} = formatClockParts(now, {locale, timeZone: timezone, hourCycle})
	// Locale- + timezone-aware date (e.g. "Mon, May 22" / "Pzt, 22 May").
	const date = new Intl.DateTimeFormat(locale, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: timezone,
	}).format(now)

	return (
		<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
			<div
				className="flex items-start justify-center font-semibold leading-none tabular-nums text-zinc-900/85 dark:text-white/90"
				style={{fontSize: 'clamp(48px, 12vw, 220px)', fontVariantNumeric: 'tabular-nums'}}
			>
				{time}
				{dayPeriod && (
					<span className="ml-[0.12em] mt-[0.12em] font-medium uppercase tracking-[0.04em]" style={{fontSize: '0.32em'}}>
						{dayPeriod}
					</span>
				)}
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
