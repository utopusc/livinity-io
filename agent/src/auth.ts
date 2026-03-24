import { AGENT_VERSION } from './config.js';
import { readCredentials, writeCredentials, type CredentialsData } from './state.js';

// ---- Constants ----

/**
 * Platform URL is hardcoded for security — agent must always authenticate
 * against the real platform, never a configurable endpoint.
 */
export const PLATFORM_URL = 'https://livinity.io';

// ---- Device Flow ----

interface DeviceRegisterResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  relay_url: string;
}

interface DeviceTokenError {
  error: string;
}

/**
 * RFC 8628 OAuth Device Authorization Grant flow.
 *
 * 1. POST /api/device/register — get device_code + user_code
 * 2. Display user_code and verification URL to user
 * 3. Poll /api/device/token every `interval` seconds until approved or expired
 * 4. Store credentials to ~/.livinity/credentials.json
 */
export async function deviceFlowSetup(deviceName: string): Promise<CredentialsData> {
  const platform = process.platform as 'win32' | 'darwin' | 'linux';

  // Step 1: Register device
  const registerRes = await fetch(`${PLATFORM_URL}/api/device/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceName, platform, agentVersion: AGENT_VERSION }),
  });

  if (!registerRes.ok) {
    const body = await registerRes.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Device registration failed: ${(body as { error: string }).error}`);
  }

  const grant = (await registerRes.json()) as DeviceRegisterResponse;
  const { device_code, user_code, verification_uri, expires_in, interval } = grant;

  // Step 2: Display instructions
  console.log('');
  console.log('Device Authentication');
  console.log('=====================');
  console.log('');
  console.log('To authorize this device, visit:');
  console.log('');
  console.log(`  ${verification_uri}`);
  console.log('');
  console.log('And enter code:');
  console.log('');
  console.log(`  ${user_code}`);
  console.log('');
  console.log('Waiting for approval...');

  // Step 3: Poll for token
  const pollInterval = (interval || 5) * 1000;
  const deadline = Date.now() + expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(pollInterval);

    const tokenRes = await fetch(`${PLATFORM_URL}/api/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code }),
    });

    if (tokenRes.ok) {
      // Approved!
      const tokenData = (await tokenRes.json()) as DeviceTokenResponse;
      const { access_token, relay_url } = tokenData;

      // Decode JWT payload to extract deviceId (no JWT library needed)
      const deviceId = decodeJwtPayload(access_token).deviceId as string;

      // Step 4: Store credentials
      const credentials: CredentialsData = {
        deviceToken: access_token,
        deviceId,
        deviceName,
        relayUrl: relay_url,
        platform,
      };
      writeCredentials(credentials);

      console.log('');
      console.log('Device authorized successfully!');
      console.log('');
      console.log(`Device ID:  ${deviceId}`);
      console.log(`Device:     ${deviceName}`);
      console.log(`Relay:      ${relay_url}`);
      console.log('Token expires in 24 hours.');
      console.log('');
      console.log('Run `livinity-agent start` to connect.');

      return credentials;
    }

    // Not approved yet — check error
    const errorBody = (await tokenRes.json()) as DeviceTokenError;

    if (errorBody.error === 'authorization_pending') {
      process.stdout.write('.');
      continue;
    }

    if (errorBody.error === 'expired_token') {
      console.log('');
      throw new Error('Device code expired. Please run setup again.');
    }

    if (errorBody.error === 'invalid_grant') {
      console.log('');
      throw new Error('Invalid device code.');
    }

    // Unknown error
    console.log('');
    throw new Error(`Unexpected error during polling: ${errorBody.error}`);
  }

  throw new Error('Device code expired (timeout). Please run setup again.');
}

// ---- Token Expiry ----

/**
 * Check if a JWT device token is expired (or within 5-minute buffer).
 * Returns true if token is expired, malformed, or within 5 minutes of expiry.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token);
    const exp = payload.exp as number;
    if (typeof exp !== 'number') return true;
    // Expired if current time >= exp - 300s (5 minute buffer)
    return Date.now() / 1000 >= exp - 300;
  } catch {
    // Malformed token — treat as expired
    return true;
  }
}

/**
 * Check credentials and token validity.
 * If token is expired, instructs user to re-run setup.
 * If valid, returns credentials unchanged.
 *
 * NOTE: No refresh token endpoint exists in v14.0. When the 24h token expires,
 * the user must re-run `livinity-agent setup`.
 */
export async function refreshOrReauth(): Promise<CredentialsData> {
  const credentials = readCredentials();
  if (!credentials) {
    throw new Error('No credentials found. Run `livinity-agent setup` first.');
  }

  if (isTokenExpired(credentials.deviceToken)) {
    console.log('Device token has expired. Re-authentication required.');
    console.log('Run `livinity-agent setup` to re-authenticate.');
    throw new Error('Token expired');
  }

  return credentials;
}

// ---- Helpers ----

/**
 * Decode JWT payload segment via base64url decoding (no external library).
 * The agent does not verify the token — the relay does JWT verification.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  // Base64url -> Base64 -> decode
  let base64 = segments[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  // Pad if necessary
  const remainder = base64.length % 4;
  if (remainder === 2) base64 += '==';
  else if (remainder === 3) base64 += '=';

  const json = Buffer.from(base64, 'base64').toString('utf-8');
  return JSON.parse(json) as Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
