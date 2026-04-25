// Phase 26 — canonical Docker-app location for the byte formatter.
//
// Body is identical to the formatBytes that lives in
// livos/packages/ui/src/hooks/use-images.ts (it predates the Docker app
// and stays in place for back-compat with existing imports). Plan 27 may
// collapse the duplicate after server-control deletion; until then both
// modules export the same function.

export function formatBytes(bytes: number): string {
	const gb = bytes / 1024 / 1024 / 1024
	if (gb >= 1) return `${gb.toFixed(2)} GB`
	const mb = bytes / 1024 / 1024
	if (mb >= 1) return `${mb.toFixed(1)} MB`
	return `${(bytes / 1024).toFixed(0)} KB`
}
