import {makeShaderWallpaper} from './shader-runner'

// ─────────────────────────────────────────────────────────────────────────────
// Stars wallpaper — from Matthias Hurrle (@atzedent)'s cosmic shader, with the
// cloud/nebula BACKGROUND removed per the user's request ("take only the stars").
// Just the drifting, glowing coloured star points. Theme-aware via the `dark`
// uniform: glowing stars on black (dark) / coloured specks on a soft sky (light).
// Runs on the shared WebGL2 fullscreen runner (no Three.js). 12-iteration loop —
// moderate; rendered at 0.85x for headroom on a weak iGPU.
// ─────────────────────────────────────────────────────────────────────────────

const STARS_FRAG = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
uniform float dark;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p){ p=fract(p*vec2(12.9898,78.233)); p+=dot(p,p+34.56); return fract(p.x*p.y); }
float noise(in vec2 p){
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float a=rnd(i), b=rnd(i+vec2(1,0)), c=rnd(i+vec2(0,1)), d=rnd(i+1.);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
void main(){
  vec2 uv=(FC-.5*R)/MN;
  vec3 col=vec3(0);
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for (float i=1.; i<12.; i++) {
    uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p);
    col+=.002*b/length(max(p, vec2(b*p.x*.02, p.y)));
  }
  // Dark theme: glowing stars on black. Light theme: coloured specks on a soft sky.
  vec3 lightCol = clamp(vec3(0.93,0.95,0.99) - col*1.4, 0.0, 1.0);
  vec3 outc = mix(lightCol, col, dark);
  O=vec4(outc, 1.0);
}`

export const StarsWallpaper = makeShaderWallpaper(STARS_FRAG, 0.85)
