/**
 * Tests for device-auth.ts signDeviceToken — Phase 263-05 (L-067 High).
 *
 * L-067: device-auth.ts:6 used to read
 *   const DEVICE_JWT_SECRET = process.env.DEVICE_JWT_SECRET || 'dev-device-jwt-secret-change-me'
 * — a committed default signing key. A paid product must never ship a known
 * signing key. This suite locks the fail-closed contract:
 *
 *   1. signDeviceToken throws when DEVICE_JWT_SECRET is unset (required).
 *   2. signDeviceToken throws when DEVICE_JWT_SECRET equals the old committed
 *      default 'dev-device-jwt-secret-change-me'.
 *   3. With a real secret set, signDeviceToken returns an HS256 JWT bound to
 *      aud='livinity-device' and iss='livinity-web'.
 *
 * The secret read is LAZY (inside signDeviceToken), not at module top-level, so
 * importing this module never throws and each case can mutate
 * process.env.DEVICE_JWT_SECRET independently.
 *
 * NOTE: device-auth.ts imports ./db, whose module top-level throws if
 * DATABASE_URL is unset (LIVOS-021). So this test must run with a dummy
 * DATABASE_URL — the lazy pg.Pool never connects:
 *
 *   cd platform/web
 *   DATABASE_URL='postgres://x:x@127.0.0.1:5432/x' \
 *     npx tsx --test src/lib/device-auth.test.ts
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import jwt from 'jsonwebtoken';

import { signDeviceToken, type DeviceTokenPayload } from './device-auth.js';

const OLD_DEFAULT = 'dev-device-jwt-secret-change-me';

const samplePayload: DeviceTokenPayload = {
  userId: '11111111-1111-1111-1111-111111111111',
  deviceId: '22222222-2222-2222-2222-222222222222',
  deviceName: 'test-laptop',
  platform: 'linux',
  sessionId: '33333333-3333-3333-3333-333333333333',
};

describe('device-auth signDeviceToken — fail-closed secret (L-067)', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.DEVICE_JWT_SECRET;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.DEVICE_JWT_SECRET;
    else process.env.DEVICE_JWT_SECRET = saved;
  });

  it('throws when DEVICE_JWT_SECRET is unset (required)', () => {
    delete process.env.DEVICE_JWT_SECRET;
    assert.throws(
      () => signDeviceToken(samplePayload),
      /DEVICE_JWT_SECRET is required/,
      'signing must fail closed when the secret is unset',
    );
  });

  it('throws when DEVICE_JWT_SECRET equals the old committed default', () => {
    process.env.DEVICE_JWT_SECRET = OLD_DEFAULT;
    assert.throws(
      () => signDeviceToken(samplePayload),
      /committed default/,
      'signing must reject the known committed default key',
    );
  });

  it('signs an HS256 token bound to aud=livinity-device, iss=livinity-web with a real secret', () => {
    process.env.DEVICE_JWT_SECRET = 'a-real-strong-random-secret-for-tests-only';
    const token = signDeviceToken(samplePayload);
    assert.equal(typeof token, 'string');
    assert.ok(token.length > 0, 'token must be non-empty');

    const decoded = jwt.decode(token, { complete: true });
    assert.ok(decoded && typeof decoded === 'object', 'token must decode');

    // Header alg is HS256.
    assert.equal((decoded as jwt.Jwt).header.alg, 'HS256');

    // Payload carries the bound aud/iss and the original claims.
    const claims = (decoded as jwt.Jwt).payload as jwt.JwtPayload;
    assert.equal(claims.aud, 'livinity-device');
    assert.equal(claims.iss, 'livinity-web');
    assert.equal(claims.userId, samplePayload.userId);
    assert.equal(claims.deviceId, samplePayload.deviceId);
    assert.equal(claims.sessionId, samplePayload.sessionId);
  });
});
