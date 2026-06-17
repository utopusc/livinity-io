// DNS reconciliation — pure classifier for the QUOTA-03 orphan sweep.
//
// Phase 283 (v46.0). Every LivOS user gets CNAMEs in the SHARED livinity.io
// zone: an apex `{username}.livinity.io` and one `{app}-{username}.livinity.io`
// per installed app, each pointing at `{tunnel_id}.cfargotunnel.com`. The
// platform records the live record id in users.cf_dns_record_id_apex /
// user_app_subdomains.cf_dns_record_id.
//
// An ORPHAN is a zone record we (the platform) created but no longer track:
//   - a DELETED user whose best-effort CF teardown failed (the memory's
//     livinitydemo / jack / haribo* tunnels), OR
//   - a partial app-provision where the DB insert + CF rollback both failed
//     (see api/me/app-subdomain/route.ts — "operator runs the reconciler").
//
// Detection is conservative by construction — ONLY a CNAME whose content is a
// `*.cfargotunnel.com` target (exclusively our per-user records; the zone's
// apex A record, MX, Vercel CNAMEs, etc. are never touched) AND whose id is not
// in the DB-tracked set can ever be flagged. The cron only DELETES the `aged`
// subset (created longer ago than the grace window) so an in-flight provision
// whose DB write hasn't landed yet is never raced.
//
// This module is PURE (no CF, no DB) so the classification — the only risky
// part — is unit-tested in isolation (dns-reconcile.test.ts).

import type { DnsRecord } from '@/lib/cf-saas';

/** CF CNAME content suffix that marks a record as one of our tunnel records. */
export const TUNNEL_CONTENT_SUFFIX = '.cfargotunnel.com';

export type OrphanReason =
  /** content tunnel id matches no live user → the user was deleted. */
  | 'deleted-user-tunnel'
  /** tunnel still belongs to a live user, but this subdomain isn't tracked. */
  | 'untracked-on-live-tunnel';

export interface OrphanRecord {
  id: string;
  /** FQDN, e.g. `radarr-lucy.livinity.io`. */
  name: string;
  /** `<tunnel_id>.cfargotunnel.com`. */
  content: string;
  /** tunnel id parsed from `content`. */
  tunnelId: string;
  reason: OrphanReason;
  /** ms since creation, or null when CF omitted/garbled `created_on`. */
  ageMs: number | null;
  /** true ⇒ older than the grace window ⇒ eligible for deletion. */
  aged: boolean;
}

export interface ClassifyInput {
  records: DnsRecord[];
  /** users.cf_dns_record_id_apex ∪ user_app_subdomains.cf_dns_record_id. */
  knownRecordIds: Set<string>;
  /** users.cf_tunnel_id (live tunnels). */
  knownTunnelIds: Set<string>;
  /** Date.now() — injected so the classifier stays pure/testable. */
  now: number;
  /** deletion grace window in ms (record must be older than this to delete). */
  graceMs: number;
}

export interface ClassifyResult {
  /** every record in the zone (for the capacity gauge). */
  total: number;
  /** CNAME → *.cfargotunnel.com records (the per-user records we manage). */
  tunnelBackedTotal: number;
  /** tunnel-backed records whose id is NOT DB-tracked. */
  orphans: OrphanRecord[];
  /** subset of `orphans` past the grace window — the only deletable set. */
  agedOrphans: OrphanRecord[];
}

/** Extract the tunnel id from a CNAME content, or null if it isn't ours. */
export function parseTunnelId(content: string): string | null {
  if (!content.endsWith(TUNNEL_CONTENT_SUFFIX)) return null;
  const id = content.slice(0, -TUNNEL_CONTENT_SUFFIX.length);
  return id.length > 0 ? id : null;
}

export function classifyOrphans(input: ClassifyInput): ClassifyResult {
  const { records, knownRecordIds, knownTunnelIds, now, graceMs } = input;

  let tunnelBackedTotal = 0;
  const orphans: OrphanRecord[] = [];

  for (const rec of records) {
    // Gate 1: only CNAMEs whose content is one of our tunnel targets. Anything
    // else in the shared zone (apex A, MX, Vercel/verification CNAMEs) is out
    // of scope and can never be flagged, let alone deleted.
    if (rec.type !== 'CNAME') continue;
    const tunnelId = parseTunnelId(rec.content);
    if (tunnelId === null) continue;
    tunnelBackedTotal++;

    // Gate 2: a DB-tracked id is a live, legitimate record — skip it.
    if (knownRecordIds.has(rec.id)) continue;

    // Age: a missing/garbled created_on is treated as NOT aged (conservative —
    // reported for visibility, but never auto-deleted).
    let ageMs: number | null = null;
    if (rec.created_on != null) {
      const t = Date.parse(rec.created_on);
      if (!Number.isNaN(t)) ageMs = now - t;
    }
    const aged = ageMs !== null && ageMs >= graceMs;

    orphans.push({
      id: rec.id,
      name: rec.name,
      content: rec.content,
      tunnelId,
      reason: knownTunnelIds.has(tunnelId)
        ? 'untracked-on-live-tunnel'
        : 'deleted-user-tunnel',
      ageMs,
      aged,
    });
  }

  return {
    total: records.length,
    tunnelBackedTotal,
    orphans,
    agedOrphans: orphans.filter((o) => o.aged),
  };
}
