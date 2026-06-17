// GET /api/cron/reconcile-dns — Phase 283 QUOTA-03/04.
//
// Daily reconciliation of the SHARED livinity.io Cloudflare zone:
//
//   QUOTA-04 — capacity alarm: if the zone is at/over 80% of its DNS-record cap,
//     email the operator. A FULL shared zone blocks provisioning for EVERY user,
//     so we want a warning long before that.
//
//   QUOTA-03 — orphan sweep: find per-user tunnel CNAMEs the platform created
//     but no longer tracks (a deleted user whose best-effort CF teardown failed;
//     a partial app-provision where the DB insert + CF rollback both failed) and
//     clean them up. DESTRUCTIVE, so it is REPORT-ONLY by default — it only
//     deletes when DNS_RECONCILE_DELETE=true AND the record is older than the
//     grace window (so an in-flight provision is never raced). Classification
//     lives in lib/dns-reconcile (pure, unit-tested).
//
// Auth = Vercel Cron `Authorization: Bearer ${CRON_SECRET}` (see vercel.json),
// same posture as enforce-subscriptions.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { cfClient, CfApiError } from '@/lib/cf-saas';
import { classifyOrphans } from '@/lib/dns-reconcile';
import { sendOpsAlertEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Shared-zone DNS-record cap. Cloudflare's default per-zone limit is ~1000 on
// lower plans; set CF_ZONE_DNS_LIMIT to match the actual plan. Alarm at 80%.
const DEFAULT_ZONE_DNS_LIMIT = 1000;
const ALARM_FRACTION = 0.8;
// Never delete a record younger than this — an in-flight provision may not have
// written its DB row yet. Override with DNS_RECONCILE_GRACE_HOURS.
const DEFAULT_GRACE_HOURS = 24;

/** Read a positive-integer env var, falling back to a default. */
function intEnv(name: string, dflt: number): number {
  const raw = process.env[name];
  if (!raw) return dflt;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[reconcile-dns] CRON_SECRET is not set');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const deleteMode = process.env.DNS_RECONCILE_DELETE === 'true';
  const zoneLimit = intEnv('CF_ZONE_DNS_LIMIT', DEFAULT_ZONE_DNS_LIMIT);
  const graceMs = intEnv('DNS_RECONCILE_GRACE_HOURS', DEFAULT_GRACE_HOURS) * 3_600_000;

  // 1. Enumerate the whole zone (paginated through the shared rate limiter).
  let records;
  let truncated = false;
  try {
    const enumResult = await cfClient.listAllDnsRecords();
    records = enumResult.records;
    truncated = enumResult.truncated;
  } catch (err) {
    console.error('[reconcile-dns] zone enumeration failed:', err);
    return NextResponse.json({ error: 'CF enumeration failed (see logs)' }, { status: 502 });
  }

  // 2. Build the DB-tracked sets: every live record id + every live tunnel id.
  const knownRecordIds = new Set<string>();
  const knownTunnelIds = new Set<string>();
  try {
    const apex = await pool.query<{ cf_dns_record_id_apex: string }>(
      'SELECT cf_dns_record_id_apex FROM users WHERE cf_dns_record_id_apex IS NOT NULL',
    );
    for (const r of apex.rows) knownRecordIds.add(r.cf_dns_record_id_apex);

    const apps = await pool.query<{ cf_dns_record_id: string }>(
      'SELECT cf_dns_record_id FROM user_app_subdomains WHERE cf_dns_record_id IS NOT NULL',
    );
    for (const r of apps.rows) knownRecordIds.add(r.cf_dns_record_id);

    const tunnels = await pool.query<{ cf_tunnel_id: string }>(
      'SELECT cf_tunnel_id FROM users WHERE cf_tunnel_id IS NOT NULL',
    );
    for (const r of tunnels.rows) knownTunnelIds.add(r.cf_tunnel_id);
  } catch (err) {
    console.error('[reconcile-dns] DB known-set query failed:', err);
    return NextResponse.json({ error: 'DB query failed (see logs)' }, { status: 500 });
  }

  // 3. Classify (pure).
  const result = classifyOrphans({
    records,
    knownRecordIds,
    knownTunnelIds,
    now: Date.now(),
    graceMs,
  });

  // 4. QUOTA-04 capacity gauge. A TRUNCATED enumeration forces the alarm: the
  //    count is then only a floor, so a clamp must never read as "healthy".
  const usageFraction = zoneLimit > 0 ? result.total / zoneLimit : 0;
  const alarm = truncated || usageFraction >= ALARM_FRACTION;

  // 5. QUOTA-03 deletion. Aged orphans only, behind the env flag — AND only the
  //    'deleted-user-tunnel' class (the record's tunnel matches NO live user, so
  //    nobody is served by it). 'untracked-on-live-tunnel' records sit on a LIVE
  //    user's tunnel and may be a transient restore/provision artifact the
  //    duplicate-recovery path will re-adopt, so we NEVER auto-delete them — they
  //    are reported for the operator to review. (Adversarial-review hardening.)
  const deletable = result.agedOrphans.filter((o) => o.reason === 'deleted-user-tunnel');
  const heldForReview = result.agedOrphans.filter((o) => o.reason === 'untracked-on-live-tunnel');
  const deleted: string[] = [];
  const deleteErrors: string[] = [];
  if (deleteMode) {
    for (const o of deletable) {
      try {
        await cfClient.deleteDnsRecord(o.id);
        deleted.push(o.name);
        console.info(`[reconcile-dns] DELETED orphan ${o.name} (${o.id}, ${o.reason})`);
      } catch (err) {
        if (err instanceof CfApiError && err.code === 404) {
          deleted.push(o.name); // already gone — count as resolved
          continue;
        }
        console.error(`[reconcile-dns] delete failed for ${o.name} (${o.id}):`, err);
        deleteErrors.push(o.name);
      }
    }
  }

  // 6. Email the operator only when there's something actionable (no spam on a
  //    clean day). idempotencyKey is keyed to the UTC day + condition so a cron
  //    retry within 24h can't double-send the same alert.
  const dayKey = new Date().toISOString().slice(0, 10);
  if (alarm || result.orphans.length > 0) {
    const blocks: string[] = [
      `<p style="color:#555;line-height:1.6;">Zone <b>livinity.io</b>: <b>${result.total}${truncated ? '+' : ''}</b> / ${zoneLimit} DNS records (${Math.round(usageFraction * 100)}%).${
        truncated
          ? ' <b style="color:#b00020;">⚠ Enumeration TRUNCATED — true count is higher; raise CF_ZONE_DNS_LIMIT / investigate.</b>'
          : alarm
            ? ' <b style="color:#b00020;">⚠ Over 80% — provisioning is at risk.</b>'
            : ''
      }</p>`,
    ];
    if (result.orphans.length > 0) {
      const sample = result.orphans
        .slice(0, 25)
        .map((o) => `<li>${o.name} — ${o.reason}${o.aged ? ' (aged)' : ' (within grace)'}</li>`)
        .join('');
      const more = result.orphans.length > 25 ? `<li>…and ${result.orphans.length - 25} more</li>` : '';
      blocks.push(
        `<p style="color:#555;line-height:1.6;"><b>${result.orphans.length}</b> orphaned tunnel record(s); <b>${result.agedOrphans.length}</b> past grace ` +
          `(<b>${deletable.length}</b> auto-deletable [deleted-user-tunnel], <b>${heldForReview.length}</b> held for manual review [untracked-on-live-tunnel]).${
            deleteMode
              ? ` <b>${deleted.length}</b> deleted this run.`
              : ' (report-only — set DNS_RECONCILE_DELETE=true to auto-clean the deletable ones.)'
          }</p><ul style="color:#555;font-size:13px;margin:0;">${sample}${more}</ul>`,
      );
    }
    try {
      await sendOpsAlertEmail(
        truncated
          ? `Livinity DNS zone enumeration truncated (>=${result.total})`
          : alarm
            ? `Livinity DNS zone ${Math.round(usageFraction * 100)}% full`
            : `Livinity DNS: ${result.orphans.length} orphan record(s)`,
        blocks.join(''),
        `reconcile-dns:${dayKey}:${alarm ? 'alarm' : 'orphans'}`,
      );
    } catch (err) {
      console.error('[reconcile-dns] ops alert email failed:', err);
    }
  }

  console.info(
    `[reconcile-dns] done: total=${result.total}${truncated ? '(truncated)' : ''}/${zoneLimit} ` +
      `tunnelBacked=${result.tunnelBackedTotal} orphans=${result.orphans.length} aged=${result.agedOrphans.length} ` +
      `deletable=${deletable.length} heldForReview=${heldForReview.length} deleteMode=${deleteMode} ` +
      `deleted=${deleted.length} errors=${deleteErrors.length} alarm=${alarm}`,
  );

  return NextResponse.json({
    total: result.total,
    truncated,
    zoneLimit,
    usagePct: Math.round(usageFraction * 100),
    alarm,
    tunnelBacked: result.tunnelBackedTotal,
    orphans: result.orphans.length,
    agedOrphans: result.agedOrphans.length,
    deletable: deletable.length,
    heldForReview: heldForReview.length,
    deleteMode,
    deleted,
    deleteErrors,
    orphanSample: result.orphans
      .slice(0, 50)
      .map((o) => ({ name: o.name, id: o.id, reason: o.reason, aged: o.aged })),
  });
}
