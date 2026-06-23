import {memo, useEffect, useRef, useState} from 'react'

import {cn} from '@/shadcn-lib/utils'

import type {AnimatedWallpaperProps} from '../animated-wallpapers'

// ─────────────────────────────────────────────────────────────────────────────
// Shared raw-WebGL2 fullscreen fragment-shader runner for Shadertoy-style
// wallpapers. NO Three.js. A fragment shader written for this runner must be
// `#version 300 es` and declare:
//   uniform vec2 resolution;  // drawing-buffer size in px
//   uniform float time;       // seconds (paused → frozen, speed → scaled)
//   uniform float dark;       // 1.0 in dark theme, 0.0 in light theme
//   out vec4 <name>;          // its colour output
//
// Theme is a UNIFORM (no GL re-init on toggle). `paused` freezes time AND skips
// the (expensive) per-pixel redraw after one frame. `renderScale` (<1) renders
// at a lower internal resolution for heavy shaders on weak iGPUs; the canvas is
// CSS-scaled back up. rAF + resize listener + GL context are all released on
// unmount.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
precision highp float;
in vec4 position;
void main(){ gl_Position = position; }`

function useIsDark(): boolean {
	const [dark, setDark] = useState(
		() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
	)
	useEffect(() => {
		const html = document.documentElement
		const body = document.body
		const read = () => setDark(html.classList.contains('dark') || body.classList.contains('dark'))
		read()
		const mo = new MutationObserver(read)
		mo.observe(html, {attributes: true, attributeFilter: ['class']})
		mo.observe(body, {attributes: true, attributeFilter: ['class']})
		return () => mo.disconnect()
	}, [])
	return dark
}

export function makeShaderWallpaper(fragmentShader: string, renderScale = 1) {
	return memo(function ShaderWallpaper({paused, speed, className}: AnimatedWallpaperProps) {
		const canvasRef = useRef<HTMLCanvasElement>(null)
		const isDark = useIsDark()

		const pausedRef = useRef(paused ?? false)
		const speedRef = useRef(speed ?? 1)
		const darkRef = useRef(isDark)
		useEffect(() => {
			pausedRef.current = paused ?? false
		}, [paused])
		useEffect(() => {
			speedRef.current = speed ?? 1
		}, [speed])
		useEffect(() => {
			darkRef.current = isDark
		}, [isDark])

		useEffect(() => {
			const canvas = canvasRef.current
			if (!canvas) return
			const gl = canvas.getContext('webgl2', {antialias: false, alpha: false})
			if (!gl) {
				console.error('WebGL2 not available — shader wallpaper cannot render')
				return
			}

			const compile = (type: number, src: string): WebGLShader => {
				const s = gl.createShader(type)!
				gl.shaderSource(s, src)
				gl.compileShader(s)
				if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
					console.error('Shader compile error:', gl.getShaderInfoLog(s))
				}
				return s
			}

			const prog = gl.createProgram()!
			gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
			gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragmentShader))
			gl.linkProgram(prog)
			if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
				console.error('Shader link error:', gl.getProgramInfoLog(prog))
			}
			gl.useProgram(prog)

			const buf = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, buf)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW)
			const posLoc = gl.getAttribLocation(prog, 'position')
			gl.enableVertexAttribArray(posLoc)
			gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

			const uRes = gl.getUniformLocation(prog, 'resolution')
			const uTime = gl.getUniformLocation(prog, 'time')
			const uDark = gl.getUniformLocation(prog, 'dark')

			const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * renderScale
			const resize = () => {
				const w = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr))
				const h = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr))
				canvas.width = w
				canvas.height = h
				gl.viewport(0, 0, w, h)
				pausedDrawn = false // force a repaint at the new size even while paused
			}

			let raf = 0
			let last = performance.now()
			let t = 0
			let pausedDrawn = false

			const draw = () => {
				if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height)
				if (uTime) gl.uniform1f(uTime, t)
				if (uDark) gl.uniform1f(uDark, darkRef.current ? 1 : 0)
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
			}

			const frame = () => {
				raf = requestAnimationFrame(frame)
				const now = performance.now()
				if (pausedRef.current) {
					last = now
					// Paint once (so theme/size changes show) then idle — don't burn the
					// GPU re-running a fullscreen shader for an unchanging frame.
					if (!pausedDrawn) {
						draw()
						pausedDrawn = true
					}
					return
				}
				pausedDrawn = false
				t += Math.min((now - last) / 1000, 0.05) * speedRef.current
				last = now
				draw()
			}

			resize()
			frame()
			window.addEventListener('resize', resize)
			const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
			ro?.observe(canvas)

			return () => {
				cancelAnimationFrame(raf)
				window.removeEventListener('resize', resize)
				ro?.disconnect()
				const lose = gl.getExtension('WEBGL_lose_context')
				lose?.loseContext()
			}
			// shader is static; theme rides the `dark` uniform → no re-init needed
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [])

		const wrapperClass = className
			? cn('overflow-hidden bg-white dark:bg-black', className)
			: 'pointer-events-none fixed inset-0 h-lvh w-full overflow-hidden bg-white dark:bg-black'

		return (
			<div className={wrapperClass}>
				<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			</div>
		)
	})
}
