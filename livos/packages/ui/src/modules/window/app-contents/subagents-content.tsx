import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'

const SubagentsInner = React.lazy(() => import('@/routes/subagents'))

export default function SubagentsWindowContent() {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<Suspense fallback={<Loading />}>
				<SubagentsInner />
			</Suspense>
		</ErrorBoundary>
	)
}
