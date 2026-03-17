import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import pool from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Always return success to prevent email enumeration
    const result = await pool.query<{ id: string; email: string }>(
      'SELECT id, email FROM users WHERE email = $1 LIMIT 1',
      [normalizedEmail],
    );

    if (result.rows.length > 0) {
      const resetToken = nanoid(48);
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await pool.query(
        'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
        [resetToken, resetExpires, result.rows[0].id],
      );

      await sendPasswordResetEmail(result.rows[0].email, resetToken);
    }

    // Always return success (no email enumeration)
    return NextResponse.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (err) {
    console.error('[auth] Forgot password error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
