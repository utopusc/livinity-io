import {useState} from 'react'
import {Trans} from 'react-i18next/TransWithoutContext'
import {RiAlarmWarningFill} from 'react-icons/ri'
import {useNavigate} from 'react-router-dom'

import {ErrorAlert} from '@/components/ui/alert'
import {links} from '@/constants/links'
import {cn} from '@/shadcn-lib/utils'
import {afterDelayedClose} from '@/utils/dialog'
import {linkClass} from '@/utils/element-classes'
import {t} from '@/utils/i18n'
import {tw} from '@/utils/tw'

export const cardTitleClass = tw`text-caption font-semibold leading-tight truncate -tracking-2 text-text-tertiary`
export const cardValueClass = tw`font-bold -tracking-4 truncate text-heading-sm leading-inter-trimmed`
export const cardValueSubClass = tw`text-body font-bold truncate leading-inter-trimmed -tracking-3 text-text-tertiary`
export const cardSecondaryValueBaseClass = tw`text-body font-medium -tracking-3 text-text-tertiary leading-inter-trimmed`
export const cardSecondaryValueClass = cn(cardSecondaryValueBaseClass, tw`truncate flex-shrink-full`)
export const cardErrorClass = cn(cardSecondaryValueBaseClass, tw`animate-pulse leading-snug text-destructive2-lightest`)

export function ContactSupportLink({className}: {className?: string}) {
	return (
		<p className={cn('mx-auto text-caption font-normal text-text-secondary', className)}>
			<Trans
				i18nKey='settings.contact-support'
				components={{
					// Feedback 90358f61: MUST be a plain <a>, not a react-router
						// <Link>. <Link to="https://…"> is treated as an in-app route
						// (/https://…) → the SPA navigates to a dead path and the panel
						// goes blank ("button disappears after clicking around").
						linked: <a href={links.support} className={linkClass} target='_blank' rel='noopener noreferrer' />,
				}}
			/>
		</p>
	)
}

export function ChangePasswordWarning() {
	return <ErrorAlert icon={RiAlarmWarningFill} description={t('change-password.callout')} />
}

export function useSettingsDialogProps() {
	const navigate = useNavigate()

	const [open, setOpen] = useState(true)

	return {
		open,
		onOpenChange: (open: boolean) => {
			setOpen(open)
			afterDelayedClose(() => navigate('/settings'))(open)
		},
	}
}
