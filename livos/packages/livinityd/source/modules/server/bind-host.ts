// Phase 257-02 (WS-C, LIVOS-015) — admin daemon bind host resolution.
//
// The livinityd admin daemon (:8080) must bind the loopback interface by
// default. Previously `this.server.listen(targetPort, cb)` was called with NO
// host argument → INADDR_ANY, so the full management console was reachable from
// any device on the LAN. The intended topology is Cloudflare(DNS) → Server5
// relay → Mini PC tunnel, and Caddy reverse-proxies to 127.0.0.1:<port> as the
// public front door — so a loopback bind keeps the public/Caddy path working
// while removing the unintended LAN surface.
//
// Factored into its own dependency-free module so it is unit-testable without
// importing the full server graph (which pulls native addons) and without
// opening a socket.
//
// Override: LIVOS_BIND_HOST lets an operator opt into a non-loopback bind (e.g.
// a ZeroTier/Tailscale overlay IP) without re-exposing the LAN. Empty/unset →
// loopback.

export const DEFAULT_BIND_HOST = '127.0.0.1'

export function resolveBindHost(): string {
	const override = process.env.LIVOS_BIND_HOST
	if (typeof override === 'string' && override.trim().length > 0) {
		return override.trim()
	}
	return DEFAULT_BIND_HOST
}
