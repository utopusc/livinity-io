/**
 * Device JWT Authentication
 *
 * Verifies device tokens issued by livinity.io /api/device/token.
 * Tokens are HS256 JWTs with userId, deviceId, deviceName, platform, sessionId claims.
 */

import jwt from 'jsonwebtoken';
import { config } from './config.js';

export interface DeviceTokenPayload {
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  sessionId: string;  // Phase 14 SESS-01: approving user's sessions.id UUID
  iat: number;
  exp: number;
}

export function verifyDeviceToken(token: string): DeviceTokenPayload | null {
  try {
    const payload = jwt.verify(token, config.DEVICE_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as DeviceTokenPayload;

    // Phase 14 SESS-01: sessionId is now a required claim — legacy tokens without it are rejected
    if (!payload.userId || !payload.deviceId || !payload.deviceName || !payload.platform || !payload.sessionId) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
