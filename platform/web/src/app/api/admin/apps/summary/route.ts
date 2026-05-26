import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const [totalsResult, perAppResult] = await Promise.all([
    pool.query<{ apps_total: string }>('SELECT COUNT(*)::text AS apps_total FROM apps'),
    pool.query<{
      app_id: string;
      slug: string;
      name: string;
      install_count: string;
    }>(
      `SELECT a.id AS app_id, a.slug, a.name, COUNT(ih.id)::text AS install_count
       FROM apps a
       LEFT JOIN install_history ih ON ih.app_id = a.id AND ih.action IN ('install', 'install_success')
       GROUP BY a.id, a.slug, a.name
       ORDER BY install_count DESC, a.name ASC
       LIMIT 100`,
    ),
  ]);

  return NextResponse.json({
    apps_total: Number(totalsResult.rows[0].apps_total),
    installs_per_app: perAppResult.rows.map((r) => ({
      app_id: r.app_id,
      slug: r.slug,
      name: r.name,
      install_count: Number(r.install_count),
    })),
  });
}
