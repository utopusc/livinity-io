/**
 * GET /api/me/announcements/poll
 *
 * The single box-facing read route that powers fleet announcement delivery.
 * The livinityd announcement-poller (Plan 06) fetches this every 60s with its
 * x-api-key; central resolves the CLOUD users.id from the key and returns only
 * the announcements that user is eligible to see RIGHT NOW.
 *
 * Eligibility (decided server-side — the box just renders what it gets):
 *   - status = 'published'
 *   - in schedule window: now() within [start_at, end_at] (null bounds = open)
 *   - targeted: target_kind 'all' | 'user_ids' (∋ this user) | 'plan_tier' (== this user's tier)
 *   - under the per-user frequency cap (LEFT JOIN announcement_seen)
 *   - ordered by priority ASC (lower = higher priority → stacking order)
 *
 * Response: { announcements: [{ id, slug, title, kind, blocks,
 *             raw_html_sanitized, frequency, frequency_n, priority,
 *             dismissible, start_at, end_at }] }
 *
 * Serves the publish-time-sanitized HTML ONLY — never the unsanitized source
 * column (T-292-14).
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
// DEC-10: NO subscription/billing gate (no 402) — announcements must reach
// expired/trial boxes too (renewal prompts, win-back campaigns, etc.).
// getSubscriptionStatus is imported ONLY to resolve the user's plan tier for
// plan_tier targeting, never to deny access.
import { getSubscriptionStatus } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

interface AnnouncementRow {
  id: string;
  slug: string | null;
  title: string;
  kind: string;
  blocks: unknown;
  raw_html_sanitized: string | null;
  frequency: string;
  frequency_n: number | null;
  priority: number;
  dismissible: boolean;
  start_at: string | null;
  end_at: string | null;
}

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  try {
    // Resolve the caller's plan tier for target_kind='plan_tier' matching.
    // Defensive: if the lookup fails, degrade to "tier unknown" so 'all' and
    // 'user_ids' announcements still flow (never let tier resolution break the poll).
    let userTier = 'inactive';
    try {
      userTier = (await getSubscriptionStatus(auth.userId)).plan;
    } catch {
      /* tier unknown → only 'all' / 'user_ids' announcements match */
    }

    const result = await pool.query<AnnouncementRow>(
      // NOTE: the unsanitized source column is intentionally NOT selected —
      // only the publish-time-sanitized HTML is ever served to the fleet (T-292-14).
      `SELECT a.id, a.slug, a.title, a.kind, a.blocks, a.raw_html_sanitized,
              a.frequency, a.frequency_n, a.priority, a.dismissible,
              a.start_at, a.end_at
         FROM announcements a
         LEFT JOIN announcement_seen s
           ON s.announcement_id = a.id AND s.user_id = $1
        WHERE a.status = 'published'
          AND (a.start_at IS NULL OR a.start_at <= now())
          AND (a.end_at   IS NULL OR a.end_at   >= now())
          AND (
               a.target_kind = 'all'
            OR (a.target_kind = 'user_ids'  AND $1 = ANY(a.target_user_ids))
            OR (a.target_kind = 'plan_tier' AND a.target_plan_tier = $2)
          )
          -- frequency cap. once_per_day is intentionally permissive here
          -- (999999): the real 24h boundary is enforced CLIENT-side in the box
          -- UI via a per-announcement localStorage timestamp (Plan 07 Task 2),
          -- not in this route or the poller. Known MVP weak-enforcement: a user
          -- who clears localStorage within the same day may re-see a
          -- once_per_day announcement. announcement_seen.last_seen_at exists for
          -- a future server-side day boundary (out of MVP scope).
          AND COALESCE(s.seen_count, 0) < CASE a.frequency
                WHEN 'once_ever'    THEN 1
                WHEN 'once_per_day' THEN 999999
                WHEN 'n_times'      THEN COALESCE(a.frequency_n, 1)
                ELSE 1
              END
        ORDER BY a.priority ASC, a.created_at ASC`,
      [auth.userId, userTier],
    );

    return NextResponse.json(
      { announcements: result.rows },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    // 42P01 (undefined_table): the 0025 migration hasn't been applied yet.
    // Degrade to "no announcements" so a pre-migration box polls cleanly.
    if ((err as { code?: string })?.code === '42P01') {
      return NextResponse.json(
        { announcements: [] },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    console.error('[announcements/poll] query failed', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
