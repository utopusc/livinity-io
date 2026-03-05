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
	const route = isCreateAccount ? '/onboarding/create-account' : '/onboarding/restore'
	const Icon = isCreateAccount ? TbUser : TbHistory

	return (
		<div className='flex flex-row flex-wrap items-center justify-center gap-3'>
			<Link to={route} unstable_viewTransition>
				{/* Small screens: with short text */}
				<IconButton icon={Icon} size='default' className='border-white/[0.06] bg-white/[0.04] text-white/60 backdrop-blur-md hover:bg-white/[0.08] hover:text-white/80 sm:hidden'>
					{/* Using explicit conditionals instead of dynamic keys so GitHub Action for translations can detect translation keys */}
					{isCreateAccount ? t('onboarding.create-instead-short') : t('onboarding.restore-short')}
				</IconButton>
				{/* Larger screens: with full text */}
				<IconButton icon={Icon} size='default' className='hidden border-white/[0.06] bg-white/[0.04] text-white/60 backdrop-blur-md hover:bg-white/[0.08] hover:text-white/80 sm:flex'>
					{/* Using explicit conditionals instead of dynamic keys so GitHub Action for translations can detect translation keys */}
					{isCreateAccount ? t('onboarding.create-instead-long') : t('onboarding.restore-long')}
				</IconButton>
			</Link>
			{/* TODO: consider adding drawer on mobile */}
			<LanguageDropdown />
			<Link to={links.support} target='_blank'>
				<IconButton icon={TbMessageCircle} size='default' className='border-white/[0.06] bg-white/[0.04] text-white/60 backdrop-blur-md hover:bg-white/[0.08] hover:text-white/80'>
					{t('onboarding.contact-support')}
				</IconButton>
			</Link>
		</div>
	)
}
