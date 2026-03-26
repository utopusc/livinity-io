import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { db } from '@/lib/drizzle';
import { customDomains } from '@/db/schema';
import { generateVerificationToken, RELAY_SERVER_IP } from '@/lib/dns-verify';

const MAX_DOMAINS_FREE_TIER = 3;

async function getUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getSession(token);
}

/**
 * Validate domain format.
 * Must have at least one dot, no protocol prefix, alphanumeric + hyphens + dots.
 */
function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  // No protocol prefix
  if (/^https?:\/\//i.test(domain)) return false;
  // Must have at least one dot
  if (!domain.includes('.')) return false;
  // Each label: alphanumeric + hyphens, no leading/trailing hyphens, max 63 chars
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label),
  );
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

/** POST /api/domains -- Add a new custom domain */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const rawDomain = body.domain?.trim().toLowerCase();
  if (!rawDomain) {
    return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
  }

  if (!isValidDomain(rawDomain)) {
    return NextResponse.json(
      { error: 'Invalid domain format. Enter a domain like example.com (no http://)' },
      { status: 400 },
    );
  }

  // Block livinity.io and livinity.app subdomains
  if (rawDomain.endsWith('.livinity.io') || rawDomain.endsWith('.livinity.app') || rawDomain === 'livinity.io' || rawDomain === 'livinity.app') {
    return NextResponse.json(
      { error: 'Cannot add livinity.io or livinity.app domains' },
      { status: 400 },
    );
  }

  // Check domain uniqueness across ALL users
  const existing = await db
    .select({ id: customDomains.id })
    .from(customDomains)
    .where(eq(customDomains.domain, rawDomain))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'This domain is already registered' },
      { status: 409 },
    );
  }

  // Check free tier limit (3 domains per user)
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customDomains)
    .where(eq(customDomains.user_id, user.userId));

  const currentCount = countResult[0]?.count ?? 0;
  if (currentCount >= MAX_DOMAINS_FREE_TIER) {
    return NextResponse.json(
      { error: `Free tier limit reached. Maximum ${MAX_DOMAINS_FREE_TIER} domains allowed.` },
      { status: 403 },
    );
  }

  // Generate verification token and create domain record
  const verificationToken = generateVerificationToken();

  const [created] = await db
    .insert(customDomains)
    .values({
      user_id: user.userId,
      domain: rawDomain,
      verification_token: verificationToken,
      status: 'pending_dns',
    })
    .returning();

  return NextResponse.json({
    domain: created,
    dns_instructions: {
      a_record: {
        type: 'A',
        name: rawDomain,
        value: RELAY_SERVER_IP,
        description: `Point your domain to ${RELAY_SERVER_IP}`,
      },
      txt_record: {
        type: 'TXT',
        name: `_livinity-verification.${rawDomain}`,
        value: `liv_verify=${verificationToken}`,
        description: 'Add this TXT record to verify domain ownership',
      },
    },
  }, { status: 201 });
}
