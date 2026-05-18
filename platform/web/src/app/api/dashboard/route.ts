import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { cfClient } from '@/lib/cf-saas';

const RELAY_URL = process.env.RELAY_INTERNAL_URL || 'http://localhost:4000';

// Phase 141-07: 30-second in-memory cache of CF tunnel connection counts.
// Per-user (tunnel_id) keyed. Dashboard polls frequently in the browser; we
// don't want to hammer the CF API on every poll. 30s is enough for the
// "asleep ↔ online" transition to feel fresh without breaking the per-token
// rate limit (1200/5min ≈ 240/min) when hundreds of users dashboard at once.
type CachedStatus = { count: number; checkedAt: number };
const CF_STATUS_CACHE = new Map<string, CachedStatus>();
const CF_STATUS_TTL_MS = 30_000;

async function getCfTunnelOnline(tunnel_id: string): Promise<boolean> {
  const cached = CF_STATUS_CACHE.get(tunnel_id);
  const now = Date.now();
  if (cached && now - cached.checkedAt < CF_STATUS_TTL_MS) {
    return cached.count > 0;
  }
  const { count } = await cfClient.getTunnelConnections(tunnel_id);
  CF_STATUS_CACHE.set(tunnel_id, { count, checkedAt: now });
  return count > 0;
}

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

  // Phase 140-06.4: surface whether the user's CF tunnel was provisioned at
  // signup. The dashboard.html derives `hasComputer` from this (replacing the
  // older custom_domains-only signal that pre-dates Phase 140's auto-provisioning).
  // Phase 141-07: also fetch cf_tunnel_id so we can query CF for live connection
  // count (the authoritative online signal for Phase 134+ deployments — the
  // relay WebSocket the old code probed is no longer opened by livinityd).
  const cfResult = await pool.query<{ provisioned_at: Date | null; tunnel_id: string | null }>(
    'SELECT cf_provisioned_at AS provisioned_at, cf_tunnel_id AS tunnel_id FROM users WHERE id = $1',
    [user.userId],
  );
  const cfProvisioned = cfResult.rows.length > 0 && cfResult.rows[0].provisioned_at != null;
  const cfTunnelId = cfResult.rows.length > 0 ? cfResult.rows[0].tunnel_id : null;

  // Phase 141-07: connection status. Prefer the CF Tunnel API for users with
  // a provisioned tunnel (Phase 140+). Fall back to the relay WebSocket
  // probe for legacy users without a tunnel — those installs still report
  // "online" via the relay control plane.
  let online = false;
  if (cfTunnelId) {
    try {
      online = await getCfTunnelOnline(cfTunnelId);
    } catch {
      // CF unreachable → leave online=false. Cache miss keeps the call cheap.
    }
  } else {
    try {
      const statusRes = await fetch(`${RELAY_URL}/internal/user-status?username=${user.username}`, { cache: 'no-store' });
      if (statusRes.ok) {
        const data = await statusRes.json();
        online = data.online;
      }
    } catch {
      // Relay unreachable
    }
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
      provisioned: cfProvisioned,
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
      username: user.username,
      // Plan 145-02: shortest aesthetic form. install.sh's parse-cli accepts
      // a bare `liv_k_*` positional and auto-resolves subdomain from /api/me/profile
      // (Phase 145-01). -fsSL is the conventional curl flag set: -f fail on HTTP
      // error (don't pipe a 4xx body to bash), -s silent, -S still show errors, -L
      // follow redirects.
      installCommand: `curl -fsSL https://livinity.io/install.sh | sudo bash -s ${rawKey}`,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
