import LivinityLogo from '@/assets/livinity-logo'
import {tw} from '@/utils/tw'

export const bareContainerClass = tw`mt-[10vh] flex-1 flex h-full max-w-full flex-col items-center sm:w-auto`
export const bareTitleClass = tw`sm:text-36 text-24 font-bold -tracking-2`
export const bareTextClass = tw`text-center text-15 font-medium leading-tight -tracking-2 text-text-secondary`

// Phase 304 — readable, theme-aware card for the bare/system screens (update,
// restore, migrate, factory-reset). Replaces the old full-height
// `bareContainerClass` (mt-[10vh] flex-1 h-full) that, combined with BarePage's
// `justify-between`, spread the title to the top and the button/alert to the
// very bottom edge — on a short laptop the button "flew off" the screen.
// Instead this is a COMPACT card, vertically centered (`my-auto` overrides
// BarePage's justify-between), capped to the viewport with internal scroll so
// nothing overflows on low resolutions. The solid `var(--bg)` surface (white in
// light theme, near-black in dark — exactly the colour of the LivinityLogo's
// donut hole, so the mark reads cleanly) makes the title + message legible over
// the blurred wallpaper, which the old transparent layout did not.
export const bareCardClass = tw`my-auto flex w-full max-w-md flex-col items-center gap-6 overflow-y-auto rounded-3xl border border-border-default bg-[color:var(--bg)] px-6 py-10 text-center text-text-primary shadow-2xl max-h-[calc(100dvh-2.5rem)] sm:gap-7 sm:px-10`

export const BareLogoTitle = ({children}: {children: React.ReactNode}) => (
	<div className='flex flex-col items-center gap-4'>
		<LivinityLogo />
		<h1 className={bareTitleClass}>{children}</h1>
	</div>
)

export const BareSpacer = () => <div className='pt-[50px]' />
