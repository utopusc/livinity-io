/**
 * tunnel-http-bridge.ts — Phase 146 doc-only stub
 *
 * Phase 145 and earlier: this code path lived inside tunnel-client.ts
 * (handleHttpRequest, handleWsUpgrade, ws-proxy). It accepted relay-forwarded
 * HTTP requests + WS upgrades and proxied them to localhost:8080.
 *
 * Phase 146 onwards: that pipeline is OBSOLETE. Inbound HTTP/WS for
 *   https://<username>.livinity.io
 * now arrives via Cloudflare Tunnel directly to livinityd's local cloudflared
 * connector (managed by `liv-cloudflared.service`), which routes straight to
 * 127.0.0.1:8080. No tunnel-client involvement.
 *
 * Why a stub file: keeps `grep tunnel-http-bridge` and `grep handleHttpRequest`
 * discoverable for future maintainers tracing the Phase 145 → 146 transition.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */
export const PHASE_146_HTTP_BRIDGE_NOTE =
	'HTTP/WS forwarding moved to CF Tunnel (cloudflared) post-Phase-146; see tunnel-client.ts header'
