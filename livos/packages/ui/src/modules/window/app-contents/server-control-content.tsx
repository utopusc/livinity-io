import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'

const ServerControlInner = React.lazy(() => import('@/routes/server-control'))

export default function ServerControlWindowContent() {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<Suspense fallback={<Loading />}>
				<ServerControlInner />
			</Suspense>
		</ErrorBoundary>
	)
}
