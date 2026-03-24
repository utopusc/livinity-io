import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';

const RELAY_URL = process.env.RELAY_INTERNAL_URL || 'http://localhost:4000';

async function getUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getSession(token);
}

/** GET /api/dashboard — Get dashboard data (status, bandwidth, key info) */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if user has an API key
  const keyResult = await pool.query<{ prefix: string; created_at: string }>(
    'SELECT prefix, created_at FROM api_keys WHERE user_id = $1 LIMIT 1',
    [user.userId],
  );
  const hasApiKey = keyResult.rows.length > 0;
  const apiKeyPrefix = hasApiKey ? keyResult.rows[0].prefix : null;

  // Get connection status from relay
  let online = false;
  try {
    const statusRes = await fetch(`${RELAY_URL}/internal/user-status?username=${user.username}`, { cache: 'no-store' });
    if (statusRes.ok) {
      const data = await statusRes.json();
      online = data.online;
    }
  } catch {
    // Relay unreachable
  }

  // Get bandwidth from relay
  let bandwidth = { usedBytes: 0, limitBytes: 53_687_091_200, allowed: true };
  try {
    const bwRes = await fetch(`${RELAY_URL}/internal/user-bandwidth?userId=${user.userId}`, { cache: 'no-store' });
    if (bwRes.ok) {
      bandwidth = await bwRes.json();
    }
  } catch {
    // Relay unreachable
  }

  // Get user's registered devices
  let devices: { deviceId: string; deviceName: string; platform: string; createdAt: string; lastSeen: string | null }[] = [];
  try {
    const devicesResult = await pool.query<{
      device_id: string;
      device_name: string;
      platform: string;
      created_at: string;
      last_seen: string | null;
    }>(
      'SELECT device_id, device_name, platform, created_at, last_seen FROM devices WHERE user_id = $1 AND (revoked IS NULL OR revoked = false) ORDER BY created_at DESC',
      [user.userId],
    );
    devices = devicesResult.rows.map((r) => ({
      deviceId: r.device_id,
      deviceName: r.device_name,
      platform: r.platform,
      createdAt: r.created_at,
      lastSeen: r.last_seen,
    }));
  } catch {
    // devices table may not exist yet
  }

  return NextResponse.json({
    user: {
      id: user.userId,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
    },
    apiKey: {
      hasKey: hasApiKey,
      prefix: apiKeyPrefix,
    },
    server: {
      online,
      url: `https://${user.username}.livinity.io`,
    },
    bandwidth: {
      usedBytes: bandwidth.usedBytes,
      limitBytes: bandwidth.limitBytes,
      usedPercent: Math.round((bandwidth.usedBytes / bandwidth.limitBytes) * 100),
    },
    devices,
  });
}

/** POST /api/dashboard — Generate or regenerate API key */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!user.emailVerified) {
    return NextResponse.json({ error: 'Please verify your email before generating an API key' }, { status: 403 });
  }

  const { action } = await req.json();

  if (action === 'generate-key' || action === 'regenerate-key') {
    // Delete existing key if regenerating
    await pool.query('DELETE FROM api_keys WHERE user_id = $1', [user.userId]);

    // Generate new key
    const rawKey = `liv_k_${nanoid(20)}`;
    const prefix = rawKey.substring(0, 14);
    const keyHash = await bcrypt.hash(rawKey, 10);

    await pool.query(
      'INSERT INTO api_keys (user_id, key_hash, prefix) VALUES ($1, $2, $3)',
      [user.userId, keyHash, prefix],
    );

    return NextResponse.json({
      success: true,
      apiKey: rawKey, // Displayed ONCE, never again
      prefix,
      installCommand: `curl -sSL https://livinity.io/install.sh | sudo bash -s -- --api-key ${rawKey}`,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
