import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'

const AiChatInner = React.lazy(() => import('@/routes/ai-chat'))

export default function AiChatWindowContent() {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<Suspense fallback={<Loading />}>
				<AiChatInner />
			</Suspense>
		</ErrorBoundary>
	)
}
