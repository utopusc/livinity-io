// External-reputation lookup for a tenant hostname (Phase 280 abuse detection).
//
// Each tenant is a subdomain `{username}.livinity.io`, so per-tenant reputation
// needs a checker that understands full hostnames/URLs — Google Safe Browsing
// (phishing / malware / unwanted-software lists) is the right tool. It is
// ENV-GATED: with no GOOGLE_SAFE_BROWSING_KEY we return 'unknown' (the feature
// is dormant until the operator adds a key). DNS blocklists (Spamhaus DBL) are
// deliberately NOT used — they key on the registered domain (livinity.io), so
// they can't distinguish one abusive tenant from the rest of the zone.
//
// Best-effort: NEVER throws. Any missing key / network error / non-200 / parse
// failure → { reputation: 'unknown' } so the abuse-scan cron never breaks
// because reputation is flaky.

export type Reputation = 'clean' | 'flagged' | 'unknown';

const SAFE_BROWSING_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const PER_CALL_TIMEOUT_MS = 5000;

interface SafeBrowsingMatch {
  threatType?: string;
}
interface SafeBrowsingResponse {
  matches?: SafeBrowsingMatch[];
}

/**
 * Check a tenant hostname against Google Safe Browsing.
 * @returns 'clean' (no match), 'flagged' (+ detail = matched threat types), or
 *          'unknown' (no key configured / lookup failed).
 */
export async function checkReputation(
  hostname: string,
): Promise<{ reputation: Reputation; detail: string | null }> {
  const key = process.env.GOOGLE_SAFE_BROWSING_KEY;
  if (!key) {
    return { reputation: 'unknown', detail: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);

  try {
    const res = await fetch(`${SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        client: { clientId: 'livinity', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: [
            'MALWARE',
            'SOCIAL_ENGINEERING',
            'UNWANTED_SOFTWARE',
            'POTENTIALLY_HARMFUL_APPLICATION',
          ],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          // Check both schemes + the bare host — Safe Browsing canonicalizes.
          threatEntries: [
            { url: `https://${hostname}/` },
            { url: `http://${hostname}/` },
          ],
        },
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[reputation] ${hostname} -> HTTP ${res.status}`);
      return { reputation: 'unknown', detail: null };
    }

    const json = (await res.json()) as SafeBrowsingResponse;
    const matches = Array.isArray(json.matches) ? json.matches : [];
    if (matches.length === 0) {
      return { reputation: 'clean', detail: null };
    }
    const types = [...new Set(matches.map((m) => m.threatType).filter(Boolean))].join(', ');
    return { reputation: 'flagged', detail: types || 'threat match' };
  } catch (err) {
    clearTimeout(timer);
    const e = err as Error;
    console.warn(`[reputation] ${hostname} lookup failed: ${e?.message ?? String(err)}`);
    return { reputation: 'unknown', detail: null };
  }
}
