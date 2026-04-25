// Phase 24-02 — Pure formatters consumed by the StatusBar pills.
//
// Each formatter is locale-free and side-effect-free so the StatusBar render
// is deterministic across user timezones / browsers. Tests live in the
// adjacent format.unit.test.ts (12 cases).
//
// Why no date-fns / pretty-bytes / etc.: the math is 8 lines per function and
// date-fns's formatDistance produces shapes ("about 3 days") that don't match
// the Dockhand-style "Up 3d 14h" the design calls for. pretty-bytes likewise
// rounds bytes to KB/MB/GB/TB without the "RAM" / "free" suffix the StatusBar
// wants — string concatenation costs nothing.
//
// formatTimeHHMM avoids Intl.DateTimeFormat because its locale defaults
// produce "9:05 AM" on en-US in many browsers; manual zero-padded HH:MM is
// exact across every locale.

export function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400)
	const hours = Math.floor((seconds % 86400) / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	if (days > 0) return `Up ${days}d ${hours}h`
	if (hours > 0) return `Up ${hours}h ${minutes}m`
	return `Up ${minutes}m`
}

export function formatRamGb(bytes: number): string {
	const gb = bytes / 1024 ** 3
	return `${gb.toFixed(1)} GB RAM`
}

export function formatDiskFree(bytes: number): string {
	const gb = bytes / 1024 ** 3
	if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB free`
	return `${gb.toFixed(1)} GB free`
}

export function formatTimeHHMM(date: Date): string {
	const hh = date.getHours().toString().padStart(2, '0')
	const mm = date.getMinutes().toString().padStart(2, '0')
	return `${hh}:${mm}`
}

export type SocketKind = 'socket' | 'tcp-tls' | 'agent'

export function formatSocketType(t: SocketKind): string {
	if (t === 'socket') return 'Socket'
	if (t === 'tcp-tls') return 'TCP/TLS'
	return 'Agent'
}
