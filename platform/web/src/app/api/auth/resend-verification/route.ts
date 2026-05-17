/**
 * POST /api/auth/resend-verification
 *
 * Re-issues an email-verification token for the currently authenticated
 * user and sends a fresh verification email via Resend. Used by the
 * "Resend verification email" button on /verify when the user hasn't
 * received the original link.
 *
 * Auth: session cookie (no api-key path — this is a browser-only flow).
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 *
 * Phase 140-06.2 (2026-05-17): added during Resend wiring + verify-pending
 * UX work. The 24h expiry mirrors the register-time policy in
 * src/app/api/auth/register/route.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email';

const TOKEN_EXPIRY_HOURS = 24;

async function getUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getSession(token);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.emailVerified) {
    return NextResponse.json({ error: 'Email is already verified' }, { status: 400 });
  }

  // Soft rate-limit: refuse if last reissue was < 60 sec ago. Cheap defense
  // against accidental double-clicks + button spam.
  const recent = await pool.query<{ updated_at: Date }>(
    `SELECT email_verification_expires AS updated_at
     FROM users
     WHERE id = $1
       AND email_verification_expires IS NOT NULL
       AND email_verification_expires > NOW() + INTERVAL '${TOKEN_EXPIRY_HOURS - 1} hours'`,
    [user.userId],
  );
  if (recent.rows.length > 0) {
    return NextResponse.json({ error: 'Please wait a minute before requesting another email.' }, { status: 429 });
  }

  const token = nanoid(48);
  const expires = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await pool.query(
    `UPDATE users
     SET email_verification_token = $1,
         email_verification_expires = $2
     WHERE id = $3`,
    [token, expires, user.userId],
  );

  try {
    await sendVerificationEmail(user.email, token);
  } catch (err) {
    console.error('[auth] Resend verification email failed:', err);
    return NextResponse.json({ error: 'Could not send email. Try again shortly.' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
