export interface Settings {
  gatewayUrl: string;
  token?: string;
  deviceToken?: string;
}

const STORAGE_KEY = "claw-settings-v1";

/**
 * Phase 203 Hot-fix I 2026-05-24 — pre-Hot-fix-G stale localStorage scrub.
 *
 * Operators who connected before Hot-fix G (`9a2cc79e`) shipped the direct
 * loopback URL still have `wss://${userHost}.livinity.io/liv-ai-app/liv-ai/ws`
 * persisted in `claw-settings-v1`. That URL is dead — Caddy used to rewrite it
 * to `:18789` via `handle_path /liv-ai-app/liv-ai*` but Hot-fix G removed
 * reliance on it. Until the operator clears their browser storage by hand, the
 * stale URL re-appears in the form input AND short-circuits the bypass
 * probe's auto-connect attempt (`already-configured` path skips re-handshake
 * unless `force=true` — which Hot-fix H does for AUTH_FAILED but not for the
 * passive cached-but-broken state).
 *
 * Strategy: any persisted `gatewayUrl` matching the legacy livinity.io pattern
 * is treated as poisoned. We wipe gatewayUrl + deviceToken so the bypass probe
 * re-seeds fresh credentials from `/openclawos/handshake` on the next mount.
 * Standalone deploys keep their custom URLs (we only match the exact stale
 * shape).
 */
const POISONED_GATEWAY_URL_PATTERNS: ReadonlyArray<RegExp> = [
  // wss://anything.livinity.io/liv-ai-app/liv-ai/ws  (pre-Hot-fix-G shape)
  /^wss?:\/\/[^/]+\.livinity\.(io|live)\/liv-ai-app\/liv-ai\/ws$/i,
  // wss://anything.livinity.io/plugins/openclawos/ws (variant some operators may have)
  /^wss?:\/\/[^/]+\.livinity\.(io|live)\/plugins\/openclawos\/ws$/i,
];

function isPoisonedGatewayUrl(url: string | undefined): boolean {
  if (!url) return false;
  return POISONED_GATEWAY_URL_PATTERNS.some((re) => re.test(url));
}

/**
 * Hot-fix J 2026-05-24 — master tokens are 64 hex chars (openclaw config
 * shape: `node:crypto.randomBytes(32).toString('hex')` produced by livinityd
 * install.sh Hot-fix G part 3). Device tokens are JWTs (contain `.`s).
 * Anything matching the master shape that's saved in the deviceToken slot
 * is a Hot-fix F2-era poisoning (we used to write the master token into
 * `deviceToken` which made `handshake.ts` send `auth: {deviceToken: ...}`
 * — openclaw `mode: token` rejects that with `device_token_mismatch`).
 */
const MASTER_TOKEN_HEX64 = /^[0-9a-f]{64}$/i;

function isPoisonedDeviceToken(token: string | undefined): boolean {
  if (!token) return false;
  // JWTs always have at least two `.`s; master tokens never do.
  return !token.includes(".") && MASTER_TOKEN_HEX64.test(token);
}

export function getSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Settings;
    // Hot-fix I scrub: poisoned URL → wipe gatewayUrl+deviceToken so the
    // auto-connect probe falls into the `seeded` branch with fresh creds
    // instead of short-circuiting on `already-configured` with a dead URL.
    if (isPoisonedGatewayUrl(parsed.gatewayUrl)) {
      const {gatewayUrl: _gw, deviceToken: _dt, ...rest} = parsed;
      const scrubbed = {...rest, gatewayUrl: ""} as Settings;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scrubbed));
      } catch {
        // best-effort; even if persistence fails the in-memory return is clean
      }
      // Returning null is semantically equivalent to "no settings" for the
      // caller — the bypass probe will then treat this as fresh-install and
      // seed via /openclawos/handshake.
      return null;
    }
    // Hot-fix J scrub: master token in deviceToken slot → move it to token slot.
    // handshake.ts (claw-client) picks the WS connect frame shape from which
    // Settings field is populated; openclaw `mode: token` ONLY accepts the
    // `auth: {token}` shape, and rejects `auth: {deviceToken}` regardless of
    // the token's actual value with `device_token_mismatch` then rate-limit
    // lockout (operator UAT 2026-05-23/24). Promoting the cached value to the
    // right slot is a same-value-different-slot move, so the next reconnect
    // succeeds immediately without a round-trip to /openclawos/handshake.
    if (isPoisonedDeviceToken(parsed.deviceToken)) {
      const {deviceToken: stale, ...rest} = parsed;
      const repaired: Settings = {...rest, token: stale!};
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(repaired));
      } catch {
        // best-effort
      }
      return repaired;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function saveDeviceToken(token: string): void {
  const settings = getSettings();
  if (settings) saveSettings({ ...settings, deviceToken: token });
}

export function clearDeviceToken(): void {
  const settings = getSettings();
  if (settings) {
    const { deviceToken: _, ...rest } = settings;
    saveSettings(rest as Settings);
  }
}

export function clearAuthCredentials(): void {
  const settings = getSettings();
  if (settings) {
    const { deviceToken: _dt, token: _t, ...rest } = settings;
    saveSettings(rest as Settings);
  }
}
