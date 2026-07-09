/**
 * src/main/cloudflare/cf-client.ts
 *
 * The typed Cloudflare API client: one thin verb method per CF endpoint this
 * phase needs, each routing through the bearer-token `callCf` transport
 * (./cf-http) and running its response through `.safeParse` (never `.parse`) at
 * the trust boundary (./cf-schemas). Ported from the two proven in-repo clients
 * (cf-saas.ts:383-446 tunnel recipes + cf-local.ts:247-284 ingress/DNS recipes),
 * so we do not re-introduce the lost-update / missing-catch-all / no-retry-on-4xx
 * bugs both existing clients already fixed.
 *
 * Structure mirrors platform/auth-client.ts's `getMe` shape (safeParse -> typed
 * value). A terminal HTTP error surfaces as a `CfApiError` thrown by `callCf`;
 * the orchestrators at 03-05/03-06 catch and classify it (per-scope verdict /
 * network screen). Read/list responses that fail to parse degrade to a safe empty
 * value; the id-bearing writes (createTunnel/getTunnelToken/createDnsCname) throw
 * a token-free CfApiError on an unparseable body rather than return a bad id.
 *
 * SECRET DISCIPLINE (T-03-01): the CF token is passed to `callCf` (header only)
 * and NEVER logged; every `logSafe` here carries scalars/counts/flags, never a
 * token, secret, or connector blob. `config_src:'cloudflare'` is MANDATORY on
 * create (a locally-managed tunnel silently ignores every ingress push, T-03-14);
 * the apex CNAME is `proxied:true` -> `<tunnel_id>.cfargotunnel.com` (apex-only,
 * D-13 — no wildcard). Every user-derived path segment is `encodeURIComponent`'d
 * before it enters a URL path (T-03-13).
 *
 * Zero imports from ipc/ or tray/ — a main-process primitive.
 */

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { callCf, CfApiError } from './cf-http';
import {
  VerifySchema,
  ZoneListSchema,
  ZoneDetailSchema,
  TunnelListSchema,
  ConfigurationsSchema,
  DnsRecordListSchema,
  type ZoneList,
  type TunnelList,
  type IngressEntry,
  type DnsRecordList,
} from './cf-schemas';
import { logSafe } from '../log';

/** A CF create/mutate result carrying the new object id (tunnel / dns_record). */
const IdResultSchema = z.object({ id: z.string() }).passthrough();
/** `GET .../token` returns the connector blob as a plain JSON string in `result`. */
const ConnectorStringSchema = z.string();

const MAX_ZONE_PAGES = 20;
const ZONES_PER_PAGE = 50;

/** Encode a single user-derived path segment before it enters a CF URL path. */
function seg(value: string): string {
  return encodeURIComponent(value);
}

/** A token-free error for a 2xx response whose body does not match its schema. */
function unexpectedShape(endpoint: string): CfApiError {
  return new CfApiError({
    message: `CF ${endpoint} returned an unexpected response shape`,
    status: 0,
    cfErrorCode: -1,
    cfMessage: 'unexpected response shape',
    endpoint,
  });
}

/**
 * `GET /user/tokens/verify` (Stage 0). alive = HTTP 200 AND result.status==='active'.
 * A terminal auth failure (401/403/404) resolves to `{ alive:false }` (the token is
 * not alive); a network/server failure (status 0 / 429 / 5xx) is re-thrown so the
 * orchestrator shows "couldn't reach Cloudflare", NOT "token invalid".
 */
export async function verifyToken(token: string): Promise<{ alive: boolean }> {
  try {
    const result = await callCf<unknown>(token, { method: 'GET', path: '/user/tokens/verify' });
    const parsed = VerifySchema.safeParse({ result });
    const alive = parsed.success && parsed.data.result.status === 'active';
    logSafe('cf.verify', { alive });
    return { alive };
  } catch (err) {
    if (err instanceof CfApiError && (err.status === 401 || err.status === 403 || err.status === 404)) {
      logSafe('cf.verify', { alive: false, status: err.status });
      return { alive: false };
    }
    throw err;
  }
}

/**
 * `GET /zones?per_page=50` (Zone·Read probe + dropdown source). Paginates by
 * page length (each zone embeds `account.id`, used main-side and never crossed to
 * the renderer). Most BYOD users have a single page; the loop is implemented but
 * usually runs once. Degrades to `[]` on an unparseable body.
 */
export async function getZones(token: string): Promise<ZoneList> {
  const collected: unknown[] = [];
  for (let page = 1; page <= MAX_ZONE_PAGES; page++) {
    const result = await callCf<unknown[]>(token, {
      method: 'GET',
      path: `/zones?per_page=${ZONES_PER_PAGE}&page=${page}`,
    });
    const items = Array.isArray(result) ? result : [];
    collected.push(...items);
    if (items.length < ZONES_PER_PAGE) break; // last (or only) page
  }
  const parsed = ZoneListSchema.safeParse(collected);
  const zones = parsed.success ? parsed.data : [];
  logSafe('cf.getZones', { count: zones.length });
  return zones;
}

/**
 * `GET /zones/{id}` (CF-04 nameserver screen source). Returns `status` +
 * `nameServers` (the free-plan-safe `name_servers[]`). Degrades to a safe
 * `pending` result on an unparseable body so the caller stays on the NS screen.
 */
export async function getZone(token: string, zoneId: string): Promise<{ status: string; nameServers: string[] }> {
  const result = await callCf<unknown>(token, { method: 'GET', path: `/zones/${seg(zoneId)}` });
  const parsed = ZoneDetailSchema.safeParse(result);
  if (!parsed.success) {
    logSafe('cf.getZone', { parseError: true });
    return { status: 'pending', nameServers: [] };
  }
  logSafe('cf.getZone', { status: parsed.data.status, nsCount: parsed.data.name_servers.length });
  return { status: parsed.data.status, nameServers: parsed.data.name_servers };
}

/**
 * `GET /accounts/{acct}/cfd_tunnel?is_deleted=false` (CF-05 reuse-by-name source).
 * Degrades to `[]` on an unparseable body (no reuse match -> a fresh tunnel is created).
 */
export async function listTunnels(token: string, acctId: string): Promise<TunnelList> {
  const result = await callCf<unknown>(token, {
    method: 'GET',
    path: `/accounts/${seg(acctId)}/cfd_tunnel?is_deleted=false`,
  });
  const parsed = TunnelListSchema.safeParse(result ?? []);
  const tunnels = parsed.success ? parsed.data : [];
  logSafe('cf.listTunnels', { count: tunnels.length });
  return tunnels;
}

/**
 * `POST /accounts/{acct}/cfd_tunnel` (CF-05). Generates a base64 32-byte
 * tunnel_secret and creates a REMOTELY-managed tunnel (`config_src:'cloudflare'`
 * is MANDATORY — a locally-managed tunnel silently ignores API ingress pushes).
 * The generated secret is never logged. Throws on an unparseable body (no id).
 */
export async function createTunnel(token: string, acctId: string, name: string): Promise<{ tunnelId: string }> {
  const secret = randomBytes(32).toString('base64');
  const result = await callCf<unknown>(token, {
    method: 'POST',
    path: `/accounts/${seg(acctId)}/cfd_tunnel`,
    body: { name, tunnel_secret: secret, config_src: 'cloudflare' },
  });
  const parsed = IdResultSchema.safeParse(result);
  if (!parsed.success) throw unexpectedShape(`POST /accounts/${acctId}/cfd_tunnel`);
  logSafe('cf.createTunnel', { created: true });
  return { tunnelId: parsed.data.id };
}

/**
 * `GET /accounts/{acct}/cfd_tunnel/{id}/token` (CF-05). CF returns the connector
 * blob as a plain JSON string in `result`. The returned string is a SECRET — it is
 * never logged. Throws on an unparseable body.
 */
export async function getTunnelToken(token: string, acctId: string, tunnelId: string): Promise<string> {
  const endpoint = `GET /accounts/${acctId}/cfd_tunnel/${tunnelId}/token`;
  const result = await callCf<unknown>(token, {
    method: 'GET',
    path: `/accounts/${seg(acctId)}/cfd_tunnel/${seg(tunnelId)}/token`,
  });
  const parsed = ConnectorStringSchema.safeParse(result);
  if (!parsed.success) throw unexpectedShape(endpoint);
  logSafe('cf.getConnector', { fetched: true });
  return parsed.data;
}

/**
 * `GET /accounts/{acct}/cfd_tunnel/{id}/configurations` (CF-06 RMW read half).
 * Returns `config.ingress` (or `[]` on a brand-new tunnel / unparseable body).
 */
export async function getIngress(token: string, acctId: string, tunnelId: string): Promise<IngressEntry[]> {
  const result = await callCf<unknown>(token, {
    method: 'GET',
    path: `/accounts/${seg(acctId)}/cfd_tunnel/${seg(tunnelId)}/configurations`,
  });
  const parsed = ConfigurationsSchema.safeParse(result);
  const ingress = parsed.success ? parsed.data.config?.ingress ?? [] : [];
  logSafe('cf.getIngress', { count: ingress.length });
  return ingress;
}

/**
 * `PUT /accounts/{acct}/cfd_tunnel/{id}/configurations` (CF-06 RMW write half).
 * The merged ingress (already catch-all-terminated by merge-ingress) is pushed
 * verbatim inside `{ config: { ingress } }`.
 */
export async function putIngress(
  token: string,
  acctId: string,
  tunnelId: string,
  ingress: IngressEntry[]
): Promise<void> {
  await callCf<unknown>(token, {
    method: 'PUT',
    path: `/accounts/${seg(acctId)}/cfd_tunnel/${seg(tunnelId)}/configurations`,
    body: { config: { ingress } },
  });
  logSafe('cf.putIngress', { count: ingress.length });
}

/**
 * `GET /zones/{zone}/dns_records?name=<name>` (D-08 collision guard). The `name`
 * is `encodeURIComponent`'d into the query. Degrades to `[]` on an unparseable body.
 */
export async function listDnsByName(token: string, zoneId: string, name: string): Promise<DnsRecordList> {
  const result = await callCf<unknown>(token, {
    method: 'GET',
    path: `/zones/${seg(zoneId)}/dns_records?name=${encodeURIComponent(name)}`,
  });
  const parsed = DnsRecordListSchema.safeParse(result ?? []);
  const records = parsed.success ? parsed.data : [];
  logSafe('cf.listDns', { count: records.length });
  return records;
}

/**
 * `POST /zones/{zone}/dns_records` (CF-06, apex-only per D-13). Creates ONE proxied
 * CNAME `<apexHost>` -> `<tunnelId>.cfargotunnel.com` (`proxied:true` is required
 * for a tunnel). `apexHost` is a single apex host — a wildcard host is never
 * constructed (D-13). Throws on an unparseable body (no id).
 */
export async function createDnsCname(
  token: string,
  zoneId: string,
  apexHost: string,
  tunnelId: string
): Promise<{ id: string }> {
  const result = await callCf<unknown>(token, {
    method: 'POST',
    path: `/zones/${seg(zoneId)}/dns_records`,
    body: { type: 'CNAME', name: apexHost, content: `${tunnelId}.cfargotunnel.com`, proxied: true, ttl: 1 },
  });
  const parsed = IdResultSchema.safeParse(result);
  if (!parsed.success) throw unexpectedShape(`POST /zones/${zoneId}/dns_records`);
  logSafe('cf.createDns', { created: true });
  return { id: parsed.data.id };
}

/**
 * `DELETE /zones/{zone}/dns_records/{id}` — used ONLY by the D-08 take-over path
 * (the phase's single destructive external write, gated behind the checkbox +
 * disabled-red-button UI). Never called otherwise.
 */
export async function deleteDnsRecord(token: string, zoneId: string, id: string): Promise<void> {
  await callCf<unknown>(token, { method: 'DELETE', path: `/zones/${seg(zoneId)}/dns_records/${seg(id)}` });
  logSafe('cf.deleteDns', { deleted: true });
}
