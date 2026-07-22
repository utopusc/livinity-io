import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'

// Phase 352-01 (VMAPP-01) — native Virtual Machine app window wrapper.
// Identical ErrorBoundary → Suspense<Loading> shape as my-devices-content.tsx
// (the house pattern for every system-app window). The feature root is the
// default export of @/features/vm.
const VmAppInner = React.lazy(() => import('@/features/vm'))

// Phase 358-01 (VMPURE-01) — windowId is populated ONLY by the desktop
// window path (windows-container.tsx) and ABSENT on the mobile path
// (mobile-app-renderer.tsx). `windowed = windowId !== undefined` is the
// exact "real floating window vs. mobile in-panel sheet" discriminator —
// it drives VmApp's pure-stream suppression (no header/Back/title in a
// window). Derived from an EXISTING signal, threaded as a plain prop,
// never persisted (the 356 titleIcon render-time-only idiom).
export default function VmWindowContent({initialRoute, windowId}: {initialRoute?: string; windowId?: string}) {
	const windowed = windowId !== undefined
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<Suspense fallback={<Loading />}>
				<VmAppInner initialRoute={initialRoute} windowed={windowed} />
			</Suspense>
		</ErrorBoundary>
	)
}
