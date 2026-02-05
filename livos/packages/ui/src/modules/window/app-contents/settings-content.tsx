import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'

// Lazy load the settings content component
const SettingsContentInner = React.lazy(() =>
	import('@/routes/settings/_components/settings-content').then((m) => ({default: m.SettingsContent})),
)

type SettingsWindowContentProps = {
	initialRoute: string
}

export default function SettingsWindowContent({initialRoute}: SettingsWindowContentProps) {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<Suspense fallback={<Loading />}>
				<SettingsContentInner />
			</Suspense>
		</ErrorBoundary>
	)
}
