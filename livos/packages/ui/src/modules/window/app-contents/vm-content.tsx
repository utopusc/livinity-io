import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'

// Phase 352-01 (VMAPP-01) — native Virtual Machine app window wrapper.
// Identical ErrorBoundary → Suspense<Loading> shape as my-devices-content.tsx
// (the house pattern for every system-app window). The feature root is the
// default export of @/features/vm.
const VmAppInner = React.lazy(() => import('@/features/vm'))

export default function VmWindowContent() {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<Suspense fallback={<Loading />}>
				<VmAppInner />
			</Suspense>
		</ErrorBoundary>
	)
}
