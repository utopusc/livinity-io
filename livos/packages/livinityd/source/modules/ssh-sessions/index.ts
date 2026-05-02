/**
 * Phase 48 Plan 48-01 — ssh-sessions module barrel.
 *
 * Public API consumed by `server/index.ts` (WS route mount) and Plan 48-03 tests.
 * Implements FR-SSH-01: live tail of `journalctl -u ssh -o json --follow --since "1 hour ago"`
 * with admin-only WS at `/ws/ssh-sessions`.
 *
 * D-NO-NEW-DEPS upheld — uses node:child_process.spawn (built-in) only. No new
 * geo-IP / pino / third-party JWT lib. Uses livinityd's existing verifyToken + findUserById.
 *
 * D-NO-SERVER4 upheld — Mini PC only.
 */

export {
	extractIp,
	makeJournalctlStream,
	realJournalctlStream,
	type JournalctlStream,
	type MakeStreamOptions,
	type SpawnFn,
	type SshSessionEvent,
} from './journalctl-stream.js'

// `createSshSessionsWsHandler` is added to the barrel by Plan 48-01 Task 2.
export {createSshSessionsWsHandler} from './ws-handler.js'
