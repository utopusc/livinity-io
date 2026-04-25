// Phase 26 Plan 26-01 — Container port-mapping formatter.
//
// Verbatim port of legacy routes/server-control/index.tsx:237-243 (deleted in Phase 27-02).

export function formatPorts(ports: Array<{hostPort: number | null; containerPort: number; protocol: string}>) {
	if (!ports.length) return '-'
	return ports
		.map((p) => (p.hostPort != null ? `${p.hostPort}:${p.containerPort}/${p.protocol}` : `${p.containerPort}/${p.protocol}`))
		.join(', ')
}
