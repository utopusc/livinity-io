/**
 * DELETE /api/me/app-subdomain/[app_slug] — Phase 140-05
 *
 * Deprovisions a per-app subdomain. Authenticates via `X-API-Key`. Called by
 * livinityd on the Mini PC whenever a user uninstalls an app.
 *
 * Request:
 *   DELETE /api/me/app-subdomain/n8n
 *   Headers: X-API-Key: liv_k_xxxxx
 *
 * Response 204 — deleted (or already absent — idempotent)
 * Response 401 — invalid / missing API key
 *
 * CF failure handling: if the CF deprovision (ingress filter + DNS delete)
 * fails, we log the error and STILL delete the DB row. Rationale: an orphan
 * CF resource is recoverable via the reconciler (140-06+), an orphan DB row
 * blocks the user from re-installing the same app. Better to fail toward
 * "DB clean, CF possibly stale" than the inverse.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { deprovisionAppSubdomain } from '@/lib/cf-saas';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ app_slug: string }> },
) {
  // 1. Authenticate
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  const { app_slug: appSlug } = await params;

  // 2. Look up the user (need username + tunnel_id for CF cleanup)
  const userRows = await pool.query<{
    username: string;
    cf_tunnel_id: string | null;
  }>(
    'SELECT username, cf_tunnel_id FROM users WHERE id = $1',
    [auth.userId],
  );
  if (userRows.rows.length === 0) {
    return unauthorizedResponse('User not found');
  }
  const { username, cf_tunnel_id } = userRows.rows[0];

  // 3. Find the subdomain row. If absent → idempotent 204.
  const subRows = await pool.query<{ id: string; cf_dns_record_id: string }>(
    'SELECT id, cf_dns_record_id FROM user_app_subdomains WHERE user_id = $1 AND app_slug = $2',
    [auth.userId, appSlug],
  );
  if (subRows.rows.length === 0) {
    return new NextResponse(null, { status: 204 });
  }
  const { id: rowId, cf_dns_record_id } = subRows.rows[0];

  // 4. CF cleanup — best effort. Even if this fails we proceed to DB delete.
  if (cf_tunnel_id) {
    try {
      await deprovisionAppSubdomain({
        tunnel_id: cf_tunnel_id,
        username,
        app_slug: appSlug,
        dns_record_id: cf_dns_record_id,
      });
    } catch (err) {
      console.error(
        `[140-05/DELETE] CF deprovision failed for user=${username} app=${appSlug} — continuing to DB delete; orphan CF resource recoverable via reconciler`,
        err,
      );
    }
  } else {
    // User has a subdomain row but no tunnel — unusual but recoverable; the
    // DB row should still be removed so the user can re-install later.
    console.warn(
      `[140-05/DELETE] user=${username} has user_app_subdomains row id=${rowId} but no cf_tunnel_id — skipping CF cleanup`,
    );
  }

  // 5. DB delete (authoritative)
  await pool.query('DELETE FROM user_app_subdomains WHERE id = $1', [rowId]);

  return new NextResponse(null, { status: 204 });
}
