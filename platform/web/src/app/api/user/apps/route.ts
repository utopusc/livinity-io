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
      `WITH latest_events AS (
        SELECT DISTINCT ON (app_id, instance_name)
          app_id, instance_name, action, created_at
        FROM install_history
        WHERE user_id = $1
        ORDER BY app_id, instance_name, created_at DESC
      )
      SELECT le.instance_name, le.created_at as installed_at,
             a.slug as app_id, a.name, a.tagline, a.icon_url, a.version, a.category
      FROM latest_events le
      JOIN apps a ON a.id = le.app_id
      WHERE le.action = 'install'
      ORDER BY le.instance_name, a.name`,
      [auth.userId]
    );

    // Group results by instance_name
    const instances: Record<string, Array<{
      app_id: string;
      name: string;
      tagline: string;
      icon_url: string;
      version: string;
      category: string;
      installed_at: string;
    }>> = {};

    for (const row of result.rows) {
      if (!instances[row.instance_name]) {
        instances[row.instance_name] = [];
      }
      instances[row.instance_name].push({
        app_id: row.app_id,
        name: row.name,
        tagline: row.tagline,
        icon_url: row.icon_url,
        version: row.version,
        category: row.category,
        installed_at: row.installed_at,
      });
    }

    return NextResponse.json({ instances });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
