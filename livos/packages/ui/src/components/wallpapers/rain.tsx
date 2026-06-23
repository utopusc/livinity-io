import {useEffect, useRef, memo} from 'react'

import {cn} from '@/shadcn-lib/utils'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

// ─────────────────────────────────────────────────────────────────────────────
// LivOS wallpaper — Rain (2026-06-22)
//
// Same family as FluidParticlesWallpaper: a calm, minimal, LIGHTWEIGHT 2D-canvas
// generative animation. NO WebGL, NO shadowBlur/filter, NO per-pixel image data.
//
// Visual: gentle diagonal "rain"/drift lines. ~120 thin short line segments fall
// slowly on a slight diagonal, wrapping back to the top when they exit the
// bottom, with slight per-line speed/length variance. Low-alpha monochrome
// strokes. The motion blur "trail" is a single low-alpha full-canvas fillRect
// each frame — exactly the cheap fade trick Fluid uses — so the lines leave a
// soft fading streak instead of a hard line. Soothing, ambient.
//
// Theme-aware every frame (`documentElement.classList` contains "dark"): light
// theme = dark marks on a white-ish bg, dark theme = light marks on a black-ish
// bg. Kept SUBTLE / low-alpha like Fluid.
//
// Performance: ≤140 cheap stroke() segments per frame, O(n) over the drops, one
// fillRect for the fade. Comfortably 60fps on a Mini PC iGPU.
//
// Honours the AnimatedWallpaperProps surface (`paused`, `speed`, `className`):
// `paused` halts the rAF loop (paints one static frame); `speed` scales the
// per-frame time delta. The pausedRef/speedRef pattern keeps the rAF loop from
// restarting on prop change.
// ─────────────────────────────────────────────────────────────────────────────

type RainProps = AnimatedWallpaperProps & {
	dropCount?: number
	// Diagonal slant: horizontal drift per vertical unit travelled.
	slant?: number
}

interface Drop {
	x: number
	y: number
	len: number
	// Per-drop fall speed in CSS px/sec.
	vy: number
	// Per-drop stroke alpha (subtle variance so the field has depth).
	alpha: number
}

// Trail blend for each theme. Very-low-alpha so the lines leave a soft fading
// streak (photographic motion blur) between frames rather than a hard mark.
const COLOR_SCHEME = {
	light: {background: 'rgba(255, 255, 255, 0.12)'},
	dark: {background: 'rgba(0, 0, 0, 0.12)'},
} as const

export const RainWallpaper = memo(function RainWallpaper({
	paused,
	speed,
	className,
	dropCount = 120,
	slant = 0.28,
}: RainProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	// Hold latest values for paused/speed without forcing effect restart.
	const pausedRef = useRef(paused ?? false)
	const speedRef = useRef(speed ?? 1)
	useEffect(() => {
		pausedRef.current = paused ?? false
	}, [paused])
	useEffect(() => {
		speedRef.current = speed ?? 1
	}, [speed])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d', {alpha: true})
		if (!ctx) return

		// Cap the segment count so the per-frame cost stays bounded regardless of
		// the caller's request (≤140 segments, per the perf budget).
		const count = Math.max(1, Math.min(140, Math.floor(dropCount)))

		// Read live pixel dimensions from the canvas's CSS box and scale the bitmap
		// by DPR for crisp drawing. Falls back to viewport size if the canvas isn't
		// laid out yet (e.g. when rendered inside a 0-sized container).
		const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
		// Declared before resize() so the initial resize() call (below) is past its
		// TDZ. A resize reassigns canvas.width which CLEARS the bitmap, so a paused
		// wallpaper must repaint its static frame at the new size — resize() flags it.
		let staticFramePainted = false
		const resize = () => {
			const w = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth
			const h = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight
			canvas.width = Math.max(1, Math.floor(w * dpr))
			canvas.height = Math.max(1, Math.floor(h * dpr))
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			staticFramePainted = false
		}

		resize()

		// Use the CSS-box dimensions for drop distribution so they spread to the
		// visible area regardless of DPR scaling.
		const cssW = () => canvas.width / dpr
		const cssH = () => canvas.height / dpr

		const drops: Drop[] = Array.from({length: count}, () => ({
			x: Math.random() * cssW(),
			y: Math.random() * cssH(),
			len: 14 + Math.random() * 26, // 14–40 px short segments
			vy: 26 + Math.random() * 34, // 26–60 px/sec — slight per-line variance
			alpha: 0.05 + Math.random() * 0.09, // 0.05–0.14 subtle monochrome
		}))

		let rafId = 0
		let lastTime = performance.now()

		// Draw the diagonal segments for the current drop positions. Shared by the
		// static-frame painter and the animation loop.
		const drawDrops = (isDark: boolean) => {
			ctx.lineWidth = 1
			ctx.lineCap = 'round'
			for (const drop of drops) {
				// Segment points "up the slope" so it trails behind the fall.
				const dx = drop.len * slant
				ctx.strokeStyle = isDark
					? `rgba(255, 255, 255, ${drop.alpha})`
					: `rgba(0, 0, 0, ${drop.alpha})`
				ctx.beginPath()
				ctx.moveTo(drop.x, drop.y)
				ctx.lineTo(drop.x - dx, drop.y - drop.len)
				ctx.stroke()
			}
		}

		// Paint one static frame so a paused-from-mount picker tile shows the
		// wallpaper instead of a solid bg-white square.
		const paintStaticFrame = () => {
			const isDark = document.documentElement.classList.contains('dark')
			ctx.fillStyle = isDark ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'
			ctx.fillRect(0, 0, cssW(), cssH())
			drawDrops(isDark)
			staticFramePainted = true
		}

		const animate = () => {
			rafId = requestAnimationFrame(animate)

			if (pausedRef.current) {
				lastTime = performance.now()
				if (!staticFramePainted) paintStaticFrame()
				return
			}

			const now = performance.now()
			// Delta in seconds, scaled by speed. Clamp to avoid a huge jump after a
			// tab is backgrounded (which would teleport the rain).
			const dt = Math.min(0.05, ((now - lastTime) / 1000) * speedRef.current)
			lastTime = now

			const isDark = document.documentElement.classList.contains('dark')
			const scheme = isDark ? COLOR_SCHEME.dark : COLOR_SCHEME.light

			const w = cssW()
			const h = cssH()

			// Soft motion-blur fade: one cheap low-alpha full-canvas fill per frame.
			ctx.fillStyle = scheme.background
			ctx.fillRect(0, 0, w, h)

			for (const drop of drops) {
				drop.y += drop.vy * dt
				drop.x += drop.vy * slant * dt // drift sideways with the slant

				// Wrap to the top once the segment fully exits the bottom; re-randomise
				// x and the horizontal position so the pattern never visibly repeats.
				if (drop.y - drop.len > h) {
					drop.y = -drop.len
					drop.x = Math.random() * w
				}
				// Keep the sideways drift inside the frame by wrapping horizontally.
				if (drop.x > w) drop.x -= w
				else if (drop.x < 0) drop.x += w
			}

			drawDrops(isDark)
		}

		animate()
		window.addEventListener('resize', resize)

		// Catch parent-size changes (settings preview tile, picker thumbs on a CSS
		// grid). ResizeObserver fires once on attach which also lets the canvas pick
		// up its true CSS box after the first layout pass.
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
		ro?.observe(canvas)

		return () => {
			cancelAnimationFrame(rafId)
			window.removeEventListener('resize', resize)
			ro?.disconnect()
		}
	}, [dropCount, slant])

	// When the caller supplies a className we assume they're providing their own
	// sizing/positioning (e.g. the settings preview tile passes `absolute
	// inset-0`). Otherwise default to pinning to the viewport like the legacy
	// wallpapers did, so <Wallpaper /> consumers work without the caller sizing
	// their parent.
	const wrapperClass = className
		? cn('overflow-hidden bg-white dark:bg-black', className)
		: 'pointer-events-none fixed inset-0 h-lvh w-full overflow-hidden bg-white dark:bg-black'

	return (
		<div className={wrapperClass}>
			<canvas ref={canvasRef} className='absolute inset-0 h-full w-full' />
		</div>
	)
})
