/**
 * Phase 203 Hot-fix D 2026-05-24 — auto-connect bootstrap tests.
 *
 * Note: vitest 4.x in the claw-client workspace has a pre-existing vite
 * resolution gap (documented in 203-04-SUMMARY) so this file may not
 * auto-run. The tests are TS-clean and target the helpers directly with
 * a fake `localStorage` + a stub `fetchLivinitydDeviceToken`.
 */

import {beforeEach, describe, expect, test, vi} from "vitest";

import {attemptLivOsAutoConnect, computeSameOriginGatewayUrl} from "./auto-connect";
import type {LivinitydHandshakeResult} from "./livinityd-handshake";

// ─── localStorage fake ───────────────────────────────────────────────────

function installFakeLocalStorage(): void {
	const store = new Map<string, string>();
	(globalThis as unknown as {localStorage: Storage}).localStorage = {
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => {
			store.set(k, v);
		},
		removeItem: (k) => {
			store.delete(k);
		},
		clear: () => store.clear(),
		key: () => null,
		length: 0,
	} as Storage;
}

function installFakeWindow(host = "bruce.livinity.io", protocol = "https:"): void {
	(globalThis as unknown as {window: Window}).window = {
		location: {protocol, host},
	} as unknown as Window;
}

beforeEach(() => {
	installFakeLocalStorage();
	installFakeWindow();
});

// ─── computeSameOriginGatewayUrl ─────────────────────────────────────────

describe("computeSameOriginGatewayUrl", () => {
	// Hot-fix G 2026-05-24 — direct-loopback URL. The browser always runs
	// inside the LivOS desktop stream on the Mini PC, so localhost = Mini PC
	// = openclaw gateway. Caddy round-trip is intentionally bypassed.
	test("returns the loopback openclaw WS URL regardless of host (HTTPS embed)", () => {
		expect(
			computeSameOriginGatewayUrl({protocol: "https:", host: "bruce.livinity.io"}),
		).toBe("ws://localhost:18789/plugins/openclawos/ws");
	});

	test("returns the loopback openclaw WS URL regardless of host (HTTP dev)", () => {
		expect(
			computeSameOriginGatewayUrl({protocol: "http:", host: "127.0.0.1:8080"}),
		).toBe("ws://localhost:18789/plugins/openclawos/ws");
	});

	test("path targets the openclaw plugin WS mount (NOT the Caddy-routed external prefix)", () => {
		const url = computeSameOriginGatewayUrl({protocol: "https:", host: "x.io"});
		expect(url).toContain("/plugins/openclawos/ws");
		expect(url).not.toContain("/liv-ai-app/");
	});
});

// ─── attemptLivOsAutoConnect ─────────────────────────────────────────────

describe("attemptLivOsAutoConnect", () => {
	test("returns already-configured when settings.gatewayUrl is already set", async () => {
		const existing = {gatewayUrl: "wss://x.io/liv-ai-app/liv-ai/ws"};
		localStorage.setItem("claw-settings-v1", JSON.stringify(existing));
		const fetcher = vi.fn().mockRejectedValue(new Error("must not be called"));
		const result = await attemptLivOsAutoConnect(fetcher as never);
		expect(result).toEqual({
			ok: true,
			reason: "already-configured",
			settings: existing,
		});
		expect(fetcher).not.toHaveBeenCalled();
	});

	test("seeds settings on successful handshake (gatewayUrl + deviceToken persisted)", async () => {
		const handshake: LivinitydHandshakeResult = {
			token: "tok-abc",
			expiresAt: Date.now() + 300_000,
			sessionId: "jti-xyz",
		};
		const fetcher = vi.fn().mockResolvedValue(handshake);
		const result = await attemptLivOsAutoConnect(fetcher as never);
		const expectedSettings = {
			gatewayUrl: "ws://localhost:18789/plugins/openclawos/ws",
			deviceToken: "tok-abc",
		};
		expect(result).toEqual({
			ok: true,
			reason: "seeded",
			settings: expectedSettings,
		});
		const persisted = JSON.parse(localStorage.getItem("claw-settings-v1") ?? "null");
		expect(persisted).toEqual(expectedSettings);
	});

	test("Hot-fix E — seeded result includes settings the caller MUST forward to engine.reconnect", async () => {
		// Hot-fix D shipped without returning settings → ChatApp couldn't
		// reconnect the engine after auto-connect → operator saw setup form
		// even though handshake succeeded. Hot-fix E closes that race.
		const handshake: LivinitydHandshakeResult = {
			token: "tok-e",
			expiresAt: Date.now() + 300_000,
			sessionId: "jti-e",
		};
		const fetcher = vi.fn().mockResolvedValue(handshake);
		const result = await attemptLivOsAutoConnect(fetcher as never);
		expect(result.ok).toBe(true);
		expect(result.reason).toBe("seeded");
		expect(result.settings).toBeDefined();
		expect(result.settings?.gatewayUrl).toBe("ws://localhost:18789/plugins/openclawos/ws");
		expect(result.settings?.deviceToken).toBe("tok-e");
	});

	test("returns handshake-failed silently when the bridge rejects (standalone deploys)", async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error("401 unauth"));
		const result = await attemptLivOsAutoConnect(fetcher as never);
		expect(result).toEqual({ok: false, reason: "handshake-failed"});
		// MUST NOT have written anything to localStorage — the existing setup
		// dialog path needs to remain the fallback for standalone deploys.
		expect(localStorage.getItem("claw-settings-v1")).toBeNull();
	});

	test("does not call the handshake when settings already configured (idempotent fast path)", async () => {
		localStorage.setItem(
			"claw-settings-v1",
			JSON.stringify({gatewayUrl: "wss://existing.io/liv-ai-app/liv-ai/ws"}),
		);
		const fetcher = vi.fn();
		await attemptLivOsAutoConnect(fetcher as never);
		expect(fetcher).not.toHaveBeenCalled();
	});

	test("returns no-window when called in a non-browser env", async () => {
		// Simulate SSR / Node: delete window. Cast through unknown so the
		// `delete` operator type-checks against the dynamic shape we just
		// installed in beforeEach.
		delete (globalThis as unknown as {window?: unknown}).window;
		const fetcher = vi.fn();
		const result = await attemptLivOsAutoConnect(fetcher as never);
		expect(result).toEqual({ok: false, reason: "no-window"});
		expect(fetcher).not.toHaveBeenCalled();
	});
});
