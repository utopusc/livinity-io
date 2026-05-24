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
