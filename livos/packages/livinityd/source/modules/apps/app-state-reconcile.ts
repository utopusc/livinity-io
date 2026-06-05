// Phase 260-01 (SC1) — Docker-state reconciliation for the admin/single-user
// `apps.state` read path.
//
// `app.state` (app.ts:61) is an in-memory field that defaults to 'unknown' and
// is NOT rehydrated from disk. `restart()` sets 'restarting'→'ready' and
// `uninstall()` sets 'uninstalling'; if the body throws or livinityd restarts
// mid-flight, the field wedges on a transient value. The admin path of
// `apps.state` returned this raw field with no reconciliation, so the grid
// rendered a perpetual sliding-loader (both states live in `progressStates`,
// ui/src/trpc/trpc.ts) and the tile became un-clickable.
//
// The fix: when `app.state` is transient, reconcile it against the actual
// Docker container status — the SAME `docker inspect --format={{.State.Status}}`
// + stateMap pattern already used for per-user instances (routes.ts). Stable
// states bypass the Docker call entirely so the 2s poll keeps no perf regression.
//
// LANDMINE (do not "fix" by editing trpc.ts progressStates): the operator WANTS
// the spinner during a REAL restart/uninstall. The fix is state RESOLUTION here,
// not hiding the indicator.

/**
 * App states that represent an in-flight lifecycle operation. While the field
 * holds one of these, the UI shows a spinner and treats the tile as busy. They
 * must self-heal on the next poll if the underlying operation has actually
 * finished (or the process that owned it died).
 */
export const TRANSIENT_APP_STATES = [
	'restarting',
	'uninstalling',
	'stopping',
	'starting',
] as const

export type TransientAppState = (typeof TRANSIENT_APP_STATES)[number]

export function isTransientAppState(state: string): boolean {
	return (TRANSIENT_APP_STATES as readonly string[]).includes(state)
}

/**
 * Maps a Docker container `State.Status` to a stable LivOS app state.
 * Mirrors the per-user-instance map already in routes.ts.
 */
const DOCKER_STATUS_TO_APP_STATE: Record<string, string> = {
	running: 'running',
	exited: 'stopped',
	created: 'ready',
	paused: 'stopped',
}

/** Injectable container-status reader; throws when the container is gone. */
export type ContainerStatusInspector = (containerName: string) => Promise<string>

/**
 * Default inspector — runs `docker inspect --format={{.State.Status}}` via execa.
 * The container name is server-derived (from the app's compose file), never from
 * request input, so the execa template literal (no shell concat) is safe.
 */
export async function dockerInspectStatus(containerName: string): Promise<string> {
	const {$} = await import('execa')
	const result = await $`docker inspect --format={{.State.Status}} ${containerName}`
	return result.stdout.trim()
}

export type ReconciledAppState = {state: string; progress: number}

/**
 * Reconcile a possibly-wedged transient app state against real Docker status.
 *
 * - Stable states are returned unchanged WITHOUT any Docker call (perf: the
 *   admin grid polls this every ~2s).
 * - Transient states are reconciled against the app's container(s). Any
 *   container reporting `running` wins (a multi-service app is "up" if any
 *   service is up). Otherwise the first resolvable status is mapped.
 * - If NO container can be inspected (they're all gone), the app has effectively
 *   finished its lifecycle: 'uninstalling' → 'not-installed' (the containers
 *   were removed), any other transient → 'ready' (clickable, never wedged).
 *
 * The returned state is GUARANTEED non-transient, so a tile can never stay
 * un-clickable across polls.
 */
export async function reconcileTransientAppState(
	inMemoryState: string,
	containerNames: string[],
	inspect: ContainerStatusInspector = dockerInspectStatus,
): Promise<ReconciledAppState> {
	if (!isTransientAppState(inMemoryState)) {
		return {state: inMemoryState, progress: 0}
	}

	let resolved: string | null = null
	for (const containerName of containerNames) {
		try {
			const status = await inspect(containerName)
			const mapped = DOCKER_STATUS_TO_APP_STATE[status] || 'ready'
			// Any running container means the app is up — short-circuit.
			if (mapped === 'running') return {state: 'running', progress: 0}
			// Remember the first resolvable (non-running) status as a fallback.
			if (resolved === null) resolved = mapped
		} catch {
			// This container is gone — keep checking the others.
		}
	}

	if (resolved !== null) {
		return {state: resolved, progress: 0}
	}

	// No container resolved at all — the containers are gone.
	if (inMemoryState === 'uninstalling') {
		return {state: 'not-installed', progress: 0}
	}
	return {state: 'ready', progress: 0}
}
