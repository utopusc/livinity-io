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
 * Compute the same-origin gateway WS URL when running inside LivOS.
 * `location.protocol === 'https:'` → wss://; otherwise ws://. Path is the
 * Hot-fix-D part-1 `/liv-ai-app/liv-ai/ws` external prefix which Caddy
 * rewrites to `/plugins/openclawos/ws` before forwarding to :18789.
 */
export function computeSameOriginGatewayUrl(loc: {protocol: string; host: string}): string {
	const scheme = loc.protocol === "https:" ? "wss:" : "ws:";
	return `${scheme}//${loc.host}/liv-ai-app/liv-ai/ws`;
}

export interface AutoConnectResult {
	/** True when settings are now sufficient for the socket layer to connect. */
	ok: boolean;
	/** Diagnostic string for the console — never user-facing. */
	reason: "already-configured" | "seeded" | "handshake-failed" | "no-window";
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
		return {ok: true, reason: "already-configured"};
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
		return {ok: true, reason: "seeded"};
	} catch {
		// Standalone deploy (operator opened claw-client outside LivOS), or
		// LIVINITY_SESSION cookie missing/expired. Either way, fall through to
		// the legacy SettingsDialog flow — that path keeps working unchanged.
		return {ok: false, reason: "handshake-failed"};
	}
}
