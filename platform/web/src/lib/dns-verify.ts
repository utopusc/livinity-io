import dns from 'node:dns/promises';
import crypto from 'node:crypto';

const RELAY_IP = '45.137.194.102';
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
    const verified = addresses.includes(RELAY_IP);
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
    const verified = addresses.includes(RELAY_IP);
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
