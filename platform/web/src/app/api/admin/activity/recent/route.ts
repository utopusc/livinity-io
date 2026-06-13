import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

type EventRow = {
  type: string;
  title: string | null;
  sublabel: string | null;
  at: string | null;
};

function clampLimit(raw: string | null, def: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(500, Math.max(1, Math.floor(n)));
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const limit = clampLimit(searchParams.get('limit'), 20);

  // UNION ALL of signup / install|uninstall / tunnel events, sorted newest-first.
  // Each branch is pre-limited to keep the union efficient.
  const result = await pool.query<EventRow>(
    `SELECT type, title, sublabel, at FROM (
       (
         SELECT 'signup' AS type,
                u.username AS title,
                u.email AS sublabel,
                u.created_at AS at
         FROM users u
         WHERE u.created_at IS NOT NULL
         ORDER BY u.created_at DESC
         LIMIT $1
       )
       UNION ALL
       (
         SELECT ih.action AS type,
                a.name AS title,
                ('by ' || COALESCE(u.username, 'unknown')) AS sublabel,
                ih.created_at AS at
         FROM install_history ih
         LEFT JOIN apps a ON a.id = ih.app_id
         LEFT JOIN users u ON u.id = ih.user_id
         WHERE ih.created_at IS NOT NULL
         ORDER BY ih.created_at DESC
         LIMIT $1
       )
       UNION ALL
       (
         SELECT 'tunnel' AS type,
                (COALESCE(u.username, 'unknown') || ' connected') AS title,
                tc.client_version AS sublabel,
                tc.connected_at AS at
         FROM tunnel_connections tc
         LEFT JOIN users u ON u.id = tc.user_id
         WHERE tc.connected_at IS NOT NULL
         ORDER BY tc.connected_at DESC
         LIMIT $1
       )
     ) merged
     ORDER BY at DESC
     LIMIT $1`,
    [limit],
  );

  const events = result.rows.map((r) => ({
    type: r.type,
    title: r.title ?? '',
    sublabel: r.sublabel ?? '',
    at: r.at,
  }));

  return NextResponse.json({ events, limit });
}
