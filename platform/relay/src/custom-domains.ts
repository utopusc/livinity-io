/**
 * Custom Domain Lookup & Redis Cache Layer
 *
 * Provides Redis-cached domain authorization for the Caddy on_demand_tls ask
 * endpoint.  Verified/active custom domains get certificates provisioned;
 * unverified or unknown domains are rejected.
 *
 * Redis key prefixes:
 *   relay:custom-domain:{hostname}       -> JSON CustomDomainInfo | "null"
 *   relay:custom-domain-auth:{domain}    -> "1" | "0"
 */

import type { Redis } from 'ioredis';
import type pg from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomDomainInfo {
  userId: string;
  username: string;
  domain: string;
  status: string;
  appMapping: Record<string, string>;  // Phase 09: domain-to-app mapping
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'relay:custom-domain:';
const AUTH_CACHE_PREFIX = 'relay:custom-domain-auth:';

/** Positive-result cache lifetime in seconds. */
const POSITIVE_TTL_S = 60;

/** Negative-result cache lifetime in seconds (prevents repeated DB queries). */
const NEGATIVE_TTL_S = 30;

/** Status values that count as "authorized for TLS". */
const AUTHORIZED_STATUSES = ['dns_verified', 'active'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Given a hostname like `blog.mysite.com`, return the parent domain
 * `mysite.com`.  Returns `null` when the hostname has two or fewer labels
 * (e.g. `mysite.com` has no meaningful parent to check).
 */
function getParentDomain(hostname: string): string | null {
  const parts = hostname.split('.');
  // "blog.mysite.com" -> ["blog","mysite","com"] -> "mysite.com"
  if (parts.length <= 2) return null;
  return parts.slice(1).join('.');
}

// ---------------------------------------------------------------------------
// lookupCustomDomain
// ---------------------------------------------------------------------------

/**
 * Full domain lookup returning user info.  Checks Redis first, then falls
 * back to a DB query joining `custom_domains` with `users`.
 *
 * Also checks the parent domain (first label stripped) so that subdomains
 * of a verified custom domain inherit authorization.
 */
export async function lookupCustomDomain(
  pool: pg.Pool,
  redis: Redis,
  hostname: string,
): Promise<CustomDomainInfo | null> {
  const lower = hostname.toLowerCase();

  // 1. Try exact hostname from cache
  const cached = await redis.get(`${CACHE_PREFIX}${lower}`);
  if (cached !== null) {
    return cached === 'null' ? null : (JSON.parse(cached) as CustomDomainInfo);
  }

  // 2. DB lookup (exact hostname)
  const info = await queryDomainInfo(pool, lower);
  if (info) {
    await redis.set(`${CACHE_PREFIX}${lower}`, JSON.stringify(info), 'EX', POSITIVE_TTL_S);
    return info;
  }

  // 3. Parent domain fallback (e.g. blog.mysite.com -> mysite.com)
  const parent = getParentDomain(lower);
  if (parent) {
    // Check parent cache first
    const parentCached = await redis.get(`${CACHE_PREFIX}${parent}`);
    if (parentCached !== null) {
      const parentInfo = parentCached === 'null' ? null : (JSON.parse(parentCached) as CustomDomainInfo);
      // Cache the child mapping too (positive or negative)
      if (parentInfo) {
        await redis.set(`${CACHE_PREFIX}${lower}`, JSON.stringify(parentInfo), 'EX', POSITIVE_TTL_S);
      } else {
        await redis.set(`${CACHE_PREFIX}${lower}`, 'null', 'EX', NEGATIVE_TTL_S);
      }
      return parentInfo;
    }

    const parentInfo = await queryDomainInfo(pool, parent);
    if (parentInfo) {
      await redis.set(`${CACHE_PREFIX}${parent}`, JSON.stringify(parentInfo), 'EX', POSITIVE_TTL_S);
      await redis.set(`${CACHE_PREFIX}${lower}`, JSON.stringify(parentInfo), 'EX', POSITIVE_TTL_S);
      return parentInfo;
    }
    // Cache parent as negative too
    await redis.set(`${CACHE_PREFIX}${parent}`, 'null', 'EX', NEGATIVE_TTL_S);
  }

  // 4. Negative cache for exact hostname
  await redis.set(`${CACHE_PREFIX}${lower}`, 'null', 'EX', NEGATIVE_TTL_S);
  return null;
}

/**
 * Query the DB for a custom domain, joining with users to get the username.
 */
async function queryDomainInfo(
  pool: pg.Pool,
  domain: string,
): Promise<CustomDomainInfo | null> {
  const result = await pool.query<{
    user_id: string;
    username: string;
    domain: string;
    status: string;
    app_mapping: Record<string, string> | null;
  }>(
    `SELECT cd.user_id, u.username, cd.domain, cd.status, cd.app_mapping
     FROM custom_domains cd
     JOIN users u ON u.id = cd.user_id
     WHERE cd.domain = $1
       AND cd.status = ANY($2)
     LIMIT 1`,
    [domain, AUTHORIZED_STATUSES],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    userId: row.user_id,
    username: row.username,
    domain: row.domain,
    status: row.status,
    appMapping: row.app_mapping || {},
  };
}

// ---------------------------------------------------------------------------
// isCustomDomainAuthorized
// ---------------------------------------------------------------------------

/**
 * Lightweight authorization check for the Caddy ask endpoint.  Returns a
 * simple boolean cached in Redis.
 *
 * Checks both the exact hostname and its parent domain.
 */
export async function isCustomDomainAuthorized(
  pool: pg.Pool,
  redis: Redis,
  domain: string,
): Promise<boolean> {
  const lower = domain.toLowerCase();

  // 1. Check auth cache for exact domain
  const cached = await redis.get(`${AUTH_CACHE_PREFIX}${lower}`);
  if (cached !== null) return cached === '1';

  // 2. DB check for exact domain
  const authorized = await queryDomainAuthorized(pool, lower);
  if (authorized) {
    await redis.set(`${AUTH_CACHE_PREFIX}${lower}`, '1', 'EX', POSITIVE_TTL_S);
    return true;
  }

  // 3. Parent domain fallback
  const parent = getParentDomain(lower);
  if (parent) {
    const parentCached = await redis.get(`${AUTH_CACHE_PREFIX}${parent}`);
    if (parentCached !== null) {
      const parentAuth = parentCached === '1';
      await redis.set(`${AUTH_CACHE_PREFIX}${lower}`, parentAuth ? '1' : '0', 'EX', parentAuth ? POSITIVE_TTL_S : NEGATIVE_TTL_S);
      return parentAuth;
    }

    const parentAuthorized = await queryDomainAuthorized(pool, parent);
    if (parentAuthorized) {
      await redis.set(`${AUTH_CACHE_PREFIX}${parent}`, '1', 'EX', POSITIVE_TTL_S);
      await redis.set(`${AUTH_CACHE_PREFIX}${lower}`, '1', 'EX', POSITIVE_TTL_S);
      return true;
    }
    await redis.set(`${AUTH_CACHE_PREFIX}${parent}`, '0', 'EX', NEGATIVE_TTL_S);
  }

  // 4. Negative cache
  await redis.set(`${AUTH_CACHE_PREFIX}${lower}`, '0', 'EX', NEGATIVE_TTL_S);
  return false;
}

/**
 * Simple DB existence check for authorized domains.
 */
async function queryDomainAuthorized(
  pool: pg.Pool,
  domain: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM custom_domains
     WHERE domain = $1
       AND status = ANY($2)
     LIMIT 1`,
    [domain, AUTHORIZED_STATUSES],
  );
  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// warmDomainCache
// ---------------------------------------------------------------------------

/**
 * Pre-populate Redis cache with all verified/active custom domains.
 * Called once on relay startup.
 */
export async function warmDomainCache(
  pool: pg.Pool,
  redis: Redis,
): Promise<void> {
  const result = await pool.query<{
    user_id: string;
    username: string;
    domain: string;
    status: string;
    app_mapping: Record<string, string> | null;
  }>(
    `SELECT cd.user_id, u.username, cd.domain, cd.status, cd.app_mapping
     FROM custom_domains cd
     JOIN users u ON u.id = cd.user_id
     WHERE cd.status = ANY($1)`,
    [AUTHORIZED_STATUSES],
  );

  const pipeline = redis.pipeline();
  for (const row of result.rows) {
    const info: CustomDomainInfo = {
      userId: row.user_id,
      username: row.username,
      domain: row.domain,
      status: row.status,
      appMapping: row.app_mapping || {},
    };
    pipeline.set(`${CACHE_PREFIX}${row.domain}`, JSON.stringify(info), 'EX', POSITIVE_TTL_S);
    pipeline.set(`${AUTH_CACHE_PREFIX}${row.domain}`, '1', 'EX', POSITIVE_TTL_S);
  }
  await pipeline.exec();

  console.log(`[relay] Warmed cache for ${result.rows.length} custom domain(s)`);
}

// ---------------------------------------------------------------------------
// invalidateDomainCache
// ---------------------------------------------------------------------------

/**
 * Remove both cache keys for a domain.  Called when a domain's status
 * changes (verification result, removal, etc.).
 */
export async function invalidateDomainCache(
  redis: Redis,
  domain: string,
): Promise<void> {
  const lower = domain.toLowerCase();
  await redis.del(`${CACHE_PREFIX}${lower}`, `${AUTH_CACHE_PREFIX}${lower}`);
}

// ---------------------------------------------------------------------------
// resolveCustomDomainApp
// ---------------------------------------------------------------------------

/**
 * Given a hostname and a CustomDomainInfo, resolve the target app slug
 * from the domain's appMapping.
 *
 * For "mysite.com" with appMapping {"root": "code-server", "blog": "ghost"}:
 *   hostname "mysite.com" -> "code-server" (root mapping)
 *   hostname "blog.mysite.com" -> "ghost" (subdomain prefix mapping)
 *   hostname "unknown.mysite.com" -> null (no mapping)
 */
export function resolveCustomDomainApp(
  hostname: string,
  domainInfo: CustomDomainInfo,
): string | null {
  const lower = hostname.toLowerCase();
  const baseDomain = domainInfo.domain.toLowerCase();

  if (lower === baseDomain) {
    return domainInfo.appMapping['root'] || null;
  }

  if (lower.endsWith(`.${baseDomain}`)) {
    const prefix = lower.slice(0, -(baseDomain.length + 1));
    // Only support single-level prefix (e.g., "blog", not "a.blog")
    if (!prefix.includes('.')) {
      return domainInfo.appMapping[prefix] || null;
    }
  }

  return null;
}
