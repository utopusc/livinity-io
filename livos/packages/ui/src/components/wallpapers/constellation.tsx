import {useEffect, useRef, memo} from 'react'

import {cn} from '@/shadcn-lib/utils'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

// ─────────────────────────────────────────────────────────────────────────────
// LivOS Wallpaper — Constellation (network graph) — same family as Fluid.
//
// A calm, minimal 2D-canvas generative animation: ~70 slow-drifting nodes; any
// pair closer than a threshold is joined by a thin line whose alpha fades with
// distance. Nodes wrap at the edges. Monochrome + low-alpha, theme-aware
// (dark marks on white in light mode, light marks on black in dark mode).
//
// Mirrors `fluid-particles.tsx` scaffolding EXACTLY — only the draw logic
// differs. Performance is the whole point (must hold 60fps on a Mini-PC iGPU):
//   - NO WebGL, NO shadowBlur/filter, NO per-pixel getImageData/putImageData.
//   - O(n²) pair-check is bounded by `nodeCount` (≤80) → ≤3160 cheap distance
//     tests per frame, well within budget.
//   - Each frame = ONE full clear (cheap) + a handful of stroke paths + small
//     arc() fills. No allocation in the loop.
//   - `paused` halts the rAF loop (paints one static frame); `speed` scales the
//     drift accumulator. pausedRef/speedRef keep the loop from restarting.
// ─────────────────────────────────────────────────────────────────────────────

type ConstellationProps = AnimatedWallpaperProps & {
	// Node count. Capped at 80 to keep the O(n²) link pass cheap.
	nodeCount?: number
	// Max pixel distance (CSS px) at which two nodes are linked.
	linkDistance?: number
	// Node dot radius in CSS px.
	nodeRadius?: number
}

interface Node {
	x: number
	y: number
	vx: number
	vy: number
}

export const ConstellationWallpaper = memo(function ConstellationWallpaper({
	paused,
	speed,
	className,
	nodeCount = 70,
	linkDistance = 120,
	nodeRadius = 1.6,
}: ConstellationProps) {
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

		// Hard cap so the O(n²) link pass can never blow the frame budget.
		const count = Math.max(1, Math.min(80, Math.floor(nodeCount)))
		// Squared threshold so the inner loop avoids a sqrt on the reject path.
		const maxDist = Math.max(1, linkDistance)
		const maxDistSq = maxDist * maxDist

		// Read live pixel dimensions from the canvas's CSS box (set by Tailwind
		// inset-0 / h-full / etc.) and scale the bitmap by DPR for crisp drawing.
		// Falls back to viewport size if the canvas isn't laid out yet.
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

		// Use the CSS-box dimensions for node distribution so they spread to the
		// visible area regardless of DPR scaling.
		const cssW = () => canvas.width / dpr
		const cssH = () => canvas.height / dpr

		// Slow random drift (~12 CSS px/sec at speed 1) so the network breathes
		// without ever feeling busy.
		const nodes: Node[] = Array.from({length: count}, () => ({
			x: Math.random() * cssW(),
			y: Math.random() * cssH(),
			vx: (Math.random() - 0.5) * 12,
			vy: (Math.random() - 0.5) * 12,
		}))

		let rafId = 0
		let lastTime = performance.now()

		// Draw the whole scene from the nodes' CURRENT positions. Shared by the
		// paused/static path and the animated path so they look identical.
		const render = (isDark: boolean) => {
			const w = cssW()
			const h = cssH()

			// Full clear each frame (cheap) over the theme background.
			ctx.fillStyle = isDark ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'
			ctx.fillRect(0, 0, w, h)

			// Monochrome marks: dark on light theme, light on dark theme.
			const inkR = isDark ? 255 : 0

			// Links first so dots sit on top. Alpha fades with distance — close
			// pairs are (faintly) visible, distant pairs fade to nothing.
			ctx.lineWidth = 1
			for (let i = 0; i < count; i++) {
				const a = nodes[i]
				for (let j = i + 1; j < count; j++) {
					const b = nodes[j]
					const dx = a.x - b.x
					const dy = a.y - b.y
					const distSq = dx * dx + dy * dy
					if (distSq >= maxDistSq) continue
					const t = 1 - Math.sqrt(distSq) / maxDist // 1 = touching, 0 = at threshold
					const alpha = t * 0.14 // keep SUBTLE, like Fluid's ~0.15 cap
					ctx.strokeStyle = `rgba(${inkR}, ${inkR}, ${inkR}, ${alpha})`
					ctx.beginPath()
					ctx.moveTo(a.x, a.y)
					ctx.lineTo(b.x, b.y)
					ctx.stroke()
				}
			}

			// Nodes — small, low-alpha dots.
			ctx.fillStyle = `rgba(${inkR}, ${inkR}, ${inkR}, 0.15)`
			for (let i = 0; i < count; i++) {
				const n = nodes[i]
				ctx.beginPath()
				ctx.arc(n.x, n.y, nodeRadius, 0, Math.PI * 2)
				ctx.fill()
			}
		}

		// Paint one static frame so a paused-from-mount picker tile still shows
		// the wallpaper instead of a solid bg-white square.
		const paintStaticFrame = () => {
			render(document.documentElement.classList.contains('dark'))
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
			// dt in seconds, scaled by speed; clamped so a backgrounded tab that
			// resumes doesn't teleport every node across the screen.
			const dt = Math.min((now - lastTime) / 1000, 0.05) * speedRef.current
			lastTime = now

			const isDark = document.documentElement.classList.contains('dark')

			const w = cssW()
			const h = cssH()

			// Advance + wrap. Cheap: one mul + a few compares per node.
			for (let i = 0; i < count; i++) {
				const n = nodes[i]
				n.x += n.vx * dt
				n.y += n.vy * dt
				if (n.x < 0) n.x += w
				else if (n.x > w) n.x -= w
				if (n.y < 0) n.y += h
				else if (n.y > h) n.y -= h
			}

			render(isDark)
		}

		animate()
		window.addEventListener('resize', resize)

		// Catch parent-size changes (settings preview tile mounts inside a
		// shrinking dialog, picker thumbs ride a CSS grid, etc.). ResizeObserver
		// fires once on attach which also lets the canvas pick up its true CSS
		// box after the first layout pass.
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
		ro?.observe(canvas)

		return () => {
			cancelAnimationFrame(rafId)
			window.removeEventListener('resize', resize)
			ro?.disconnect()
		}
	}, [nodeCount, linkDistance, nodeRadius])

	// When the caller supplies a className we assume they're providing their own
	// sizing/positioning (e.g. the settings preview tile passes `absolute
	// inset-0`). Otherwise default to pinning to the viewport like the legacy
	// WebGL wallpapers did, so <Wallpaper /> consumers work without the caller
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
