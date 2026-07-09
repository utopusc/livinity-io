import { NextRequest, NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { lookupPendingGrant } from '@/lib/device-auth';

/**
 * WR-03: pre-approval device-identity lookup for the /device approval page.
 * Discloses only the requesting device's self-reported { deviceName, platform }
 * for a pending, unexpired user_code — so the user sees what they are about to
 * authorize BEFORE clicking Approve (RFC 8628 device-code-phishing mitigation).
 *
 * Session-gated like /api/device/approve: only a signed-in approver can use it,
 * which also blocks anonymous user_code enumeration.
 */
export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const session = await getSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const code = req.nextUrl.searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    const info = await lookupPendingGrant(code);
    if (!info) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 404 });
    }

    return NextResponse.json({ deviceName: info.deviceName, platform: info.platform });
  } catch (err) {
    console.error('[device] Lookup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
