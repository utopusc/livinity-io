/**
 * Phase 203 Hot-fix D 2026-05-24 — auto-connect bootstrap.
 *
 * Bridges the operator-UX gap between Plan 203-05 (server-side handshake
 * bridge) and the upstream claw-client which still expects an
 * operator-pasted setup URL. When claw-client loads inside LivOS at
 * /liv-ai-app/liv-ai, this helper:
 *
 *   1. Detects "we are same-origin with livinityd" by attempting the
 *      /openclawos/handshake bridge (which only works when the
 *      LIVINITY_SESSION cookie is present).
 *   2. On success, persists a Settings object with gatewayUrl =
 *      wss://${location.host}/liv-ai-app/liv-ai/ws (Caddy passes the
 *      WebSocket upgrade through to the openclaw gateway at :18789 via
 *      the Hot-fix-D part-1 rewrite) AND the freshly-minted deviceToken.
 *   3. On failure (operator opened claw-client OUTSIDE LivOS, no JWT
 *      cookie), returns false silently so the existing setup-form UX
 *      continues to work for external standalone use.
 *
 * The function is idempotent — if settings.gatewayUrl is already set,
 * we skip the handshake and return true (the existing socket-layer
 * handshake on every WS open continues to refresh the device token).
 *
 * No retry loop here — the socket-layer reconnect already handles
 * transient handshake hiccups (livinityd-handshake.ts +
 * shouldRefreshDeviceToken).
 */

import {fetchLivinitydDeviceToken} from "./livinityd-handshake";
import {getSettings, saveSettings, type Settings} from "../storage";

/**
 * Phase 203 Hot-fix G 2026-05-24 — direct loopback gateway URL.
 *
 * Hot-fix D originally routed claw-client over Caddy
 * (`wss://${host}/liv-ai-app/liv-ai/ws` → openclaw on :18789) so that an
 * operator on a remote browser could reach the gateway. Operator UAT
 * proved that pathway both slow (TLS + reverse-proxy round trip on every
 * frame) AND fragile (proxy-trust headers desync the gateway's local-
 * client detection and produce `device_token_mismatch` storms — see Hot-
 * fix F2).
 *
 * Reality check: the Liv AI claw-client only ever runs INSIDE the LivOS
 * desktop stream, which means the browser executing this code is Chrome
 * on the SAME Mini PC that hosts openclaw. `localhost === Mini PC` and
 * the gateway is already bound to 127.0.0.1:18789. So we skip Caddy
 * entirely and connect directly.
 *
 * Path `/plugins/openclawos/ws` matches what Caddy was rewriting to —
 * confirmed live via `Caddyfile: handle_path /liv-ai-app/liv-ai* {
 *   rewrite * /plugins/openclawos{path}; reverse_proxy 127.0.0.1:18789 }`.
 *
 * The `loc` argument is retained for the test surface (and so we keep
 * `ws://` for any future HTTP dev harness) but its host is intentionally
 * ignored — the destination is always the loopback gateway port.
 */
export function computeSameOriginGatewayUrl(_loc: {protocol: string; host: string}): string {
	return "ws://localhost:18789/plugins/openclawos/ws";
}

export interface AutoConnectResult {
	/** True when settings are now sufficient for the socket layer to connect. */
	ok: boolean;
	/** Diagnostic string for the console — never user-facing. */
	reason: "already-configured" | "seeded" | "handshake-failed" | "no-window";
	/**
	 * Phase 203 Hot-fix E 2026-05-24 — the settings persisted to localStorage.
	 *
	 * On `seeded`: the freshly-minted {gatewayUrl, deviceToken} the caller
	 * MUST forward to `engine.reconnect(...)` (the engine was constructed at
	 * mount with empty settings BEFORE auto-connect ran — H3 race condition
	 * from Hot-fix D operator UAT).
	 *
	 * On `already-configured`: the existing persisted settings (returned for
	 * symmetry; the engine was already initialized with these on mount, so
	 * the caller does NOT need to reconnect).
	 *
	 * On `handshake-failed` / `no-window`: undefined.
	 */
	settings?: Settings;
}

/**
 * Attempt to seed Settings from the LivOS same-origin handshake bridge.
 * Safe to call multiple times — the result is idempotent on already-
 * configured installs.
 *
 * @param fetchHandshake Override for tests; defaults to the real
 *   `/openclawos/handshake` fetcher.
 */
export async function attemptLivOsAutoConnect(
	fetchHandshake: typeof fetchLivinitydDeviceToken = fetchLivinitydDeviceToken,
): Promise<AutoConnectResult> {
	if (typeof window === "undefined") {
		return {ok: false, reason: "no-window"};
	}

	const existing = getSettings();
	if (existing?.gatewayUrl) {
		// Already-configured installs short-circuit. The socket layer's
		// per-open handshake (Plan 203-05) keeps the deviceToken fresh
		// on every (re)connect, so we don't need to fetch here too.
		return {ok: true, reason: "already-configured", settings: existing};
	}

	// Probe the LivOS handshake bridge. Same-origin so the LIVINITY_SESSION
	// cookie is auto-forwarded by the browser (T-203-06 trust chain).
	try {
		const handshake = await fetchHandshake();
		const gatewayUrl = computeSameOriginGatewayUrl(window.location);
		const seeded: Settings = {
			gatewayUrl,
			deviceToken: handshake.token,
		};
		saveSettings(seeded);
		// Hot-fix E 2026-05-24 — return the seeded settings so the caller
		// (ChatApp) can fire engine.reconnect(seeded) immediately. Without
		// this, the engine constructed at mount with empty gatewayUrl never
		// learns about the fresh creds and the operator sees the setup form
		// even though localStorage has a valid token.
		return {ok: true, reason: "seeded", settings: seeded};
	} catch {
		// Standalone deploy (operator opened claw-client outside LivOS), or
		// LIVINITY_SESSION cookie missing/expired. Either way, fall through to
		// the legacy SettingsDialog flow — that path keeps working unchanged.
		return {ok: false, reason: "handshake-failed"};
	}
}
