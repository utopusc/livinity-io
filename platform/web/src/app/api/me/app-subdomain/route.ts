/**
 * POST /api/me/app-subdomain — Phase 140-05
 *
 * Provisions a per-app subdomain on the caller's CF Tunnel. Authenticates via
 * `X-API-Key` (existing `api_keys` table). Called by livinityd on the Mini PC
 * whenever a user installs an app from the App Store.
 *
 * Request:
 *   Headers: X-API-Key: liv_k_xxxxx
 *   Body:    { app_slug: string, port: number }
 *
 * Response 200:
 *   {
 *     subdomain: "n8n-lucy",
 *     url: "https://n8n-lucy.livinity.io",
 *     dns_record_id: "abc123...",
 *     app_slug: "n8n",
 *   }
 *
 * Response 400 — bad input (missing/invalid app_slug or port)
 * Response 401 — invalid / missing API key
 * Response 409 — user not yet CF-provisioned, OR app already provisioned
 * Response 503 — CF API failure (provisioning service unavailable)
 *
 * Provisioning strategy: reuse the high-level orchestrator
 * `provisionAppSubdomain` (ingress push + DNS create) from cf-saas.ts, then
 * INSERT the user_app_subdomains row. If the INSERT fails after CF succeeds,
 * we rollback the CF resources via `deprovisionAppSubdomain` so we never
 * orphan tunnel ingress / DNS records.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import {
  provisionAppSubdomain,
  deprovisionAppSubdomain,
  CfApiError,
} from '@/lib/cf-saas';

// app_slug: 2-32 chars, lowercase alphanumeric + hyphens, no leading/trailing
// hyphen. Matches DNS label semantics (subset of RFC 1035) and the
// `{app_slug}-{username}.livinity.io` URL pattern locked by Phase 140.
const APP_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

interface ProvisionBody {
  app_slug?: unknown;
  port?: unknown;
}

export async function POST(req: NextRequest) {
  // 1. Authenticate
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  // 2. Parse + validate body
  let body: ProvisionBody;
  try {
    body = (await req.json()) as ProvisionBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'BAD_INPUT' },
      { status: 400 },
    );
  }

  const appSlug = body.app_slug;
  const port = body.port;

  if (typeof appSlug !== 'string' || !APP_SLUG_RE.test(appSlug)) {
    return NextResponse.json(
      {
        error:
          'app_slug must be 2-32 chars, lowercase alphanumeric or hyphen, no leading/trailing hyphen',
        code: 'BAD_INPUT',
      },
      { status: 400 },
    );
  }

  if (
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return NextResponse.json(
      { error: 'port must be an integer between 1 and 65535', code: 'BAD_INPUT' },
      { status: 400 },
    );
  }

  // 3. Look up the authenticated user
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

  // 4. Reject if user hasn't been CF-provisioned yet (legacy account, or the
  //    140-04 provision step never completed). Caller can surface a hint to
  //    the operator to re-run provisioning.
  if (!cf_tunnel_id) {
    return NextResponse.json(
      {
        error: 'User not yet provisioned with a Cloudflare tunnel',
        code: 'USER_NOT_PROVISIONED',
      },
      { status: 409 },
    );
  }

  // 5. Reject duplicate app-install for this user
  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM user_app_subdomains WHERE user_id = $1 AND app_slug = $2',
    [auth.userId, appSlug],
  );
  if (existing.rows.length > 0) {
    return NextResponse.json(
      {
        error: 'App subdomain already exists for this user + app',
        code: 'ALREADY_EXISTS',
      },
      { status: 409 },
    );
  }

  // 6. CF: push tunnel ingress + create DNS CNAME (orchestrated)
  let cfResult: { subdomain: string; url: string; dns_record_id: string };
  try {
    cfResult = await provisionAppSubdomain({
      tunnel_id: cf_tunnel_id,
      username,
      app_slug: appSlug,
      port,
    });
  } catch (err) {
    if (err instanceof CfApiError) {
      console.error(
        `[140-05/POST] CF provisioning failed for user=${username} app=${appSlug}: ${err.message}`,
      );
    } else {
      console.error(
        `[140-05/POST] unexpected error during CF provisioning for user=${username} app=${appSlug}`,
        err,
      );
    }
    return NextResponse.json(
      {
        error: 'Provisioning service temporarily unavailable',
        code: 'CF_UNAVAILABLE',
      },
      { status: 503 },
    );
  }

  // 7. INSERT DB row. If this fails AFTER CF resources exist, roll back CF so
  //    we never leave an orphan tunnel ingress + DNS record.
  try {
    await pool.query(
      `INSERT INTO user_app_subdomains
         (user_id, app_slug, subdomain, cf_dns_record_id, port)
       VALUES ($1, $2, $3, $4, $5)`,
      [auth.userId, appSlug, cfResult.subdomain, cfResult.dns_record_id, port],
    );
  } catch (err) {
    console.error(
      `[140-05/POST] DB insert failed after CF provision succeeded — rolling back CF for user=${username} app=${appSlug}`,
      err,
    );
    try {
      await deprovisionAppSubdomain({
        tunnel_id: cf_tunnel_id,
        username,
        app_slug: appSlug,
        dns_record_id: cfResult.dns_record_id,
      });
    } catch (rollbackErr) {
      // Surface but don't override the original error — operator will need to
      // run the reconciler to clean up the orphaned CF resources.
      console.error(
        `[140-05/POST] CF rollback also failed — orphaned ingress/DNS for user=${username} app=${appSlug}`,
        rollbackErr,
      );
    }
    return NextResponse.json(
      {
        error: 'Provisioning service temporarily unavailable',
        code: 'CF_UNAVAILABLE',
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    subdomain: cfResult.subdomain,
    url: cfResult.url,
    dns_record_id: cfResult.dns_record_id,
    app_slug: appSlug,
  });
}
