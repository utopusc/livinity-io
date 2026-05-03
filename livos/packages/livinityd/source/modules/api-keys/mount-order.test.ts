/**
 * Phase 59 Plan 59-01 — mount-order.test.ts (RED phase).
 *
 * Source-string positional check on `server/index.ts`. Express middleware
 * order is insertion order, so the test reads the source as text and asserts
 * the position of three mount calls:
 *
 *   1. mountUsageCaptureMiddleware  (line 1228 — Phase 44; broker_usage capture)
 *   2. mountBearerAuthMiddleware    (NEW — Phase 59; Bearer token auth)
 *   3. mountBrokerRoutes            (line 1234 — Phase 41; broker handler)
 *
 * Bearer middleware MUST run BEFORE the broker handler so `req.userId` is
 * set in time, AND AFTER the usage capture so 401 responses are still
 * captured by Phase 44's broker_usage row writer.
 *
 * Mirrors common.test.ts:160-178 source-string-assert pattern.
 *
 * RED expectation: `mountBearerAuthMiddleware` is not yet referenced in
 * `server/index.ts`; Wave 2/3 inserts the call between line 1228 and 1234.
 */

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, test} from 'vitest'

const serverIndexPath = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'server',
	'index.ts',
)
const src = readFileSync(serverIndexPath, 'utf8')

describe('Phase 59 mount-order — Bearer between usage capture and broker (RED)', () => {
	test('T1 — server/index.ts mounts mountBearerAuthMiddleware between mountUsageCaptureMiddleware and mountBrokerRoutes', () => {
		const usageIdx = src.indexOf('mountUsageCaptureMiddleware(')
		const bearerIdx = src.indexOf('mountBearerAuthMiddleware(')
		const brokerIdx = src.indexOf('mountBrokerRoutes(')

		// All three calls MUST exist
		expect(usageIdx).toBeGreaterThan(-1)
		expect(bearerIdx).toBeGreaterThan(-1) // RED — Wave 2/3 adds this
		expect(brokerIdx).toBeGreaterThan(-1)

		// Strict ordering: usage capture → bearer → broker
		expect(usageIdx).toBeLessThan(bearerIdx)
		expect(bearerIdx).toBeLessThan(brokerIdx)
	})
})
