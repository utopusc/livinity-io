// /icon-lab — Phase 1 of .planning/ICON-TILE-PLAN.md (transparent-icon fix,
// mockup-first). TEMPORARY comparison playground: renders the user's REAL
// installed apps/webapps/native apps in 4 candidate icon treatments, one row
// per treatment, on the live wallpaper backdrop. The operator opens
// :3000/icon-lab, picks a winner (A/B/C/D), and ONLY THEN does Phase 2 apply
// it to the real surfaces (desktop/dock/Launchpad). Nothing here touches
// production components.
//
// Hard rules baked in (from the rejected 2026-06-10 attempt):
//   • logos never below 80% of the tile
//   • tile colors are VIVID (s 0.55-0.85, l 0.42-0.58) or properly dark/white
//     — never washed pastels
//   • every treatment is applied to ALL icons in its row (one-family rule is
//     judged directly: n8n/Jellyfin-style full-bleed icons sit in the same row)

import React, {useMemo} from 'react'

import {LauncherIcon, useIconAnalysis} from '@/components/launcher-icon'
import {useTheme} from '@/hooks/use-theme'
import {APP_ICON_PLACEHOLDER_SRC} from '@/modules/desktop/app-icon'
import {dockTileStyle} from '@/modules/desktop/dock-item'
import {useApps} from '@/providers/apps'
import {trpcReact} from '@/trpc/trpc'

const SIZE = 72
const RADIUS = SIZE * 0.28
const LOGO_PCT = '80%' // hard rule: never below ~78-82%

// Pixel analysis (48px canvas, alpha-ratio + chroma-weighted hue vote) moved
// to components/launcher-icon.tsx when C2 shipped (Phase 2) — the lab imports
// it so the rows can never drift from production behavior.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ── Shared bits ──────────────────────────────────────────────────────────

function Logo80({src}: {src: string}) {
	return (
		<img
			src={src}
			alt=''
			draggable={false}
			className='relative z-[2] object-contain'
			style={{width: LOGO_PCT, height: LOGO_PCT}}
		/>
	)
}

/** The icon exactly as a full-bleed app ships it — rounded square, no tile. */
function FullBleed({src}: {src: string}) {
	return (
		<div className='overflow-hidden shadow-lg' style={{width: SIZE, height: SIZE, borderRadius: RADIUS}}>
			<img src={src} alt='' draggable={false} className='h-full w-full object-cover' />
		</div>
	)
}

// ── A — Ambient Blur (iOS-widget style; detection-free, CORS-free) ───────
// Background = the icon itself at 2.4x + blur + saturate over a dark neutral
// base (the base keeps transparent-logo tiles from going see-through), faint
// bottom gradient for label contrast, sharp logo at 80% on top. Applied to
// EVERY icon — full-bleed images blur into their own ambient ring.

function AmbientBlurTile({src}: {src: string}) {
	return (
		<div
			className='relative flex items-center justify-center overflow-hidden shadow-lg'
			style={{
				width: SIZE,
				height: SIZE,
				borderRadius: RADIUS,
				background: 'linear-gradient(180deg, #3a3a42 0%, #232329 100%)',
			}}
		>
			<img
				src={src}
				alt=''
				aria-hidden
				draggable={false}
				className='absolute inset-0 h-full w-full object-cover'
				style={{transform: 'scale(2.4)', filter: 'blur(18px) saturate(1.6)'}}
			/>
			<div
				className='absolute inset-0'
				style={{background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.25) 100%)'}}
			/>
			<Logo80 src={src} />
			<div
				className='pointer-events-none absolute inset-0 z-[3]'
				style={{
					borderRadius: 'inherit',
					boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 1px 0 rgba(255,255,255,0.12)',
				}}
			/>
		</div>
	)
}

// ── B — Vivid Solid (the rejected idea, FIXED: 80% logo + punchy color) ──
// Needs pixel analysis. Full-bleed icons keep their own art (same size/radius
// /shadow → one family of filled squares). CORS-blocked favicons fall back to
// the C-style glass tile (Phase 3 proxy would cover them).

function VividTile({src}: {src: string}) {
	const st = useIconAnalysis(src)
	const {resolvedTheme} = useTheme()
	const dark = resolvedTheme === 'dark'

	if (st.status !== 'done') return <GlassSurface dark={dark} src={src} forceLogo />
	if (!st.a.transparent) return <FullBleed src={src} />

	let background: string
	let border = '1px solid rgba(255,255,255,0.16)'
	if (st.a.color) {
		const {h, s, l} = st.a.color
		const top = `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${clamp(l * 100 + 5, 42, 60).toFixed(0)}%)`
		const bottom = `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${clamp(l * 100 - 5, 38, 56).toFixed(0)}%)`
		background = `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`
	} else if (st.a.markLightness > 0.6) {
		// light/white marks → near-black tile
		background = 'linear-gradient(180deg, #2a2a2f 0%, #1d1d1f 100%)'
	} else {
		// dark marks → soft-white tile
		background = 'linear-gradient(180deg, #ffffff 0%, #eeeef2 100%)'
		border = '1px solid rgba(0,0,0,0.08)'
	}

	return (
		<div
			className='relative flex items-center justify-center overflow-hidden shadow-lg'
			style={{
				width: SIZE,
				height: SIZE,
				borderRadius: RADIUS,
				background,
				border,
				boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px rgba(0,0,0,0.4)',
			}}
		>
			<Logo80 src={src} />
		</div>
	)
}

// ── C — Uniform Glass (Apple-minimal; dock's exact squircle surface) ─────
// EVERY icon on the same dockTileStyle() glass: full-bleed images cover it
// edge-to-edge, transparent logos sit at 80% on the frost. Unknown (CORS/
// pending) defaults to the 80%-logo branch — the only unanalyzable icons in
// practice are favicons, which are transparent logos.
//
// Round 2 (operator 2026-06-11 "C daha iyi gibi ama çerçevesi olmasın"):
// the "frame" he saw is the dock tile's 1px outline + inset hairlines —
// around full-bleed icons it reads as a ring, around logos as a framed box.
// Two frameless variants of the same treatment:
//   frost — same frosted gradient, NO border/outline, soft drop shadow only.
//           Full-bleed icons cover the tile → they appear exactly as
//           themselves; transparent logos get a quiet solid frosted backing.
//   clear — frameless translucent pane w/ backdrop blur; wallpaper bleeds
//           through behind transparent logos (macOS Launchpad-folder feel).

type GlassVariant = 'dock' | 'frost' | 'clear'

function glassSurfaceStyle(variant: GlassVariant, dark: boolean): React.CSSProperties {
	if (variant === 'dock') return dockTileStyle(SIZE, dark)
	const base = {width: SIZE, height: SIZE, borderRadius: RADIUS}
	if (variant === 'frost') {
		return {
			...base,
			background: dark
				? 'linear-gradient(180deg, rgba(40,40,46,0.94) 0%, rgba(24,24,28,0.90) 100%)'
				: 'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(245,245,247,0.88) 100%)',
			boxShadow: '0 5px 14px -6px rgba(0,0,0,0.30)',
		}
	}
	return {
		...base,
		background: dark ? 'rgba(34,34,40,0.42)' : 'rgba(255,255,255,0.38)',
		backdropFilter: 'blur(20px) saturate(1.4)',
		WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
		boxShadow: '0 5px 14px -6px rgba(0,0,0,0.25)',
	}
}

function GlassSurface({
	dark,
	src,
	fullBleed,
	forceLogo,
	variant = 'dock',
}: {
	dark: boolean
	src: string
	fullBleed?: boolean
	forceLogo?: boolean
	variant?: GlassVariant
}) {
	return (
		<div
			className='relative flex items-center justify-center overflow-hidden shadow-lg'
			style={glassSurfaceStyle(variant, dark)}
		>
			{/* top sheen — dock variant only (frameless variants stay clean) */}
			{variant === 'dock' && (
				<div
					className='pointer-events-none absolute inset-0 z-[1]'
					style={{
						background: dark
							? 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)'
							: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 40%)',
						borderRadius: 'inherit',
					}}
				/>
			)}
			{fullBleed && !forceLogo ? (
				<img src={src} alt='' draggable={false} className='absolute inset-0 z-[2] h-full w-full object-cover' />
			) : (
				<Logo80 src={src} />
			)}
		</div>
	)
}

function GlassTile({src, variant = 'dock'}: {src: string; variant?: GlassVariant}) {
	const st = useIconAnalysis(src)
	const {resolvedTheme} = useTheme()
	const dark = resolvedTheme === 'dark'
	const fullBleed = st.status === 'done' && !st.a.transparent
	return <GlassSurface dark={dark} src={src} fullBleed={fullBleed} variant={variant} />
}

// ── D — Color Halo (minimum touch) ───────────────────────────────────────
// Icons exactly as the desktop renders them today (frosted div + full image);
// transparent logos additionally get a soft blurred radial glow in their
// dominant color behind the tile. Weakest framing — included for contrast.

function HaloIcon({src}: {src: string}) {
	const st = useIconAnalysis(src)
	const halo =
		st.status === 'done' && st.a.transparent
			? st.a.color
				? `hsl(${st.a.color.h.toFixed(0)} ${(st.a.color.s * 100).toFixed(0)}% ${(st.a.color.l * 100).toFixed(0)}% / 0.65)`
				: 'rgba(255,255,255,0.45)'
			: null
	return (
		<div className='relative' style={{width: SIZE, height: SIZE}}>
			{halo && (
				<div
					className='pointer-events-none absolute'
					style={{
						inset: '-14%',
						background: `radial-gradient(circle, ${halo} 0%, transparent 70%)`,
						filter: 'blur(10px)',
					}}
				/>
			)}
			{/* today's desktop chrome (app-icon.tsx): frosted rounded square */}
			<div className='relative h-full w-full overflow-hidden rounded-2xl bg-neutral-100/60 shadow-sm backdrop-blur-sm'>
				<img src={src} alt='' draggable={false} className='h-full w-full object-cover' />
			</div>
		</div>
	)
}

// ── The lab page ─────────────────────────────────────────────────────────

type LabEntry = {key: string; label: string; src: string}

function TreatmentRow({
	letter,
	title,
	blurb,
	entries,
	render,
}: {
	letter: string
	title: string
	blurb: string
	entries: LabEntry[]
	render: (e: LabEntry) => React.ReactNode
}) {
	return (
		<section className='mb-9'>
			<div className='mb-3 flex flex-wrap items-baseline gap-x-3'>
				<span className='rounded-lg bg-white/15 px-2.5 py-0.5 text-[18px] font-bold text-white'>{letter}</span>
				<span className='text-[17px] font-semibold text-white'>{title}</span>
				<span className='text-[13px] text-white/60'>{blurb}</span>
			</div>
			<div className='flex flex-wrap gap-x-4 gap-y-6'>
				{entries.map((e) => (
					<div key={e.key} className='flex w-[88px] flex-col items-center gap-2'>
						{render(e)}
						<span className='max-w-full truncate text-[11px] font-medium text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]'>
							{e.label}
						</span>
					</div>
				))}
			</div>
		</section>
	)
}

export default function IconLab() {
	const {userApps, webapps} = useApps()
	// Same query/policy as launchpad-grid.tsx (Phase 101-07).
	const nativeAppsQ = trpcReact.apps.native.list.useQuery(undefined, {staleTime: 30 * 1000, retry: false})

	const entries = useMemo<LabEntry[]>(() => {
		const out: LabEntry[] = []
		for (const app of userApps ?? []) {
			out.push({key: `app-${app.id}`, label: app.name, src: app.icon || APP_ICON_PLACEHOLDER_SRC})
		}
		for (const wa of webapps) {
			const label =
				wa.title?.trim() ||
				(() => {
					try {
						return new URL(wa.url).hostname
					} catch {
						return wa.url
					}
				})()
			out.push({key: `webapp-${wa.id}`, label, src: wa.faviconUrl || APP_ICON_PLACEHOLDER_SRC})
		}
		for (const cfg of nativeAppsQ.data ?? []) {
			out.push({key: `native-${cfg.id}`, label: cfg.name, src: cfg.iconUrl || APP_ICON_PLACEHOLDER_SRC})
		}
		out.sort((a, b) => a.label.localeCompare(b.label, undefined, {sensitivity: 'base'}))
		return out
	}, [userApps, webapps, nativeAppsQ.data])

	return (
		<div className='fixed inset-0 z-[800] overflow-y-auto bg-black/40'>
			<div className='mx-auto max-w-6xl px-8 pb-20 pt-10'>
				<h1 className='text-[26px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]'>
					Icon Lab — Round 2
				</h1>
				<p className='mb-8 mt-1 max-w-3xl text-[13px] leading-relaxed text-white/70'>
					You picked C; now the frame question. Three frame levels of the same glass treatment — full-bleed icons
					(n8n, Jellyfin…) are untouched in all three (they cover the tile, so no frame appears around them in the
					frameless variants). Pick C1 / C2 / C3, or ask for tweaks.
				</p>

				<TreatmentRow
					letter='C2'
					title='Frameless Frost — SHIPPED (this row IS the production LauncherIcon)'
					blurb='no border, no outline — solid frosted squircle behind transparent logos; full-bleed icons appear exactly as themselves.'
					entries={entries}
					render={(e) => (
						<div className='shadow-lg' style={{width: SIZE, height: SIZE, borderRadius: RADIUS}}>
							<LauncherIcon src={e.src} />
						</div>
					)}
				/>
				<TreatmentRow
					letter='C3'
					title='Clear Glass'
					blurb='frameless translucent pane — the wallpaper shows through behind transparent logos (backdrop blur).'
					entries={entries}
					render={(e) => <GlassTile src={e.src} variant='clear' />}
				/>
				<TreatmentRow
					letter='C1'
					title='Dock Glass (original C)'
					blurb="reference: the dock's outlined tile, exactly as round 1."
					entries={entries}
					render={(e) => <GlassTile src={e.src} variant='dock' />}
				/>

				<div className='mb-8 mt-12 border-t border-white/15 pt-6'>
					<p className='mb-6 text-[13px] font-medium text-white/50'>
						Eliminated in round 1 — kept for reference only.
					</p>
					<TreatmentRow
						letter='A'
						title='Ambient Blur'
						blurb='tile = the icon itself, blurred + saturated; sharp logo at 80% on top.'
						entries={entries}
						render={(e) => <AmbientBlurTile src={e.src} />}
					/>
					<TreatmentRow
						letter='B'
						title='Vivid Solid'
						blurb='dominant-color tile, punchy; monochrome logos get near-black/white tiles.'
						entries={entries}
						render={(e) => <VividTile src={e.src} />}
					/>
					<TreatmentRow
						letter='D'
						title='Color Halo'
						blurb='icons exactly as today + a soft dominant-color glow behind transparent logos.'
						entries={entries}
						render={(e) => <HaloIcon src={e.src} />}
					/>
				</div>

				<p className='mt-2 text-[12px] text-white/50'>
					Note: CORS-blocked favicons (google.com, antigravity.google) can't be analyzed — they default to the
					80%-logo glass branch in C1/C2/C3.
				</p>
			</div>
		</div>
	)
}
