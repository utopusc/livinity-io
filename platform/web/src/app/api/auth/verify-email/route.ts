/**
 * POST /api/auth/verify-email — Stage 2 of the email-verify-FIRST signup flow.
 *
 * Primary path (NEW signups): the token belongs to a `pending_registrations`
 * row. We promote it into `public.users` (email_verified=TRUE, NO CF fields —
 * the tunnel is provisioned later, on subscribe), DELETE the pending row, and
 * log the user in (session cookie). The page then redirects to /pricing.
 *
 * Back-compat path (pre-existing unverified users created by the OLD register
 * flow — e.g. `fofomen`): the token belongs to a `public.users` row. We flip
 * email_verified=TRUE as before, then ALSO issue a session so the UX matches
 * the new flow.
 *
 * Both paths end the same way: resolve a user id → create a session → set the
 * `liv_session` cookie → return { success: true }.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth';

async function issueSessionCookie(req: NextRequest, userId: string): Promise<NextResponse> {
  const sessionToken = await createSession(
    userId,
    req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
    req.headers.get('user-agent') ?? undefined,
  );
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // ── Primary path: pending registration → create the user. ────────────────
    const pending = await pool.query<{
      id: string;
      email: string;
      username: string;
      password_hash: string;
    }>(
      `SELECT id, email, username, password_hash
         FROM pending_registrations
        WHERE verification_token = $1 AND verification_expires > NOW()
        LIMIT 1`,
      [token],
    );

    if (pending.rows.length > 0) {
      const p = pending.rows[0];
      const normalizedEmail = p.email.toLowerCase().trim();
      const normalizedUsername = p.username.toLowerCase().trim();

      // Guard a race: the email/username slot may have been taken by another
      // (already-verified) account between register and this link click.
      const clash = await pool.query<{ which: string }>(
        `SELECT CASE WHEN email = $1 THEN 'email' ELSE 'username' END AS which
           FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
        [normalizedEmail, normalizedUsername],
      );
      if (clash.rows.length > 0) {
        // The pending row is now unusable — drop it and ask them to retry.
        await pool
          .query('DELETE FROM pending_registrations WHERE id = $1', [p.id])
          .catch(() => {});
        const which = clash.rows[0].which;
        return NextResponse.json(
          {
            error:
              which === 'email'
                ? 'That email is already registered. Try signing in.'
                : 'That username was just taken. Please register again with a different username.',
          },
          { status: 409 },
        );
      }

      const client = await pool.connect();
      let userId: string;
      try {
        await client.query('BEGIN');
        const ins = await client.query<{ id: string }>(
          `INSERT INTO users (username, email, password_hash, email_verified)
           VALUES ($1, $2, $3, TRUE)
           RETURNING id`,
          [normalizedUsername, normalizedEmail, p.password_hash],
        );
        userId = ins.rows[0].id;
        await client.query('DELETE FROM pending_registrations WHERE id = $1', [p.id]);
        await client.query('COMMIT');
      } catch (txErr) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('[auth] verify-email rollback failed:', rollbackErr);
        }
        if ((txErr as { code?: string })?.code === '23505') {
          // Lost the race for the UNIQUE(email)/UNIQUE(username) index.
          return NextResponse.json(
            { error: 'That email or username was just taken. Please register again.' },
            { status: 409 },
          );
        }
        throw txErr;
      } finally {
        client.release();
      }

      return issueSessionCookie(req, userId);
    }

    // ── Back-compat path: token on an existing (legacy) unverified user. ──────
    const legacy = await pool.query<{ id: string }>(
      `UPDATE users
          SET email_verified = TRUE,
              email_verification_token = NULL,
              email_verification_expires = NULL
        WHERE email_verification_token = $1
          AND email_verification_expires > NOW()
          AND email_verified = FALSE
        RETURNING id`,
      [token],
    );

    if (legacy.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or expired verification link' },
        { status: 400 },
      );
    }

    return issueSessionCookie(req, legacy.rows[0].id);
  } catch (err) {
    console.error('[auth] Verify email error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
