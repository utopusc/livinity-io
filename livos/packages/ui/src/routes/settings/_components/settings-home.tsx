import {Link} from 'react-router-dom'
import {
	TbKey,
	TbRobot,
	TbPlug,
	TbShieldLock,
	TbWifi,
	TbWorldWww,
	TbBrandChrome,
} from 'react-icons/tb'

import {SettingsPageHeader} from '@/components/settings-page-header'

/**
 * v36 LivOS Design Port — Settings hub launcher (Phase 124+ consumer).
 *
 * Replaces the legacy SettingsContent sidebar with a single-column landing
 * page listing every available settings sub-page as a hairline card. Each
 * card navigates to /settings/{slug} which renders stand-alone — no sidebar
 * wrapper, no duplicate header.
 *
 * Source pattern: design-system.html §05 Field rows (hairline-divided list
 * inside a bordered card) mixed with §09 monogram glyph (left of each row).
 *
 * D-V36-NO-FUNCTIONAL-CHANGES: this is a NEW route — no existing settings
 * subpage is touched.
 */

type SectionDef = {
	slug: string
	eyebrow: string
	title: string
	titleAccent?: string
	sub: string
	icon: React.ComponentType<{className?: string}>
}

const SECTIONS: SectionDef[] = [
	{
		slug: 'ai-config',
		eyebrow: '01',
		title: 'AI',
		titleAccent: 'configuration',
		sub: 'Primary provider, account sign-in, active model, computer use.',
		icon: TbKey,
	},
	{
		slug: 'liv-agent',
		eyebrow: '02',
		title: 'Liv',
		titleAccent: 'Agent',
		sub: 'Marketplace, onboarding tour replay, subagent settings.',
		icon: TbRobot,
	},
	{
		slug: 'integrations',
		eyebrow: '03',
		title: 'Integrations',
		sub: 'Telegram, Slack, Discord, Matrix — chat with Liv from anywhere.',
		icon: TbPlug,
	},
	{
		slug: 'dm-pairing',
		eyebrow: '04',
		title: 'DM',
		titleAccent: 'security',
		sub: 'Lock direct-message commands to a specific allowlist.',
		icon: TbShieldLock,
	},
	{
		slug: 'local-access',
		eyebrow: '05',
		title: 'Local',
		titleAccent: 'access',
		sub: 'Reach LivOS on your LAN — phones, laptops, no relay.',
		icon: TbWifi,
	},
	{
		slug: 'domain-setup',
		eyebrow: '06',
		title: 'Domain &',
		titleAccent: 'HTTPS',
		sub: 'Bring a custom domain + auto SSL via Cloudflare.',
		icon: TbWorldWww,
	},
	{
		slug: 'chrome-master',
		eyebrow: '07',
		title: 'Chrome',
		titleAccent: 'profile',
		sub: 'One Google sign-in shared across every WebApp browser.',
		icon: TbBrandChrome,
	},
]

export function SettingsHome() {
	return (
		<div className='animate-in fade-in slide-in-from-right-4 duration-200 px-6 py-8 max-w-3xl mx-auto'>
			<SettingsPageHeader
				eyebrow='Settings'
				title='Tune'
				titleAccent='LivOS.'
				sub='Every knob, switch, and account toggle lives here. Settings group by area — pick a card to open it stand-alone.'
			/>
			<div className='h-8' />
			<div className='rounded-[var(--r-lg)] border border-line bg-[color:var(--bg)] overflow-hidden divide-y divide-line'>
				{SECTIONS.map((s) => {
					const Icon = s.icon
					return (
						<Link
							key={s.slug}
							to={`/settings/${s.slug}`}
							className='group grid grid-cols-[48px_1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-[color:var(--bg-2)]'
						>
							<div className='h-9 w-9 rounded-[10px] grid place-items-center bg-fg text-[color:var(--bg)]'>
								<Icon className='h-4 w-4' />
							</div>
							<div className='min-w-0'>
								<div className='font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint mb-0.5'>
									{s.eyebrow}
								</div>
								<div className='text-[15px] font-medium text-fg tracking-[-0.005em]'>
									{s.title}
									{s.titleAccent && (
										<>
											{' '}
											<em className='font-serif italic font-normal text-fg-mute'>{s.titleAccent}</em>
										</>
									)}
								</div>
								<div className='text-[13px] text-fg-mute mt-0.5 leading-snug'>{s.sub}</div>
							</div>
							<div className='font-mono text-[11px] uppercase tracking-[0.1em] text-fg-faint group-hover:text-fg-mute transition-colors'>
								Open →
							</div>
						</Link>
					)
				})}
			</div>
		</div>
	)
}
