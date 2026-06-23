// ─────────────────────────────────────────────────────────────────────────────
// v36 LivOS Design Port — wallpaper registry (2026-05-15)
//
// History: this file previously hosted 11 WebGL2 fragment-shader wallpapers
// (Aurora / Nebula / Ocean / Ember / Matrix / Chromatic / Prism / Terrain /
// Pixel / Mesh / Vortex) totalling ~670 lines. Per user direction 2026-05-15
// the system has been pared back to a single photo-feel wallpaper as the
// foundation for an explicit light/dark theme split. Future wallpapers will
// land here tagged with their target theme.
//
// The file name + public exports are preserved (AnimatedWallpaperProps,
// AnimatedWallpaperId, animatedWallpapers, animatedWallpaperIds) so every
// consumer of the wallpaper provider keeps working without an import sweep.
// Rename to `wallpapers.tsx` is deferred to a follow-up phase.
//
// Foundation: each registry entry now carries a `theme` discriminator:
//   - 'light' : intended for the LIGHT theme only
//   - 'dark'  : intended for the DARK theme only
//   - 'auto'  : adapts to whichever theme is active at runtime
// The wallpaper picker UI uses this to group entries into Light / Dark / Both
// rails. Today's single entry (`fluid`) is 'auto' — it inspects
// `documentElement.classList.contains('dark')` per frame.
// ─────────────────────────────────────────────────────────────────────────────

import type React from 'react'

import {AuroraWallpaper} from './wallpapers/aurora'
import {AuroraClockWallpaper} from './wallpapers/aurora-clock'
import {DreamWallpaper} from './wallpapers/dream'
import {FluidParticlesWallpaper} from './wallpapers/fluid-particles'
import {MeshWallpaper} from './wallpapers/mesh'
import {NebulaWallpaper} from './wallpapers/nebula'
import {StarsWallpaper} from './wallpapers/stars'

// ─── Types ──────────────────────────────────────────────────────────────────

export type AnimatedWallpaperProps = {
	paused?: boolean
	speed?: number
	className?: string
}

export type WallpaperTheme = 'light' | 'dark' | 'auto'

export type AnimatedWallpaperId = 'fluid' | 'aurora' | 'aurora-clock' | 'dream' | 'mesh' | 'nebula' | 'stars'

export interface AnimatedWallpaperEntry {
	component: React.ComponentType<AnimatedWallpaperProps>
	name: string
	/** Brand HSL used by the accent-color system when no custom accent is set. */
	brandColorHsl: string
	/** Which theme this wallpaper is designed for. 'auto' adapts at runtime. */
	theme: WallpaperTheme
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const animatedWallpapers: Record<AnimatedWallpaperId, AnimatedWallpaperEntry> = {
	fluid: {
		component: FluidParticlesWallpaper,
		name: 'Fluid',
		brandColorHsl: '0 0% 50%',
		theme: 'auto',
	},
	// Aceternity "Aurora Background" (MIT), pure-CSS — colourful northern-lights
	// glow, GPU-composited (very low RAM). The first of the "hero" wallpapers.
	aurora: {
		component: AuroraWallpaper,
		name: 'Aurora',
		brandColorHsl: '217 91% 60%',
		theme: 'auto',
	},
	// Aurora background + a large centred live clock.
	'aurora-clock': {
		component: AuroraClockWallpaper,
		name: 'Aurora Clock',
		brandColorHsl: '217 91% 60%',
		theme: 'auto',
	},
	// "Aurora Dream Corner Whispers" (MIT) — STATIC pastel corner glows, the
	// lightest possible wallpaper (no animation). Theme-aware.
	dream: {
		component: DreamWallpaper,
		name: 'Dream',
		brandColorHsl: '280 70% 65%',
		theme: 'auto',
	},
	// Stripe-style WebGL mesh gradient (MIT). A WebGL wallpaper — richer but
	// heavier; theme-aware (light/dark colour sets).
	mesh: {
		component: MeshWallpaper,
		name: 'Mesh',
		brandColorHsl: '224 76% 48%',
		theme: 'auto',
	},
	// Flowing aurora WebGL shader (the "AnoAI" one), raw-WebGL2 (no Three.js).
	// Dark theme good as-is; light theme is a soft pastel wash (v44.75 fix).
	nebula: {
		component: NebulaWallpaper,
		name: 'Nebula',
		brandColorHsl: '280 65% 60%',
		theme: 'auto',
	},
	// Glowing star points (cloud background removed), WebGL2 shader. Dark good;
	// light theme reworked to coloured points on a soft sky (v44.75 fix).
	stars: {
		component: StarsWallpaper,
		name: 'Stars',
		brandColorHsl: '230 60% 60%',
		theme: 'auto',
	},
}

export const animatedWallpaperIds = Object.keys(animatedWallpapers) as AnimatedWallpaperId[]
