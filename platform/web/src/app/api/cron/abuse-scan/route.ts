// GET /api/cron/abuse-scan — Phase 280/283. Daily per-tenant risk sweep.
//
// Two signals per tunnel tenant, written to abuse_signals (the admin "abuse"
// panel reads it) and digested to the operator:
//   CFC-03 — bandwidth anomaly: last-24h CF egress for {username}.livinity.io;
//     flag if over the per-tenant limit (a box used as a CDN/relay/file-share).
//   Reputation — Google Safe Browsing verdict on the tenant hostname (phishing /
//     malware). Env-gated; 'unknown' when no key is configured.
//
// Auth = Vercel Cron `Authorization: Bearer ${CRON_SECRET}` (same as the other
// crons). Best-effort throughout: a per-tenant failure can't stall the sweep,
// and a missing abuse_signals table (pre-0024) degrades to digest-only.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { fetchHostnameBytes } from '@/lib/cf-analytics';
import { checkReputation } from '@/lib/reputation';
import { classifyRisk, egressLimitBytes, BYTES_PER_GB } from '@/lib/abuse-scan';
import { sendOpsAlertEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UNDEFINED_TABLE = '42P01';

interface UserRow {
  id: string;
  username: string;
}

interface FlaggedTenant {
  username: string;
  level: 'watch' | 'high';
  egressGb: number | null;
  reputation: string;
  detail: string | null;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[abuse-scan] CRON_SECRET is not set');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitBytes = egressLimitBytes();
  const now = new Date();
  const sinceISO = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const untilISO = now.toISOString();

  // Every tunnel-provisioned, non-revoked tenant (paid OR grandfathered — an
  // abusive box is abusive regardless of plan).
  const candidates = await pool.query<UserRow>(
    `SELECT id, username FROM users
      WHERE access_revoked_at IS NULL AND cf_tunnel_id IS NOT NULL`,
  );

  let scanned = 0;
  let tableMissing = false;
  let truncated = false;
  const flagged: FlaggedTenant[] = [];
  const errors: string[] = [];

  // Wall-clock budget: each tenant does two best-effort lookups (≤5s each, run
  // CONCURRENTLY → ~5s worst case). Stop cleanly before Vercel's maxDuration
  // kill so a fleet that outgrows one run truncates VISIBLY (ops-alert below)
  // instead of being silently chopped mid-sweep.
  const startMs = Date.now();
  const BUDGET_MS = 50_000;

  for (const user of candidates.rows) {
    if (Date.now() - startMs > BUDGET_MS) {
      truncated = true;
      break;
    }
    try {
      const hostname = `${user.username}.livinity.io`;
      // Both lookups are best-effort and never throw — run them concurrently.
      const [egress, rep] = await Promise.all([
        fetchHostnameBytes(hostname, sinceISO, untilISO), // bytes | null
        checkReputation(hostname), // { reputation, detail }
      ]);
      const risk = classifyRisk({ egress24hBytes: egress, reputation: rep.reputation }, limitBytes);

      if (!tableMissing) {
        try {
          await pool.query(
            `INSERT INTO abuse_signals
               (user_id, username, egress_24h_bytes, egress_flagged, reputation, reputation_detail, scanned_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (user_id) DO UPDATE SET
               username          = EXCLUDED.username,
               egress_24h_bytes  = EXCLUDED.egress_24h_bytes,
               egress_flagged    = EXCLUDED.egress_flagged,
               reputation        = EXCLUDED.reputation,
               reputation_detail = EXCLUDED.reputation_detail,
               scanned_at        = now()`,
            [user.id, user.username, egress, risk.egressFlagged, rep.reputation, rep.detail],
          );
        } catch (err) {
          if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
            // Migration 0024 not applied yet — stop trying to persist, but keep
            // scanning so the operator still gets the digest.
            tableMissing = true;
            console.warn('[abuse-scan] abuse_signals table missing (apply 0024) — digest-only this run');
          } else {
            throw err;
          }
        }
      }

      scanned += 1;
      if (risk.level !== 'ok') {
        flagged.push({
          username: user.username,
          level: risk.level,
          egressGb: egress !== null ? Math.round((egress / BYTES_PER_GB) * 10) / 10 : null,
          reputation: rep.reputation,
          detail: rep.detail,
        });
      }
    } catch (err) {
      console.error(`[abuse-scan] failed for ${user.username}:`, err);
      errors.push(user.username);
    }
  }

  // Digest: only when something is flagged (no daily noise on a clean fleet).
  if (flagged.length > 0) {
    const dayKey = now.toISOString().slice(0, 10);
    // high (reputation) first, then watch (egress).
    flagged.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
    const rows = flagged
      .map((f) => {
        const bits: string[] = [];
        if (f.reputation === 'flagged') {
          bits.push(`<b style="color:#b00020;">reputation: ${f.detail ?? 'threat match'}</b>`);
        }
        if (f.egressGb !== null) bits.push(`egress ${f.egressGb} GB/24h`);
        return `<li><b>${f.username}.livinity.io</b> [${f.level.toUpperCase()}] — ${bits.join('; ') || 'flagged'}</li>`;
      })
      .join('');
    await sendOpsAlertEmail(
      `Livinity abuse scan: ${flagged.length} flagged tenant(s)`,
      `<p style="color:#555;line-height:1.6;">The daily abuse scan flagged <b>${flagged.length}</b> of ${scanned} tenant(s). Review in the admin abuse panel; suspend from the user page if confirmed.</p>
       <ul style="color:#555;font-size:13px;margin:0;">${rows}</ul>`,
      `abuse-scan:${dayKey}`,
    ).catch((err) => console.error('[abuse-scan] digest email failed:', err));
  }

  // Truncation is a fleet-outgrew-the-budget signal — surface it like
  // refresh-bandwidth's self-diagnosis so an incomplete daily scan is never
  // silent. idempotencyKey keyed to the UTC day.
  if (truncated) {
    const dayKey = now.toISOString().slice(0, 10);
    console.error(
      `[abuse-scan] TRUNCATED after ${scanned}/${candidates.rows.length} tenants (${BUDGET_MS}ms budget) — fleet outgrew one run`,
    );
    await sendOpsAlertEmail(
      'Livinity abuse scan did not finish',
      `<p style="color:#555;line-height:1.6;">The daily abuse scan ran out of time after <b>${scanned}/${candidates.rows.length}</b> tenants, so the rest were not re-scanned today. Their abuse signals may be stale. As the fleet grows, raise the function budget or shard the scan.</p>`,
      `abuse-scan-truncated:${dayKey}`,
    ).catch((err) => console.error('[abuse-scan] truncation alert failed:', err));
  }

  console.info(
    `[abuse-scan] done: scanned=${scanned}/${candidates.rows.length} flagged=${flagged.length} ` +
      `truncated=${truncated} tableMissing=${tableMissing} errors=${errors.length}`,
  );
  return NextResponse.json({
    scanned,
    flagged: flagged.length,
    flaggedDetail: flagged,
    truncated,
    tableMissing,
    errors,
  });
}
