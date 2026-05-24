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
import {getOrCreateDeviceIdentity} from "./device-identity";
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
 * REVERT 2026-05-24: Hot-fix G assumed browser runs ON Mini PC (LivOS
 * desktop stream's local Chrome). REALITY: operator's browser is REMOTE
 * (their laptop), so `localhost` resolved to the LAPTOP, not Mini PC →
 * WS code=1006. Back to same-origin Caddy-proxied path. allowedOrigins
 * whitelist (Hot-fix G part 2) covers the origin gate so the original
 * URL now actually works end-to-end.
 */
export function computeSameOriginGatewayUrl(loc: {protocol: string; host: string}): string {
	const wsScheme = loc.protocol === "https:" ? "wss:" : "ws:";
	return `${wsScheme}//${loc.host}/liv-ai-app/liv-ai/ws`;
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
 * Phase 203 Hot-fix H 2026-05-24 — options for `attemptLivOsAutoConnect`.
 *
 * `force=true` skips the `already-configured` short-circuit. Used by
 * AUTH_FAILED recovery in ChatApp: when the gateway rejects an existing
 * deviceToken (or a stale `gatewayUrl` points at a dead host), the operator
 * has no way to fix it from the LivOS shell (they don't know the token).
 * Forcing a fresh handshake re-mints credentials AND overwrites the stale
 * `gatewayUrl` with the loopback one so the next reconnect succeeds.
 */
export interface AutoConnectOptions {
	/** Override for tests; defaults to the real `/openclawos/handshake` fetcher. */
	fetchHandshake?: typeof fetchLivinitydDeviceToken;
	/**
	 * When true, ignore any existing settings.gatewayUrl in localStorage and
	 * always attempt a fresh handshake. Used by AUTH_FAILED recovery to
	 * overwrite stale creds the operator can't see or edit.
	 */
	force?: boolean;
}

/**
 * Attempt to seed Settings from the LivOS same-origin handshake bridge.
 * Safe to call multiple times — the result is idempotent on already-
 * configured installs (unless `force=true`).
 */
export async function attemptLivOsAutoConnect(
	optsOrFetchHandshake:
		| AutoConnectOptions
		| typeof fetchLivinitydDeviceToken = {},
): Promise<AutoConnectResult> {
	// Back-compat: callers passing a bare fetcher (Hot-fix D era) still work.
	const opts: AutoConnectOptions =
		typeof optsOrFetchHandshake === "function"
			? {fetchHandshake: optsOrFetchHandshake}
			: optsOrFetchHandshake;
	const fetchHandshake = opts.fetchHandshake ?? fetchLivinitydDeviceToken;

	if (typeof window === "undefined") {
		return {ok: false, reason: "no-window"};
	}

	if (!opts.force) {
		const existing = getSettings();
		if (existing?.gatewayUrl) {
			// Already-configured installs short-circuit. The socket layer's
			// per-open handshake (Plan 203-05) keeps the deviceToken fresh
			// on every (re)connect, so we don't need to fetch here too.
			return {ok: true, reason: "already-configured", settings: existing};
		}
	}

	// Probe the LivOS handshake bridge. Same-origin so the LIVINITY_SESSION
	// cookie is auto-forwarded by the browser (T-203-06 trust chain).
	try {
		// Hot-fix F3 2026-05-24 — include the browser's deviceId so livinityd
		// can auto-approve any matching pending openclaw pairing request
		// inline with the handshake. Without this the first WS connect for
		// every new browser hits NOT_PAIRED and never recovers (operator
		// UAT loop 2026-05-24).
		let deviceId: string | undefined;
		try {
			const identity = await getOrCreateDeviceIdentity();
			deviceId = identity.deviceId;
		} catch {
			// IndexedDB unavailable (private mode, locked) — fall through.
			deviceId = undefined;
		}
		const handshake = await fetchHandshake(
			deviceId ? {deviceId} : {},
		);
		const gatewayUrl = computeSameOriginGatewayUrl(window.location);
		// Hot-fix J 2026-05-24 — route master tokens into Settings.token (rides
		// in WS connect `auth: {token}`) and device tokens into
		// Settings.deviceToken (rides in `auth: {deviceToken}`). Openclaw
		// `mode: token` requires the former; sending the latter trips
		// `device_token_mismatch` then rate-limit lockout (operator UAT
		// 2026-05-23/24). Default to "device" for back-compat with bridges
		// that don't yet emit authMode.
		const authMode = handshake.authMode ?? "device";
		const seeded: Settings =
			authMode === "master"
				? {gatewayUrl, token: handshake.token}
				: {gatewayUrl, deviceToken: handshake.token};
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
