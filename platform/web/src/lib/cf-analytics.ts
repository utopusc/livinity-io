/**
 * WS3 — Cloudflare GraphQL Analytics client (read-only egress metering).
 *
 * Single-purpose companion to lib/cf-saas.ts (which owns the REST provisioning
 * API). This module hits the GraphQL Analytics endpoint to sum per-hostname
 * egress bytes for the bandwidth meter.
 *
 * Endpoint:  POST https://api.cloudflare.com/client/v4/graphql
 * Auth:      Authorization: Bearer <CF_API_TOKEN>
 * Zone:      process.env.CF_ZONE_ID_LIVINITY_IO  (zoneTag)
 *
 * Dataset: httpRequestsAdaptiveGroups — the adaptive sampling HTTP request
 * dataset. We filter by clientRequestHTTPHost + a datetime window and sum
 * `sum.edgeResponseBytes` (bytes Cloudflare's edge returned to clients =
 * egress, the quantity the 1 TB cap meters). The adaptive dataset is sampled;
 * Cloudflare scales sums by the sample interval so the returned value is an
 * estimate of true volume — accurate enough for a soft cap.
 *
 * Posture mirrors cf-saas.ts: 5s per-call timeout, bearer auth, structured
 * logging. BUT this is strictly best-effort — it NEVER throws. Any non-200,
 * network error, GraphQL `errors[]`, or missing env returns null so the
 * dashboard/cron never break because analytics is flaky. Callers treat null as
 * "unknown / no data this round".
 */

const CF_GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const PER_CALL_TIMEOUT_MS = 5000;

interface GraphQLResponse {
  data?: {
    viewer?: {
      zones?: Array<{
        httpRequestsAdaptiveGroups?: Array<{
          sum?: { edgeResponseBytes?: number | null } | null;
        }> | null;
      }> | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string }> | null;
}

// httpRequestsAdaptiveGroups: sampled adaptive dataset. `sum.edgeResponseBytes`
// is the edge→client byte count (egress). We don't group by any dimension —
// the host filter already scopes the query — so a single summed row comes back.
const QUERY = `
query HostnameBytes($zoneTag: String!, $host: String!, $since: Time!, $until: Time!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequestsAdaptiveGroups(
        limit: 1
        filter: {
          clientRequestHTTPHost: $host
          datetime_geq: $since
          datetime_leq: $until
        }
      ) {
        sum {
          edgeResponseBytes
        }
      }
    }
  }
}`;

// CF's httpRequestsAdaptiveGroups dataset REJECTS a query window wider than 1w1d
// (8 days) with a `quota` error → the whole fetch returns null. So a month-to-
// date query (up to 31 days) silently fails after the 8th of each month. Cap
// each request at 7 days and sum across chunks (see fetchHostnameBytes).
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** One ≤8-day window — the raw CF GraphQL call. null on any error (best-effort). */
async function fetchWindowBytes(
  hostname: string,
  sinceISO: string,
  untilISO: string,
  token: string,
  zoneTag: string,
): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);

  try {
    const res = await fetch(CF_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { zoneTag, host: hostname, since: sinceISO, until: untilISO },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[cf-analytics] ${hostname} -> HTTP ${res.status} ${text.slice(0, 200)}`);
      return null;
    }

    const json = (await res.json()) as GraphQLResponse;

    if (json.errors && json.errors.length > 0) {
      console.warn(
        `[cf-analytics] ${hostname} GraphQL errors:`,
        json.errors.map((e) => e?.message).join('; '),
      );
      return null;
    }

    const groups = json.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
    if (!Array.isArray(groups) || groups.length === 0) {
      // No traffic in window — legitimately zero, not an error.
      return 0;
    }

    const bytes = groups[0]?.sum?.edgeResponseBytes;
    return typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0;
  } catch (err) {
    clearTimeout(timer);
    const e = err as Error;
    console.warn(`[cf-analytics] ${hostname} fetch failed: ${e?.message ?? String(err)}`);
    return null;
  }
}

/**
 * Sum egress bytes (edge→client) for a single hostname over a datetime window
 * of ANY width. Windows wider than the dataset's 1w1d cap are split into ≤7-day
 * chunks and summed, so callers (month-to-date billing, 24h abuse-scan) don't
 * have to care about the limit.
 *
 * @param hostname e.g. "alice.livinity.io"
 * @param sinceISO ISO-8601 start (inclusive), e.g. "2026-06-01T00:00:00Z"
 * @param untilISO ISO-8601 end (inclusive), e.g. now
 * @returns total bytes, or null on any failure / missing config (best-effort).
 *          A null from ANY chunk ⇒ null overall (no misleading partial total —
 *          the next sweep retries; ON CONFLICT keeps the last good value).
 */
export async function fetchHostnameBytes(
  hostname: string,
  sinceISO: string,
  untilISO: string,
): Promise<number | null> {
  const token = process.env.CF_API_TOKEN;
  const zoneTag = process.env.CF_ZONE_ID_LIVINITY_IO;
  if (!token || !zoneTag) {
    console.warn(
      '[cf-analytics] missing CF_API_TOKEN or CF_ZONE_ID_LIVINITY_IO — skipping bandwidth fetch',
    );
    return null;
  }

  const sinceMs = Date.parse(sinceISO);
  const untilMs = Date.parse(untilISO);

  // Unparseable / non-positive range, or already within the cap → one call.
  if (
    Number.isNaN(sinceMs) ||
    Number.isNaN(untilMs) ||
    untilMs <= sinceMs ||
    untilMs - sinceMs <= MAX_WINDOW_MS
  ) {
    return fetchWindowBytes(hostname, sinceISO, untilISO, token, zoneTag);
  }

  // Wider than 8 days → sum 7-day chunks.
  let total = 0;
  for (let cursor = sinceMs; cursor < untilMs; cursor += MAX_WINDOW_MS) {
    const chunkEnd = Math.min(cursor + MAX_WINDOW_MS, untilMs);
    const bytes = await fetchWindowBytes(
      hostname,
      new Date(cursor).toISOString(),
      new Date(chunkEnd).toISOString(),
      token,
      zoneTag,
    );
    if (bytes === null) return null;
    total += bytes;
  }
  return total;
}
