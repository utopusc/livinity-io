import React from 'react'
import {Link, LinkProps} from 'react-router-dom'

import {useWindowRouterOptional} from '@/providers/window-router'

type WindowAwareLinkProps = LinkProps & {
	children?: React.ReactNode
}

/**
 * A Link component that works both inside windows and in the main app.
 * When inside a window, it uses the WindowRouter for navigation.
 * When outside, it uses the normal React Router.
 */
export function WindowAwareLink({to, children, onClick, ...props}: WindowAwareLinkProps) {
	const windowRouter = useWindowRouterOptional()

	// If we're inside a window, use window navigation
	if (windowRouter) {
		const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
			e.preventDefault()
			const path = typeof to === 'string' ? to : to.pathname || ''
			windowRouter.navigate(path)
			onClick?.(e)
		}

		return (
			<a href={typeof to === 'string' ? to : to.pathname} onClick={handleClick} {...props}>
				{children}
			</a>
		)
	}

	// Outside of window, use normal React Router Link
	return (
		<Link to={to} onClick={onClick} {...props}>
			{children}
		</Link>
	)
}
