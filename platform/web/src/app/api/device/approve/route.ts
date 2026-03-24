import { NextRequest, NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { approveGrant } from '@/lib/device-auth';

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const session = await getSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await req.json();
    const { user_code } = body;

    if (!user_code || typeof user_code !== 'string') {
      return NextResponse.json({ error: 'user_code is required' }, { status: 400 });
    }

    const result = await approveGrant(user_code, session.userId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      deviceName: result.deviceInfo?.deviceName,
      platform: result.deviceInfo?.platform,
    });
  } catch (err) {
    console.error('[device] Approve error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
