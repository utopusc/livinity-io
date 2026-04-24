import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import pool from './db';

// Shared secret between platform and relay for device JWT validation
const DEVICE_JWT_SECRET = process.env.DEVICE_JWT_SECRET || 'dev-device-jwt-secret-change-me';
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
  return jwt.sign(payload, DEVICE_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: DEVICE_TOKEN_EXPIRY,
  });
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
