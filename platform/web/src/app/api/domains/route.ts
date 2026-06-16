import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { db } from '@/lib/drizzle';
import { customDomains } from '@/db/schema';

async function getUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getSession(token);
}

/** GET /api/domains -- List all domains for authenticated user */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const domains = await db
    .select()
    .from(customDomains)
    .where(eq(customDomains.user_id, user.userId))
    .orderBy(desc(customDomains.created_at));

  return NextResponse.json({ domains });
}

/**
 * POST /api/domains -- DISABLED.
 *
 * Bring-your-own custom-domain onboarding was built on the legacy relay
 * A-record ingress (Server5, RETIRED). The current topology is Cloudflare
 * Tunnel, under which there is no relay A-record for an operator to point at,
 * so this BYO add flow can never verify. It is disabled (410 Gone) rather than
 * handing operators a dead DNS target. The primary `{username}.livinity.io`
 * onboarding (cf-saas.ts `provisionUserHostnames`) is unaffected.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    {
      error:
        'Custom domains are not currently supported. Use your {username}.livinity.io address.',
    },
    { status: 410 },
  );
}
