/**
 * POST /api/auth/register — Stage 1 of the email-verify-FIRST signup flow.
 *
 * The signup is three stages:
 *   1. (HERE) register → write a `pending_registrations` row + email a verify
 *      link. NO `public.users` row, NO Cloudflare tunnel, NO session yet.
 *   2. POST /api/auth/verify-email (link click) → create the `public.users` row
 *      (email_verified=TRUE) and log the user in.
 *   3. mirrorSubscription (on trial/paid subscribe) → provision the CF tunnel
 *      (lib/user-provisioning.ts).
 *
 * Rationale: we never create a user — or burn a Cloudflare tunnel — for an
 * unverified email. CF resources exist only for actual subscribers.
 *
 * This replaces the pre-existing flow (Phase 140-04) which INSERTed the user +
 * provisioned the tunnel immediately at register, before verification.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import pool from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';
import { validateUsername } from '@/lib/username-validator';

const TOKEN_EXPIRY_HOURS = 24;

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

    // Email uniqueness against CONFIRMED users (validateUsername already covered
    // username uniqueness vs users). Separate check so the message can say
    // "email taken" vs "username taken".
    const existingEmail = await pool.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [normalizedEmail],
    );
    if (existingEmail.rows.length > 0) {
      return NextResponse.json({ error: 'Email already taken' }, { status: 409 });
    }

    // Username uniqueness against OTHER pending signups. A pending row for THIS
    // same email is fine — the upsert below refreshes it. A pending row for a
    // DIFFERENT email holding this username blocks (first-come-first-served
    // until it expires or is verified).
    const pendingUser = await pool.query<{ email: string }>(
      'SELECT email FROM pending_registrations WHERE lower(username) = $1 LIMIT 1',
      [normalizedUsername],
    );
    if (
      pendingUser.rows.length > 0 &&
      pendingUser.rows[0].email.toLowerCase() !== normalizedEmail
    ) {
      return NextResponse.json(
        { error: `"${normalizedUsername}" is already taken.`, code: 'TAKEN' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = nanoid(48);
    const verificationExpires = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Upsert on lower(email): a re-register before verifying refreshes the
    // token + username + password instead of 409'ing a stale, never-verified
    // pending row.
    try {
      await pool.query(
        `INSERT INTO pending_registrations
           (email, username, password_hash, verification_token, verification_expires)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (lower(email)) DO UPDATE SET
           username = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash,
           verification_token = EXCLUDED.verification_token,
           verification_expires = EXCLUDED.verification_expires,
           created_at = NOW()`,
        [normalizedEmail, normalizedUsername, passwordHash, verificationToken, verificationExpires],
      );
    } catch (err) {
      // 23505 on the username unique index → a concurrent pending signup won
      // the username between our check and this insert.
      if ((err as { code?: string })?.code === '23505') {
        return NextResponse.json(
          { error: `"${normalizedUsername}" is already taken.`, code: 'TAKEN' },
          { status: 409 },
        );
      }
      throw err;
    }

    await sendVerificationEmail(normalizedEmail, verificationToken);

    // No user, no session — the client redirects to /verify ("check your email").
    return NextResponse.json({ pending: true }, { status: 201 });
  } catch (err) {
    console.error('[auth] Register error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
