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
import { createUser } from '@/lib/user-creation';

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
    // Phase 274: pending rows no longer carry a username — the user is created
    // username-less and picks one in /username after this step.
    // Read the pending row + the free-BYOD intent (migration 0027). If that
    // column isn't migrated yet (42703), fall back to the pre-feature SELECT and
    // treat the signup as a normal (free_byod=false) account — the safe direction.
    let pending: {
      rows: Array<{ id: string; email: string; password_hash: string; free_byod?: boolean }>;
    };
    try {
      pending = await pool.query(
        `SELECT id, email, password_hash, free_byod
           FROM pending_registrations
          WHERE verification_token = $1 AND verification_expires > NOW()
          LIMIT 1`,
        [token],
      );
    } catch (err) {
      if ((err as { code?: string })?.code !== '42703') throw err;
      pending = await pool.query(
        `SELECT id, email, password_hash
           FROM pending_registrations
          WHERE verification_token = $1 AND verification_expires > NOW()
          LIMIT 1`,
        [token],
      );
    }

    if (pending.rows.length > 0) {
      const p = pending.rows[0];
      const normalizedEmail = p.email.toLowerCase().trim();

      // Guard a race: the EMAIL may have been registered by another account
      // between register and this link click (username can no longer clash here
      // since none is assigned yet).
      const clash = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [normalizedEmail],
      );
      if (clash.rows.length > 0) {
        // The pending row is now unusable — drop it and ask them to retry.
        await pool
          .query('DELETE FROM pending_registrations WHERE id = $1', [p.id])
          .catch(() => {});
        return NextResponse.json(
          { error: 'That email is already registered. Try signing in.' },
          { status: 409 },
        );
      }

      const client = await pool.connect();
      let userId: string;
      try {
        await client.query('BEGIN');
        // Shared helper (lib/user-creation.ts) so the email-verify path and the
        // OAuth bridge create users identically. Runs inside this tx so the
        // INSERT + pending-row DELETE stay atomic. username=NULL → /username.
        userId = await createUser(
          {
            username: null,
            email: normalizedEmail,
            passwordHash: p.password_hash,
            emailVerified: true,
            // Carry the free-BYOD tier choice from the pending row (defaults to
            // false when the column is absent or the signup was normal/paid).
            freeByod: p.free_byod === true,
          },
          client,
        );
        await client.query('DELETE FROM pending_registrations WHERE id = $1', [p.id]);
        await client.query('COMMIT');
      } catch (txErr) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('[auth] verify-email rollback failed:', rollbackErr);
        }
        if ((txErr as { code?: string })?.code === '23505') {
          // Lost the race for the UNIQUE(email) index.
          return NextResponse.json(
            { error: 'That email was just registered. Please sign in.' },
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
