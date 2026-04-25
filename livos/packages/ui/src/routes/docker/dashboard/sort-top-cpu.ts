// Phase 25 Plan 25-02 — sortTopCpu pure module (DOC-05).
//
// Sort algorithm for the cross-environment Top-CPU panel. Pure: no React, no
// tRPC, no module-level state — all logic lives in `sortTopCpu(entries, limit?)`.
// Caller responsibility:
//   - Pre-filter to running containers (sortTopCpu does NOT re-filter)
//   - Provide cpuPercent values from successful stats fanout
//
// Sort key: cpuPercent DESC, ties broken by envName ASC, then containerName
// ASC. Hard cap at TOP_CPU_LIMIT (10) by default; exposed limit param lets
// callers test with smaller fixtures or render top-N for different surfaces.

/** A flattened "container in env" record carrying only the fields the UI consumes. */
export interface TopCpuEntry {
	envId: string
	envName: string
	containerId: string
	containerName: string
	image: string
	cpuPercent: number
	memoryPercent: number
	isProtected: boolean
}

/** Default cap on the rendered list — Dockhand reference shows 10. */
export const TOP_CPU_LIMIT = 10

/**
 * Sort entries by cpuPercent DESC; ties broken by envName ASC, then
 * containerName ASC. Caller is responsible for pre-filtering to running
 * containers — this function sorts whatever is given.
 *
 * Returns a NEW array; never mutates the input.
 */
export function sortTopCpu(entries: TopCpuEntry[], limit: number = TOP_CPU_LIMIT): TopCpuEntry[] {
	return [...entries]
		.sort((a, b) => {
			if (b.cpuPercent !== a.cpuPercent) return b.cpuPercent - a.cpuPercent
			if (a.envName !== b.envName) return a.envName.localeCompare(b.envName)
			return a.containerName.localeCompare(b.containerName)
		})
		.slice(0, limit)
}
