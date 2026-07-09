import { NextRequest, NextResponse } from 'next/server';
import { createDeviceGrant } from '@/lib/device-auth';

const VALID_PLATFORMS = new Set(['win32', 'darwin', 'linux']);

// WR-03 hardening: deviceName is attacker-reachable free text (this endpoint is
// unauthenticated) and is later shown to the approving user on /device. Strip
// characters that can visually forge or corrupt that disclosure: C0/C1 controls,
// bidi overrides/isolates/marks, zero-width and joiner characters, BOM.
// Code-point filter (not a regex literal) so no escape ambiguity survives edits.
function sanitizeDeviceName(name: string): string {
  let out = '';
  for (const ch of name) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const isControl = cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
    const isBidiOrInvisible =
      cp === 0x061c || // Arabic letter mark
      (cp >= 0x200b && cp <= 0x200f) || // zero-width space/joiners, LRM/RLM
      (cp >= 0x202a && cp <= 0x202e) || // bidi embeddings/overrides
      (cp >= 0x2060 && cp <= 0x2069) || // word joiner, invisibles, bidi isolates
      cp === 0xfeff; // BOM / zero-width no-break space
    if (!isControl && !isBidiOrInvisible) out += ch;
  }
  return out.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, agentVersion } = body;

    const deviceName =
      typeof body.deviceName === 'string' ? sanitizeDeviceName(body.deviceName) : '';
    if (deviceName.length < 1 || deviceName.length > 64) {
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
