import {TbHistory, TbMessageCircle, TbUser} from 'react-icons/tb'
import {Link} from 'react-router-dom'

import {IconButton} from '@/components/ui/icon-button'
import {links} from '@/constants/links'
import {LanguageDropdown} from '@/routes/settings/_components/language-dropdown'
import {t} from '@/utils/i18n'

export enum OnboardingAction {
	CREATE_ACCOUNT = 'create-account',
	RESTORE = 'restore',
}

interface OnboardingFooterProps {
	action: OnboardingAction
}

export function OnboardingFooter({action}: OnboardingFooterProps) {
	const isCreateAccount = action === OnboardingAction.CREATE_ACCOUNT
	// Phase 271 — `/onboarding/create-account` (+ index/account-created) routes
	// were deleted; the create-account flow now lives at the `/onboarding`
	// wizard index (setup-wizard-v2). The CREATE_ACCOUNT branch (rendered by
	// the restore page's "create instead" link) points there.
	const route = isCreateAccount ? '/onboarding' : '/onboarding/restore'
	const Icon = isCreateAccount ? TbUser : TbHistory

	return (
		<div className='flex flex-row flex-wrap items-center justify-center gap-3'>
			<Link to={route} unstable_viewTransition>
				{/* Small screens: with short text */}
				<IconButton icon={Icon} size='default' className='border-border-subtle bg-surface-base text-text-secondary hover:bg-surface-1 hover:text-text-primary sm:hidden'>
					{/* Using explicit conditionals instead of dynamic keys so GitHub Action for translations can detect translation keys */}
					{isCreateAccount ? t('onboarding.create-instead-short') : t('onboarding.restore-short')}
				</IconButton>
				{/* Larger screens: with full text */}
				<IconButton icon={Icon} size='default' className='hidden border-border-subtle bg-surface-base text-text-secondary hover:bg-surface-1 hover:text-text-primary sm:flex'>
					{/* Using explicit conditionals instead of dynamic keys so GitHub Action for translations can detect translation keys */}
					{isCreateAccount ? t('onboarding.create-instead-long') : t('onboarding.restore-long')}
				</IconButton>
			</Link>
			{/* TODO: consider adding drawer on mobile */}
			<LanguageDropdown />
			{/* Feedback 90358f61: external URL must be a plain <a>, not a
			    react-router <Link> (which would treat it as an in-app route). */}
			<a href={links.support} target='_blank' rel='noopener noreferrer'>
				<IconButton icon={TbMessageCircle} size='default' className='border-border-subtle bg-surface-base text-text-secondary hover:bg-surface-1 hover:text-text-primary'>
					{t('onboarding.contact-support')}
				</IconButton>
			</a>
		</div>
	)
}
