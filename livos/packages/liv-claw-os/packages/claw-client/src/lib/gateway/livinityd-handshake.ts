/**
 * Phase 203-05 — LivOS handshake bridge (claw-client side).
 *
 * Architecture (D-203-12 / INV-203-10):
 *
 *   Parent LivOS UI (with LIVINITY_SESSION cookie)
 *     ↓ loads iframe
 *   liv-claw-client (this code)
 *     ↓ same-origin fetch /openclawos/handshake (LIVINITY_SESSION cookie auto-forwarded by Caddy)
 *   livinityd :8080 (verifies JWT, mints 5-min Ed25519 device token)
 *     ↓ returns {token, expiresAt, sessionId}
 *   liv-claw-client stores token in Settings.deviceToken
 *     ↓ WS handshake to openclaw gateway uses that token
 *   openclaw gateway :18789 (validates token against shared keypair)
 *
 * The token is short-lived (5 minutes per T-203-02). We fetch a fresh token
 * every time the socket needs to (re)connect, so retries naturally pick up
 * fresh credentials. The previous token's jti is auto-evicted from Redis at
 * livinityd via EX 300.
 *
 * This file is NEW in the fork (does not exist upstream). It bypasses the
 * upstream "operator pastes a setup URL" flow entirely by minting the token
 * server-side from the outer JWT — the operator never sees the openclaw URL
 * or token directly.
 */

const HANDSHAKE_ENDPOINT = "/openclawos/handshake";

export interface LivinitydHandshakeResult {
  token: string;
  expiresAt: number; // unix-ms
  sessionId: string;
  /**
   * Phase 203 Hot-fix J 2026-05-24 — auth-mode discriminator.
   *
   * "master" (default for current Hot-fix F2 master-token path) means the
   * token must ride in the WS connect frame as `auth: {token: ...}` so
   * openclaw's `mode: token` gateway accepts it as a shared bearer. The
   * legacy "device" mode is reserved for any future per-device pairing
   * flow (the original Plan 203-05 design) where the token is verified
   * against an openclaw-side device keypair.
   *
   * Optional for back-compat with older bridge responses (treated as
   * "device" if missing — that's the pre-J behaviour).
   */
  authMode?: "master" | "device";
}

export class LivinitydHandshakeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LivinitydHandshakeError";
  }
}

export interface FetchHandshakeOptions {
  /** Endpoint override (defaults to /openclawos/handshake same-origin). */
  endpoint?: string;
  /** fetch implementation override for tests. */
  fetchImpl?: typeof fetch;
  /**
   * Phase 203 Hot-fix F3 2026-05-24 — opaque hex deviceId (sha256 of the
   * browser's Ed25519 pubkey, see device-identity.ts). When present, the
   * livinityd handshake will auto-approve any matching pending pairing
   * request in openclaw's `pending.json` before responding. Closes the
   * NOT_PAIRED gate that openclaw enforces on every new browser device,
   * since outer LIVINITY_SESSION JWT auth is already the trust gate.
   */
  deviceId?: string;
}

/**
 * Fetch a fresh openclaw device token from livinityd. Same-origin so the
 * LIVINITY_SESSION cookie is auto-forwarded by the browser. Throws on any
 * non-200 response so the caller can fall through to its existing failure path.
 *
 * Back-compat: callers passing positional endpoint/fetchImpl still work.
 */
export async function fetchLivinitydDeviceToken(
  endpointOrOptions: string | FetchHandshakeOptions = HANDSHAKE_ENDPOINT,
  fetchImplArg: typeof fetch = fetch,
): Promise<LivinitydHandshakeResult> {
  // Normalize old positional API → options shape.
  const options: FetchHandshakeOptions =
    typeof endpointOrOptions === "string"
      ? {endpoint: endpointOrOptions, fetchImpl: fetchImplArg}
      : endpointOrOptions;
  const endpoint = options.endpoint ?? HANDSHAKE_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetchImplArg ?? fetch;

  const requestBodyObj: Record<string, unknown> = {};
  if (typeof options.deviceId === "string" && options.deviceId.length > 0) {
    requestBodyObj["deviceId"] = options.deviceId;
  }
  const requestBody = JSON.stringify(requestBodyObj);

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      credentials: "include", // LIVINITY_SESSION cookie travels with the request
      headers: {"Content-Type": "application/json"},
      body: requestBody,
    });
  } catch (networkErr) {
    throw new LivinitydHandshakeError(
      `network error fetching ${endpoint}: ${
        networkErr instanceof Error ? networkErr.message : String(networkErr)
      }`,
    );
  }

  if (response.status === 401) {
    throw new LivinitydHandshakeError(
      "LIVINITY_SESSION cookie missing or expired — login required",
      401,
    );
  }
  if (!response.ok) {
    throw new LivinitydHandshakeError(
      `unexpected handshake status ${response.status}`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (parseErr) {
    throw new LivinitydHandshakeError(
      `handshake response JSON parse failed: ${
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      }`,
    );
  }

  if (!body || typeof body !== "object") {
    throw new LivinitydHandshakeError("handshake response not an object");
  }
  const obj = body as Record<string, unknown>;
  const {token, expiresAt, sessionId, authMode} = obj;
  if (typeof token !== "string" || token.length === 0) {
    throw new LivinitydHandshakeError("handshake response missing token");
  }
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    throw new LivinitydHandshakeError("handshake response missing expiresAt");
  }
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new LivinitydHandshakeError("handshake response missing sessionId");
  }
  // Hot-fix J — authMode is optional; default to "device" so older bridges
  // keep the legacy frame format. Current livinityd (Hot-fix F2+) emits
  // "master" because openclaw runs in mode:token.
  const mode: "master" | "device" =
    authMode === "master" || authMode === "device" ? authMode : "device";

  return {token, expiresAt, sessionId, authMode: mode};
}

/**
 * Returns true when the supplied token is missing or its expiry is within
 * `bufferMs` of now (default 30s). Used by the socket layer to decide whether
 * a cached deviceToken is fresh enough to reuse or needs a re-fetch.
 */
export function shouldRefreshDeviceToken(
  expiresAt: number | undefined,
  now: number = Date.now(),
  bufferMs: number = 30_000,
): boolean {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return true;
  return expiresAt - now < bufferMs;
}
