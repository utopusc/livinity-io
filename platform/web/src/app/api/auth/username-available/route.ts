/**
 * GET /api/auth/username-available — Phase 140-06
 *
 * Public (no auth) live availability check for the install wizard's username
 * picker. The wizard debounces typing and hits this endpoint, which delegates
 * to `validateUsername` from 140-02 so the rules stay in sync with the
 * register handler (FORMAT → RESERVED → APP_COLLISION → TAKEN).
 *
 * Request:
 *   GET /api/auth/username-available?u=lucy
 *
 * Response 200:
 *   { available: true }
 *   { available: false, reason: "...", code: "FORMAT" | "RESERVED" | "APP_COLLISION" | "TAKEN" }
 *
 * Response 400:
 *   { error: "u parameter required" }
 *
 * Notes:
 *   - Public on purpose: the install wizard runs pre-login during onboarding,
 *     and the same validator is the chokepoint at register time, so this
 *     endpoint cannot leak more than the register form already does.
 *   - No write side effects — only the two SELECTs validateUsername performs.
 *   - The result is advisory: the register handler revalidates on submit
 *     (a name could be taken in the race window between check and submit).
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUsername } from '@/lib/username-validator';
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');

  if (!u || u.trim().length === 0) {
    return NextResponse.json({ error: 'u parameter required' }, { status: 400 });
  }

  // Public endpoint (pre-login wizard) — cap per IP to stop DB-enumeration floods.
  const ipLimit = await rateLimit(`uname:ip:${getClientIp(req)}`, 60, 60);
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfter);

  const result = await validateUsername(u);

  if (result.ok) {
    return NextResponse.json({ available: true });
  }

  return NextResponse.json({
    available: false,
    reason: result.error,
    code: result.code,
  });
}
