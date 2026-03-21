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

// ─── Accumulated time persistence ───────────────────────────────────

const TIME_KEY = 'livinity-wallpaper-time'

function loadAccumulatedTime(): number {
	try {
		const v = localStorage.getItem(TIME_KEY)
		return v ? parseFloat(v) : 0
	} catch {
		return 0
	}
}

function saveAccumulatedTime(time: number) {
	try {
		localStorage.setItem(TIME_KEY, String(time))
	} catch {}
}

// ─── Types ──────────────────────────────────────────────────────────

export type AnimatedWallpaperProps = {
	paused?: boolean
	speed?: number
	className?: string
}

// ─── Hook ───────────────────────────────────────────────────────────

function useWebGLWallpaper(fragShader: string, baseSpeed: number = 1, paused?: boolean, speed?: number) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const animRef = useRef<number>(0)
	const accumulatedTimeRef = useRef(loadAccumulatedTime())
	const lastFrameRef = useRef(Date.now())
	const lastSaveRef = useRef(Date.now())
	const pausedRef = useRef(paused ?? false)
	const speedRef = useRef((speed ?? 1) * baseSpeed)

	useEffect(() => {
		pausedRef.current = paused ?? false
		if (paused) saveAccumulatedTime(accumulatedTimeRef.current)
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
			const dpr = Math.min(window.devicePixelRatio, 1.5)
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
				// Save periodically (every 5 seconds)
				if (now - lastSaveRef.current > 5000) {
					saveAccumulatedTime(accumulatedTimeRef.current)
					lastSaveRef.current = now
				}
			}
			lastFrameRef.current = now

			gl.clear(gl.COLOR_BUFFER_BIT)
			gl.useProgram(program)
			if (uTime) gl.uniform1f(uTime, accumulatedTimeRef.current)
			if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height)
			gl.drawArrays(gl.TRIANGLES, 0, 6)

			animRef.current = requestAnimationFrame(render)
		}

		render()

		return () => {
			window.removeEventListener('resize', resize)
			cancelAnimationFrame(animRef.current)
			saveAccumulatedTime(accumulatedTimeRef.current)
			gl.deleteProgram(program)
		}
	}, [fragShader])

	return canvasRef
}

// ─── Canvas helper ──────────────────────────────────────────────────

const DEFAULT_CANVAS_CLASS = 'pointer-events-none fixed inset-0 h-lvh w-full'

function WallpaperCanvas({fragShader, baseSpeed = 1, paused, speed, className}: AnimatedWallpaperProps & {fragShader: string; baseSpeed?: number}) {
	const ref = useWebGLWallpaper(fragShader, baseSpeed, paused, speed)
	return <canvas ref={ref} className={className ?? DEFAULT_CANVAS_CLASS} />
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

export const AuroraWallpaper = memo(function AuroraWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={AURORA_FRAG} />
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

export const NebulaWallpaper = memo(function NebulaWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={NEBULA_FRAG} />
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

export const OceanWallpaper = memo(function OceanWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={OCEAN_FRAG} />
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

export const EmberWallpaper = memo(function EmberWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={EMBER_FRAG} />
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

export const MatrixWallpaper = memo(function MatrixWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={MATRIX_FRAG} />
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

export const ChromaticWallpaper = memo(function ChromaticWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={CHROMATIC_FRAG} />
})

// ─── 7. Prism — colorful concentric rings with RGB separation ───

const PRISM_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;
  float lw = 0.002;
  vec3 color = vec3(0.0);
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 5; i++) {
      color[j] += lw * float(i * i) / abs(fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
    }
  }
  fragColor = vec4(color, 1.0);
}
`

export const PrismWallpaper = memo(function PrismWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={PRISM_FRAG} />
})

// ─── 8. Terrain — synthwave retro grid ──────────────────────────

const TERRAIN_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.2;
  vec3 color = vec3(0.02, 0.0, 0.06);
  float horizon = 0.52;

  // Sky
  if (uv.y >= horizon) {
    float skyT = (uv.y - horizon) / (1.0 - horizon);
    color = mix(vec3(0.08, 0.01, 0.15), vec3(0.01, 0.0, 0.04), skyT);
    color += vec3(0.2, 0.05, 0.25) * exp(-(uv.y - horizon) * 8.0);
  }

  // Sun
  vec2 sunP = vec2(0.5, horizon + 0.15);
  float sunD = length((uv - sunP) * vec2(1.0, 2.0));
  color += vec3(0.4, 0.1, 0.2) * smoothstep(0.25, 0.0, sunD) * 0.5;
  if (sunD < 0.1) {
    float scan = step(0.5, fract(uv.y * 60.0));
    vec3 sunC = mix(vec3(1.0, 0.2, 0.4), vec3(1.0, 0.7, 0.1), clamp((uv.y - sunP.y + 0.1) / 0.2, 0.0, 1.0));
    color = mix(color, sunC * (0.6 + 0.4 * scan), smoothstep(0.1, 0.09, sunD));
  }

  // Ground grid
  if (uv.y < horizon) {
    float gy = max(horizon - uv.y, 0.001);
    float depth = 0.12 / gy;
    float gz = depth + t * 3.0;
    float gx = (uv.x - 0.5) * depth * 2.0;
    float gridZ = abs(fract(gz * 0.25) - 0.5);
    float gridX = abs(fract(gx * 0.12) - 0.5);
    float fade = exp(-gy * 3.5);
    float lineZ = smoothstep(0.03, 0.0, gridZ) * fade;
    float lineX = smoothstep(0.02, 0.0, gridX) * fade;
    vec3 gridC = vec3(0.3, 0.08, 0.5);
    color += gridC * (lineZ + lineX) * 0.5;
    color += vec3(0.06, 0.01, 0.12) * exp(-gy * 5.0);
  }

  fragColor = vec4(color, 1.0);
}
`

export const TerrainWallpaper = memo(function TerrainWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={TERRAIN_FRAG} />
})

// ─── 9. Pixel — dithered wave pattern ───────────────────────────

const PIXEL_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

const int bayer8x8[64] = int[64](
  0,32,8,40,2,34,10,42,
  48,16,56,24,50,18,58,26,
  12,44,4,36,14,46,6,38,
  60,28,52,20,62,30,54,22,
  3,35,11,43,1,33,9,41,
  51,19,59,27,49,17,57,25,
  15,47,7,39,13,45,5,37,
  63,31,55,23,61,29,53,21
);

void main() {
  float t = 0.5 * u_time;
  float pxSize = 4.0;
  vec2 px = (gl_FragCoord.xy - 0.5 * u_resolution) / pxSize;
  vec2 puv = floor(px) * pxSize / u_resolution;

  vec2 s = puv * 4.0;
  float wave = cos(0.5 * s.x - 2.0 * t) * sin(1.5 * s.x + t) * (0.75 + 0.25 * cos(3.0 * t));
  float shape = 1.0 - smoothstep(-1.0, 1.0, s.y + wave);

  ivec2 bp = ivec2(mod(px, 8.0));
  float dither = float(bayer8x8[bp.y * 8 + bp.x]) / 64.0 - 0.5;
  float res = step(0.5, shape + dither);

  vec3 bg = vec3(0.0, 0.067, 0.133);
  vec3 fg = vec3(1.0, 0.0, 0.533);
  fragColor = vec4(mix(bg, fg, res), 1.0);
}
`

export const PixelWallpaper = memo(function PixelWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={PIXEL_FRAG} />
})

// ─── 10. Mesh — flowing multi-color blobs ───────────────────────

const MESH_FRAG = `#version 300 es
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
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.12;

  float n1 = snoise(uv * 3.0 + vec2(t * 0.3, -t * 0.2)) * 0.5 + 0.5;
  float n2 = snoise(uv * 2.5 + vec2(-t * 0.2, t * 0.15)) * 0.5 + 0.5;
  float n3 = snoise(uv * 4.0 + vec2(t * 0.1, t * 0.25)) * 0.5 + 0.5;
  float n4 = snoise(uv * 1.5 + vec2(-t * 0.15, -t * 0.1)) * 0.5 + 0.5;

  vec3 c1 = vec3(0.0, 0.0, 0.0);
  vec3 c2 = vec3(0.35, 0.2, 0.6);
  vec3 c3 = vec3(1.0, 1.0, 1.0);
  vec3 c4 = vec3(0.12, 0.1, 0.3);
  vec3 c5 = vec3(0.3, 0.1, 0.35);

  vec3 color = c1;
  color = mix(color, c4, smoothstep(0.1, 0.6, n1));
  color = mix(color, c2, smoothstep(0.3, 0.7, n2) * 0.7);
  color = mix(color, c5, smoothstep(0.2, 0.8, n3) * 0.5);
  color = mix(color, c3, smoothstep(0.65, 0.95, n1 * n2) * 0.15);

  float wireN = snoise(uv * 8.0 + vec2(t * 0.15, -t * 0.1));
  float wire = abs(sin(wireN * 12.0)) * smoothstep(0.0, 0.3, n4);
  wire = smoothstep(0.92, 0.98, wire);
  color += vec3(0.15, 0.1, 0.2) * wire;

  fragColor = vec4(color, 1.0);
}
`

export const MeshWallpaper = memo(function MeshWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={MESH_FRAG} />
})

// ─── 11. Vortex — dithered swirl pattern ────────────────────────

const VORTEX_FRAG = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;

#define TWO_PI 6.28318530718

const int bayer4x4[16] = int[16](
  0,8,2,10,
  12,4,14,6,
  3,11,1,9,
  15,7,13,5
);

void main() {
  float t = 0.5 * u_time;
  float pxSize = 5.0;
  vec2 px = (gl_FragCoord.xy - 0.5 * u_resolution) / pxSize;
  vec2 puv = floor(px) * pxSize / u_resolution;

  float l = length(puv);
  float angle = 6.0 * atan(puv.y, puv.x) + 4.0 * t;
  float twist = 1.2;
  float offset = pow(max(l, 0.001), -twist) + angle / TWO_PI;
  float mid = smoothstep(0.0, 1.0, pow(l, twist));
  float shape = mix(0.0, fract(offset), mid);

  ivec2 bp = ivec2(mod(px, 4.0));
  float dither = float(bayer4x4[bp.y * 4 + bp.x]) / 16.0 - 0.5;
  float res = step(0.5, shape + dither);

  vec3 bg = vec3(0.133, 0.0, 0.067);
  vec3 fg = vec3(0.0, 1.0, 1.0);
  fragColor = vec4(mix(bg, fg, res), 1.0);
}
`

export const VortexWallpaper = memo(function VortexWallpaper(props: AnimatedWallpaperProps) {
	return <WallpaperCanvas {...props} fragShader={VORTEX_FRAG} />
})

// ─── Wallpaper Registry ─────────────────────────────────────────

export type AnimatedWallpaperId = 'aurora' | 'nebula' | 'ocean' | 'ember' | 'matrix' | 'chromatic' | 'prism' | 'terrain' | 'pixel' | 'mesh' | 'vortex'

export const animatedWallpapers: Record<AnimatedWallpaperId, {
	component: React.ComponentType<AnimatedWallpaperProps>
	name: string
	brandColorHsl: string
}> = {
	aurora: {component: AuroraWallpaper, name: 'Aurora', brandColorHsl: '187 85% 43%'},
	nebula: {component: NebulaWallpaper, name: 'Nebula', brandColorHsl: '200 90% 35%'},
	ocean: {component: OceanWallpaper, name: 'Ocean', brandColorHsl: '210 100% 25%'},
	ember: {component: EmberWallpaper, name: 'Ember', brandColorHsl: '15 80% 30%'},
	matrix: {component: MatrixWallpaper, name: 'Matrix', brandColorHsl: '160 80% 30%'},
	chromatic: {component: ChromaticWallpaper, name: 'Chromatic', brandColorHsl: '0 0% 10%'},
	prism: {component: PrismWallpaper, name: 'Prism', brandColorHsl: '190 85% 45%'},
	terrain: {component: TerrainWallpaper, name: 'Terrain', brandColorHsl: '340 70% 35%'},
	pixel: {component: PixelWallpaper, name: 'Pixel', brandColorHsl: '330 100% 40%'},
	mesh: {component: MeshWallpaper, name: 'Mesh', brandColorHsl: '195 70% 40%'},
	vortex: {component: VortexWallpaper, name: 'Vortex', brandColorHsl: '180 100% 35%'},
}

export const animatedWallpaperIds = Object.keys(animatedWallpapers) as AnimatedWallpaperId[]
