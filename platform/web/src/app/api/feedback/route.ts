/**
 * POST /api/feedback — public user-key feedback ingest.
 *
 * The SAME payload shape flows: LivOS UI → livinityd tRPC proxy → this route.
 * Auth: user API key (X-Api-Key: liv_k_…) via validateApiKey. The user_id +
 * username are resolved server-side from the key — NEVER trusted from the body.
 *
 * Contract (body):
 *   { type?, title?, area?, severity?, message (REQUIRED), steps?, contact?,
 *     app_version?, user_agent?, page_url? }
 *
 * DEFENSIVE: the `feedback` table is applied by the operator separately. If it
 * is still missing (Postgres 42P01 undefined_table) we return 503 with a clear
 * JSON error rather than a hard 500 — so shipping this code before the SQL is
 * safe.
 *
 * Response 200: { ok: true, id }
 * Response 400: missing/empty message
 * Response 401: invalid / missing API key
 * Response 503: feedback table not provisioned yet
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';

// Allowed enums (anything else falls back to the documented default).
const TYPES = new Set(['bug', 'feedback', 'request', 'question', 'other']);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

// Column length guards — keep varchar fields bounded; message/steps are TEXT
// but we still cap to avoid pathological payloads.
const MAX_VARCHAR = 255;
const MAX_TEXT = 20000;
const MAX_USER_AGENT = 2000;
const MAX_PAGE_URL = 2000;

/** Coerce to a trimmed string, clamp to `max`, or null when empty/absent. */
function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // message is the only REQUIRED field (any language / unicode).
  const message = clampStr(body.message, MAX_TEXT);
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // type defaults to 'bug'; severity stays null unless a known value is given.
  const rawType = clampStr(body.type, MAX_VARCHAR);
  const type = rawType && TYPES.has(rawType) ? rawType : 'bug';
  const rawSeverity = clampStr(body.severity, MAX_VARCHAR);
  const severity = rawSeverity && SEVERITIES.has(rawSeverity) ? rawSeverity : null;

  const area = clampStr(body.area, MAX_VARCHAR);
  const title = clampStr(body.title, MAX_VARCHAR);
  const steps = clampStr(body.steps, MAX_TEXT);
  const contact = clampStr(body.contact, MAX_VARCHAR);
  const appVersion = clampStr(body.app_version, MAX_VARCHAR);
  // Prefer the explicit body user_agent; fall back to the request header.
  const userAgent =
    clampStr(body.user_agent, MAX_USER_AGENT) ??
    clampStr(req.headers.get('user-agent'), MAX_USER_AGENT);
  const pageUrl = clampStr(body.page_url, MAX_PAGE_URL);

  // Resolve username server-side (defensive — key valid but row gone → null).
  let username: string | null = null;
  try {
    const u = await pool.query<{ username: string }>(
      'SELECT username FROM users WHERE id = $1 LIMIT 1',
      [auth.userId],
    );
    username = u.rows[0]?.username ?? null;
  } catch (err) {
    // Non-fatal — we can still store the feedback without a denormalized name.
    console.warn('[feedback] username lookup failed:', (err as Error)?.message ?? err);
  }

  try {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO feedback
         (user_id, username, type, severity, area, title, message, steps,
          contact, app_version, user_agent, page_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        auth.userId,
        username,
        type,
        severity,
        area,
        title,
        message,
        steps,
        contact,
        appVersion,
        userAgent,
        pageUrl,
      ],
    );
    return NextResponse.json(
      { ok: true, id: result.rows[0].id },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === UNDEFINED_TABLE) {
      // Table not provisioned yet — degrade gracefully, do NOT hard-500.
      return NextResponse.json(
        {
          ok: false,
          error: 'Feedback is not available yet — please try again later.',
          code: 'FEEDBACK_TABLE_MISSING',
        },
        { status: 503 },
      );
    }
    console.error('[feedback] insert failed:', (err as Error)?.message ?? err);
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}
