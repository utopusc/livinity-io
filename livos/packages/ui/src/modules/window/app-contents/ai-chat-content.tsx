import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'

// Phase 90 — Cutover (D-90-01). The AI Chat window now renders the v32 chat
// (Suna-port + SSE) instead of the legacy chat. The legacy module remains on
// disk at @/routes/ai-chat for emergency rollback; v33 owns the holistic
// legacy directory cleanup. The /ai-chat-v2 router URL stays as an alias.
const AiChatInner = React.lazy(() => import('@/routes/ai-chat/v32'))

export default function AiChatWindowContent() {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<Suspense fallback={<Loading />}>
				<AiChatInner />
			</Suspense>
		</ErrorBoundary>
	)
}
