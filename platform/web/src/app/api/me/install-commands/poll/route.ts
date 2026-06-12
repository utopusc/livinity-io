/**
 * GET /api/me/install-commands/poll
 *
 * Mini PC livinityd poller fetches its own queued install commands.
 * Auth: x-api-key (same as the rest of /api/me/* routes).
 *
 * Response: { commands: [{id, app_id, app_slug, app_name, instance_name,
 *             params, created_at}] }
 *
 * Only returns rows for status='queued' belonging to the api-key's user.
 * Limit hard-coded to 10 per poll to keep individual install runs bounded.
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { hasActiveAccess } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  // Billing gate: stop feeding install work to an expired box.
  if (!(await hasActiveAccess(auth.userId))) {
    return NextResponse.json(
      { error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' },
      { status: 402 },
    );
  }

  const result = await pool.query<{
    id: string;
    app_id: string;
    app_slug: string | null;
    app_name: string | null;
    instance_name: string | null;
    params: unknown;
    created_at: string;
  }>(
    `SELECT ic.id, ic.app_id, a.slug AS app_slug, a.name AS app_name,
            ic.instance_name, ic.params, ic.created_at
       FROM install_commands ic
       LEFT JOIN apps a ON a.id = ic.app_id
       WHERE ic.user_id = $1 AND ic.status = 'queued'
       ORDER BY ic.created_at ASC
       LIMIT 10`,
    [auth.userId],
  );

  return NextResponse.json(
    { commands: result.rows },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
