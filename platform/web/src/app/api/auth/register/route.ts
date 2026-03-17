import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import pool from '@/lib/db';
import { hashPassword, validateUsername, createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const { email, password, username } = await req.json();

    if (!email || !password || !username) {
      return NextResponse.json({ error: 'Email, password, and username are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const usernameCheck = validateUsername(username.toLowerCase());
    if (!usernameCheck.valid) {
      return NextResponse.json({ error: usernameCheck.error }, { status: 400 });
    }

    const normalizedUsername = username.toLowerCase();
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email or username already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1',
      [normalizedEmail, normalizedUsername],
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Email or username already taken' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = nanoid(48);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (username, email, password_hash, email_verification_token, email_verification_expires)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [normalizedUsername, normalizedEmail, passwordHash, verificationToken, verificationExpires],
    );

    const userId = result.rows[0].id;

    // Send verification email
    await sendVerificationEmail(normalizedEmail, verificationToken);

    // Create session immediately (but email not verified yet)
    const sessionToken = await createSession(
      userId,
      req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
      req.headers.get('user-agent') ?? undefined,
    );

    const response = NextResponse.json({
      success: true,
      user: { id: userId, username: normalizedUsername, email: normalizedEmail, emailVerified: false },
    }, { status: 201 });

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
