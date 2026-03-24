/**
 * Device JWT Authentication
 *
 * Verifies device tokens issued by livinity.io /api/device/token.
 * Tokens are HS256 JWTs with userId, deviceId, deviceName, platform claims.
 */

import jwt from 'jsonwebtoken';
import { config } from './config.js';

export interface DeviceTokenPayload {
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  iat: number;
  exp: number;
}

export function verifyDeviceToken(token: string): DeviceTokenPayload | null {
  try {
    const payload = jwt.verify(token, config.DEVICE_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as DeviceTokenPayload;

    // Validate required claims
    if (!payload.userId || !payload.deviceId || !payload.deviceName || !payload.platform) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
