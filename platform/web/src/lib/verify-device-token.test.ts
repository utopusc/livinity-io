/**
 * Tests for device-auth.ts verifyDeviceToken — AUTH-02 device-flow pivot (02-08).
 *
 * verifyDeviceToken() is the verify path signDeviceToken's comment mandated: it
 * pins { algorithms: ['HS256'], audience: 'livinity-device', issuer: 'livinity-web' }
 * so a forged alg=none/RS256 token, a wrong-audience token, a tampered signature,
 * or an expired token all THROW rather than silently validating. This suite
 * proves the round-trip and each rejection case.
 *
 * Deliberately a NEW file — device-auth.test.ts carries a sacred-SHA invariant
 * and must not be touched.
 *
 * NOTE: device-auth.ts imports ./db, whose module top-level throws if
 * DATABASE_URL is unset (LIVOS-021). So this test must run with a dummy
 * DATABASE_URL — the lazy pg.Pool never connects:
 *
 *   cd platform/web
 *   DATABASE_URL='postgres://x:x@127.0.0.1:5432/x' \
 *     npx tsx --test src/lib/verify-device-token.test.ts
 */

import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import jwt from 'jsonwebtoken';

import { signDeviceToken, verifyDeviceToken, type DeviceTokenPayload } from './device-auth.js';

const samplePayload: DeviceTokenPayload = {
  userId: '11111111-1111-1111-1111-111111111111',
  deviceId: '22222222-2222-2222-2222-222222222222',
  deviceName: 'test-laptop',
  platform: 'linux',
  sessionId: '33333333-3333-3333-3333-333333333333',
};

const TEST_SECRET = 'a-real-strong-random-secret-for-tests-only';

describe('device-auth verifyDeviceToken — verify path (264/265 follow-up)', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.DEVICE_JWT_SECRET;
    process.env.DEVICE_JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.DEVICE_JWT_SECRET;
    else process.env.DEVICE_JWT_SECRET = saved;
  });

  it('round-trips: verifyDeviceToken returns the same claims signDeviceToken embedded', () => {
    const token = signDeviceToken(samplePayload);
    const claims = verifyDeviceToken(token);
    assert.equal(claims.userId, samplePayload.userId);
    assert.equal(claims.deviceId, samplePayload.deviceId);
    assert.equal(claims.deviceName, samplePayload.deviceName);
    assert.equal(claims.platform, samplePayload.platform);
    assert.equal(claims.sessionId, samplePayload.sessionId);
  });

  it('throws on a wrong-audience token', () => {
    const token = jwt.sign(samplePayload, TEST_SECRET, {
      algorithm: 'HS256',
      expiresIn: '24h',
      audience: 'something-else',
      issuer: 'livinity-web',
    });
    assert.throws(() => verifyDeviceToken(token));
  });

  it('throws on an expired token', () => {
    const token = jwt.sign(samplePayload, TEST_SECRET, {
      algorithm: 'HS256',
      expiresIn: '-1s',
      audience: 'livinity-device',
      issuer: 'livinity-web',
    });
    assert.throws(() => verifyDeviceToken(token));
  });

  it('throws on a tampered signature', () => {
    const token = signDeviceToken(samplePayload);
    // Flip one character in the signature segment (last segment after the final dot).
    const parts = token.split('.');
    const lastChar = parts[2].slice(-1);
    const flipped = lastChar === 'A' ? 'B' : 'A';
    parts[2] = parts[2].slice(0, -1) + flipped;
    const tampered = parts.join('.');
    assert.throws(() => verifyDeviceToken(tampered));
  });

  it('rejects alg confusion — a token whose header claims alg=none', () => {
    // Craft an unsigned "alg: none" token by hand: base64url(header).base64url(payload).
    // jwt.sign refuses algorithm:'none' unless explicitly allowed, so build it manually
    // to simulate a forged token an attacker controls end-to-end.
    const b64url = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const header = b64url({ alg: 'none', typ: 'JWT' });
    const payload = b64url({
      ...samplePayload,
      aud: 'livinity-device',
      iss: 'livinity-web',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const noneToken = `${header}.${payload}.`;
    assert.throws(() => verifyDeviceToken(noneToken));
  });
});
