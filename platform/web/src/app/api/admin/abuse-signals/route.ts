// GET /api/admin/abuse-signals — the admin "abuse" panel data (Phase 280/283).
//
// Per-tenant risk: the cron-computed signals (24h egress + reputation, from
// abuse_signals) JOINed with LIVE signals computed on read (subdomain count,
// suspended / revoked state). Sorted worst-first so "who to look at" is the top
// of the list. requireAdmin-gated (session cookie or x-api-key).
//
// DEFENSIVE: if abuse_signals doesn't exist yet (migration 0024 not applied),
// degrade to the live signals only (egress/reputation null) — never 500.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';
const UNDEFINED_COLUMN = '42703';

interface Row {
  user_id: string;
  username: string;
  suspended: boolean;
  revoked: boolean;
  subdomain_count: number;
  egress_24h_bytes: string | null;
  egress_flagged: boolean | null;
  reputation: string | null;
  reputation_detail: string | null;
  scanned_at: Date | null;
}

const WITH_SIGNALS = `
  SELECT u.id AS user_id, u.username,
         (u.suspended_at IS NOT NULL)       AS suspended,
         (u.access_revoked_at IS NOT NULL)  AS revoked,
         (SELECT count(*)::int FROM user_app_subdomains s WHERE s.user_id = u.id) AS subdomain_count,
         a.egress_24h_bytes::text AS egress_24h_bytes,
         a.egress_flagged,
         a.reputation,
         a.reputation_detail,
         a.scanned_at
    FROM users u
    LEFT JOIN abuse_signals a ON a.user_id = u.id
   WHERE u.cf_tunnel_id IS NOT NULL
   ORDER BY (a.reputation = 'flagged') DESC NULLS LAST,
            COALESCE(a.egress_flagged, false) DESC,
            a.egress_24h_bytes DESC NULLS LAST,
            u.username ASC
   LIMIT 500`;

// Fallback for a freshly-deployed env where the migrations lag the code:
// references NEITHER abuse_signals (0024) NOR suspended_at (0023), so it can't
// throw 42P01 or 42703 — honoring the route's "never 500" contract. suspended
// is synthesized false (no ban column yet); signal fields null.
const WITHOUT_SIGNALS = `
  SELECT u.id AS user_id, u.username,
         false                              AS suspended,
         (u.access_revoked_at IS NOT NULL)  AS revoked,
         (SELECT count(*)::int FROM user_app_subdomains s WHERE s.user_id = u.id) AS subdomain_count,
         NULL::text AS egress_24h_bytes,
         NULL::boolean AS egress_flagged,
         NULL::text AS reputation,
         NULL::text AS reputation_detail,
         NULL::timestamptz AS scanned_at
    FROM users u
   WHERE u.cf_tunnel_id IS NOT NULL
   ORDER BY u.username ASC
   LIMIT 500`;

function levelOf(r: Row): 'ok' | 'watch' | 'high' {
  if (r.reputation === 'flagged') return 'high';
  if (r.egress_flagged === true) return 'watch';
  return 'ok';
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  let rows: Row[];
  let signalsAvailable = true;
  try {
    rows = (await pool.query<Row>(WITH_SIGNALS)).rows;
  } catch (err) {
    // Degrade gracefully when the migrations lag the code: abuse_signals absent
    // (42P01) OR suspended_at absent (42703) → the signal-free, column-free
    // fallback. Never 500.
    const code = (err as { code?: string })?.code;
    if (code === UNDEFINED_TABLE || code === UNDEFINED_COLUMN) {
      signalsAvailable = false;
      rows = (await pool.query<Row>(WITHOUT_SIGNALS)).rows;
    } else {
      throw err;
    }
  }

  const signals = rows.map((r) => ({
    user_id: r.user_id,
    username: r.username,
    suspended: r.suspended,
    revoked: r.revoked,
    subdomain_count: r.subdomain_count,
    egress_24h_bytes: r.egress_24h_bytes !== null ? Number(r.egress_24h_bytes) : null,
    egress_flagged: r.egress_flagged === true,
    reputation: (r.reputation ?? 'unknown') as 'clean' | 'flagged' | 'unknown',
    reputation_detail: r.reputation_detail,
    scanned_at: r.scanned_at ? r.scanned_at.toISOString() : null,
    level: levelOf(r),
  }));

  return NextResponse.json({ signals, signalsAvailable });
}
