// Phase 26 Plan 26-01 — Relative date formatter.
//
// Verbatim port of legacy routes/server-control/index.tsx:1062-1070 (deleted in Phase 27-02).
// Drives ImageHistoryPanel + ScanResultPanel timestamp displays.
//
// Input is a UNIX seconds timestamp (NOT milliseconds). Output is a short
// human-readable string ("just now", "5m ago", "3h ago", "2d ago", "5mo
// ago"). Beyond ~30 days the output stays in months — the Docker app
// doesn't display image history older than that often; if/when needed,
// extend the ladder with `< 31536000 → "yr ago"`.

export function formatRelativeDate(timestamp: number): string {
	const now = Math.floor(Date.now() / 1000)
	const diff = now - timestamp
	if (diff < 60) return 'just now'
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
	if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
	return `${Math.floor(diff / 2592000)}mo ago`
}
