import { NextRequest, NextResponse } from 'next/server';
import { getGrantByDeviceCode, signDeviceToken, createDeviceRecord } from '@/lib/device-auth';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { device_code } = body;

    if (!device_code || typeof device_code !== 'string') {
      return NextResponse.json({ error: 'device_code is required' }, { status: 400 });
    }

    const grant = await getGrantByDeviceCode(device_code);

    if (!grant) {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
    }

    if (grant.status === 'expired') {
      return NextResponse.json({ error: 'expired_token' }, { status: 400 });
    }

    if (grant.status === 'pending') {
      return NextResponse.json({ error: 'authorization_pending' }, { status: 400 });
    }

    // grant.status === 'approved'
    if (!grant.userId || !grant.deviceInfo) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Phase 14 SESS-01: every approved grant MUST have been bound to a session.
    // Missing sessionId means a pre-migration grant or a data integrity bug — reject the token exchange.
    if (!grant.sessionId) {
      console.error('[device] Approved grant missing session_id — rejecting token exchange');
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
    }

    // Create device record and issue JWT
    const deviceId = await createDeviceRecord(grant.userId, {
      deviceName: grant.deviceInfo.deviceName,
      platform: grant.deviceInfo.platform,
    });

    const token = signDeviceToken({
      userId: grant.userId,
      deviceId,
      deviceName: grant.deviceInfo.deviceName,
      platform: grant.deviceInfo.platform,
      sessionId: grant.sessionId,  // Phase 14 SESS-01: bind this JWT to the approving user session
    });

    // Mark grant as consumed (delete it so device_code can't be reused)
    await pool.query('DELETE FROM device_grants WHERE device_code = $1', [device_code]);

    return NextResponse.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 86400, // 24 hours in seconds
      relay_url: 'wss://relay.livinity.io',
    });
  } catch (err) {
    console.error('[device] Token error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
