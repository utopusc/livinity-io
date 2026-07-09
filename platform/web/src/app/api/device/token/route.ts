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

    // WR-01: consume the grant with a single atomic statement BEFORE minting anything.
    // Two concurrent requests with the same device_code (client retry / network replay)
    // could both pass the SELECT above; only one can win this row-locked DELETE, so one
    // approval can never mint two independent device JWTs. Mirrors /api/device/exchange's
    // token_exchanged_at CAS (migration 0029). The loser gets invalid_grant — identical
    // to what any post-consumption poll already received.
    const claimed = await pool.query<{
      user_id: string;
      session_id: string;
      device_info: { deviceName: string; platform: string };
    }>(
      `DELETE FROM device_grants
       WHERE device_code = $1 AND status = 'approved'
       RETURNING user_id, session_id, device_info`,
      [device_code]
    );
    if (claimed.rows.length === 0) {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
    }
    const row = claimed.rows[0];

    // Create device record and issue JWT — from the claimed row, not the pre-read grant
    const deviceId = await createDeviceRecord(row.user_id, {
      deviceName: row.device_info.deviceName,
      platform: row.device_info.platform,
    });

    const token = signDeviceToken({
      userId: row.user_id,
      deviceId,
      deviceName: row.device_info.deviceName,
      platform: row.device_info.platform,
      sessionId: row.session_id,  // Phase 14 SESS-01: bind this JWT to the approving user session
    });

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
