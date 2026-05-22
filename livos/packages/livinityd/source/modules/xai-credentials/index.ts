/**
 * Phase 195 Plan 02 Task 2 — xai-credentials barrel.
 *
 * Public surface consumed by:
 *   - 195-03 tRPC router      → XaiCredentialsService.getStatus/clear
 *   - 195-05 xai-provider     → XaiCredentialsService.getToken at request time
 *   - tests / diagnostics     → decodeXaiJwt, refreshXaiToken, getOpencodeAuthPath
 */

export {XaiCredentialsService} from './credentials-service.js'
export {NotConnectedError} from './credentials-service.js'
export type {
	XaiCredentialsStatus,
	XaiCredentialsServiceOpts,
	XaiCredentialsEvent,
	Logger,
} from './credentials-service.js'

export {decodeXaiJwt, AuthJsonCorruptError} from './jwt-decoder.js'
export type {XaiJwtClaims} from './jwt-decoder.js'

export {refreshXaiToken, RefreshFailedError} from './token-refresher.js'
export type {RefreshXaiTokenOpts, RefreshXaiTokenResult} from './token-refresher.js'

export {getOpencodeAuthPath} from './auth-json-path.js'
