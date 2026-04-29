// Phase 38 Plan 04 — D-RT-03 rolled-back recovery success page.
//
// Rendered by FactoryResetProgress when the latest factory-reset event has
// status === 'rolled-back'. Shows the rollback success copy + a single
// Return-to-dashboard button.

import {Link} from 'react-router-dom'

import type {FactoryResetEvent} from '@/features/factory-reset/lib/types'
import {BarePage} from '@/layouts/bare/bare-page'
import {buttonClass} from '@/layouts/bare/shared'
import {bareContainerClass, BareLogoTitle, BareSpacer, bareTextClass} from '@/modules/bare/shared'
import {t} from '@/utils/i18n'

export function FactoryResetRecoveryPage({event}: {event: FactoryResetEvent}) {
	const errorTag = event.error ?? 'unknown'

	return (
		<BarePage>
			<div className={bareContainerClass}>
				<BareLogoTitle>{t('factory-reset.recovery.heading')}</BareLogoTitle>
				<BareSpacer />
				<p className={bareTextClass}>
					{t('factory-reset.recovery.body-pre-error')} <code>{errorTag}</code>.
				</p>
				<BareSpacer />
				{/* `reloadDocument` forces a fresh page load so any stale auth state
				    from the rollback window is cleared. */}
				<Link to='/' reloadDocument className={buttonClass}>
					{t('factory-reset.recovery.return-to-dashboard')}
				</Link>
			</div>
		</BarePage>
	)
}
