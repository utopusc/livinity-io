import {Link, To} from 'react-router-dom'

import {buttonClass} from '@/layouts/bare/shared'
import {bareCardClass, BareLogoTitle, bareTextClass} from '@/modules/bare/shared'
import {cn} from '@/shadcn-lib/utils'

export function SuccessLayout({
	title,
	description,
	buttonText,
	to,
	buttonOnClick,
}: {
	title: string
	description: string
	buttonText: string
	to?: To
	buttonOnClick?: () => void
}) {
	return (
		<div className={cn(bareCardClass, 'duration-1000 animate-in fade-in zoom-in-95')}>
			<BareLogoTitle>{title}</BareLogoTitle>
			<p className={cn(bareTextClass, 'max-w-[90%]')}>{description}</p>
			{to && (
				<Link to={to} className={buttonClass} onClick={buttonOnClick}>
					{buttonText}
				</Link>
			)}
			{!to && (
				<button className={buttonClass} onClick={buttonOnClick}>
					{buttonText}
				</button>
			)}
		</div>
	)
}
