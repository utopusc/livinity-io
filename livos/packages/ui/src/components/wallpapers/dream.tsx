import {memo} from 'react'

import {cn} from '@/shadcn-lib/utils'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

// ─────────────────────────────────────────────────────────────────────────────
// Dream wallpaper — "Aurora Dream Corner Whispers" (adapted, MIT).
//
// A STATIC pastel radial-gradient background: four soft corner glows over a
// gentle vertical base gradient. No animation at all → GPU-composited, the
// LIGHTEST possible wallpaper (effectively zero RAM/CPU). `paused`/`speed` are
// no-ops because nothing moves.
//
// Theme-aware via the `.dark` ancestor class: light = the original soft pastel;
// dark = the same corner-glow idea on a deep base with muted jewel tones so it
// stays legible and calm in dark mode.
// ─────────────────────────────────────────────────────────────────────────────

const DREAM_STYLE = `
.livos-dream {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(ellipse 85% 65% at 8% 8%, rgba(175, 109, 255, 0.42), transparent 60%),
		radial-gradient(ellipse 75% 60% at 75% 35%, rgba(255, 235, 170, 0.55), transparent 62%),
		radial-gradient(ellipse 70% 60% at 15% 80%, rgba(255, 100, 180, 0.40), transparent 62%),
		radial-gradient(ellipse 70% 60% at 92% 92%, rgba(120, 190, 255, 0.45), transparent 62%),
		linear-gradient(180deg, #f7eaff 0%, #fde2ea 100%);
}
.dark .livos-dream {
	background:
		radial-gradient(ellipse 85% 65% at 8% 8%, rgba(150, 90, 255, 0.32), transparent 60%),
		radial-gradient(ellipse 75% 60% at 75% 35%, rgba(255, 205, 120, 0.20), transparent 62%),
		radial-gradient(ellipse 70% 60% at 15% 80%, rgba(255, 80, 160, 0.26), transparent 62%),
		radial-gradient(ellipse 70% 60% at 92% 92%, rgba(90, 160, 255, 0.30), transparent 62%),
		linear-gradient(180deg, #0c0a16 0%, #140d1c 100%);
}
`

export const DreamWallpaper = memo(function DreamWallpaper({className}: AnimatedWallpaperProps) {
	const wrapperClass = className
		? cn('overflow-hidden', className)
		: 'pointer-events-none fixed inset-0 h-lvh w-full overflow-hidden'

	return (
		<div className={wrapperClass}>
			<style>{DREAM_STYLE}</style>
			<div className="livos-dream" />
		</div>
	)
})
