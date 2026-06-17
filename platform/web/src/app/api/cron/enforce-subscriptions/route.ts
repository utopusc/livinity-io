// GET /api/cron/enforce-subscriptions — scheduled billing enforcement.
//
// Vercel Cron hits this (see vercel.json); auth = `Authorization: Bearer
// ${CRON_SECRET}` which Vercel attaches automatically when the env var is set.
//
// Two passes, both driven by lib/subscription.ts (the single access oracle):
//   1. REVOKE — provisioned, non-legacy users whose access lapsed → delete
//      their CF DNS records (lib/billing-enforcement) + access_revoked_at.
//      Never-subscribed users get a 3-day onboarding window from signup so we
//      don't cut someone who registered an hour ago and is mid-checkout.
//   2. RESTORE — revoked users whose subscription came back (webhook also
//      restores inline on reactivation; this is the retry/fallback path).
//
// Per-user try/catch: one CF failure must not stall the whole sweep.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSubscriptionStatus } from '@/lib/subscription';
import { revokeUserAccess, restoreUserAccess } from '@/lib/billing-enforcement';
import { sendAccessPausedEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ONBOARDING_GRACE_DAYS = 3;

interface CandidateRow {
  id: string;
  username: string;
  email: string;
  cf_tunnel_id: string | null;
  cf_dns_record_id_apex: string | null;
  created_at: Date;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[billing-enforce] CRON_SECRET is not set');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const revoked: string[] = [];
  const restored: string[] = [];
  const errors: string[] = [];

  // ── Pass 1: revoke lapsed users ──────────────────────────────────────────
  const candidates = await pool.query<CandidateRow>(
    `SELECT id, username, email, cf_tunnel_id, cf_dns_record_id_apex, created_at
       FROM users
      WHERE legacy_free = FALSE
        AND access_revoked_at IS NULL
        AND cf_tunnel_id IS NOT NULL`,
  );

  for (const user of candidates.rows) {
    try {
      const status = await getSubscriptionStatus(user.id);
      if (status.active) continue;

      if (status.reason === 'no_subscription') {
        const ageMs = Date.now() - new Date(user.created_at).getTime();
        if (ageMs < ONBOARDING_GRACE_DAYS * 86400000) continue;
      }

      await revokeUserAccess(user);
      revoked.push(user.username);
      await sendAccessPausedEmail(user.email, user.username).catch((err) =>
        console.error(`[billing-enforce] paused email failed for ${user.username}:`, err),
      );
    } catch (err) {
      console.error(`[billing-enforce] revoke failed for ${user.username}:`, err);
      errors.push(`revoke:${user.username}`);
    }
  }

  // ── Pass 2: restore reactivated users ────────────────────────────────────
  // suspended_at IS NULL guard (Phase 280): an admin-suspended (banned) user
  // also has access_revoked_at set, so they land in this pass. getSubscription
  // Status already returns active=false reason='suspended' for them (so the
  // restore below would skip anyway), but we exclude them at the SQL level too
  // so billing reactivation can NEVER silently un-ban an abuser — independent of
  // the oracle's internals. DEFENSIVE (mirrors stripe-sync.ts): users.suspended_at
  // is live in prod + captured in 0023, but on a fresh rebuild that hasn't run
  // 0023 the column is absent → on 42703 retry WITHOUT the predicate so the
  // housekeeping below still runs (never 500 before the column exists).
  let revokedUsers;
  try {
    revokedUsers = await pool.query<CandidateRow>(
      `SELECT id, username, email, cf_tunnel_id, cf_dns_record_id_apex, created_at
         FROM users
        WHERE access_revoked_at IS NOT NULL
          AND suspended_at IS NULL`,
    );
  } catch (err) {
    if ((err as { code?: string })?.code === '42703') {
      revokedUsers = await pool.query<CandidateRow>(
        `SELECT id, username, email, cf_tunnel_id, cf_dns_record_id_apex, created_at
           FROM users
          WHERE access_revoked_at IS NOT NULL`,
      );
    } else {
      throw err;
    }
  }

  for (const user of revokedUsers.rows) {
    try {
      const status = await getSubscriptionStatus(user.id);
      if (!status.active) continue;

      await restoreUserAccess(user);
      restored.push(user.username);
    } catch (err) {
      console.error(`[billing-enforce] restore failed for ${user.username}:`, err);
      errors.push(`restore:${user.username}`);
    }
  }

  // ── Housekeeping: drop stripe_events rows past Stripe's ~90-day replay
  // window so the idempotency table doesn't grow unbounded. ─────────────────
  try {
    await pool.query(`DELETE FROM stripe_events WHERE processed_at < NOW() - INTERVAL '90 days'`);
  } catch (err) {
    console.error('[billing-enforce] stripe_events cleanup failed:', err);
  }

  // ── Housekeeping: drop abandoned pending_registrations whose verification
  // link has expired, so unconfirmed signups don't accumulate (and free up the
  // email/username slots they were holding). Tolerate the table not existing
  // yet (migration 0018 applied separately). ───────────────────────────────
  try {
    await pool.query(`DELETE FROM pending_registrations WHERE verification_expires < NOW()`);
  } catch (err) {
    if ((err as { code?: string })?.code !== '42P01') {
      console.error('[billing-enforce] pending_registrations cleanup failed:', err);
    }
  }

  // ── Housekeeping: prune expired rate-limit windows (Phase 282 rate_limits).
  // The limiter reuses a row per key, but keys that go quiet linger; drop any
  // window that ended over an hour ago so the table stays small. ────────────
  try {
    await pool.query(`DELETE FROM rate_limits WHERE reset_at < NOW() - INTERVAL '1 hour'`);
  } catch (err) {
    if ((err as { code?: string })?.code !== '42P01') {
      console.error('[billing-enforce] rate_limits cleanup failed:', err);
    }
  }

  console.info(
    `[billing-enforce] sweep done: checked=${candidates.rows.length} revoked=${revoked.length} restored=${restored.length} errors=${errors.length}`,
  );
  return NextResponse.json({
    checked: candidates.rows.length,
    revoked,
    restored,
    errors,
  });
}
