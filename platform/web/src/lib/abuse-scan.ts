// Pure risk classification for the daily abuse-scan (Phase 280/283 CFC-03).
//
// No I/O — the cron gathers raw signals (24h CF egress + reputation verdict) and
// this module turns them into flags + a risk level. Kept pure so the thresholds
// are unit-tested in isolation (abuse-scan.test.ts).

import type { Reputation } from '@/lib/reputation';

/** Default per-tenant egress ceiling before we flag a box (GB/day). A normal
 *  interactive desktop/app stream is well under this; sustained tens-of-GB/day
 *  egress is the signature of a box used as a CDN / file-share / relay. */
export const DEFAULT_EGRESS_GB_PER_DAY = 50;
export const BYTES_PER_GB = 1_000_000_000;

export interface RawSignal {
  /** Bytes the CF edge returned for the tenant in the last 24h. null ⇒ CF
   *  Analytics was unavailable (treated as "no egress signal", never flagged). */
  egress24hBytes: number | null;
  reputation: Reputation;
}

export type RiskLevel = 'ok' | 'watch' | 'high';

export interface RiskResult {
  egressFlagged: boolean;
  reputationFlagged: boolean;
  level: RiskLevel;
}

/**
 * Classify a tenant's raw signals.
 * - reputation 'flagged' (malware/phishing) ⇒ 'high' (most serious, act now).
 * - else egress over the limit ⇒ 'watch' (investigate, not auto-serious).
 * - else 'ok'.
 * A null egress reading is NEVER a flag (missing data, not zero/over).
 */
export function classifyRisk(signal: RawSignal, egressLimitBytes: number): RiskResult {
  const egressFlagged =
    signal.egress24hBytes !== null && signal.egress24hBytes > egressLimitBytes;
  const reputationFlagged = signal.reputation === 'flagged';

  let level: RiskLevel = 'ok';
  if (reputationFlagged) level = 'high';
  else if (egressFlagged) level = 'watch';

  return { egressFlagged, reputationFlagged, level };
}

/** Resolve the egress limit (bytes) from env, falling back to the default. */
export function egressLimitBytes(): number {
  const raw = process.env.ABUSE_EGRESS_GB_PER_DAY;
  const gb = raw ? Number(raw) : NaN;
  return (Number.isFinite(gb) && gb > 0 ? gb : DEFAULT_EGRESS_GB_PER_DAY) * BYTES_PER_GB;
}
