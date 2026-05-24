/**
 * Phase 203-05 — Tests for the claw-client livinityd handshake bridge.
 *
 * Note: plugin-side vitest 4.x has a pre-existing vite resolution gap
 * (documented in 203-04-SUMMARY) so this file may not auto-run. The tests
 * are TS-clean and target the helper functions directly with mocked fetch.
 */

import {describe, expect, test, vi} from "vitest";
import {
  fetchLivinitydDeviceToken,
  LivinitydHandshakeError,
  shouldRefreshDeviceToken,
} from "./livinityd-handshake";

function mockFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: {"Content-Type": "application/json"},
    }),
  ) as unknown as typeof fetch;
}

describe("Phase 203-05 — fetchLivinitydDeviceToken", () => {
  test("200 with valid body returns the token tuple (default authMode=device)", async () => {
    const fetchImpl = mockFetch({
      token: "abc.def",
      expiresAt: 1700000300000,
      sessionId: "jti-123",
    });
    const result = await fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl);
    expect(result).toEqual({
      token: "abc.def",
      expiresAt: 1700000300000,
      sessionId: "jti-123",
      // Hot-fix J 2026-05-24 — body without authMode defaults to "device"
      // for back-compat with pre-J livinityd bridges.
      authMode: "device",
    });
  });

  test("Hot-fix J — 200 with authMode=master surfaces the master discriminator", async () => {
    const fetchImpl = mockFetch({
      token: "deadbeef".repeat(8),
      expiresAt: 1700000300000,
      sessionId: "master:admin",
      authMode: "master",
    });
    const result = await fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl);
    expect(result.authMode).toBe("master");
    expect(result.token).toBe("deadbeef".repeat(8));
  });

  test("Hot-fix J — unknown authMode value falls back to 'device'", async () => {
    const fetchImpl = mockFetch({
      token: "abc.def",
      expiresAt: 1700000300000,
      sessionId: "jti-x",
      authMode: "nonsense",
    });
    const result = await fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl);
    expect(result.authMode).toBe("device");
  });

  test("401 surfaces LivinitydHandshakeError with login-required message", async () => {
    const fetchImpl = mockFetch({error: "unauthorized"}, 401);
    await expect(fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl)).rejects.toThrow(
      /login required/,
    );
    try {
      await fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl);
    } catch (e) {
      expect(e).toBeInstanceOf(LivinitydHandshakeError);
      expect((e as LivinitydHandshakeError).status).toBe(401);
    }
  });

  test("500 surfaces LivinitydHandshakeError with status", async () => {
    const fetchImpl = mockFetch({error: "mint_failed"}, 500);
    await expect(fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl)).rejects.toThrow(
      /500/,
    );
  });

  test("network error wrapped as LivinitydHandshakeError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    await expect(fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl)).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });

  test("malformed body (missing token) throws", async () => {
    const fetchImpl = mockFetch({expiresAt: 123, sessionId: "x"});
    await expect(fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl)).rejects.toThrow(
      /missing token/,
    );
  });

  test("malformed body (missing expiresAt) throws", async () => {
    const fetchImpl = mockFetch({token: "abc.def", sessionId: "x"});
    await expect(fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl)).rejects.toThrow(
      /missing expiresAt/,
    );
  });

  test("malformed body (missing sessionId) throws", async () => {
    const fetchImpl = mockFetch({token: "abc.def", expiresAt: 123});
    await expect(fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl)).rejects.toThrow(
      /missing sessionId/,
    );
  });

  test("sends LIVINITY_SESSION cookie via credentials:include", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({token: "x.y", expiresAt: 1, sessionId: "j"}),
        {status: 200},
      ),
    ) as unknown as typeof fetch;
    await fetchLivinitydDeviceToken("/openclawos/handshake", fetchImpl);
    const callArgs = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs?.[0]).toBe("/openclawos/handshake");
    expect((callArgs?.[1] as RequestInit)?.credentials).toBe("include");
    expect((callArgs?.[1] as RequestInit)?.method).toBe("POST");
  });
});

describe("Phase 203-05 — shouldRefreshDeviceToken", () => {
  const now = 1700000000000;
  test("undefined expiresAt → refresh", () => {
    expect(shouldRefreshDeviceToken(undefined, now)).toBe(true);
  });
  test("expiresAt already past → refresh", () => {
    expect(shouldRefreshDeviceToken(now - 1, now)).toBe(true);
  });
  test("expiresAt within 30s buffer → refresh", () => {
    expect(shouldRefreshDeviceToken(now + 10_000, now)).toBe(true);
  });
  test("expiresAt > 30s away → reuse", () => {
    expect(shouldRefreshDeviceToken(now + 60_000, now)).toBe(false);
  });
  test("custom buffer respected", () => {
    expect(shouldRefreshDeviceToken(now + 45_000, now, 60_000)).toBe(true);
    expect(shouldRefreshDeviceToken(now + 90_000, now, 60_000)).toBe(false);
  });
});
