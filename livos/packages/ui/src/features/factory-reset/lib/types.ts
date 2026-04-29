// Phase 38 — shared types for the factory-reset UI surface.
// Mirror Phase 37 D-EVT-02 schema exactly — the UI consumes JSON event rows
// produced by livinityd's factory-reset.sh.

export type FactoryResetErrorTag =
	| 'api-key-401'
	| 'server5-unreachable'
	| 'install-sh-failed'
	| 'install-sh-unreachable'

export type FactoryResetStatus = 'in-progress' | 'success' | 'failed' | 'rolled-back'

export interface FactoryResetEvent {
	type: 'factory-reset'
	status: FactoryResetStatus
	started_at: string
	ended_at: string | null
	preserveApiKey: boolean
	wipe_duration_ms: number
	reinstall_duration_ms: number
	install_sh_exit_code: number | null
	install_sh_source: 'live' | 'cache' | null
	snapshot_path: string
	error: FactoryResetErrorTag | null
}

// Derived UI state (D-OV-03). Distinguishes the 3 in-progress sub-states by
// inspecting wipe_duration_ms / reinstall_duration_ms; success / failed /
// rolled-back fall through to the JSON's status field directly.
export type FactoryResetUiState =
	| 'stopping-services'
	| 'fetching-install-sh'
	| 'reinstalling'
	| 'success'
	| 'failed'
	| 'rolled-back'

export interface FactoryResetAccepted {
	accepted: true
	eventPath: string
	snapshotPath: string
}

export type PreserveApiKeyChoice = boolean
