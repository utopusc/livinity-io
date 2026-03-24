import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'

const MyDevicesInner = React.lazy(() => import('@/routes/my-devices'))

export default function MyDevicesWindowContent() {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<Suspense fallback={<Loading />}>
				<MyDevicesInner />
			</Suspense>
		</ErrorBoundary>
	)
}
