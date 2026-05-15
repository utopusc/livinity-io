import {cn} from '@/shadcn-lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// LivinityBrand — canonical wordmark + donut mark used across LivOS.
//
// Source: `C:/Users/hello/Downloads/logo.html` (the canonical
// Livinity logo page, 2026-05-15). The mark is a fg-coloured circle with a
// bg-coloured donut hole; both halves ride the `--fg` / `--bg` CSS vars from
// tokens.css so the brand inverts automatically in dark mode.
//
// Sizes correspond to the four exact specs from logo.html:
//   sm — 18px mark + 14px text  (footer / fine print)
//   md — 26px mark + 18px text  (top nav, app header — default)
//   lg — 40px mark + 28px text  (section heading)
//   xl — 64px mark + 44px text  (splash / about hero)
//
// markOnly renders just the donut — for favicons, avatars, tight spaces.
// ─────────────────────────────────────────────────────────────────────────────

export type LivinityBrandSize = 'sm' | 'md' | 'lg' | 'xl'

export interface LivinityBrandProps {
	size?: LivinityBrandSize
	/** Render just the donut mark (no wordmark). */
	markOnly?: boolean
	/** Optional className forwarded to the outer wrapper. */
	className?: string
}

const TEXT_CLASSES: Record<LivinityBrandSize, string> = {
	sm: 'gap-2 text-[14px] font-semibold tracking-[-0.02em]',
	md: 'gap-2.5 text-[18px] font-semibold tracking-[-0.02em]',
	lg: 'gap-[14px] text-[28px] font-semibold tracking-[-0.03em]',
	xl: 'gap-[18px] text-[44px] font-medium tracking-[-0.035em]',
}

const MARK_OUTER: Record<LivinityBrandSize, {size: number; inset: number}> = {
	sm: {size: 18, inset: 5},
	md: {size: 26, inset: 7},
	lg: {size: 40, inset: 11},
	xl: {size: 64, inset: 17},
}

export function LivinityMark({size = 'md', className}: {size?: LivinityBrandSize; className?: string}) {
	const dims = MARK_OUTER[size]
	return (
		<span
			aria-hidden='true'
			className={cn(
				'relative inline-block shrink-0 rounded-full bg-[color:var(--fg)]',
				className,
			)}
			style={{width: dims.size, height: dims.size}}
		>
			<span
				className='absolute rounded-full bg-[color:var(--bg)]'
				style={{inset: dims.inset}}
			/>
		</span>
	)
}

export function LivinityBrand({size = 'md', markOnly = false, className}: LivinityBrandProps) {
	if (markOnly) {
		return <LivinityMark size={size} className={className} />
	}

	return (
		<span
			className={cn(
				'inline-flex items-center text-[color:var(--fg)]',
				TEXT_CLASSES[size],
				className,
			)}
		>
			<LivinityMark size={size} />
			<span>Livinity</span>
		</span>
	)
}
