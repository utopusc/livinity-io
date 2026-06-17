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
import { sendOpsAlertEmail } from '@/lib/email';

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

  // EVERY tunnel-provisioned, non-revoked user — NOT just paid ones. Bandwidth
  // is metered for visibility + abuse detection (CFC-03), so legacy_free
  // (grandfathered) tenants must be metered too; otherwise the admin sees
  // nothing for them and an abusive grandfathered box is invisible. (Billing's
  // 1 TB cap enforcement is separate and still only applies to paid plans.)
  const candidates = await pool.query<UserRow>(
    `SELECT id, username
       FROM users
      WHERE access_revoked_at IS NULL
        AND cf_tunnel_id IS NOT NULL`,
  );

  let updated = 0;
  let analyticsNull = 0; // fetchHostnameBytes returned null (CF analytics failed)
  const errors: string[] = [];

  for (const user of candidates.rows) {
    try {
      const hostname = `${user.username}.livinity.io`;
      const bytes = await fetchHostnameBytes(hostname, sinceISO, untilISO);
      if (bytes === null) {
        // CF analytics unavailable this round — skip, don't error the whole
        // sweep or zero out an existing row.
        analyticsNull += 1;
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

  // Self-diagnose: if there ARE users to meter but EVERY CF analytics read came
  // back null, the metering pipeline is dead — almost always because
  // CF_API_TOKEN lacks the Zone "Analytics: Read" permission (a provisioning
  // token scoped only to DNS/Tunnel returns GraphQL errors → null). Surface it
  // loudly + alert the operator ONCE/day so an empty bandwidth table never goes
  // unnoticed again. (idempotencyKey keyed to the UTC day.)
  const analyticsDead = candidates.rows.length > 0 && analyticsNull === candidates.rows.length;
  if (analyticsDead) {
    const dayKey = new Date().toISOString().slice(0, 10);
    console.error(
      `[refresh-bandwidth] CF Analytics returned null for ALL ${candidates.rows.length} users — ` +
        `verify CF_API_TOKEN has Zone "Analytics: Read" permission`,
    );
    await sendOpsAlertEmail(
      'Livinity bandwidth metering is DOWN',
      `<p style="color:#555;line-height:1.6;">The hourly bandwidth sweep got <b>null</b> from Cloudflare Analytics for <b>all ${candidates.rows.length}</b> metered users, so no usage is being recorded (the admin bandwidth view will be empty).</p>
       <p style="color:#555;line-height:1.6;">Almost always this means <b>CF_API_TOKEN is missing the Zone &rarr; Analytics &rarr; Read permission</b>. Fix: Cloudflare dashboard &rarr; My Profile &rarr; API Tokens &rarr; edit the token &rarr; add <b>Zone · Analytics · Read</b> (Zone Resources: livinity.io) &rarr; save. Then re-run this cron.</p>`,
      `bandwidth-metering-down:${dayKey}`,
    ).catch((err) => console.error('[refresh-bandwidth] ops alert failed:', err));
  }

  console.info(
    `[refresh-bandwidth] sweep done: checked=${candidates.rows.length} updated=${updated} ` +
      `analyticsNull=${analyticsNull} analyticsDead=${analyticsDead} errors=${errors.length}`,
  );
  return NextResponse.json({
    checked: candidates.rows.length,
    updated,
    analyticsNull,
    analyticsDead,
    errors,
  });
}
