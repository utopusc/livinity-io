import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { db } from '@/lib/drizzle';
import { customDomains } from '@/db/schema';
import { verifyDomainDns } from '@/lib/dns-verify';

/** Hours after creation before a domain is considered dns_failed */
const DNS_TIMEOUT_HOURS = 48;

async function getUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getSession(token);
}

/** POST /api/domains/[id]/verify -- Trigger DNS verification for a domain */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Fetch the domain (must belong to authenticated user)
  const [domain] = await db
    .select()
    .from(customDomains)
    .where(and(eq(customDomains.id, id), eq(customDomains.user_id, user.userId)))
    .limit(1);

  if (!domain) {
    return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
  }

  // Run DNS verification
  const result = await verifyDomainDns(domain.domain, domain.verification_token);

  // Determine new status
  const now = new Date();
  let newStatus = domain.status;
  let verifiedAt = domain.verified_at;
  let errorMessage: string | null = domain.error_message;

  const wasPreviouslyVerified = domain.status === 'dns_verified' || domain.status === 'active';

  if (result.aRecordVerified && result.txtRecordVerified) {
    // Both checks pass
    newStatus = 'dns_verified';
    verifiedAt = now;
    errorMessage = null;
  } else if (wasPreviouslyVerified) {
    // Was verified but DNS changed
    newStatus = 'dns_changed';
    errorMessage = buildErrorMessage(result);
  } else {
    // Not yet verified -- check if past 48h timeout
    const hoursSinceCreated = (now.getTime() - new Date(domain.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreated > DNS_TIMEOUT_HOURS) {
      newStatus = 'dns_failed';
      errorMessage = buildErrorMessage(result);
    } else {
      newStatus = 'pending_dns';
      errorMessage = buildErrorMessage(result);
    }
  }

  // Update the domain record
  const [updated] = await db
    .update(customDomains)
    .set({
      dns_a_verified: result.aRecordVerified,
      dns_txt_verified: result.txtRecordVerified,
      last_dns_check: now,
      status: newStatus,
      verified_at: verifiedAt,
      error_message: errorMessage,
      updated_at: now,
    })
    .where(eq(customDomains.id, id))
    .returning();

  return NextResponse.json({
    domain: updated,
    verification: {
      aRecord: {
        verified: result.aRecordVerified,
        values: result.aRecordValues,
      },
      txtRecord: {
        verified: result.txtRecordVerified,
        values: result.txtRecordValues,
      },
    },
  });
}

function buildErrorMessage(result: { aRecordVerified: boolean; txtRecordVerified: boolean }): string | null {
  const issues: string[] = [];
  if (!result.aRecordVerified) issues.push('A record not pointing to relay server');
  if (!result.txtRecordVerified) issues.push('TXT verification record not found');
  return issues.length > 0 ? issues.join('; ') : null;
}
