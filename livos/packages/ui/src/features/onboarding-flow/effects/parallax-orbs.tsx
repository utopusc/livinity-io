import {useEffect} from 'react'

/**
 * Drives the ambient orbs (`.onb-ambient-orb`) parallax with the cursor.
 *
 * Ported from reference effects.jsx ParallaxOrbs. Looks up orb divs already
 * rendered by the wizard shell, attaches a mousemove + RAF loop, writes
 * `--px` / `--py` CSS vars so the stylesheet's drift keyframes compose
 * with the cursor offset.
 */
export function ParallaxOrbs() {
	useEffect(() => {
		const orbs = document.querySelectorAll<HTMLElement>('.onb-ambient-orb')
		if (!orbs.length) return

		let raf = 0
		let tx = 0
		let ty = 0
		let cx = 0
		let cy = 0

		const onMove = (e: MouseEvent) => {
			const w = window.innerWidth
			const h = window.innerHeight
			tx = (e.clientX / w - 0.5) * 2 // -1..1
			ty = (e.clientY / h - 0.5) * 2
		}
		const tick = () => {
			cx += (tx - cx) * 0.08
			cy += (ty - cy) * 0.08
			orbs.forEach((orb, i) => {
				const depth = [22, -18, 12][i] ?? 14
				orb.style.setProperty('--px', `${cx * depth}px`)
				orb.style.setProperty('--py', `${cy * depth}px`)
			})
			raf = requestAnimationFrame(tick)
		}
		window.addEventListener('mousemove', onMove)
		raf = requestAnimationFrame(tick)
		return () => {
			window.removeEventListener('mousemove', onMove)
			cancelAnimationFrame(raf)
		}
	}, [])
	return null
}
