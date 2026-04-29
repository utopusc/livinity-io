// Phase 38 Plan 04 — D-RT-02 error page.
//
// Rendered by FactoryResetProgress when the latest factory-reset event has
// status === 'failed'. Shows the error-tag-specific message + 3 buttons
// (View event log / Try again / Manual SSH recovery).
//
// HARD RULE: this page must NOT auto-redirect (D-RT-02 specifics #3 — the
// user has triggered a destructive op and needs to consciously read the
// failure before deciding what to do next). All transitions are user-driven.

import {useNavigate} from 'react-router-dom'

import {mapErrorTagToMessage} from '@/features/factory-reset/lib/error-tags'
import type {FactoryResetEvent} from '@/features/factory-reset/lib/types'
import {BarePage} from '@/layouts/bare/bare-page'
import {buttonClass, secondaryButtonClasss} from '@/layouts/bare/shared'
import {bareContainerClass, BareLogoTitle, BareSpacer, bareTextClass} from '@/modules/bare/shared'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

export function FactoryResetErrorPage({event}: {event: FactoryResetEvent}) {
	const navigate = useNavigate()
	const message = mapErrorTagToMessage(event.error, {
		install_sh_exit_code: event.install_sh_exit_code,
	})

	// The event filename used by Phase 33's diagnostic surface follows the
	// convention `<ts>-factory-reset.json`, where <ts> is the started_at
	// stripped of separators (Phase 37 wipe-script convention). If parsing
	// fails, suppress the View-event-log button rather than crash.
	const eventBasename = ((): string | null => {
		try {
			const ts = event.started_at.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
			if (!ts) return null
			return `${ts}-factory-reset.json`
		} catch {
			return null
		}
	})()

	return (
		<BarePage>
			<div className={cn(bareContainerClass, 'animate-in slide-in-from-bottom-2')}>
				<BareLogoTitle>{t('factory-reset.error.heading')}</BareLogoTitle>
				<BareSpacer />
				<p className={bareTextClass}>{message}</p>
				<BareSpacer />
				<div className='flex flex-col items-center gap-2 sm:flex-row'>
					{/* D-RT-02 buttons */}
					{eventBasename && (
						<a
							data-testid='factory-reset-view-event-log'
							href={`/admin/diagnostic/${eventBasename}`}
							className={secondaryButtonClasss}
						>
							{t('factory-reset.error.view-event-log')}
						</a>
					)}
					<button
						data-testid='factory-reset-try-again'
						type='button'
						className={buttonClass}
						onClick={() => navigate('/factory-reset')}
					>
						{t('factory-reset.error.try-again')}
					</button>
					<a
						data-testid='factory-reset-manual-ssh'
						href='/help/factory-reset-recovery'
						className={secondaryButtonClasss}
					>
						{t('factory-reset.error.manual-ssh')}
					</a>
				</div>
			</div>
		</BarePage>
	)
}
