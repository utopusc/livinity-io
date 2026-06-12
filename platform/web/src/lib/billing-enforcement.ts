// Billing enforcement — actually cutting off (and restoring) an expired box.
//
// Why DNS-level and not deleteTunnel: once install.sh hands the box its
// connector token, cloudflared talks straight to the CF edge — the platform is
// out of the data path. Deleting the TUNNEL would mint a new token on
// re-subscribe, stranding the box with the old one (user would have to
// reinstall). Deleting only the DNS records (apex + per-app CNAMEs) kills
// `{username}.livinity.io` immediately but keeps the tunnel + token valid, so
// restore = re-create the CNAMEs and the running box comes back instantly.
//
// State machine (users.access_revoked_at):
//   NULL + active subscription   → normal
//   NULL + inactive              → cron revokes: delete DNS, set access_revoked_at
//   SET  + active subscription   → webhook/cron restores: re-create DNS, clear it
import pool from '@/lib/db';
import { cfClient, CfApiError } from '@/lib/cf-saas';

export interface EnforceableUser {
  id: string;
  username: string;
  cf_tunnel_id: string | null;
  cf_dns_record_id_apex?: string | null;
}

/** Delete a DNS record, treating "already gone" as success. */
async function deleteDnsRecordIdempotent(recordId: string): Promise<void> {
  try {
    await cfClient.deleteDnsRecord(recordId);
  } catch (err) {
    if (err instanceof CfApiError && err.code === 404) return;
    throw err;
  }
}

/**
 * Create a CNAME → tunnel record, reusing an existing record if CF reports a
 * duplicate (partial previous restore / drift).
 */
async function ensureDnsRecord(name: string, content: string): Promise<string> {
  try {
    const { dns_record_id } = await cfClient.createDnsRecord({
      type: 'CNAME',
      name,
      content,
      proxied: true,
    });
    return dns_record_id;
  } catch (err) {
    // The list lookup must not mask the original create error if it fails too.
    try {
      const existing = await cfClient.listDnsRecordsByName(`${name}.livinity.io`);
      const match = existing.find((r) => r.type === 'CNAME');
      if (match) return match.id;
    } catch (listErr) {
      console.warn(`[billing-enforce] duplicate-recovery list failed for ${name}:`, listErr);
    }
    throw err;
  }
}

/**
 * Revoke: delete the apex CNAME + every per-app CNAME, then stamp
 * access_revoked_at. The stamp is written LAST so a partial failure leaves the
 * user eligible for the next cron sweep (deletes are idempotent).
 */
export async function revokeUserAccess(user: EnforceableUser): Promise<void> {
  if (user.cf_dns_record_id_apex) {
    await deleteDnsRecordIdempotent(user.cf_dns_record_id_apex);
  }

  const apps = await pool.query<{ cf_dns_record_id: string }>(
    'SELECT cf_dns_record_id FROM user_app_subdomains WHERE user_id = $1',
    [user.id],
  );
  for (const row of apps.rows) {
    await deleteDnsRecordIdempotent(row.cf_dns_record_id);
  }

  await pool.query('UPDATE users SET access_revoked_at = NOW() WHERE id = $1', [user.id]);
  console.info(`[billing-enforce] revoked ${user.username} (apex + ${apps.rows.length} app records)`);
}

/**
 * Restore: re-create the apex CNAME + every per-app CNAME against the user's
 * still-alive tunnel, persist the new record ids, then clear
 * access_revoked_at. The clear is written LAST so a partial failure keeps the
 * user in the restore queue.
 */
export async function restoreUserAccess(user: EnforceableUser): Promise<void> {
  if (!user.cf_tunnel_id) {
    // Never provisioned — nothing DNS-side to restore.
    await pool.query('UPDATE users SET access_revoked_at = NULL WHERE id = $1', [user.id]);
    return;
  }

  const target = `${user.cf_tunnel_id}.cfargotunnel.com`;

  const apexId = await ensureDnsRecord(user.username, target);
  await pool.query('UPDATE users SET cf_dns_record_id_apex = $1 WHERE id = $2', [apexId, user.id]);

  const apps = await pool.query<{ id: string; subdomain: string }>(
    'SELECT id, subdomain FROM user_app_subdomains WHERE user_id = $1',
    [user.id],
  );
  for (const row of apps.rows) {
    const recordId = await ensureDnsRecord(row.subdomain, target);
    await pool.query('UPDATE user_app_subdomains SET cf_dns_record_id = $1 WHERE id = $2', [
      recordId,
      row.id,
    ]);
  }

  await pool.query('UPDATE users SET access_revoked_at = NULL WHERE id = $1', [user.id]);
  console.info(`[billing-enforce] restored ${user.username} (apex + ${apps.rows.length} app records)`);
}
