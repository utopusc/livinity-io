import {useEffect, useRef, memo} from 'react'

import {cn} from '@/shadcn-lib/utils'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

// ─────────────────────────────────────────────────────────────────────────────
// Waves wallpaper — calm "topographic" stacked horizontal lines.
//
// Same family as FluidParticlesWallpaper: a lightweight, theme-aware 2D-canvas
// generative animation. Different look (parallel contour lines instead of a
// particle field) but the SAME minimal, low-alpha, meditative register.
//
// Visual: ~7 horizontal strokes span the full width. Each is the sum of two
// sines (different frequency/phase) so the curve breathes organically rather
// than reading as a single perfect sine. Phases drift slowly over time; lines
// never restart on prop change.
//
// Performance (must stay 60fps on a Mini-PC iGPU):
//   - NO WebGL, NO shadowBlur/filter, NO getImageData/putImageData.
//   - Each frame walks ~7 lines × (width / 16px) points → at 1080p that's
//     7 × ~120 ≈ 840 lineTo() calls then ONE stroke() per line. Tiny.
//   - Trail/fade via a single low-alpha full-canvas fillRect (like Fluid).
//   - Effect deps are stable tuning primitives only, so the rAF loop is never
//     torn down on paused/speed changes (pausedRef/speedRef pattern).
//
// Theme-aware every frame: dark marks on a white-ish bg in light theme;
// light marks on a black-ish bg in dark theme. Colours are neutral and very
// low-alpha so the look stays calm; the accent hue is handled elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

type WavesProps = AnimatedWallpaperProps & {
	// Number of stacked horizontal lines. Kept small for the perf budget.
	lineCount?: number
	// Horizontal sampling step in CSS px. Larger = fewer points = cheaper.
	stepPx?: number
	// Base vertical amplitude (CSS px) of each line's wobble.
	amplitude?: number
}

// Per-theme trail-fill alpha for the soft photographic fade between frames.
const COLOR_SCHEME = {
	light: {background: 'rgba(255, 255, 255, 0.10)'},
	dark: {background: 'rgba(0, 0, 0, 0.10)'},
} as const

export const WavesWallpaper = memo(function WavesWallpaper({
	paused,
	speed,
	className,
	lineCount = 7,
	stepPx = 16,
	amplitude = 26,
}: WavesProps) {
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
		// bitmap by DPR for crisp lines. Falls back to viewport size if the
		// canvas isn't laid out yet (e.g. a 0-sized container at first paint).
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

		// Use the CSS-box dimensions so the lines span the visible area
		// regardless of DPR scaling.
		const cssW = () => canvas.width / dpr
		const cssH = () => canvas.height / dpr

		// Per-line constants. Each line gets its own two-sine recipe + phase
		// offsets so the stack reads as organic, not as parallel clones. These
		// are deterministic-ish (derived from the index) so a remount looks the
		// same and nothing is reallocated per frame.
		const lines = Array.from({length: Math.max(1, lineCount)}, (_, i) => {
			const t = lineCount > 1 ? i / (lineCount - 1) : 0.5
			return {
				// Vertical centre as a fraction of height (evenly stacked with
				// a little inset top/bottom so edges don't clip the wobble).
				yFrac: 0.12 + t * 0.76,
				// Two spatial frequencies (radians per CSS px). Slightly varied
				// per line so peaks don't align across the stack.
				freqA: 0.0042 + (i % 3) * 0.0006,
				freqB: 0.0021 + (i % 2) * 0.0005,
				// Phase drift speeds (radians per second) — slow + meditative,
				// alternating sign so adjacent lines drift opposite ways.
				driftA: (i % 2 === 0 ? 1 : -1) * (0.16 + (i % 4) * 0.02),
				driftB: (i % 2 === 0 ? -1 : 1) * (0.1 + (i % 3) * 0.015),
				// Static phase offset so lines start out of sync.
				phaseA: i * 1.7,
				phaseB: i * 0.9,
				// Amplitude eases toward the middle of the stack for a gentle
				// "bulge", with a small per-line variation.
				amp: amplitude * (0.7 + 0.3 * Math.sin(t * Math.PI)) * (0.85 + (i % 3) * 0.08),
			}
		})

		let rafId = 0
		let lastTime = performance.now()
		// Accumulated animation time in seconds (scaled by speed). Drives the
		// phase drift; advancing only this (not real time) makes speed/pause
		// behave smoothly.
		let elapsed = 0

		// Draw the full stack at the current `elapsed`. Shared by the live loop
		// and the paused static-frame path.
		const drawLines = (isDark: boolean) => {
			const w = cssW()
			const strokeStyle = isDark
				? 'rgba(255, 255, 255, 0.16)'
				: 'rgba(0, 0, 0, 0.16)'
			ctx.lineWidth = 1.25
			ctx.lineJoin = 'round'
			ctx.lineCap = 'round'
			ctx.strokeStyle = strokeStyle

			const baseH = cssH()
			for (const line of lines) {
				const yc = line.yFrac * baseH
				const pa = line.phaseA + line.driftA * elapsed
				const pb = line.phaseB + line.driftB * elapsed
				ctx.beginPath()
				for (let x = 0; x <= w; x += stepPx) {
					const y =
						yc +
						Math.sin(x * line.freqA + pa) * line.amp +
						Math.sin(x * line.freqB + pb) * line.amp * 0.5
					if (x === 0) ctx.moveTo(0, y)
					else ctx.lineTo(x, y)
				}
				ctx.stroke()
			}
		}

		// Paint one static frame so a paused-from-mount picker tile shows the
		// wallpaper instead of a solid bg-white square. Uses an opaque bg fill
		// (not the trailing low-alpha one) so the single frame reads cleanly.
		const paintStaticFrame = () => {
			const isDark = document.documentElement.classList.contains('dark')
			ctx.fillStyle = isDark ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'
			ctx.fillRect(0, 0, cssW(), cssH())
			drawLines(isDark)
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
			// dt in seconds, scaled by speed. Clamp to avoid a huge jump after
			// a tab is backgrounded.
			const dt = Math.min((now - lastTime) / 1000, 0.1) * speedRef.current
			lastTime = now
			elapsed += dt

			const isDark = document.documentElement.classList.contains('dark')
			const scheme = isDark ? COLOR_SCHEME.dark : COLOR_SCHEME.light

			// Low-alpha full-canvas fill = soft trailing fade between frames.
			ctx.fillStyle = scheme.background
			ctx.fillRect(0, 0, cssW(), cssH())

			drawLines(isDark)
		}

		animate()
		window.addEventListener('resize', resize)

		// Catch parent-size changes (settings preview tile, picker grid, etc.).
		// ResizeObserver fires once on attach which also lets the canvas pick up
		// its true CSS box after the first layout pass.
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
		ro?.observe(canvas)

		return () => {
			cancelAnimationFrame(rafId)
			window.removeEventListener('resize', resize)
			ro?.disconnect()
		}
	}, [lineCount, stepPx, amplitude])

	// When the caller supplies a className we assume they're providing their
	// own sizing/positioning (e.g. the settings preview tile passes
	// `absolute inset-0`). Otherwise default to pinning to the viewport like
	// the other wallpapers so <Wallpaper /> consumers work without the caller
	// having to size their parent.
	const wrapperClass = className
		? cn('overflow-hidden bg-white dark:bg-black', className)
		: 'pointer-events-none fixed inset-0 h-lvh w-full overflow-hidden bg-white dark:bg-black'

	return (
		<div className={wrapperClass}>
			<canvas ref={canvasRef} className='absolute inset-0 h-full w-full' />
		</div>
	)
})
