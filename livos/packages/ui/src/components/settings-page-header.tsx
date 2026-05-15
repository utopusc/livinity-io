import {useNavigate} from 'react-router-dom'
import {TbArrowLeft} from 'react-icons/tb'

/**
 * v36 LivOS Design Port — Section-Head pattern (Phase 124, Step 3 of 8).
 *
 * Renders the design system's canonical section-head:
 *   eyebrow (mono 11px uppercase) → 32px light h1 with optional italic-serif accent → 14px sub
 *
 * Source: .planning/design-system/livinity-design-system.html §17 (lines 1020-1039).
 * The `.p-section-eyebrow`, `.p-section-title`, `.p-section-title em`, `.p-section-sub`
 * CSS rules are mapped directly to Tailwind classes here using v36 design tokens
 * (text-fg, text-fg-mute, text-fg-faint, font-serif italic, etc.).
 *
 * Designed as opt-in: a consumer page passes `hideHeader` to `<SettingsPageLayout/>`
 * and renders this above its content instead.
 */
export interface SettingsPageHeaderProps {
	/** Mono uppercase eyebrow, e.g. "01 · AI" or "Identity". */
	eyebrow?: string
	/** Primary headline (regular weight slot). */
	title: string
	/** Optional italic-serif accent rendered after the title, e.g. "identity" → "Account & identity". */
	titleAccent?: string
	/** Optional sub-paragraph, max-width 560px. */
	sub?: string
	/**
	 * Back button target. Pass a route string to render the back button, pass
	 * `null` (default) to hide it. Defaults to null because settings pages now
	 * open in their own dock windows — the window chrome already provides a
	 * close/back affordance.
	 */
	backTo?: string | null
}

export function SettingsPageHeader({eyebrow, title, titleAccent, sub, backTo = null}: SettingsPageHeaderProps) {
	const navigate = useNavigate()

	return (
		<header className='flex flex-col gap-3 border-b border-line pb-8 pt-2'>
			{(backTo || eyebrow) && (
				<div className='flex items-center gap-3'>
					{backTo && (
						<button
							type='button'
							onClick={() => navigate(backTo)}
							className='flex h-7 w-7 items-center justify-center rounded-full border border-line-strong text-fg-mute transition-colors hover:bg-surface hover:text-fg'
							aria-label='Back'
						>
							<TbArrowLeft className='h-3.5 w-3.5' />
						</button>
					)}
					{eyebrow && (
						<span className='font-mono text-[11px] uppercase tracking-[0.08em] text-fg-faint'>{eyebrow}</span>
					)}
				</div>
			)}
			<h1 className='text-[32px] font-light tracking-[-0.025em] leading-[1.1] text-fg text-balance'>
				{title}
				{titleAccent && (
					<>
						{' '}
						<em className='font-serif italic font-normal text-fg-mute'>{titleAccent}</em>
					</>
				)}
			</h1>
			{sub && <p className='text-[14px] text-fg-mute leading-[1.5] max-w-[560px]'>{sub}</p>}
		</header>
	)
}
