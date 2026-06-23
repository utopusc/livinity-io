import {useEffect, useRef, memo} from 'react'

import {cn} from '@/shadcn-lib/utils'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

// ─────────────────────────────────────────────────────────────────────────────
// Drift wallpaper — soft drifting gradient blobs (2026-06-22)
//
// Same family as FluidParticlesWallpaper (calm, minimal, lightweight 2D canvas
// generative animation) but a different look: a handful (≤5) of large soft
// radial gradients that slowly drift across the canvas and gently pulse in
// radius, producing a dreamy mesh-gradient feel.
//
// PERFORMANCE — deliberately CHEAP so switching is never laggy on a Mini-PC
// iGPU:
//   - NO WebGL, NO shadowBlur/filter, NO per-pixel get/putImageData.
//   - ≤5 createRadialGradient() calls per frame, each filled once.
//   - Full clear() each frame (cheaper than a trail since blob count is tiny).
//   - Drift driven by a couple of cheap sin/cos per blob — no noise field.
//
// THEME-AWARE every frame: detects `documentElement.classList` containing
// "dark" and swaps the bg + blob colour so the same wallpaper works on both
// themes. Colours kept NEUTRAL (white/black low-alpha) so it stays calm; the
// accent hue is handled elsewhere.
//
// Honours the AnimatedWallpaperProps surface (`paused`, `speed`, `className`)
// for drop-in compatibility with the wallpaper registry. `paused` halts the
// rAF loop (painting one static frame); `speed` scales the time accumulator.
// ─────────────────────────────────────────────────────────────────────────────

type DriftProps = AnimatedWallpaperProps & {
	blobCount?: number
	maxAlpha?: number
}

interface Blob {
	// Drift is a slow Lissajous figure: each blob orbits the canvas on two
	// independent sine axes so paths never repeat into an obvious pattern.
	baseX: number
	baseY: number
	ampX: number
	ampY: number
	phaseX: number
	phaseY: number
	freqX: number
	freqY: number
	// Radius pulse.
	baseR: number
	pulseR: number
	pulsePhase: number
	pulseFreq: number
}

export const DriftWallpaper = memo(function DriftWallpaper({
	paused,
	speed,
	className,
	blobCount = 4,
	maxAlpha = 0.14,
}: DriftProps) {
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

		// Clamp to a small, sane blob count so the per-frame cost stays tiny.
		const count = Math.max(1, Math.min(blobCount, 8))

		// Read live pixel dimensions from the canvas's CSS box (set by Tailwind
		// inset-0 / h-full / etc.) and scale the bitmap by DPR for crisp drawing.
		// Falls back to viewport size if the canvas isn't laid out yet (e.g. when
		// rendered inside a 0-sized container).
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

		// Use the CSS-box dimensions for blob layout so they spread to the
		// visible area regardless of DPR scaling.
		const cssW = () => canvas.width / dpr
		const cssH = () => canvas.height / dpr

		const rand = (min: number, max: number) => Math.random() * (max - min) + min

		const blobs: Blob[] = Array.from({length: count}, () => {
			const w = cssW()
			const h = cssH()
			const span = Math.max(w, h)
			return {
				baseX: rand(0.2, 0.8) * w,
				baseY: rand(0.2, 0.8) * h,
				ampX: rand(0.18, 0.34) * w,
				ampY: rand(0.18, 0.34) * h,
				phaseX: rand(0, Math.PI * 2),
				phaseY: rand(0, Math.PI * 2),
				// Very slow orbits (radians/sec) — dreamy, never busy.
				freqX: rand(0.02, 0.06),
				freqY: rand(0.025, 0.07),
				baseR: rand(0.34, 0.52) * span,
				pulseR: rand(0.06, 0.12) * span,
				pulsePhase: rand(0, Math.PI * 2),
				pulseFreq: rand(0.05, 0.12),
			}
		})

		let rafId = 0
		let lastTime = performance.now()
		// Accumulated, speed-scaled time in seconds — drives all motion so the
		// animation is smooth and frame-rate independent.
		let t = 0

		const paintBlob = (b: Blob, w: number, h: number, isDark: boolean) => {
			const x = b.baseX + Math.sin(t * b.freqX + b.phaseX) * b.ampX
			const y = b.baseY + Math.cos(t * b.freqY + b.phaseY) * b.ampY
			const r = Math.max(1, b.baseR + Math.sin(t * b.pulseFreq + b.pulsePhase) * b.pulseR)

			const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
			if (isDark) {
				grad.addColorStop(0, `rgba(255, 255, 255, ${maxAlpha})`)
				grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
			} else {
				grad.addColorStop(0, `rgba(0, 0, 0, ${maxAlpha})`)
				grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
			}
			ctx.fillStyle = grad
			// Fill ONLY the blob's on-screen bounding box — the radial gradient is
			// fully transparent past radius r, so filling the whole canvas per blob
			// is pure overdraw. This is the big fill-rate win on a weak iGPU (the
			// "must not lag when switching" requirement).
			const x0 = Math.max(0, x - r)
			const y0 = Math.max(0, y - r)
			const bw = Math.min(w, x + r) - x0
			const bh = Math.min(h, y + r) - y0
			if (bw > 0 && bh > 0) ctx.fillRect(x0, y0, bw, bh)
		}

		// Paint one static frame (blobs at t=0) so a paused-from-mount picker
		// tile still shows the wallpaper instead of a solid bg-white square.
		const paintStaticFrame = () => {
			const isDark = document.documentElement.classList.contains('dark')
			const w = cssW()
			const h = cssH()
			ctx.clearRect(0, 0, w, h)
			ctx.fillStyle = isDark ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'
			ctx.fillRect(0, 0, w, h)
			// 'lighter' lets overlapping blobs build up softly into a mesh feel.
			ctx.globalCompositeOperation = 'lighter'
			for (const b of blobs) paintBlob(b, w, h, isDark)
			ctx.globalCompositeOperation = 'source-over'
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
			// Delta in seconds, scaled by speed. Clamp to avoid a huge jump when
			// the tab regains focus after being backgrounded.
			const dt = Math.min((now - lastTime) / 1000, 0.05) * speedRef.current
			lastTime = now
			t += dt

			const isDark = document.documentElement.classList.contains('dark')
			const w = cssW()
			const h = cssH()

			// Full clear + solid bg each frame (cheap with ≤8 blobs).
			ctx.clearRect(0, 0, w, h)
			ctx.fillStyle = isDark ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'
			ctx.fillRect(0, 0, w, h)

			ctx.globalCompositeOperation = 'lighter'
			for (const b of blobs) paintBlob(b, w, h, isDark)
			ctx.globalCompositeOperation = 'source-over'
		}

		animate()
		window.addEventListener('resize', resize)

		// Catch parent-size changes (settings preview tile mounts inside a
		// shrinking dialog, picker thumbs ride a CSS grid, etc.). ResizeObserver
		// fires once on attach which also lets the canvas pick up its true CSS
		// box after the first layout pass — important for the fixed-viewport
		// default below where the canvas's `inset-0` resolves only post-mount.
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
		ro?.observe(canvas)

		return () => {
			cancelAnimationFrame(rafId)
			window.removeEventListener('resize', resize)
			ro?.disconnect()
		}
	}, [blobCount, maxAlpha])

	// When the caller supplies a className we assume they're providing their
	// own sizing/positioning (e.g. the settings preview tile passes
	// `absolute inset-0`). Otherwise default to pinning to the viewport like
	// the legacy WebGL wallpapers did, so <Wallpaper /> consumers (desktop bg,
	// login, cover-message, 404) work without the caller having to size their
	// parent. We branch on className rather than relying on tailwind-merge to
	// strip `fixed` because `h-lvh` is not yet in every twMerge group config
	// and a stray `fixed` would bleed the wallpaper across the viewport.
	const wrapperClass = className
		? cn('overflow-hidden bg-white dark:bg-black', className)
		: 'pointer-events-none fixed inset-0 h-lvh w-full overflow-hidden bg-white dark:bg-black'

	return (
		<div className={wrapperClass}>
			<canvas ref={canvasRef} className='absolute inset-0 h-full w-full' />
		</div>
	)
})
