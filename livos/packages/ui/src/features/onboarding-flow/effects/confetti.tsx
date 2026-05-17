import {useEffect, useRef} from 'react'

type Particle = {
	x: number
	y: number
	vx: number
	vy: number
	r: number
	a: number
	rot: number
	vr: number
	shape: 'dot' | 'tick'
}

/**
 * Minimal monochrome confetti shower. Ported from reference effects.jsx
 * Confetti. Reads `--fg` from body so the particles pick up the current
 * theme — falls back to #1d1d1f if the var isn't set.
 */
export function Confetti({active, duration = 2200}: {active: boolean; duration?: number}) {
	const ref = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		if (!active) return
		// 139-05 — skip confetti entirely under prefers-reduced-motion.
		if (
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		)
			return
		const canvas = ref.current
		if (!canvas) return
		const dpr = Math.min(window.devicePixelRatio || 1, 2)
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		canvas.width = w * dpr
		canvas.height = h * dpr
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		ctx.scale(dpr, dpr)

		const N = 64
		const fg = getComputedStyle(document.body).getPropertyValue('--fg').trim() || '#1d1d1f'
		const particles: Particle[] = Array.from({length: N}, () => ({
			x: w / 2 + (Math.random() - 0.5) * 80,
			y: h * 0.65,
			vx: (Math.random() - 0.5) * 4.5,
			vy: -Math.random() * 9 - 5,
			r: Math.random() * 2.2 + 1.2,
			a: 1,
			rot: Math.random() * Math.PI,
			vr: (Math.random() - 0.5) * 0.2,
			shape: Math.random() < 0.5 ? 'dot' : 'tick',
		}))
		const start = performance.now()
		let raf = 0
		const draw = (t: number) => {
			const elapsed = t - start
			ctx.clearRect(0, 0, w, h)
			particles.forEach((p) => {
				p.vy += 0.18
				p.vx *= 0.995
				p.x += p.vx
				p.y += p.vy
				p.rot += p.vr
				p.a = Math.max(0, 1 - elapsed / duration)
				ctx.globalAlpha = p.a
				ctx.fillStyle = fg
				if (p.shape === 'dot') {
					ctx.beginPath()
					ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
					ctx.fill()
				} else {
					ctx.save()
					ctx.translate(p.x, p.y)
					ctx.rotate(p.rot)
					ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8)
					ctx.restore()
				}
			})
			if (elapsed < duration) raf = requestAnimationFrame(draw)
			else ctx.clearRect(0, 0, w, h)
		}
		raf = requestAnimationFrame(draw)
		return () => cancelAnimationFrame(raf)
	}, [active, duration])

	return <canvas ref={ref} className='fx-confetti-canvas' aria-hidden='true' />
}
