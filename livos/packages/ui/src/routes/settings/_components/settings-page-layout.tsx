import {ReactNode} from 'react'
import {useNavigate} from 'react-router-dom'
import {TbArrowLeft} from 'react-icons/tb'

import {Card} from '@/components/ui/card'
import {cn} from '@/shadcn-lib/utils'
import {useIsMobile} from '@/hooks/use-is-mobile'

interface SettingsPageLayoutProps {
	title: string
	description?: string
	children: ReactNode
	backTo?: string
}

export function SettingsPageLayout({title, description, children, backTo = '/settings'}: SettingsPageLayoutProps) {
	const navigate = useNavigate()
	const isMobile = useIsMobile()

	return (
		<div className='animate-in fade-in slide-in-from-right-4 duration-200 overflow-x-hidden'>
			<Card className={cn(isMobile ? '' : 'min-h-[500px]')}>
				{/* Header with back button */}
				<div className='flex items-center gap-4 border-b border-border-default pb-4'>
					<button
						onClick={() => navigate(backTo)}
						className='flex h-11 w-11 items-center justify-center rounded-radius-md bg-surface-base text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary'
					>
						<TbArrowLeft className='h-5 w-5' />
					</button>
					<div className='min-w-0'>
						<h1 className='text-heading font-semibold -tracking-2 truncate'>{title}</h1>
						{description && <p className='text-body-sm text-text-secondary truncate'>{description}</p>}
					</div>
				</div>

				{/* Content */}
				<div className='overflow-x-hidden pt-6'>{children}</div>
			</Card>
		</div>
	)
}
