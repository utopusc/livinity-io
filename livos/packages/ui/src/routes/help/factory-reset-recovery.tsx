// Phase 38 Plan 04 — D-RT-02 manual SSH recovery static instructions page.
//
// Linked from FactoryResetErrorPage's "Manual SSH recovery instructions"
// button. Snapshot lives on the user's own Mini PC; no shared infra
// hostnames are surfaced here.

import {Link} from 'react-router-dom'

import {BarePage} from '@/layouts/bare/bare-page'
import {buttonClass} from '@/layouts/bare/shared'
import {bareContainerClass, BareLogoTitle, BareSpacer, bareTextClass} from '@/modules/bare/shared'
import {t} from '@/utils/i18n'

// Verbatim per D-RT-02:
//   tar -xzf $(cat /tmp/livos-pre-reset.path) -C / && systemctl restart livos liv-core liv-worker liv-memory
const RECOVERY_COMMAND =
	'tar -xzf $(cat /tmp/livos-pre-reset.path) -C / && systemctl restart livos liv-core liv-worker liv-memory'

export default function FactoryResetRecoveryHelp() {
	return (
		<BarePage>
			<div className={bareContainerClass}>
				<BareLogoTitle>{t('factory-reset.help.recovery.heading')}</BareLogoTitle>
				<BareSpacer />
				<p className={bareTextClass}>{t('factory-reset.help.recovery.intro')}</p>
				<BareSpacer />
				<pre
					data-testid='factory-reset-recovery-command'
					className='max-w-full overflow-x-auto rounded-radius-md bg-surface-1 p-4 text-left font-mono text-body-sm'
				>
					{RECOVERY_COMMAND}
				</pre>
				<BareSpacer />
				<p className={bareTextClass}>{t('factory-reset.help.recovery.warning')}</p>
				<BareSpacer />
				<Link to='/' className={buttonClass}>
					{t('factory-reset.help.recovery.return')}
				</Link>
			</div>
		</BarePage>
	)
}
