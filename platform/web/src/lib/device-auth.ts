import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import pool from './db';

// Shared secret between platform and relay for device JWT validation.
// L-067 (Phase 263-05): NO committed default. The signing key must be a real
// secret set in the Vercel project env (dashboard, NOT committed). requireDeviceSecret()
// fails closed — it throws if DEVICE_JWT_SECRET is unset OR equal to the old
// committed default. It is called LAZILY inside signDeviceToken (not at module
// top-level) so importing this module never throws: the fail-closed check fires
// exactly when a device token is actually minted, which is the security-relevant
// moment. A top-level throw would break the entire Next.js route bundle on cold
// start even for routes that never sign a device token.
const DEVICE_JWT_DEFAULT = 'dev-device-jwt-secret-change-me';

function requireDeviceSecret(): string {
  const v = process.env.DEVICE_JWT_SECRET;
  if (!v) {
    throw new Error('[device-auth] DEVICE_JWT_SECRET is required — set it in the Vercel project env (L-067)');
  }
  if (v === DEVICE_JWT_DEFAULT) {
    throw new Error('[device-auth] DEVICE_JWT_SECRET is the committed default — set a real secret (L-067)');
  }
  return v;
}

const DEVICE_TOKEN_EXPIRY = '24h';
const GRANT_EXPIRY_MINUTES = 15;
const POLL_INTERVAL_SECONDS = 5;

// Characters excluding ambiguous ones: 0/O, 1/I/L
const USER_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateUserCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_CHARS[Math.floor(Math.random() * USER_CODE_CHARS.length)];
  }
  return code.slice(0, 4) + '-' + code.slice(4);
}

export function generateDeviceCode(): string {
  return nanoid(32);
}

export interface DeviceGrant {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export async function createDeviceGrant(deviceInfo: {
  deviceName: string;
  platform: string;
  agentVersion: string;
}): Promise<DeviceGrant> {
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + GRANT_EXPIRY_MINUTES * 60 * 1000);

  await pool.query(
    `INSERT INTO device_grants (device_code, user_code, device_info, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [deviceCode, userCode, JSON.stringify(deviceInfo), expiresAt]
  );

  return {
    deviceCode,
    userCode,
    verificationUri: 'https://livinity.io/device',
    expiresIn: GRANT_EXPIRY_MINUTES * 60,
    interval: POLL_INTERVAL_SECONDS,
  };
}

export interface GrantStatus {
  status: 'pending' | 'approved' | 'expired';
  userId?: string;
  sessionId?: string;  // Phase 14 SESS-01: populated when grant is approved
  deviceInfo?: { deviceName: string; platform: string; agentVersion: string };
}

export async function getGrantByDeviceCode(deviceCode: string): Promise<GrantStatus | null> {
  const result = await pool.query<{
    status: string;
    user_id: string | null;
    session_id: string | null;
    device_info: any;
    expires_at: Date;
  }>(
    // Phase 14 SESS-01: select session_id alongside user_id so the token endpoint can embed it
    'SELECT status, user_id, session_id, device_info, expires_at FROM device_grants WHERE device_code = $1 LIMIT 1',
    [deviceCode]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  // Check expiry
  if (new Date() > new Date(row.expires_at) && row.status === 'pending') {
    await pool.query("UPDATE device_grants SET status = 'expired' WHERE device_code = $1", [deviceCode]);
    return { status: 'expired' };
  }

  return {
    status: row.status as GrantStatus['status'],
    userId: row.user_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    deviceInfo: row.device_info,
  };
}

export async function approveGrant(userCode: string, userId: string, sessionId: string): Promise<{
  success: boolean;
  error?: string;
  deviceInfo?: { deviceName: string; platform: string; agentVersion: string };
}> {
  // Find the pending grant by user_code
  const result = await pool.query<{
    id: string;
    status: string;
    device_info: any;
    expires_at: Date;
  }>(
    "SELECT id, status, device_info, expires_at FROM device_grants WHERE user_code = $1 LIMIT 1",
    [userCode.toUpperCase().replace(/-/g, '').replace(/^(.{4})/, '$1-')]
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Invalid code. Please check and try again.' };
  }

  const grant = result.rows[0];

  if (grant.status !== 'pending') {
    return { success: false, error: 'This code has already been used or expired.' };
  }

  if (new Date() > new Date(grant.expires_at)) {
    await pool.query("UPDATE device_grants SET status = 'expired' WHERE id = $1", [grant.id]);
    return { success: false, error: 'This code has expired. Please generate a new one from the agent.' };
  }

  // Phase 14 SESS-01: persist the approving user's session UUID alongside user_id.
  // The /api/device/token endpoint will later embed this into the signed JWT.
  await pool.query(
    "UPDATE device_grants SET status = 'approved', user_id = $1, session_id = $2 WHERE id = $3",
    [userId, sessionId, grant.id]
  );

  return { success: true, deviceInfo: grant.device_info };
}

export interface DeviceTokenPayload {
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  sessionId: string;  // Phase 14 SESS-01: approving user's sessions.id UUID (not the opaque session token)
}

export function signDeviceToken(payload: DeviceTokenPayload): string {
  // Lazy fail-closed secret read (L-067) — throws on unset/default at mint time.
  const secret = requireDeviceSecret();
  // Bind audience/issuer so a future verifier can reject token-confusion/replay
  // across audiences. NOTE: there is no live jwt.verify of the device token in
  // platform/web today (the verifier is the dead relay + the Supabase
  // sessionId+deviceId+userId DB cross-check). If a verify path is added later
  // (264/265 follow-up) it MUST pass { algorithms: ['HS256'], audience:
  // 'livinity-device', issuer: 'livinity-web' }.
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: DEVICE_TOKEN_EXPIRY,
    audience: 'livinity-device',
    issuer: 'livinity-web',
  });
}

export interface VerifiedDeviceToken {
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  sessionId: string;
}

/**
 * The verify path the signDeviceToken comment mandated (264/265 follow-up).
 * Pins { algorithms:['HS256'], audience:'livinity-device', issuer:'livinity-web' } so a
 * forged alg=none/RS256 token, a wrong-audience token, or an expired token all THROW.
 * Fail-closed secret via requireDeviceSecret() (L-067). Throws on any invalid input.
 */
export function verifyDeviceToken(token: string): VerifiedDeviceToken {
  const secret = requireDeviceSecret();
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    audience: 'livinity-device',
    issuer: 'livinity-web',
  }) as jwt.JwtPayload;
  return {
    userId: String(decoded.userId),
    deviceId: String(decoded.deviceId),
    deviceName: String(decoded.deviceName),
    platform: String(decoded.platform),
    sessionId: String(decoded.sessionId),
  };
}

export async function createDeviceRecord(userId: string, deviceInfo: {
  deviceName: string;
  platform: string;
}): Promise<string> {
  // OWN-01 hard invariant: device records MUST be bound to a user at insert time.
  // The FK constraint (migration 0007) enforces this at the DB level; we also
  // guard in application code for a clearer error message and early rejection.
  if (!userId || typeof userId !== 'string' || userId.length === 0) {
    throw new Error('createDeviceRecord called with missing userId — device registration requires an authenticated user (OWN-02)');
  }

  const result = await pool.query<{ device_id: string }>(
    `INSERT INTO devices (user_id, device_id, device_name, platform)
     VALUES ($1, gen_random_uuid(), $2, $3)
     RETURNING device_id`,
    [userId, deviceInfo.deviceName, deviceInfo.platform]
  );
  return result.rows[0].device_id;
}
