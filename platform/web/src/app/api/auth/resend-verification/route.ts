/**
 * POST /api/auth/resend-verification — re-issue an email-verification link.
 *
 * Two modes:
 *   • { email } in the body → PENDING-registration resend. In the
 *     email-verify-first flow there is NO session before the link is clicked,
 *     so the new-signup "Resend" button identifies the pending row by email.
 *     Anti-enumeration: an unknown email still returns { success: true }.
 *   • no body → SESSION resend for a legacy logged-in-but-unverified user
 *     (accounts created by the old register flow, e.g. `fofomen`).
 *
 * Both modes refresh the token + 24h expiry and re-send via Resend, with a soft
 * ~60s rate-limit against double-clicks / spam.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 *
 * Phase 140-06.2 (2026-05-17): original session-only version added during Resend
 * wiring + verify-pending UX. Email-pending mode added for the verify-first flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import pool from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email';

const TOKEN_EXPIRY_HOURS = 24;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const emailRaw = typeof body?.email === 'string' ? body.email : null;

  // ── Mode 1: pending-registration resend (no session) ──────────────────────
  if (emailRaw) {
    const email = emailRaw.toLowerCase().trim();

    const row = await pool.query<{ verification_expires: Date }>(
      'SELECT verification_expires FROM pending_registrations WHERE lower(email) = $1 LIMIT 1',
      [email],
    );
    // Anti-enumeration: never reveal whether this email has a pending signup.
    if (row.rows.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Soft 60s rate-limit: a token issued < 60s ago still has > (24h - 60s)
    // left on its expiry.
    const tooRecent = await pool.query(
      `SELECT 1 FROM pending_registrations
        WHERE lower(email) = $1
          AND verification_expires > NOW() + INTERVAL '${TOKEN_EXPIRY_HOURS} hours' - INTERVAL '1 minute'
        LIMIT 1`,
      [email],
    );
    if (tooRecent.rows.length > 0) {
      // Anti-enumeration: return the SAME success shape as the unknown-email
      // case (a 429 here would reveal that this email has a recent pending
      // signup). The previous link is still valid, so silently skipping the
      // resend is safe.
      return NextResponse.json({ success: true });
    }

    const token = nanoid(48);
    const expires = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    await pool.query(
      'UPDATE pending_registrations SET verification_token = $1, verification_expires = $2 WHERE lower(email) = $3',
      [token, expires, email],
    );

    try {
      await sendVerificationEmail(email, token);
    } catch (err) {
      console.error('[auth] Resend (pending) email failed:', err);
      return NextResponse.json({ error: 'Could not send email. Try again shortly.' }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  }

  // ── Mode 2: session resend (legacy logged-in unverified user) ─────────────
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = sessionToken ? await getSession(sessionToken) : null;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.emailVerified) {
    return NextResponse.json({ error: 'Email is already verified' }, { status: 400 });
  }

  // Soft ~60s rate-limit: refuse if last reissue was < 60 sec ago. A token
  // issued < 60s ago still has > (24h - 60s) left on its expiry. (Mirrors the
  // Mode 1 math; the earlier `TOKEN_EXPIRY_HOURS - 1 hours` form was a ~1-hour
  // window, far longer than the "wait a minute" message claims.)
  const recent = await pool.query<{ updated_at: Date }>(
    `SELECT email_verification_expires AS updated_at
     FROM users
     WHERE id = $1
       AND email_verification_expires IS NOT NULL
       AND email_verification_expires > NOW() + INTERVAL '${TOKEN_EXPIRY_HOURS} hours' - INTERVAL '1 minute'`,
    [user.userId],
  );
  if (recent.rows.length > 0) {
    return NextResponse.json(
      { error: 'Please wait a minute before requesting another email.' },
      { status: 429 },
    );
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
