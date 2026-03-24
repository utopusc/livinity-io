import { NextRequest, NextResponse } from 'next/server';
import { createDeviceGrant } from '@/lib/device-auth';

const VALID_PLATFORMS = new Set(['win32', 'darwin', 'linux']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deviceName, platform, agentVersion } = body;

    if (!deviceName || typeof deviceName !== 'string' || deviceName.length < 1 || deviceName.length > 64) {
      return NextResponse.json({ error: 'deviceName is required (1-64 characters)' }, { status: 400 });
    }
    if (!platform || !VALID_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'platform must be one of: win32, darwin, linux' }, { status: 400 });
    }
    if (!agentVersion || typeof agentVersion !== 'string') {
      return NextResponse.json({ error: 'agentVersion is required' }, { status: 400 });
    }

    const grant = await createDeviceGrant({ deviceName, platform, agentVersion });

    return NextResponse.json({
      device_code: grant.deviceCode,
      user_code: grant.userCode,
      verification_uri: grant.verificationUri,
      expires_in: grant.expiresIn,
      interval: grant.interval,
    });
  } catch (err) {
    console.error('[device] Register error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
