import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getSupabaseService, presenceChannelName } from '@/lib/supabase-server';

// Phase 146: online check moved to Supabase Realtime presence on tunnel:<userId>.
// Replaces the Phase 141-07 CF Tunnel connections API path AND the legacy
// relay /internal/user-status probe — both retired this milestone. The CF
// tunnel provisioning is still surfaced for the "tunnel provisioned" badge
// but no longer drives the online dot. Presence state is populated by
// livinityd's tunnel-presence.ts (Phase 146 W3).
//
// Each presence read opens a Realtime channel briefly (~3s timeout, then removed).
// 10s in-memory cache keeps the open-channel rate bounded when dashboards poll
// the route every few seconds.

type CachedOnline = { online: boolean; checkedAt: number };
const PRESENCE_CACHE = new Map<string, CachedOnline>();
const PRESENCE_CACHE_TTL_MS = 10_000;
const PRESENCE_READ_TIMEOUT_MS = 3_000;

async function isUserOnlineViaPresence(userId: string): Promise<boolean> {
  const cached = PRESENCE_CACHE.get(userId);
  const now = Date.now();
  if (cached && now - cached.checkedAt < PRESENCE_CACHE_TTL_MS) {
    return cached.online;
  }
  const supabase = getSupabaseService();
  const channel = supabase.channel(presenceChannelName(userId));
  try {
    const online = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), PRESENCE_READ_TIMEOUT_MS);
      channel.on('presence', { event: 'sync' }, () => {
        clearTimeout(timer);
        const state = channel.presenceState();
        resolve(Object.keys(state).length > 0);
      });
      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timer);
          resolve(false);
        }
      });
    });
    PRESENCE_CACHE.set(userId, { online, checkedAt: now });
    return online;
  } finally {
    await supabase.removeChannel(channel).catch(() => {});
  }
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

  // Phase 146: online = Supabase Realtime presence on tunnel:<userId>.
  // Single code path — CF Tunnel API + relay WebSocket probe both retired.
  // cfTunnelId is still read above for the provisioned badge but no longer
  // gates the online dot.
  let online = false;
  try {
    online = await isUserOnlineViaPresence(user.userId);
  } catch (err) {
    console.error('[146/dashboard] presence read failed for', user.userId, err);
  }

  // Phase 147 carryover: bandwidth metering will read from Supabase bandwidth_usage
  // table (currently on Server5 platform DB, restored to Supabase via W1-T1). For
  // Phase 146 cutover, hardcode zeros so the dashboard widget renders without errors.
  const bandwidth = { usedBytes: 0, limitBytes: 53_687_091_200, allowed: true };

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
