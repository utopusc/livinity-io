import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-admin';

// Lightweight admin probe. Used by the admin shell client gate to confirm
// is_admin via session cookie OR x-api-key (both supported through the
// requireAdmin bridge shipped in P213-T1).
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({
    userId: ctx.userId,
    username: ctx.username,
    email: ctx.email,
    isAdmin: true,
  });
}
