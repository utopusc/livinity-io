import {useState} from 'react'
import {Trans} from 'react-i18next/TransWithoutContext'
import {RiAlarmWarningFill} from 'react-icons/ri'
import {Link, useNavigate} from 'react-router-dom'

import {ErrorAlert} from '@/components/ui/alert'
import {cn} from '@/shadcn-lib/utils'
import {afterDelayedClose, useLinkToDialog} from '@/utils/dialog'
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
	// Feedback 90358f61: the previous targets (livinity.com/support, then a
	// mailto:) did nothing useful inside the desktop iframe — no external page
	// existed and mailto has no handler, so it read as "not working", and the
	// earlier react-router <Link to="https://…"> also blanked the panel. Point
	// "Contact Support" at the in-app Report-a-Problem dialog (the actual working
	// support channel — the same one this feedback was filed through) via the
	// global ?dialog=feedback route mounted in the dock.
	const linkToDialog = useLinkToDialog()
	return (
		<p className={cn('mx-auto text-caption font-normal text-text-secondary', className)}>
			<Trans
				i18nKey='settings.contact-support'
				components={{
					linked: <Link to={linkToDialog('feedback')} className={linkClass} />,
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
