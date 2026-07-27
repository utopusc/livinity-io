import {motion} from 'framer-motion'

import {CircularProgress} from '@/features/files/components/shared/circular-progress'
import {t} from '@/utils/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 368.8-14 — the minimized backups island in LivOS's own language.
//
// It used to be a generic react-icons clock (TbHistory) next to `text-xs` copy:
// nothing about it said Livinity. Three changes:
//
// 1. The glyph is now the Livinity donut — a filled disc with a concentric hole,
//    the same geometry as components/livinity-brand.tsx's LivinityMark.
//    Deliberately NOT imported from there: that component paints itself from
//    `var(--fg)` / `var(--bg)`, which index.css declares at #1d1d1f / #ffffff
//    inside the `body.dark .livos-app-light` block — the Files window's
//    light-on-dark context, which the dock is not. Drawing it from
//    `currentColor` instead inherits the island's own text colour, so contrast
//    is correct in both themes by construction rather than by coincidence.
//
// 2. Type moves onto LivOS's numeric scale (text-13 / text-11 with the brand's
//    -0.02em tracking, per livinity-brand.tsx) instead of Tailwind's default
//    text-xs, so the island reads as the same family as every other surface.
//
// 3. The mark breathes while a backup is running. The percentage can sit at 0
//    for a long time on a first snapshot — kopia only reports a figure once it
//    has an estimate — so a still island is indistinguishable from a stuck one.
//    The pulse is the honest signal that work is happening; it is driven by
//    nothing but time, so it never implies progress the backup has not made.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Livinity mark, drawn from currentColor so it inherits island contrast.
 *
 * Rendered as a ring (thick border, transparent centre) rather than a disc with
 * an overlaid inner circle. LivinityMark fills its hole with `var(--bg)`, which
 * only works on an opaque surface — the island is rgba(0,0,0,0.12) over the
 * wallpaper, so a painted hole would show as a visible disc of the wrong colour.
 * A border leaves the centre genuinely transparent, so the wallpaper reads
 * through the hole exactly as the mark intends.
 *
 * Proportions match LivinityMark's `sm` spec: an 18px mark with a 5px inset
 * leaves an 8px hole, i.e. hole ≈ 0.44 × size. At 11px that is a 3px ring.
 */
function LivinityDonut({size = 11}: {size?: number}) {
	const ring = Math.max(2, Math.round((size * (1 - 0.44)) / 2))
	return (
		<span
			aria-hidden='true'
			className='inline-block shrink-0 rounded-full border-current'
			style={{width: size, height: size, borderWidth: ring, borderStyle: 'solid'}}
		/>
	)
}

export function MinimizedContent({count, progress}: {count: number; progress: number}) {
	return (
		<div className='flex size-full items-center gap-2 px-2'>
			<motion.div
				className='shrink-0 text-text-primary'
				animate={{opacity: [1, 0.45, 1]}}
				transition={{duration: 2, repeat: Infinity, ease: 'easeInOut'}}
			>
				<CircularProgress progress={progress}>
					<LivinityDonut />
				</CircularProgress>
			</motion.div>
			<div className='min-w-0 flex-1'>
				<span className='block truncate text-center text-13 font-medium tracking-[-0.02em] text-text-primary'>
					{t('backups-floating-island.backing-up')}
				</span>
			</div>
			<div className='flex shrink-0 items-center gap-2'>
				<span className='text-11 font-medium tabular-nums tracking-[-0.02em] text-text-secondary'>{progress}%</span>
			</div>
		</div>
	)
}
