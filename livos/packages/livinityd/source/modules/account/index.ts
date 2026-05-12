// livos/packages/livinityd/source/modules/account/index.ts
//
// Phase 104 plan 104-10 — barrel export for the account module.
// Consumed by livos/packages/livinityd/source/index.ts at Livinityd.start()
// to wire the heartbeat-sender into the boot sequence.

export {readApiKey, redactedPreview, REDIS_KEY_API_KEY_PATH} from './api-key.js'
export type {ApiKeyRecord, ApiKeyRedis} from './api-key.js'

export {getOrCreateDeviceId, DEVICE_ID_PATH, DEVICE_ID_DIR} from './device-id.js'

export {
	buildHeartbeatPayload,
	detectPrimaryIPv4,
} from './heartbeat-payload.js'
export type {HeartbeatPayload, HeartbeatPayloadInputs} from './heartbeat-payload.js'

export {startHeartbeat} from './heartbeat-sender.js'
export type {HeartbeatLogger, StartHeartbeatOptions, StopHandle} from './heartbeat-sender.js'
