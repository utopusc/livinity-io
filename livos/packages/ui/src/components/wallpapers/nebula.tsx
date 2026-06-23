import {makeShaderWallpaper} from './shader-runner'

// ─────────────────────────────────────────────────────────────────────────────
// Nebula wallpaper — the flowing-aurora shader the user loved (originally a
// Three.js ShaderMaterial). Re-implemented on the shared raw-WebGL2 runner (NO
// Three.js dependency) and ported to GLSL ES 3.00 (it needs `tanh`). Theme-aware
// via the `dark` uniform: glowing aurora streaks on black (dark) / the aurora
// colours washed over a soft light sky (light).
//
// ⚠️ Heavy: a 35-iteration loop with 3-octave fbm PER PIXEL. Rendered at 0.6x
// internal resolution to keep it ~60fps on a weak iGPU; still the most demanding
// wallpaper in the set.
// ─────────────────────────────────────────────────────────────────────────────

const NEBULA_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform float time;
uniform vec2 resolution;
uniform float dark;

#define NUM_OCTAVES 3

float rand(vec2 n) {
  return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 ip = floor(p);
  vec2 u = fract(p);
  u = u*u*(3.0-2.0*u);
  float res = mix(
    mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
    mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
  return res * res;
}

float fbm(vec2 x) {
  float v = 0.0;
  float a = 0.3;
  vec2 shift = vec2(100);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < NUM_OCTAVES; ++i) {
    v += a * noise(x);
    x = rot * x * 2.0 + shift;
    a *= 0.4;
  }
  return v;
}

void main() {
  vec2 shake = vec2(sin(time * 1.2) * 0.005, cos(time * 2.1) * 0.005);
  vec2 p = ((gl_FragCoord.xy + shake * resolution.xy) - resolution.xy * 0.5) / resolution.y * mat2(6.0, -4.0, 4.0, 6.0);
  vec2 v;
  vec4 o = vec4(0.0);

  float f = 2.0 + fbm(p + vec2(time * 5.0, 0.0)) * 0.5;

  for (float i = 0.0; i < 35.0; i++) {
    v = p + cos(i * i + (time + p.x * 0.08) * 0.025 + i * vec2(13.0, 11.0)) * 3.5 + vec2(sin(time * 3.0 + i) * 0.003, cos(time * 3.5 - i) * 0.003);
    float tailNoise = fbm(v + vec2(time * 0.5, i)) * 0.3 * (1.0 - (i / 35.0));
    vec4 auroraColors = vec4(
      0.1 + 0.3 * sin(i * 0.2 + time * 0.4),
      0.3 + 0.5 * cos(i * 0.3 + time * 0.5),
      0.7 + 0.3 * sin(i * 0.4 + time * 0.3),
      1.0
    );
    vec4 currentContribution = auroraColors * exp(sin(i * i + time * 0.8)) / length(max(v, vec2(v.x * f * 0.015, v.y * 1.5)));
    float thinnessFactor = smoothstep(0.0, 1.0, i / 35.0) * 0.6;
    o += currentContribution * (1.0 + tailNoise * 0.8) * thinnessFactor;
  }

  o = tanh(pow(o / 100.0, vec4(1.6)));
  vec3 c = o.rgb * 1.5;

  // Dark theme: aurora glow on black. Light theme: aurora colours over a soft sky.
  vec3 lightBase = vec3(0.95, 0.96, 1.0);
  vec3 lit = mix(lightBase, c, clamp(length(c), 0.0, 1.0));
  vec3 outc = mix(lit, c, dark);
  fragColor = vec4(outc, 1.0);
}`

export const NebulaWallpaper = makeShaderWallpaper(NEBULA_FRAG, 0.6)
