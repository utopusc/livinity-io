import dns from 'node:dns/promises';
import crypto from 'node:crypto';

/**
 * Custom (bring-your-own) domain verification was built on the legacy relay
 * A-record ingress (the retired Server5 IP). Server5 is RETIRED and the
 * onboarding topology is now Cloudflare Tunnel (per-user proxied CNAMEs created
 * by cf-saas.ts — see `provisionUserHostnames`), which has NO relay A-record.
 *
 * The literal Server5 IP has therefore been removed entirely: a non-bruce
 * operator must never be shown a dead A-record target. The optional
 * `NEXT_PUBLIC_RELAY_IP` env exists only so a future relay-based ingress can be
 * re-enabled without re-introducing a hardcoded IP. It defaults to empty, which
 * makes the A-record check inert (never "verified") — the BYO add flow is
 * disabled at the API layer (`/api/domains` POST returns 410) until a real
 * ingress target exists.
 */
const RELAY_IP = process.env.NEXT_PUBLIC_RELAY_IP || '';
const CLOUDFLARE_DOH = 'https://1.1.1.1/dns-query';

export interface DnsCheckResult {
  aRecordVerified: boolean;
  txtRecordVerified: boolean;
  aRecordValues: string[];
  txtRecordValues: string[];
  error?: string;
}

/**
 * Check A record via system resolver.
 */
export async function checkARecord(domain: string): Promise<{ verified: boolean; values: string[] }> {
  try {
    const addresses = await dns.resolve4(domain);
    // No relay ingress IP is configured under the current CF-Tunnel topology, so
    // an A-record can never "verify". Return the resolved values for display but
    // never mark verified against an empty target.
    const verified = RELAY_IP !== '' && addresses.includes(RELAY_IP);
    return { verified, values: addresses };
  } catch {
    return { verified: false, values: [] };
  }
}

/**
 * Check A record via Cloudflare DoH (cross-validation).
 */
export async function checkARecordDoH(domain: string): Promise<{ verified: boolean; values: string[] }> {
  try {
    const url = `${CLOUDFLARE_DOH}?name=${encodeURIComponent(domain)}&type=A`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/dns-json' },
    });
    if (!res.ok) return { verified: false, values: [] };
    const data = await res.json() as { Answer?: Array<{ type: number; data: string }> };
    const addresses = (data.Answer || []).filter((a: { type: number }) => a.type === 1).map((a: { data: string }) => a.data);
    const verified = RELAY_IP !== '' && addresses.includes(RELAY_IP);
    return { verified, values: addresses };
  } catch {
    return { verified: false, values: [] };
  }
}

/**
 * Check TXT record at _livinity-verification.{domain} for ownership proof.
 */
export async function checkTxtRecord(domain: string, expectedToken: string): Promise<{ verified: boolean; values: string[] }> {
  const txtHost = `_livinity-verification.${domain}`;
  const expectedValue = `liv_verify=${expectedToken}`;
  try {
    const records = await dns.resolveTxt(txtHost);
    // TXT records return 2D array -- join chunks per record
    const flatRecords = records.map((chunks: string[]) => chunks.join(''));
    const verified = flatRecords.some((r: string) => r === expectedValue);
    return { verified, values: flatRecords };
  } catch {
    return { verified: false, values: [] };
  }
}

/**
 * Full DNS verification: system resolver A + Cloudflare DoH A + TXT record.
 * A record passes if EITHER system resolver OR Cloudflare DoH confirms it
 * (handles DNS propagation where one resolver has it and other doesn't yet).
 */
export async function verifyDomainDns(domain: string, verificationToken: string): Promise<DnsCheckResult> {
  const [aSystem, aDoH, txt] = await Promise.all([
    checkARecord(domain),
    checkARecordDoH(domain),
    checkTxtRecord(domain, verificationToken),
  ]);

  const aRecordVerified = aSystem.verified || aDoH.verified;
  const allAValues = [...new Set([...aSystem.values, ...aDoH.values])];

  return {
    aRecordVerified,
    txtRecordVerified: txt.verified,
    aRecordValues: allAValues,
    txtRecordValues: txt.values,
  };
}

/**
 * Generate a 64-char hex verification token.
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const RELAY_SERVER_IP = RELAY_IP;

/**
 * Phase 287 — verify-live DNS gate (Tier-1, public DoH).
 *
 * Query a single public DoH resolver for one record type and report whether the
 * `Answer` array is non-empty. ANY answer (A or CNAME) means the record EXISTS
 * — this is intentionally NOT a RELAY_IP equality test (that is dead BYO-relay
 * code in `checkARecordDoH`). A non-ok response or a fetch throw resolves to
 * `false` so a single-resolver hiccup can never reject the poll.
 */
async function dohAnswers(resolver: string, name: string, type: 'A' | 'CNAME'): Promise<boolean> {
  try {
    const url = `${resolver}?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
    if (!res.ok) return false;
    const data = (await res.json()) as { Answer?: unknown[] };
    return Array.isArray(data.Answer) && data.Answer.length > 0; // ANY answer = record exists
  } catch {
    return false;
  }
}

/**
 * Poll PUBLIC DoH resolvers until a freshly-provisioned host resolves, or the
 * deadline passes. Queries BOTH `1.1.1.1` and `dns.google` for `type=A` AND
 * `type=CNAME`; "live" = any non-empty `Answer` on EITHER resolver (a proxied
 * CNAME yields a CNAME answer and/or CF-edge A records).
 *
 * ADVISORY ONLY — this proves the record EXISTS at a public resolver. It NEVER
 * throws: on timeout it returns `{ ready: false, readyAt: null }`. The caller
 * (the app-subdomain provision route) MUST still return HTTP 200 on a timeout —
 * the CF resources + DB row already exist; propagation lag is not a failure.
 */
export async function pollSubdomainLive(
  hostname: string,
  { intervalMs = 1000, timeoutMs = 12000 } = {},
): Promise<{ ready: boolean; readyAt: number | null }> {
  const deadline = Date.now() + timeoutMs;
  const resolvers = ['https://1.1.1.1/dns-query', 'https://dns.google/resolve'];
  while (Date.now() < deadline) {
    const checks = resolvers.flatMap((r) => [dohAnswers(r, hostname, 'A'), dohAnswers(r, hostname, 'CNAME')]);
    if ((await Promise.all(checks)).some(Boolean)) return { ready: true, readyAt: Date.now() };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ready: false, readyAt: null }; // advisory: record exists, just not propagated to public resolver yet
}
