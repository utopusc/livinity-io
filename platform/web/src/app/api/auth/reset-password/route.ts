import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const result = await pool.query<{ id: string }>(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires = NULL
       WHERE password_reset_token = $2
         AND password_reset_expires > NOW()
       RETURNING id`,
      [passwordHash, token],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    // Delete all sessions for this user (force re-login with new password)
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [result.rows[0].id]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[auth] Reset password error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
