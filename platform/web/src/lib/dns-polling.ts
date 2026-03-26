import { db } from '@/lib/drizzle';
import { customDomains } from '@/db/schema';
import { verifyDomainDns } from '@/lib/dns-verify';
import { eq, and, or, lt, sql, isNull } from 'drizzle-orm';

const RELAY_DOMAIN_SYNC_URL = 'http://localhost:4000/internal/domain-sync';

async function notifyRelayDomainSync(
  userId: string,
  action: 'add' | 'update' | 'remove',
  domain: string,
  status: string,
): Promise<void> {
  try {
    await fetch(RELAY_DOMAIN_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action, domain, status }),
    });
  } catch (err) {
    console.error(`[dns-polling] Failed to notify relay of domain sync for ${domain}:`, err);
  }
}

const FAST_INTERVAL_MS = 30_000; // 30 seconds (first hour after domain addition)
const SLOW_INTERVAL_MS = 5 * 60_000; // 5 minutes (after first hour)
const REVERIFY_INTERVAL_MS = 12 * 60 * 60_000; // 12 hours for re-verification of active domains
const DNS_TIMEOUT_HOURS = 48;

let pollingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Poll all pending/failed domains for DNS verification.
 *
 * Tiered interval logic:
 * - Domains added < 1 hour ago: check every 30 seconds
 * - Domains added > 1 hour ago: check every 5 minutes
 * - Domains pending > 48 hours: mark as dns_failed (timeout)
 * - Active/verified domains: re-verify every 12 hours
 */
export async function pollPendingDomains(): Promise<void> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
  const fortyEightHoursAgo = new Date(now.getTime() - DNS_TIMEOUT_HOURS * 60 * 60_000);

  try {
    // 1. Fetch pending/failed domains that might need checking
    const pendingDomains = await db
      .select()
      .from(customDomains)
      .where(
        and(
          or(
            eq(customDomains.status, 'pending_dns'),
            eq(customDomains.status, 'dns_failed')
          ),
          or(
            isNull(customDomains.last_dns_check),
            lt(customDomains.last_dns_check, sql`NOW() - INTERVAL '30 seconds'`)
          )
        )
      );

    for (const domain of pendingDomains) {
      const createdAt = new Date(domain.created_at);

      // Check 48-hour timeout for pending_dns domains
      if (createdAt < fortyEightHoursAgo && domain.status === 'pending_dns') {
        await db
          .update(customDomains)
          .set({
            status: 'dns_failed',
            error_message: 'DNS verification timed out after 48 hours. You can retry by clicking Verify.',
            last_dns_check: now,
            updated_at: now,
          })
          .where(eq(customDomains.id, domain.id));
        continue;
      }

      // Throttle based on age: recent (< 1hr) = 30s, older = 5min
      if (domain.last_dns_check) {
        const lastCheck = new Date(domain.last_dns_check);
        const isRecent = createdAt > oneHourAgo;
        const minInterval = isRecent ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
        if (now.getTime() - lastCheck.getTime() < minInterval) {
          continue; // Skip, too soon since last check
        }
      }

      // Run DNS verification
      const result = await verifyDomainDns(domain.domain, domain.verification_token);

      const updateData: Record<string, unknown> = {
        dns_a_verified: result.aRecordVerified,
        dns_txt_verified: result.txtRecordVerified,
        last_dns_check: now,
        updated_at: now,
      };

      if (result.aRecordVerified && result.txtRecordVerified) {
        updateData.status = 'dns_verified';
        updateData.verified_at = now;
        updateData.error_message = null;
      } else {
        // Build descriptive error message
        const issues: string[] = [];
        if (!result.aRecordVerified) {
          issues.push(
            result.aRecordValues.length > 0
              ? `A record points to ${result.aRecordValues.join(', ')} instead of 45.137.194.102`
              : 'A record not found'
          );
        }
        if (!result.txtRecordVerified) {
          issues.push(
            result.txtRecordValues.length > 0
              ? 'TXT record found but does not match verification token'
              : 'TXT record not found at _livinity-verification.' + domain.domain
          );
        }
        updateData.error_message = issues.join('. ');
      }

      await db
        .update(customDomains)
        .set(updateData)
        .where(eq(customDomains.id, domain.id));

      // Notify relay to sync domain to LivOS when verified
      if (updateData.status === 'dns_verified') {
        await notifyRelayDomainSync(domain.user_id, 'add', domain.domain, 'dns_verified');
      }
    }

    // 2. Re-verify active/verified domains every 12 hours
    const activeDomains = await db
      .select()
      .from(customDomains)
      .where(
        and(
          or(
            eq(customDomains.status, 'dns_verified'),
            eq(customDomains.status, 'active')
          ),
          or(
            isNull(customDomains.last_dns_check),
            lt(customDomains.last_dns_check, sql`NOW() - INTERVAL '12 hours'`)
          )
        )
      );

    for (const domain of activeDomains) {
      const result = await verifyDomainDns(domain.domain, domain.verification_token);

      if (!result.aRecordVerified || !result.txtRecordVerified) {
        await db
          .update(customDomains)
          .set({
            status: 'dns_changed',
            dns_a_verified: result.aRecordVerified,
            dns_txt_verified: result.txtRecordVerified,
            last_dns_check: now,
            updated_at: now,
            error_message: 'DNS records have changed. Please verify your DNS configuration.',
          })
          .where(eq(customDomains.id, domain.id));

        // Notify relay to update domain status on LivOS
        await notifyRelayDomainSync(domain.user_id, 'update', domain.domain, 'dns_changed');
      } else {
        await db
          .update(customDomains)
          .set({
            last_dns_check: now,
            updated_at: now,
          })
          .where(eq(customDomains.id, domain.id));
      }
    }
  } catch (err) {
    console.error('[dns-polling] Error during DNS poll cycle:', err);
  }
}

/**
 * Start background DNS verification polling.
 * Runs pollPendingDomains every 30 seconds. Individual domains
 * are throttled internally (30s for recent, 5min for older).
 */
export function startDnsPolling(): void {
  if (pollingTimer) return; // Already running
  console.log('[dns-polling] Starting DNS verification polling (30s cycle)');
  pollingTimer = setInterval(pollPendingDomains, FAST_INTERVAL_MS);
}

/**
 * Stop background DNS verification polling.
 */
export function stopDnsPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('[dns-polling] DNS verification polling stopped');
  }
}
