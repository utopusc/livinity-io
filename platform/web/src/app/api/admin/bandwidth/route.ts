import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

function currentPeriodMonth(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get('period');
  const period = periodParam === 'current_month' || !periodParam ? currentPeriodMonth() : periodParam;

  const result = await pool.query<{
    user_id: string;
    username: string | null;
    bytes_in: string;
    bytes_out: string;
  }>(
    `SELECT bu.user_id, u.username,
            bu.bytes_in::text AS bytes_in,
            bu.bytes_out::text AS bytes_out
     FROM bandwidth_usage bu
     LEFT JOIN users u ON u.id = bu.user_id
     WHERE bu.period_month = $1
     ORDER BY (bu.bytes_in + bu.bytes_out) DESC
     LIMIT 500`,
    [period],
  );

  let totalIn = BigInt(0);
  let totalOut = BigInt(0);
  for (const row of result.rows) {
    totalIn += BigInt(row.bytes_in);
    totalOut += BigInt(row.bytes_out);
  }

  return NextResponse.json({
    period,
    users: result.rows.map((r) => ({
      user_id: r.user_id,
      username: r.username,
      bytes_in: Number(r.bytes_in),
      bytes_out: Number(r.bytes_out),
    })),
    total_bytes_in: Number(totalIn),
    total_bytes_out: Number(totalOut),
  });
}
