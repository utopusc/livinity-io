/**
 * Phase 195 Plan 01 — xai-auth barrel.
 *
 * Public surface consumed by the tRPC router (195-03) and onboarding UI (195-04):
 *
 *   - XaiAuthFlowService       — the FlowService class
 *   - All typed errors so callers can map them to user-friendly tRPC error codes
 *
 * Spawner internals (resolveOpencodeBinary, spawnOpencodeLogin) are also
 * re-exported for tests and for any caller that wants to bypass the
 * FlowService (e.g. version probing).
 */

export {XaiAuthFlowService} from './flow-service.js'
export {XaiAuthFlowTimeoutError} from './flow-service.js'
export {XaiAuthFlowAbortedError} from './flow-service.js'
export {ValidationError} from './flow-service.js'
export {DuplicateFlowError} from './flow-service.js'
export {UnknownFlowError} from './flow-service.js'
export {FlowCapacityError} from './flow-service.js'
export type {Logger, XaiAuthFlowServiceOpts} from './flow-service.js'

export {OpencodeNotInstalledError} from './opencode-spawner.js'
export {OpencodeSpawnError} from './opencode-spawner.js'
export {spawnOpencodeLogin} from './opencode-spawner.js'
export {resolveOpencodeBinary} from './opencode-spawner.js'
export type {SpawnOpencodeLoginOpts, SpawnOpencodeLoginResult} from './opencode-spawner.js'

export {extractXaiOAuthUrl} from './url-extractor.js'
