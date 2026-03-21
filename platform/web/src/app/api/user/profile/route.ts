import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import pool from '@/lib/db';

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  try {
    // Get user email
    const userResult = await pool.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [auth.userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get instance count and app count from install_history
    const statsResult = await pool.query<{ instance_count: string; app_count: string }>(
      `WITH latest_events AS (
        SELECT DISTINCT ON (app_id, instance_name)
          app_id, instance_name, action
        FROM install_history
        WHERE user_id = $1
        ORDER BY app_id, instance_name, created_at DESC
      )
      SELECT
        COUNT(DISTINCT instance_name) as instance_count,
        COUNT(*) FILTER (WHERE action = 'install') as app_count
      FROM latest_events`,
      [auth.userId]
    );

    const stats = statsResult.rows[0];

    return NextResponse.json({
      email: userResult.rows[0].email,
      instance_count: parseInt(stats.instance_count, 10) || 0,
      app_count: parseInt(stats.app_count, 10) || 0,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
