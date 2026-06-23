import {memo} from 'react'

import {cn} from '@/shadcn-lib/utils'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

// ─────────────────────────────────────────────────────────────────────────────
// Aurora wallpaper — adapted from Aceternity UI's "Aurora Background" (MIT).
//
// Pure-CSS animated aurora (northern-lights glow): a "comb" repeating-linear
// gradient + a coloured aurora gradient are layered, blurred and blended; an
// ::after layer scrolls its background-position via a keyframe = the slow drift,
// blended with mix-blend-mode:difference for the shimmer. GPU-composited → it
// animates `background-position` only (no layout/paint), so it's extremely cheap
// on RAM/CPU compared to WebGL/particle wallpapers — matches the "no lag" bar.
//
// Self-contained: the keyframe, the colour vars and the ::after rule are injected
// via a scoped <style> so this needs NO Tailwind-config or global-CSS change
// (the source relied on a custom `animate-aurora` util + Tailwind colour vars).
//
// Theme-aware purely in CSS (the `.dark` ancestor class the provider sets): the
// comb gradient swaps black↔white and the light theme is inverted, like the
// original `invert dark:invert-0`. `paused` → animation-play-state; `speed` →
// animation-duration. No JS animation loop at all.
// ─────────────────────────────────────────────────────────────────────────────

// Scoped styles. Class names are prefixed `livos-aurora-` to avoid collisions.
const AURORA_STYLE = `
@keyframes livos-aurora {
	from { background-position: 50% 50%, 50% 50%; }
	to   { background-position: 350% 50%, 350% 50%; }
}
.livos-aurora-layer {
	--la-white: repeating-linear-gradient(100deg, #fff 0%, #fff 7%, transparent 10%, transparent 12%, #fff 16%);
	--la-dark:  repeating-linear-gradient(100deg, #000 0%, #000 7%, transparent 10%, transparent 12%, #000 16%);
	--la-aurora: repeating-linear-gradient(100deg, #3b82f6 10%, #a5b4fc 15%, #93c5fd 20%, #ddd6fe 25%, #60a5fa 30%);
	--la-comb: var(--la-white);
	position: absolute;
	inset: -10px;
	opacity: 0.5;
	pointer-events: none;
	will-change: transform;
	background-image: var(--la-comb), var(--la-aurora);
	background-size: 300%, 200%;
	background-position: 50% 50%, 50% 50%;
	filter: blur(10px) invert(1);
	-webkit-mask-image: radial-gradient(ellipse at 100% 0%, black 10%, transparent 70%);
	mask-image: radial-gradient(ellipse at 100% 0%, black 10%, transparent 70%);
}
.dark .livos-aurora-layer {
	--la-comb: var(--la-dark);
	filter: blur(10px);
}
.livos-aurora-layer::after {
	content: "";
	position: absolute;
	inset: 0;
	background-image: var(--la-comb), var(--la-aurora);
	background-size: 200%, 100%;
	background-attachment: fixed;
	mix-blend-mode: difference;
	animation: livos-aurora var(--la-dur, 60s) linear infinite;
	animation-play-state: var(--la-play, running);
}
@media (prefers-reduced-motion: reduce) {
	.livos-aurora-layer::after { animation: none; }
}
`

export const AuroraWallpaper = memo(function AuroraWallpaper({paused, speed, className}: AnimatedWallpaperProps) {
	const sp = speed && speed > 0 ? speed : 1
	// 60s drift at speed 1; faster at higher speed, floored so it never strobes.
	const durSec = Math.max(8, Math.round(60 / sp))

	// Match the wallpaper family's wrapper contract (see fluid-particles.tsx): a
	// caller-provided className means the parent is sized (preview tile); otherwise
	// pin to the viewport so <Wallpaper /> consumers work without sizing the parent.
	const wrapperClass = className
		? cn('overflow-hidden bg-zinc-50 dark:bg-zinc-950', className)
		: 'pointer-events-none fixed inset-0 h-lvh w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950'

	return (
		<div className={wrapperClass}>
			<style>{AURORA_STYLE}</style>
			<div className="absolute inset-0 overflow-hidden">
				<div
					className="livos-aurora-layer"
					style={
						{
							'--la-dur': `${durSec}s`,
							'--la-play': paused ? 'paused' : 'running',
						} as React.CSSProperties
					}
				/>
			</div>
		</div>
	)
})
