import {useEffect, useRef, memo} from 'react'

// ─── Shared WebGL2 helpers ──────────────────────────────────────────

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
	const shader = gl.createShader(type)
	if (!shader) return null
	gl.shaderSource(shader, source)
	gl.compileShader(shader)
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error('Shader compile error:', gl.getShaderInfoLog(shader))
		gl.deleteShader(shader)
		return null
	}
	return shader
}

function createProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
	const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc)
	const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc)
	if (!vs || !fs) return null
	const program = gl.createProgram()
	if (!program) return null
	gl.attachShader(program, vs)
	gl.attachShader(program, fs)
	gl.linkProgram(program)
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error('Program link error:', gl.getProgramInfoLog(program))
		gl.deleteProgram(program)
		return null
	}
	return program
}

const VERTEX_SHADER = `#version 300 es
precision mediump float;
layout(location = 0) in vec4 a_position;
void main() { gl_Position = a_position; }
`

const FULLSCREEN_QUAD = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]

export type AnimatedWallpaperProps = {
	paused?: boolean
	speed?: number
}

function useWebGLWallpaper(fragShader: string, baseSpeed: number = 1, paused?: boolean, speed?: number) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const animRef = useRef<number>(0)
	const accumulatedTimeRef = useRef(0)
	const lastFrameRef = useRef(Date.now())
	const pausedRef = useRef(paused ?? false)
	const speedRef = useRef((speed ?? 1) * baseSpeed)

	useEffect(() => {
		pausedRef.current = paused ?? false
	}, [paused])

	useEffect(() => {
		speedRef.current = (speed ?? 1) * baseSpeed
	}, [speed, baseSpeed])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return

		const gl = canvas.getContext('webgl2', {antialias: false, alpha: false})
		if (!gl) return

		const program = createProgram(gl, VERTEX_SHADER, fragShader)
		if (!program) return

		const uTime = gl.getUniformLocation(program, 'u_time')
		const uRes = gl.getUniformLocation(program, 'u_resolution')

		const posLoc = gl.getAttribLocation(program, 'a_position')
		const buf = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, buf)
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(FULLSCREEN_QUAD), gl.STATIC_DRAW)
		gl.enableVertexAttribArray(posLoc)
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio, 1.5) // cap for performance
			canvas.width = Math.floor(canvas.clientWidth * dpr)
			canvas.height = Math.floor(canvas.clientHeight * dpr)
			gl.viewport(0, 0, canvas.width, canvas.height)
		}

		resize()
		window.addEventListener('resize', resize)

		const render = () => {
			const now = Date.now()
			if (!pausedRef.current) {
				const dt = (now - lastFrameRef.current) * 0.001 * speedRef.current
				accumulatedTimeRef.current += dt
				gl.clear(gl.COLOR_BUFFER_BIT)
				gl.useProgram(program)
				if (uTime) gl.uniform1f(uTime, accumulatedTimeRef.current)
				if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height)
				gl.drawArrays(gl.TRIANGLES, 0, 6)
			}
			lastFrameRef.current = now
			animRef.current = requestAnimationFrame(render)
		}

		render()

		return () => {
			window.removeEventListener('resize', resize)
			cancelAnimationFrame(animRef.current)
			gl.deleteProgram(program)
		}
	}, [fragShader])

	return canvasRef
}

// ─── 1. Aurora — flowing northern lights ────────────────────────────

const AURORA_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * 0.15;

  float n1 = snoise(vec2(uv.x * 2.0 + t * 0.3, uv.y * 1.5 - t * 0.2));
  float n2 = snoise(vec2(uv.x * 3.0 - t * 0.2, uv.y * 2.0 + t * 0.15));
  float n3 = snoise(vec2(uv.x * 1.5 + t * 0.1, uv.y * 3.0 - t * 0.1));

  vec3 c1 = vec3(0.05, 0.02, 0.15); // deep purple
  vec3 c2 = vec3(0.0, 0.3, 0.5);    // teal
  vec3 c3 = vec3(0.1, 0.5, 0.3);    // green
  vec3 c4 = vec3(0.02, 0.05, 0.12); // dark base

  float wave1 = smoothstep(0.3, 0.7, uv.y + n1 * 0.3);
  float wave2 = smoothstep(0.2, 0.8, uv.y + n2 * 0.25);
  float intensity = (1.0 - uv.y) * 0.6 + n3 * 0.2;

  vec3 color = mix(c4, c1, wave1 * 0.6);
  color = mix(color, c2, wave2 * intensity * 0.5);
  color = mix(color, c3, smoothstep(0.4, 0.6, n1 * n2) * intensity * 0.4);
  color += vec3(0.02, 0.04, 0.06) * (1.0 - uv.y);

  fragColor = vec4(color, 1.0);
}
`

export const AuroraWallpaper = memo(function AuroraWallpaper({paused, speed}: AnimatedWallpaperProps) {
	const ref = useWebGLWallpaper(AURORA_FRAG, 1, paused, speed)
	return <canvas ref={ref} className='pointer-events-none fixed inset-0 h-lvh w-full' />
})

// ─── 2. Nebula — swirling cosmic clouds ──────────────────────────

const NEBULA_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  for (float i = 1.0; i < 8.0; i++) {
    uv.x += 0.6 / i * cos(i * 2.5 * uv.y + t);
    uv.y += 0.6 / i * cos(i * 1.5 * uv.x + t);
  }

  float r = 0.15 / abs(sin(t - uv.y - uv.x));
  r = smoothstep(0.0, 1.0, r);

  vec3 c1 = vec3(0.15, 0.0, 0.3);
  vec3 c2 = vec3(0.0, 0.1, 0.4);
  vec3 c3 = vec3(0.4, 0.05, 0.2);

  vec3 color = mix(c1, c2, r);
  color = mix(color, c3, smoothstep(0.3, 0.8, r));
  color *= 0.7;

  fragColor = vec4(color, 1.0);
}
`

export const NebulaWallpaper = memo(function NebulaWallpaper({paused, speed}: AnimatedWallpaperProps) {
	const ref = useWebGLWallpaper(NEBULA_FRAG, 1, paused, speed)
	return <canvas ref={ref} className='pointer-events-none fixed inset-0 h-lvh w-full' />
})

// ─── 3. Ocean — deep water waves ────────────────────────────────

const OCEAN_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * 0.2;

  float wave = 0.0;
  for (float i = 1.0; i < 6.0; i++) {
    wave += sin(uv.x * i * 3.0 + t * i * 0.5) * cos(uv.y * i * 2.0 - t * i * 0.3) / i;
  }
  wave = wave * 0.5 + 0.5;

  vec3 deep = vec3(0.01, 0.03, 0.12);
  vec3 mid = vec3(0.0, 0.08, 0.22);
  vec3 surface = vec3(0.0, 0.15, 0.35);
  vec3 highlight = vec3(0.1, 0.3, 0.5);

  float depth = uv.y * 0.7 + wave * 0.3;
  vec3 color = mix(deep, mid, smoothstep(0.0, 0.4, depth));
  color = mix(color, surface, smoothstep(0.3, 0.7, depth));
  color = mix(color, highlight, smoothstep(0.6, 1.0, wave) * (1.0 - uv.y) * 0.3);

  fragColor = vec4(color, 1.0);
}
`

export const OceanWallpaper = memo(function OceanWallpaper({paused, speed}: AnimatedWallpaperProps) {
	const ref = useWebGLWallpaper(OCEAN_FRAG, 1, paused, speed)
	return <canvas ref={ref} className='pointer-events-none fixed inset-0 h-lvh w-full' />
})

// ─── 4. Ember — warm flowing gradients ──────────────────────────

const EMBER_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * 0.1;

  float n = 0.0;
  float amp = 0.5;
  vec2 p = uv * 3.0;
  for (int i = 0; i < 5; i++) {
    n += amp * (sin(p.x + t) * cos(p.y - t * 0.7) * 0.5 + 0.5);
    p *= 2.0;
    amp *= 0.5;
    t *= 1.2;
  }

  vec3 c1 = vec3(0.12, 0.02, 0.02); // dark red
  vec3 c2 = vec3(0.4, 0.08, 0.0);   // ember
  vec3 c3 = vec3(0.6, 0.2, 0.0);    // orange glow
  vec3 c4 = vec3(0.08, 0.02, 0.05); // deep dark

  vec3 color = mix(c4, c1, smoothstep(0.2, 0.5, n));
  color = mix(color, c2, smoothstep(0.4, 0.7, n));
  color = mix(color, c3, smoothstep(0.6, 0.9, n) * 0.4);

  fragColor = vec4(color, 1.0);
}
`

export const EmberWallpaper = memo(function EmberWallpaper({paused, speed}: AnimatedWallpaperProps) {
	const ref = useWebGLWallpaper(EMBER_FRAG, 1, paused, speed)
	return <canvas ref={ref} className='pointer-events-none fixed inset-0 h-lvh w-full' />
})

// ─── 5. Matrix — digital rain lines ────────────────────────────

const MATRIX_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

#define TWO_PI 6.2831853072

float hash11(float p) {
  p = fract(p * 0.3183099) + 0.1;
  p *= p + 19.19;
  return fract(p * p);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  vec2 mosaicScale = vec2(4.0, 2.0);
  vec2 screen = vec2(256.0);
  uv.x = floor(uv.x * screen.x / mosaicScale.x) / (screen.x / mosaicScale.x);
  uv.y = floor(uv.y * screen.y / mosaicScale.y) / (screen.y / mosaicScale.y);

  float tt = t + hash11(uv.x) * 0.4;
  float lineWidth = 0.0008;

  vec3 color = vec3(0.0);
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 5; i++) {
      color[j] += lineWidth * float(i * i) / abs(fract(tt - 0.01 * float(j) + float(i) * 0.01) * 1.0 - length(uv));
    }
  }

  // Swap channels for teal/cyan look
  fragColor = vec4(color.z * 0.3, color.y * 0.8, color.x * 1.2, 1.0);
}
`

export const MatrixWallpaper = memo(function MatrixWallpaper({paused, speed}: AnimatedWallpaperProps) {
	const ref = useWebGLWallpaper(MATRIX_FRAG, 1, paused, speed)
	return <canvas ref={ref} className='pointer-events-none fixed inset-0 h-lvh w-full' />
})

// ─── 6. Chromatic Wave — light refraction ───────────────────────

const CHROMATIC_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.4;

  float d = length(p) * 0.05;
  float xScale = 1.2;
  float yScale = 0.4;

  float rx = p.x * (1.0 + d);
  float gx = p.x;
  float bx = p.x * (1.0 - d);

  float r = 0.04 / abs(p.y + sin((rx + t) * xScale) * yScale);
  float g = 0.04 / abs(p.y + sin((gx + t) * xScale) * yScale);
  float b = 0.04 / abs(p.y + sin((bx + t) * xScale) * yScale);

  vec3 color = vec3(r, g, b) * 0.8;
  fragColor = vec4(color, 1.0);
}
`

export const ChromaticWallpaper = memo(function ChromaticWallpaper({paused, speed}: AnimatedWallpaperProps) {
	const ref = useWebGLWallpaper(CHROMATIC_FRAG, 1, paused, speed)
	return <canvas ref={ref} className='pointer-events-none fixed inset-0 h-lvh w-full' />
})

// ─── Wallpaper Registry ─────────────────────────────────────────

export type AnimatedWallpaperId = 'aurora' | 'nebula' | 'ocean' | 'ember' | 'matrix' | 'chromatic'

export const animatedWallpapers: Record<AnimatedWallpaperId, {
	component: React.ComponentType<AnimatedWallpaperProps>
	name: string
	brandColorHsl: string
}> = {
	aurora: {
		component: AuroraWallpaper,
		name: 'Aurora',
		brandColorHsl: '265 100% 40%',
	},
	nebula: {
		component: NebulaWallpaper,
		name: 'Nebula',
		brandColorHsl: '270 100% 30%',
	},
	ocean: {
		component: OceanWallpaper,
		name: 'Ocean',
		brandColorHsl: '210 100% 25%',
	},
	ember: {
		component: EmberWallpaper,
		name: 'Ember',
		brandColorHsl: '15 80% 30%',
	},
	matrix: {
		component: MatrixWallpaper,
		name: 'Matrix',
		brandColorHsl: '180 100% 25%',
	},
	chromatic: {
		component: ChromaticWallpaper,
		name: 'Chromatic',
		brandColorHsl: '0 0% 10%',
	},
}

export const animatedWallpaperIds = Object.keys(animatedWallpapers) as AnimatedWallpaperId[]
