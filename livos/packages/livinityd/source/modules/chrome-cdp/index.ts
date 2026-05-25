/**
 * Phase 101-01 — Chrome CDP module barrel.
 *
 * Exports the bootstrap helper that spawns the singleton Chrome at livinityd
 * boot (`bootstrapChrome`) and the typed CDP wrapper (`ChromeCdpClient`).
 * Consumers import from this module so the underlying file layout can move
 * without rippling through call-sites (mirrors the `webapps/index.ts`-style
 * convention used elsewhere in livinityd).
 *
 * Sacred SHA gate: liv/packages/core/src/sdk-agent-runner.ts MUST equal
 * f3538e1d811992b782a9bb057d1b7f0a0189f95f before AND after every commit.
 */

export {
	bootstrapChrome,
	ChromeBootstrapTimeoutError,
	type ChromeBootstrapHandle,
	type BootstrapOpts,
} from './bootstrap.js'

export {
	ChromeCdpClient,
	CdpDisconnectedError,
	CdpTimeoutError,
	probeAttachTarget,
	type ChromeCdpClientOpts,
	type ChromeCdpLogger,
	type CdpFactory,
	type ProbeAttachResult,
} from './client.js'
