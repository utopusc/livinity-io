// LauncherIcon — the C2 "Frameless Frost" app-icon treatment, picked by the
// operator in /icon-lab (Phase 2 of .planning/ICON-TILE-PLAN.md, 2026-06-11).
//
// One component for all three launcher surfaces (desktop grid, dock,
// Launchpad grid):
//   • full-bleed icons (n8n, Jellyfin…) cover the tile edge-to-edge → they
//     appear exactly as themselves, NO frame/outline
//   • transparent logos (Coolify, Obsidian, favicons…) sit at 80% on a
//     frameless frosted squircle (theme-aware, no border — the "çerçeve"
//     the operator rejected was the dock tile's 1px outline)
//
// Layout contract: fills its PARENT box (h-full w-full) and inherits the
// parent's border-radius — each surface keeps its own size/radius/shadow
// chrome. Shadows must live on the parent (this element is usually inside
// an overflow-hidden container, which would clip an inner box-shadow).
//
// The shared components/app-icon.tsx (20+ app-store consumers) is
// intentionally NOT touched — App Store surfaces keep the plain <img>.

import {useEffect, useState} from 'react'

import {useTheme} from '@/hooks/use-theme'
import {cn} from '@/shadcn-lib/utils'

// Same asset as APP_ICON_PLACEHOLDER_SRC in modules/desktop/app-icon.tsx —
// duplicated here (not imported) to avoid a circular import: app-icon.tsx
// renders LauncherIcon.
const PLACEHOLDER_SRC = '/figma-exports/app-icon-placeholder.svg'

// ── Pixel analysis (48px canvas, alpha-ratio + chroma-weighted hue vote) ──
//
// ALL app icons are remote (github/jsdelivr/supabase send ACAO:*, google/
// antigravity favicons do NOT) so crossOrigin='anonymous' + try/catch around
// getImageData is the whole CORS story. NEVER add a same-origin guard — it
// would silently disable analysis for every icon. Production (this file)
// only consumes `transparent`; the color fields feed /icon-lab and a
// potential Phase-4 catalog-fix script.

export type IconAnalysis = {
	/** alpha-ratio > 0.12 — logo-on-transparent (full-bleed rounded corners ≈ 0.04-0.06). */
	transparent: boolean
	/** Dominant color (clamped vivid s 0.55-0.85, l 0.42-0.58), or null for monochrome logos. */
	color: {h: number; s: number; l: number} | null
	/** Mean lightness of opaque marks — picks dark vs white tile for monochrome logos. */
	markLightness: number
}

export type IconAnalysisState = {status: 'pending'} | {status: 'blocked'} | {status: 'done'; a: IconAnalysis}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function computeAnalysis(data: Uint8ClampedArray): IconAnalysis {
	const total = data.length / 4
	const BUCKETS = 12
	const weight = new Array(BUCKETS).fill(0)
	const satSum = new Array(BUCKETS).fill(0)
	const lightSum = new Array(BUCKETS).fill(0)
	const hueX = new Array(BUCKETS).fill(0)
	const hueY = new Array(BUCKETS).fill(0)
	let transparentCount = 0
	let opaqueCount = 0
	let lightnessTotal = 0
	let chromaTotal = 0

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i]
		const g = data[i + 1]
		const b = data[i + 2]
		const a = data[i + 3]
		if (a < 32) {
			transparentCount++
			continue
		}
		if (a < 200) continue // anti-aliased edges — no vote
		opaqueCount++
		const max = Math.max(r, g, b)
		const min = Math.min(r, g, b)
		const l = (max + min) / 510
		const chroma = (max - min) / 255
		lightnessTotal += l
		chromaTotal += chroma
		if (chroma < 0.09) continue // gray pixel — no hue vote
		let h: number
		if (max === r) h = 60 * (((g - b) / (max - min)) % 6)
		else if (max === g) h = 60 * ((b - r) / (max - min) + 2)
		else h = 60 * ((r - g) / (max - min) + 4)
		if (h < 0) h += 360
		const denom = 1 - Math.abs(2 * l - 1)
		const s = denom > 0 ? (max - min) / 255 / denom : 0
		const bucket = Math.min(BUCKETS - 1, Math.floor(h / (360 / BUCKETS)))
		weight[bucket] += chroma // chroma-weighted: saturated pixels drive the vote
		satSum[bucket] += s * chroma
		lightSum[bucket] += l * chroma
		hueX[bucket] += Math.cos((h * Math.PI) / 180) * chroma
		hueY[bucket] += Math.sin((h * Math.PI) / 180) * chroma
	}

	const transparent = transparentCount / total > 0.12
	const markLightness = opaqueCount ? lightnessTotal / opaqueCount : 0.5

	let best = 0
	for (let i = 1; i < BUCKETS; i++) if (weight[i] > weight[best]) best = i
	const avgChroma = opaqueCount ? chromaTotal / opaqueCount : 0
	// Monochrome logo: not enough chromatic mass for a credible color vote.
	if (!opaqueCount || avgChroma < 0.05 || weight[best] < opaqueCount * 0.04) {
		return {transparent, color: null, markLightness}
	}
	let h = (Math.atan2(hueY[best], hueX[best]) * 180) / Math.PI
	if (h < 0) h += 360
	const s = clamp(satSum[best] / weight[best], 0.55, 0.85)
	const l = clamp(lightSum[best] / weight[best], 0.42, 0.58)
	return {transparent, color: {h, s, l}, markLightness}
}

// One analysis per URL no matter how many surfaces render the same icon.
const analysisCache = new Map<string, Promise<IconAnalysisState>>()

// Phase 271-C — hosts that serve icons/favicons WITHOUT `Access-Control-Allow-Origin`.
// Loading them crossOrigin='anonymous' then calling getImageData() taints the
// canvas and makes the browser log a cross-origin CORS error (console noise). The
// analysis result for these is ALWAYS 'blocked' (→ logo mode) anyway — the
// crossOrigin load just FAILS — so we short-circuit to 'blocked' WITHOUT touching
// the canvas, killing the console error while keeping IDENTICAL rendering (the
// visible <img> below never sets crossOrigin, so the icon still displays). Matched
// on hostname suffix so subdomains are covered.
//   2026-06-21: + flathub.org (dl.flathub.org app-store icons — one error per app
//   tile) and ycombinator.com (news.ycombinator.com/y18.svg webapp favicon), the
//   CORS console errors the operator reported on everything.livinity.io.
const NO_CORS_FAVICON_HOSTS = [
	'google.com',
	'antigravity.google',
	'gstatic.com',
	'flathub.org',
	'ycombinator.com',
]

function isNoCorsFaviconSrc(src: string): boolean {
	try {
		const host = new URL(src, window.location.origin).hostname
		return NO_CORS_FAVICON_HOSTS.some((h) => host === h || host.endsWith('.' + h))
	} catch {
		return false
	}
}

function analyzeIcon(src: string): Promise<IconAnalysisState> {
	// Phase 290 R2 (H3) — custom-icon `data:` URLs (up to the 256 KB upload cap)
	// must NOT be analyzed or cached: canvas analysis is pointless for a data URL
	// and keying analysisCache by the entire (huge) data-URL string would grow the
	// module-level Map unbounded as the user adds custom-icon shortcuts. Treat
	// them as 'blocked' (→ logo mode, the 80%-on-frost treatment) WITHOUT caching.
	if (src.startsWith('data:')) {
		return Promise.resolve<IconAnalysisState>({status: 'blocked'})
	}
	const cached = analysisCache.get(src)
	if (cached) return cached
	// Phase 271-C — skip canvas analysis for known no-ACAO favicon hosts: the
	// result would be 'blocked' regardless, and attempting getImageData() is
	// exactly what emits the cross-origin favicon CORS console error.
	if (isNoCorsFaviconSrc(src)) {
		const blocked = Promise.resolve<IconAnalysisState>({status: 'blocked'})
		analysisCache.set(src, blocked)
		return blocked
	}
	const p = new Promise<IconAnalysisState>((resolve) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			try {
				const N = 48
				const canvas = document.createElement('canvas')
				canvas.width = N
				canvas.height = N
				const ctx = canvas.getContext('2d', {willReadFrequently: true})
				if (!ctx) return resolve({status: 'blocked'})
				ctx.drawImage(img, 0, 0, N, N)
				const {data} = ctx.getImageData(0, 0, N, N) // throws if CORS-tainted
				resolve({status: 'done', a: computeAnalysis(data)})
			} catch {
				resolve({status: 'blocked'})
			}
		}
		img.onerror = () => resolve({status: 'blocked'})
		img.src = src
	})
	analysisCache.set(src, p)
	return p
}

export function useIconAnalysis(src: string): IconAnalysisState {
	const [state, setState] = useState<IconAnalysisState>({status: 'pending'})
	useEffect(() => {
		let alive = true
		setState({status: 'pending'})
		analyzeIcon(src).then((s) => {
			if (alive) setState(s)
		})
		return () => {
			alive = false
		}
	}, [src])
	return state
}

// ── The C2 surface ───────────────────────────────────────────────────────

/** Frameless frosted squircle background — no border, no outline. */
export function frostBackground(dark: boolean): string {
	return dark
		? 'linear-gradient(180deg, rgba(40,40,46,0.94) 0%, rgba(24,24,28,0.90) 100%)'
		: 'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(245,245,247,0.88) 100%)'
}

export function LauncherIcon({
	src,
	className,
	imgClassName,
}: {
	src?: string
	className?: string
	/** Extra classes for the inner <img> (e.g. desktop's brightness-50 progress dim). */
	imgClassName?: string
}) {
	// Graceful fallback to the placeholder when the source 404s — same
	// contract as the shared components/app-icon.tsx.
	const [imgSrc, setImgSrc] = useState(src || PLACEHOLDER_SRC)
	useEffect(() => {
		setImgSrc(src || PLACEHOLDER_SRC)
	}, [src])

	const analysis = useIconAnalysis(imgSrc)
	const {resolvedTheme} = useTheme()
	const dark = resolvedTheme === 'dark'

	// cover = full-bleed art (frost invisible behind it); logo = 80% on frost.
	// Unknown ('blocked' CORS) defaults to logo — the only unanalyzable icons
	// in practice are favicons, which are transparent logos. While 'pending'
	// the img is mounted but invisible (browser caches the fetch, so the
	// analysis pass right behind it resolves immediately) — icons fade in
	// once settled, matching the old FadeInImg feel.
	const mode = analysis.status === 'done' && !analysis.a.transparent ? 'cover' : 'logo'
	const settled = analysis.status !== 'pending'

	return (
		<div
			className={cn('relative flex h-full w-full items-center justify-center overflow-hidden', className)}
			style={{borderRadius: 'inherit', background: frostBackground(dark)}}
		>
			<img
				src={imgSrc}
				alt=''
				draggable={false}
				onError={() => setImgSrc(PLACEHOLDER_SRC)}
				className={cn(
					'transition-opacity duration-300',
					settled ? 'opacity-100' : 'opacity-0',
					mode === 'cover' ? 'absolute inset-0 h-full w-full object-cover' : 'h-[80%] w-[80%] object-contain',
					imgClassName,
				)}
			/>
		</div>
	)
}
