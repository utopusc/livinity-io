// Phase 345-04 (GUEST-01, D-345-4/5/8) — the standalone UNAUTHENTICATED public
// dashboard page, mounted at `/public` in the same GradientLayout route group as
// the FILES-01 share + invite pages (router.tsx). It is the anonymous, no-login
// visitor surface for the box-global public dashboard.
//
// SECURITY posture:
//  - It calls ONLY `publicDashboard.get` (publicProcedure — anonymous). It never
//    calls an authenticated/admin procedure, never renders a login-gated control.
//    The ui trpc splitLink routes to httpLink over `/trpc` whenever there is no
//    JWT (trpc/trpc.ts), so trpcReact works pre-login — no raw fetch needed.
//  - Default-OFF: when the admin has not enabled the page the server returns
//    `{enabled:false}` and NOTHING else; we render a calm "not available" state
//    and there is no app/link data in the payload to leak.
//  - Every payload string is rendered as a React TEXT node (no
//    dangerouslySetInnerHTML) — XSS-safe. The server already sanitizes urls, but
//    we ALSO refuse to render any href that does not parse as http(s) (never a
//    `javascript:` scheme), defense-in-depth.
//
// DELIBERATE deviation from the invite/share precedents: there is NO `:token` in
// the path. The page is openly browsable because its payload is admin-curated +
// provably leak-free server-side (curate.ts), so the page needs no path credential.

import {TbExternalLink} from 'react-icons/tb'
import {Link} from 'react-router-dom'

import LivinityLogo from '@/assets/livinity-logo'
import {LauncherIcon} from '@/components/launcher-icon'
import {Loading} from '@/components/ui/loading'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// href scheme guard — only http(s) urls are ever rendered as links. Anything
// else (a `javascript:`/`data:` scheme, or an unparseable string) yields null so
// the caller renders plain, non-clickable text instead.
function safeHttpUrl(url?: string): string | null {
	if (!url) return null
	try {
		const u = new URL(url)
		return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
	} catch {
		return null
	}
}

export default function PublicDashboardPage() {
	// publicProcedure over /trpc — reachable with no session (splitLink → httpLink
	// when getJwt() is null). retry:false so the not-available state shows promptly.
	const q = trpcReact.publicDashboard.get.useQuery(undefined, {retry: false})

	const loading = q.isLoading
	const data = q.data
	const enabled = data?.enabled === true
	// Narrowed only inside the enabled branch below.
	const apps = enabled ? data.apps : []
	const links = enabled ? data.links : []
	const title = (enabled && data.title) || t('public-dashboard.page.default-title')
	const isEmpty = enabled && apps.length === 0 && links.length === 0

	return (
		<div className='flex min-h-svh w-full flex-col items-center justify-center gap-6 p-6'>
			<LivinityLogo className='h-8 w-auto opacity-90' />

			{loading && (
				<div className='flex flex-col items-center gap-3 py-8'>
					<Loading />
					<span className='text-13 text-text-tertiary'>{t('public-dashboard.page.loading')}</span>
				</div>
			)}

			{!loading && !enabled && (
				<div className='w-full max-w-md rounded-20 border border-border-subtle bg-surface-base p-6 shadow-sm'>
					<div className='flex flex-col items-center gap-2 py-8 text-center'>
						<h1 className='text-16 font-semibold text-text-primary'>{t('public-dashboard.page.not-available-title')}</h1>
						<p className='text-13 text-text-secondary'>{t('public-dashboard.page.not-available-description')}</p>
						<Link to='/login' className='mt-3 text-13 text-text-tertiary underline underline-offset-2 hover:text-text-secondary'>
							{t('public-dashboard.page.sign-in')}
						</Link>
					</div>
				</div>
			)}

			{!loading && enabled && (
				<div className='flex w-full max-w-3xl flex-col gap-8'>
					<h1 className='text-center text-24 font-semibold text-text-primary'>{title}</h1>

					{isEmpty && (
						<div className='rounded-20 border border-border-subtle bg-surface-base p-6 text-center'>
							<p className='text-13 text-text-secondary'>{t('public-dashboard.page.empty')}</p>
						</div>
					)}

					{apps.length > 0 && (
						<div className='grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6'>
							{apps.map((app, i) => {
								const href = safeHttpUrl(app.url)
								const tile = (
									<>
										<div className='relative aspect-square w-14 shrink-0 overflow-hidden rounded-2xl shadow-sm transition-transform group-hover:scale-105'>
											<LauncherIcon src={app.icon} />
										</div>
										<span className='max-w-full truncate text-12 font-medium text-text-primary'>{app.name}</span>
									</>
								)
								return href ? (
									<a
										key={`${app.name}-${i}`}
										href={href}
										target='_blank'
										rel='noopener noreferrer'
										className='group flex flex-col items-center gap-2.5 focus:outline-none'
									>
										{tile}
									</a>
								) : (
									<div key={`${app.name}-${i}`} className='group flex flex-col items-center gap-2.5'>
										{tile}
									</div>
								)
							})}
						</div>
					)}

					{links.length > 0 && (
						<div className='flex flex-col gap-2'>
							<h2 className='text-13 font-medium text-text-secondary'>{t('public-dashboard.page.links-heading')}</h2>
							<ul className='flex flex-col divide-y divide-border-subtle overflow-hidden rounded-16 border border-border-subtle bg-surface-base'>
								{links.map((link, i) => {
									const href = safeHttpUrl(link.url)
									return (
										<li key={`${link.label}-${i}`}>
											{href ? (
												<a
													href={href}
													target='_blank'
													rel='noopener noreferrer'
													className='flex items-center justify-between gap-3 px-4 py-3 text-13 text-text-primary transition-colors hover:bg-surface-1'
												>
													<span className='truncate'>{link.label}</span>
													<TbExternalLink className='size-4 shrink-0 text-text-tertiary' />
												</a>
											) : (
												<span className='flex items-center px-4 py-3 text-13 text-text-tertiary'>{link.label}</span>
											)}
										</li>
									)
								})}
							</ul>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
