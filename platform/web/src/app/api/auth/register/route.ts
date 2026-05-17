/**
 * POST /api/auth/register — Phase 140-04
 *
 * SaaS register flow with CF auto-provisioning. On a successful submit:
 *
 *   1. Validate input (email format, password length, username via the
 *      async validator from 140-02 — format + reserved + app-collision
 *      + uniqueness against the apps / users tables).
 *   2. Hash password.
 *   3. Open a single PG client connection from the pool, BEGIN.
 *   4. INSERT the user row (capture id + verification token).
 *   5. Call provisionUserHostnames(username) — creates CF tunnel +
 *      apex DNS CNAME on Cloudflare. (140-01.)
 *   6. Encrypt the returned tunnel token with LIV_SECRET_KEY (140-04).
 *   7. UPDATE the user row with cf_tunnel_id, cf_tunnel_token_encrypted,
 *      cf_dns_record_id_apex, cf_provisioned_at. (Columns from 140-03.)
 *   8. COMMIT.
 *   9. Send verification email + create session + set cookie (existing
 *      post-register behavior, unchanged in shape).
 *
 * On any failure between BEGIN and COMMIT:
 *   - ROLLBACK the DB transaction (no orphan user row).
 *   - If CF tunnel or apex DNS was partially created, call
 *     deprovisionUser({...}) best-effort to clean up the CF side
 *     (no orphan tunnels). Cleanup errors are logged but do NOT mask
 *     the original error returned to the client.
 *
 * Deploy preconditions (NOT YET DONE — see 140-04 plan):
 *   - Migration 0012_phase_140_cf_saas.sql must be applied to the
 *     platform DB. Until then this route fails with `column
 *     "cf_tunnel_id" does not exist`.
 *   - LIV_SECRET_KEY env var must be set on Server5 pm2 env. Until
 *     then this route fails inside encryptToken() with a descriptive
 *     error.
 *   - CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID_LIVINITY_IO must be set
 *     (already required by cf-saas.ts since 140-01).
 *
 * Live integration testing is DEFERRED to the operator UAT walk for
 * Phase 140 — see 140-04 plan Done Criteria.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import pool from '@/lib/db';
import {
  hashPassword,
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';
import { validateUsername } from '@/lib/username-validator';
import {
  provisionUserHostnames,
  deprovisionUser,
  CfApiError,
} from '@/lib/cf-saas';
import { encryptToken } from '@/lib/token-encryption';

export async function POST(req: NextRequest) {
  try {
    const { email, password, username } = await req.json();

    if (!email || !password || !username) {
      return NextResponse.json(
        { error: 'Email, password, and username are required' },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Username validator — format + reserved + app-collision + uniqueness
    // against users.username (140-02). Returns normalized lowercase form.
    const v = await validateUsername(username);
    if (!v.ok) {
      return NextResponse.json({ error: v.error, code: v.code }, { status: 400 });
    }
    const normalizedUsername = v.normalized;
    const normalizedEmail = email.toLowerCase().trim();

    // Email uniqueness — the username validator already covered username
    // uniqueness. Keep this as a separate check so the error message can
    // distinguish "email taken" from "username taken".
    const existingEmail = await pool.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [normalizedEmail],
    );
    if (existingEmail.rows.length > 0) {
      return NextResponse.json({ error: 'Email already taken' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = nanoid(48);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Transactional user-create + CF provision + CF-fields-update.
    // CF API calls happen inside the transaction window; if they fail
    // we ROLLBACK so no orphan user row, then best-effort
    // deprovisionUser to release whatever CF resources got created.
    const client = await pool.connect();
    let userId: string | null = null;
    let tunnelId: string | null = null;
    let apexDnsId: string | null = null;
    try {
      await client.query('BEGIN');

      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO users (username, email, password_hash, email_verification_token, email_verification_expires)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          normalizedUsername,
          normalizedEmail,
          passwordHash,
          verificationToken,
          verificationExpires,
        ],
      );
      userId = insertRes.rows[0].id;

      // CF API: create tunnel + apex DNS CNAME for {username}.livinity.io
      const cf = await provisionUserHostnames(normalizedUsername);
      tunnelId = cf.tunnel_id;
      apexDnsId = cf.apex_dns_record_id;

      // Encrypt token before BYTEA persist (LIV_SECRET_KEY required).
      const encryptedToken = await encryptToken(cf.tunnel_token);

      await client.query(
        `UPDATE users
         SET cf_tunnel_id = $1,
             cf_tunnel_token_encrypted = $2,
             cf_dns_record_id_apex = $3,
             cf_provisioned_at = NOW()
         WHERE id = $4`,
        [cf.tunnel_id, encryptedToken, cf.apex_dns_record_id, userId],
      );

      await client.query('COMMIT');
    } catch (txErr) {
      // Roll back DB first so no orphan user row remains.
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[auth] Register rollback failed:', rollbackErr);
      }

      // If CF resources were partially created before failure, clean
      // them up best-effort. Cleanup errors must NOT mask the original
      // failure surfaced to the client.
      if (tunnelId || apexDnsId) {
        await deprovisionUser({
          tunnel_id: tunnelId ?? '',
          username: normalizedUsername,
          apex_dns_record_id: apexDnsId ?? '',
          app_dns_record_ids: [],
        }).catch((cleanupErr) => {
          console.error(
            '[auth] cleanup_failed_during_register_rollback',
            {
              userId,
              tunnelId,
              apexDnsId,
              username: normalizedUsername,
              error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            },
          );
        });
      }

      // Race: another concurrent register won the username/email UNIQUE
      // index — surface as 409 even though we reached this code path via
      // the post-INSERT throw.
      const pgErr = txErr as { code?: string };
      if (pgErr?.code === '23505') {
        return NextResponse.json(
          { error: 'Email or username already taken' },
          { status: 409 },
        );
      }

      // CF API failure — log full error server-side, return a generic
      // 503 so the user can retry without leaking infra details.
      if (txErr instanceof CfApiError) {
        console.error('[auth] CF provisioning failed during register:', {
          username: normalizedUsername,
          cfErrorCode: txErr.cfErrorCode,
          cfMessage: txErr.cfMessage,
          endpoint: txErr.endpoint,
          status: txErr.code,
        });
        return NextResponse.json(
          {
            error:
              'Provisioning service temporarily unavailable. Please try again in a moment.',
          },
          { status: 503 },
        );
      }

      // Anything else (encryption failure, DB error, etc.) — generic 500.
      throw txErr;
    } finally {
      client.release();
    }

    // Post-register flow (unchanged in shape from pre-140-04 behavior).
    // The user row exists, CF tunnel + DNS are live, token is at rest
    // encrypted. Now send verification email + create session.

    if (!userId) {
      // Defensive — unreachable if the transaction committed.
      throw new Error('register: userId not set after successful commit');
    }

    await sendVerificationEmail(normalizedEmail, verificationToken);

    const sessionToken = await createSession(
      userId,
      req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
      req.headers.get('user-agent') ?? undefined,
    );

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: userId,
          username: normalizedUsername,
          email: normalizedEmail,
          emailVerified: false,
        },
        username: normalizedUsername,
      },
      { status: 201 },
    );

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });

    return response;
  } catch (err) {
    console.error('[auth] Register error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
