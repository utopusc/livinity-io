/**
 * WS3 — bandwidth_usage read/write helpers.
 *
 * Table (migration 0014): bandwidth_usage(user_id UUID, period_month TEXT,
 * bytes_in BIGINT, bytes_out BIGINT, updated_at TIMESTAMPTZ) with a unique key
 * on (user_id, period_month). The AFTER INSERT/UPDATE trigger
 * (bandwidth_rollup_trigger) fans deltas into hourly/daily rollups, so writes
 * here MUST go through the bandwidth_usage upsert (not the rollup tables).
 *
 * period_month is the current calendar month as a YYYY-MM string. We derive it
 * from the now-ISO string's first 7 chars (UTC) so it matches the admin
 * bandwidth route's currentPeriodMonth() and the cron's window.
 */
import pool from '@/lib/db';

/** Current calendar month as "YYYY-MM" (UTC), e.g. "2026-06". */
export function currentPeriodMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Total bytes used by a user this month (bytes_in + bytes_out).
 * Returns { usedBytes: 0, updatedAt: null } when no row exists.
 */
export async function getMonthlyUsage(
  userId: string,
): Promise<{ usedBytes: number; updatedAt: Date | null }> {
  const period = currentPeriodMonth();
  const result = await pool.query<{
    bytes_in: string;
    bytes_out: string;
    updated_at: Date | null;
  }>(
    `SELECT bytes_in::text AS bytes_in,
            bytes_out::text AS bytes_out,
            updated_at
       FROM bandwidth_usage
      WHERE user_id = $1 AND period_month = $2
      LIMIT 1`,
    [userId, period],
  );

  if (result.rows.length === 0) {
    return { usedBytes: 0, updatedAt: null };
  }

  const row = result.rows[0];
  // BIGINT comes back as a string from pg; Number is safe up to 2^53 (~9 PB),
  // far above the 1 TB cap, so no BigInt juggling needed for the meter.
  const usedBytes = Number(row.bytes_in) + Number(row.bytes_out);
  return { usedBytes, updatedAt: row.updated_at ?? null };
}

/**
 * Upsert a user's bandwidth row for a period. ON CONFLICT (user_id,
 * period_month) overwrites the byte counters (the cron always supplies the
 * authoritative month-to-date total from CF, not a delta) and bumps
 * updated_at, which fires the rollup trigger.
 */
export async function upsertUsage(
  userId: string,
  periodMonth: string,
  bytesIn: number,
  bytesOut: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO bandwidth_usage (user_id, period_month, bytes_in, bytes_out, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, period_month)
     DO UPDATE SET bytes_in = EXCLUDED.bytes_in,
                   bytes_out = EXCLUDED.bytes_out,
                   updated_at = NOW()`,
    [userId, periodMonth, Math.round(bytesIn), Math.round(bytesOut)],
  );
}
