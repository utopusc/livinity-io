/**
 * src/main/cloudflare/cf-schemas.ts
 *
 * One zod schema per Cloudflare API response shape. Every CF response must be run
 * through `.safeParse()` before being trusted — never `.parse()` (throws) at this
 * trust boundary. CF is untrusted input: a malicious, oversized, or unknown-enum
 * response must degrade to a safe default (`.passthrough()` for CF's extra fields,
 * `.catch()` for unknown enum values), never throw. Shapes are CF-doc-derived and
 * cross-checked against cf-local's live usage (03-RESEARCH.md Code Examples 3/5/6).
 *
 * Zero imports from ipc/ or tray/ — this module is a pure, unit-testable
 * main-process primitive (ARCHITECTURE.md hard isolation rule).
 */

import { z } from 'zod';

/** The CF zone status enum. Free-plan-safe: read the standard name_servers field, never the vanity variant (a paid-plan-only field). */
const ZoneStatus = z.enum(['active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated']);

/**
 * `GET /zones` list item. `account:{id}` is embedded on each zone (used main-side
 * for provisioning; never crosses IPC). Unknown `status` degrades to `'pending'`
 * (`.catch`) so an unlisted CF status routes to the safe NS-screen path.
 */
export const ZoneSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: ZoneStatus.catch('pending'),
    account: z.object({ id: z.string(), name: z.string().optional() }),
    name_servers: z.array(z.string()).optional(),
  })
  .passthrough();
export type Zone = z.infer<typeof ZoneSchema>;

export const ZoneListSchema = z.array(ZoneSchema);
export type ZoneList = z.infer<typeof ZoneListSchema>;

/**
 * `GET /zones/{id}` detail. `name_servers` defaults to `[]` when CF omits it
 * (free-plan-safe), so the NS screen always has an array to render.
 */
export const ZoneDetailSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: ZoneStatus.catch('pending'),
    name_servers: z.array(z.string()).default([]),
  })
  .passthrough();
export type ZoneDetail = z.infer<typeof ZoneDetailSchema>;

/** `GET /user/tokens/verify` — `result.status` gates the token-valid check. */
export const VerifySchema = z
  .object({
    result: z.object({
      id: z.string().optional(),
      status: z.enum(['active', 'disabled', 'expired']),
    }),
  })
  .passthrough();
export type Verify = z.infer<typeof VerifySchema>;

/** A single tunnel ingress rule; `service` is required, `hostname` absent on the catch-all. */
export const IngressEntrySchema = z.object({
  hostname: z.string().optional(),
  service: z.string(),
});
export type IngressEntry = z.infer<typeof IngressEntrySchema>;

/**
 * `GET .../configurations` — `config.ingress` may be absent on a brand-new tunnel.
 * The caller defaults a missing ingress to `[]` before the RMW merge (D-15).
 */
export const ConfigurationsSchema = z
  .object({
    config: z.object({ ingress: z.array(IngressEntrySchema).optional() }).optional(),
  })
  .passthrough();
export type Configurations = z.infer<typeof ConfigurationsSchema>;

/** `GET/POST /zones/{id}/dns_records` list item (D-08 collision read + D-16 CNAME create). */
export const DnsRecordSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    content: z.string(),
    proxied: z.boolean().optional(),
  })
  .passthrough();
export type DnsRecord = z.infer<typeof DnsRecordSchema>;

export const DnsRecordListSchema = z.array(DnsRecordSchema);
export type DnsRecordList = z.infer<typeof DnsRecordListSchema>;

/** `GET/POST /accounts/{id}/cfd_tunnel` list item (is_deleted filtered via query param, D-14). */
export const TunnelSchema = z.object({ id: z.string(), name: z.string() }).passthrough();
export type Tunnel = z.infer<typeof TunnelSchema>;

export const TunnelListSchema = z.array(TunnelSchema);
export type TunnelList = z.infer<typeof TunnelListSchema>;
