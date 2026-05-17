import {useEffect} from 'react'

/**
 * Drives the ambient orbs (`.onb-ambient-orb`) parallax with the cursor.
 *
 * Ported from reference effects.jsx ParallaxOrbs. Looks up orb divs already
 * rendered by the wizard shell, attaches a mousemove + RAF loop, writes
 * `--px` / `--py` CSS vars so the stylesheet's drift keyframes compose
 * with the cursor offset.
 *
 * Phase 139-04 perf gating: pauses the RAF loop when the tab is hidden,
 * and early-returns entirely when the OS asks for reduced motion (139-05).
 */
export function ParallaxOrbs() {
	useEffect(() => {
		// 139-05 — respect prefers-reduced-motion: don't drive any animation.
		const reducedMotion =
			typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		if (reducedMotion) return

		const orbs = document.querySelectorAll<HTMLElement>('.onb-ambient-orb')
		if (!orbs.length) return

		let raf = 0
		let tx = 0
		let ty = 0
		let cx = 0
		let cy = 0
		let paused = document.visibilityState !== 'visible'

		const onMove = (e: MouseEvent) => {
			const w = window.innerWidth
			const h = window.innerHeight
			tx = (e.clientX / w - 0.5) * 2 // -1..1
			ty = (e.clientY / h - 0.5) * 2
		}
		const tick = () => {
			if (paused) {
				raf = requestAnimationFrame(tick)
				return
			}
			cx += (tx - cx) * 0.08
			cy += (ty - cy) * 0.08
			orbs.forEach((orb, i) => {
				const depth = [22, -18, 12][i] ?? 14
				orb.style.setProperty('--px', `${cx * depth}px`)
				orb.style.setProperty('--py', `${cy * depth}px`)
			})
			raf = requestAnimationFrame(tick)
		}
		const onVis = () => {
			paused = document.visibilityState !== 'visible'
		}
		window.addEventListener('mousemove', onMove)
		document.addEventListener('visibilitychange', onVis)
		raf = requestAnimationFrame(tick)
		return () => {
			window.removeEventListener('mousemove', onMove)
			document.removeEventListener('visibilitychange', onVis)
			cancelAnimationFrame(raf)
		}
	}, [])
	return null
}
