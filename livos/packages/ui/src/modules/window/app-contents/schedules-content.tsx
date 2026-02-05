import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'

const SchedulesInner = React.lazy(() => import('@/routes/schedules'))

export default function SchedulesWindowContent() {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<Suspense fallback={<Loading />}>
				<SchedulesInner />
			</Suspense>
		</ErrorBoundary>
	)
}
