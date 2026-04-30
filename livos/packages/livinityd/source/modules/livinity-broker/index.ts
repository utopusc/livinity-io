import type express from 'express'
import {createBrokerRouter} from './router.js'
import type Livinityd from '../../index.js'

export {createBrokerRouter} from './router.js'
export type {
	AnthropicMessagesRequest,
	AnthropicMessage,
	AnthropicContentBlock,
	BrokerDeps,
} from './types.js'

/**
 * Mount the Livinity broker routes on the existing livinityd Express app.
 *
 * Mount path: `/u`  (so the full route is `POST /u/:userId/v1/messages`)
 *
 * Per 41-CONTEXT.md D-41-02 + D-41-04 + 41-AUDIT.md Section 1. Called from
 * server/index.ts immediately after the /api/files mount (line 1208).
 *
 * Phase 41 only ships POST /v1/messages (sync + SSE). Phase 42 will add
 * POST /v1/chat/completions (OpenAI-compat). Phase 43 will inject the
 * matching env vars into per-user marketplace app compose files.
 */
export function mountBrokerRoutes(app: express.Application, livinityd: Livinityd): void {
	const router = createBrokerRouter({livinityd})
	app.use('/u', router)
	livinityd.logger.log('[livinity-broker] routes mounted at /u/:userId/v1/messages')
}
