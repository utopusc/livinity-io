import {useEffect, useRef, memo} from 'react'

import {cn} from '@/shadcn-lib/utils'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

// ─────────────────────────────────────────────────────────────────────────────
// Mist wallpaper — calm, lightweight 2D-canvas aurora haze.
//
// Same FAMILY as FluidParticlesWallpaper (theme-aware, DPR-capped, rAF loop
// with the pausedRef/speedRef pattern) but a DIFFERENT, even cheaper visual:
// 3-4 wide translucent horizontal gradient bands that slowly sway up/down and
// breathe their opacity, like soft aurora mist drifting across the screen.
//
// Performance: we CLEAR the canvas each frame and draw at most `bandCount`
// (default 4) full-width createLinearGradient rectangles. No per-pixel work, no
// shadowBlur/filter, no WebGL, no per-frame allocation beyond the gradient
// objects — comfortably 60fps on a Mini PC iGPU and instant to mount/switch.
//
// Honours the AnimatedWallpaperProps surface (`paused`, `speed`, `className`):
//   - `paused` halts the rAF loop (paints one static frame first).
//   - `speed` scales the time accumulator so bands sway faster/slower.
// ─────────────────────────────────────────────────────────────────────────────

type MistProps = AnimatedWallpaperProps & {
	// Number of mist bands stacked down the screen. Kept small (≤4) so we draw
	// ≤4 gradient rects/frame — the whole point of this wallpaper being cheap.
	bandCount?: number
	// Peak alpha of a band's centre at the brightest point of its breathing
	// cycle. Subtle by default to match the Fluid family's low-alpha calm.
	maxAlpha?: number
}

interface Band {
	// Vertical centre as a fraction of canvas height (0..1) about which the band
	// sways, the half-height (thickness) of the band, and per-band sway/breath
	// phase + frequency so the bands drift independently and never sync up.
	center: number
	thickness: number
	swayPhase: number
	swayFreq: number
	swayAmp: number
	breathPhase: number
	breathFreq: number
}

export const MistWallpaper = memo(function MistWallpaper({
	paused,
	speed,
	className,
	bandCount = 4,
	maxAlpha = 0.14,
}: MistProps) {
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

		// Read live pixel dimensions from the canvas's CSS box and scale the
		// bitmap by DPR (capped) for crisp drawing. Falls back to viewport size if
		// the canvas isn't laid out yet (e.g. rendered inside a 0-sized container).
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

		// Use the CSS-box dimensions for layout so bands span the visible area
		// regardless of DPR scaling.
		const cssW = () => canvas.width / dpr
		const cssH = () => canvas.height / dpr

		// Distribute the bands roughly evenly down the screen, each with its own
		// gentle sway and breathing parameters so the haze never looks periodic.
		const bands: Band[] = Array.from({length: bandCount}, (_, i) => ({
			center: (i + 0.5) / bandCount + (Math.random() - 0.5) * 0.08,
			thickness: 0.18 + Math.random() * 0.12,
			swayPhase: Math.random() * Math.PI * 2,
			swayFreq: 0.05 + Math.random() * 0.06,
			swayAmp: 0.05 + Math.random() * 0.05,
			breathPhase: Math.random() * Math.PI * 2,
			breathFreq: 0.08 + Math.random() * 0.07,
		}))

		let rafId = 0
		let lastTime = performance.now()
		// Seconds of "wallpaper time" elapsed (scaled by speed), drives the sway
		// and breathing so prop changes never restart the animation.
		let t = 0

		// Draw the full scene at the current `t`. Shared by the live loop and the
		// paused static-frame path so a paused-from-mount picker tile shows the
		// haze instead of a solid bg-white square.
		const drawScene = () => {
			const isDark = document.documentElement.classList.contains('dark')
			const w = cssW()
			const h = cssH()

			// Clear to the theme base each frame (cheaper than a low-alpha trail and
			// gives a perfectly clean, calm gradient with no smearing).
			ctx.fillStyle = isDark ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'
			ctx.fillRect(0, 0, w, h)

			// Mist marks: dark haze on a white bg in light theme, light haze on a
			// black bg in dark theme. Kept low-alpha for the same subtle calm as
			// Fluid. `lighter` lets overlapping bands accumulate softly.
			const prevComposite = ctx.globalCompositeOperation
			ctx.globalCompositeOperation = 'lighter'

			for (const band of bands) {
				// Sway the centre up/down and breathe the peak alpha over time.
				const cy = (band.center + Math.sin(t * band.swayFreq + band.swayPhase) * band.swayAmp) * h
				const half = band.thickness * h
				const breath = 0.55 + 0.45 * Math.sin(t * band.breathFreq + band.breathPhase)
				const peak = maxAlpha * breath

				const top = cy - half
				const bottom = cy + half
				const grad = ctx.createLinearGradient(0, top, 0, bottom)
				if (isDark) {
					grad.addColorStop(0, 'rgba(255, 255, 255, 0)')
					grad.addColorStop(0.5, `rgba(255, 255, 255, ${peak})`)
					grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
				} else {
					grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
					grad.addColorStop(0.5, `rgba(0, 0, 0, ${peak})`)
					grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
				}
				ctx.fillStyle = grad
				ctx.fillRect(0, top, w, bottom - top)
			}

			ctx.globalCompositeOperation = prevComposite
			staticFramePainted = true
		}

		const animate = () => {
			rafId = requestAnimationFrame(animate)

			if (pausedRef.current) {
				lastTime = performance.now()
				if (!staticFramePainted) drawScene()
				return
			}

			const now = performance.now()
			// Advance wallpaper-time by the real delta (seconds) scaled by speed.
			const dt = Math.min((now - lastTime) / 1000, 0.05) * speedRef.current
			lastTime = now
			t += dt

			drawScene()
		}

		animate()
		window.addEventListener('resize', resize)

		// Catch parent-size changes (settings preview tile mounts inside a
		// shrinking dialog, picker thumbs ride a CSS grid, etc.). ResizeObserver
		// also fires once on attach so the canvas picks up its true CSS box after
		// the first layout pass.
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
		ro?.observe(canvas)

		return () => {
			cancelAnimationFrame(rafId)
			window.removeEventListener('resize', resize)
			ro?.disconnect()
		}
	}, [bandCount, maxAlpha])

	// When the caller supplies a className we assume they're providing their own
	// sizing/positioning (e.g. the settings preview tile passes `absolute
	// inset-0`). Otherwise default to pinning to the viewport so <Wallpaper />
	// consumers work without the caller having to size their parent.
	const wrapperClass = className
		? cn('overflow-hidden bg-white dark:bg-black', className)
		: 'pointer-events-none fixed inset-0 h-lvh w-full overflow-hidden bg-white dark:bg-black'

	return (
		<div className={wrapperClass}>
			<canvas ref={canvasRef} className='absolute inset-0 h-full w-full' />
		</div>
	)
})
