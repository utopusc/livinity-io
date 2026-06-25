import {motion} from 'framer-motion'

import {Alert} from '@/modules/bare/alert'
import {Progress} from '@/modules/bare/progress'
import {bareCardClass, BareLogoTitle} from '@/modules/bare/shared'
import {t} from '@/utils/i18n'

export function ProgressLayout({
	title,
	// onSuccess,
	// onFail,
	progress,
	message,
	// isStarting,
	isRunning,
	callout,
}: {
	title: string
	// onSuccess: () => void
	// onFail: () => void
	progress?: number
	message?: string
	// isStarting: boolean
	isRunning: boolean
	callout: string
}) {
	const isStarting = !progress && !isRunning

	// Empty string also gets the default message
	const finalMessage = message || t('connecting')

	return (
		<motion.div
			className={bareCardClass}
			initial={{opacity: 0}}
			animate={{opacity: 1}}
			transition={{duration: 0.4, delay: 0.2}}
		>
			<BareLogoTitle>{title}</BareLogoTitle>
			{/* Show indeterminate value if not running */}
			<Progress value={isStarting ? undefined : progress}>{finalMessage}</Progress>
			<Alert>{callout}</Alert>
		</motion.div>
	)
}
