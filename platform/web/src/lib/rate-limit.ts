import { NextResponse, type NextRequest } from 'next/server';
import pool from './db';

// Best-effort client IP on Vercel (mirrors the getClientIp pattern already used
// in tunnel-connections/connect, login, verify-email).
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number };

/**
 * Atomic fixed-window rate limit backed by Postgres. Works across all Vercel
 * serverless instances (shared DB), unlike an in-memory limiter.
 *
 * FAIL-OPEN: any DB error allows the request. A limiter outage must never lock
 * legitimate users out — the limiter is a guard rail, not the core dependency.
 *
 * @param key    a stable scope+identifier, e.g. `resend:ip:1.2.3.4`
 * @param limit  max requests allowed within the window
 * @param windowSeconds  window length in seconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { rows } = await pool.query<{ count: number; reset_at: Date }>(
      `INSERT INTO rate_limits (key, count, reset_at)
       VALUES ($1, 1, now() + make_interval(secs => $2::int))
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at < now()
                         THEN now() + make_interval(secs => $2::int)
                         ELSE rate_limits.reset_at END
       RETURNING count, reset_at`,
      [key, windowSeconds],
    );
    const count = rows[0]?.count ?? 1;
    const resetMs = rows[0]?.reset_at ? new Date(rows[0].reset_at).getTime() : Date.now();
    const retryAfter = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter };
  } catch (err) {
    console.warn('[rate-limit] check failed, failing open:', err instanceof Error ? err.message : err);
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
}

// Standard 429 response with a Retry-After header.
export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } },
  );
}
