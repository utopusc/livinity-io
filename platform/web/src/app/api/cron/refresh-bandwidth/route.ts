// GET /api/cron/refresh-bandwidth — hourly bandwidth metering sweep.
//
// Vercel Cron hits this (see vercel.json); auth = `Authorization: Bearer
// ${CRON_SECRET}` which Vercel attaches automatically when the env var is set.
//
// For each provisioned, non-legacy, non-revoked user we query Cloudflare's
// GraphQL Analytics for month-to-date egress on `{username}.livinity.io` and
// upsert it into bandwidth_usage (stored in bytes_out; bytes_in 0 — CF's
// edgeResponseBytes is egress-only). The dashboard then reads the same table.
//
// Best-effort: CF analytics never throws (returns null), and each user is
// wrapped in its own try/catch so one failure can't stall the sweep. CF reads
// may legitimately be 0 / null until traffic flows — that is expected.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { fetchHostnameBytes } from '@/lib/cf-analytics';
import { upsertUsage, currentPeriodMonth } from '@/lib/bandwidth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface UserRow {
  id: string;
  username: string;
}

/** First instant of the current UTC month as an ISO-8601 string. */
function startOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[refresh-bandwidth] CRON_SECRET is not set');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const periodMonth = currentPeriodMonth();
  const sinceISO = startOfMonthISO();
  const untilISO = new Date().toISOString();

  // Provisioned, paid, still-active users — mirror enforce-subscriptions's
  // candidate predicate (legacy_free = FALSE, access_revoked_at IS NULL,
  // cf_tunnel_id IS NOT NULL).
  const candidates = await pool.query<UserRow>(
    `SELECT id, username
       FROM users
      WHERE legacy_free = FALSE
        AND access_revoked_at IS NULL
        AND cf_tunnel_id IS NOT NULL`,
  );

  let updated = 0;
  const errors: string[] = [];

  for (const user of candidates.rows) {
    try {
      const hostname = `${user.username}.livinity.io`;
      const bytes = await fetchHostnameBytes(hostname, sinceISO, untilISO);
      if (bytes === null) {
        // Best-effort: CF analytics unavailable this round — skip, don't error
        // the whole sweep or zero out an existing row.
        errors.push(`fetch:${user.username}`);
        continue;
      }
      // Egress goes in bytes_out; bytes_in 0 (CF edgeResponseBytes is egress).
      await upsertUsage(user.id, periodMonth, 0, bytes);
      updated += 1;
    } catch (err) {
      console.error(`[refresh-bandwidth] failed for ${user.username}:`, err);
      errors.push(`upsert:${user.username}`);
    }
  }

  console.info(
    `[refresh-bandwidth] sweep done: checked=${candidates.rows.length} updated=${updated} errors=${errors.length}`,
  );
  return NextResponse.json({
    checked: candidates.rows.length,
    updated,
    errors,
  });
}
