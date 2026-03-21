import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import pool from '@/lib/db';

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  try {
    const result = await pool.query(
      `SELECT ih.id, ih.app_id, ih.action, ih.instance_name, ih.created_at,
              a.name as app_name, a.icon_url
       FROM install_history ih
       JOIN apps a ON a.id = ih.app_id
       WHERE ih.user_id = $1
       ORDER BY ih.created_at DESC
       LIMIT 50`,
      [auth.userId]
    );

    const events = result.rows.map((row) => ({
      id: row.id,
      app_id: row.app_id,
      app_name: row.app_name,
      icon_url: row.icon_url,
      action: row.action,
      instance_name: row.instance_name,
      created_at: row.created_at,
    }));

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
