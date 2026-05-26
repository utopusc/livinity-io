# Cloudflare audit — `livinity.io` (Phase 216)

**Audited:** 2026-05-26 (code-side static audit; live execution = operator walk per P217).
**Zone:** `livinity.io` (`CF_ZONE_ID_LIVINITY_IO`)
**CF mode:** DNS-only (no proxy, no tunnel). Cloudflare resolves the name; Vercel terminates TLS for the apex; Server5 SaaS-style on-demand TLS handles `*.livinity.io` wildcards via the `cf-saas.ts` provisioning path.

## 1. Known topology

```
Browser
  └── Cloudflare DNS (livinity.io zone, *.livinity.io)
        ├── apex livinity.io / www.livinity.io
        │     └── A/AAAA → Vercel edge → platform/web Next.js
        │
        └── <user>.livinity.io / <user>-<app>.livinity.io
              └── CNAME → CF for SaaS (orange-cloud, custom hostname)
                    └── Server5 origin (`apps.livinity.io`)
                          └── Server5 relay → private tunnel → Mini PC livinityd
```

Important: Cloudflare is **DNS-only for apex** (Vercel needs unproxied). It IS proxied for `*.livinity.io` per-user hostnames (CF for SaaS custom hostnames). Don't conflate the two.

## 2. Expected DNS records (zone livinity.io)

| Type | Name | Expected target | Proxy | Owned by |
|---|---|---|---|---|
| A | `@` (apex) | Vercel `76.76.21.21` | DNS-only | Vercel/operator |
| AAAA | `@` | Vercel IPv6 | DNS-only | Vercel/operator |
| CNAME | `www` | `cname.vercel-dns.com` | DNS-only | Vercel/operator |
| CNAME | `apps` | Server5 IP (45.137.194.102) — DEPRECATED post-v37? | DNS-only | Server5 |
| CNAME | `*` (wildcard, custom hostnames) | created/managed by `cf-saas.ts` | Proxied | LivOS platform |
| MX | `@` | (operator email config) | DNS-only | operator |
| TXT | `_dmarc` | DMARC policy | DNS-only | operator |
| TXT | `@` | SPF | DNS-only | operator |
| TXT | varies | DKIM | DNS-only | operator |

## 3. Code-side state findings

### `users` table — CF columns (Supabase prod, 2026-05-26)

Live query:
```sql
SELECT username, cf_tunnel_id, cf_provisioned_at FROM users ORDER BY created_at;
```
Operator should run this to confirm which users have provisioned tunnels (NULL = never provisioned OR rolled back).

### CF API client (`platform/web/src/lib/cf-saas.ts`)

- Uses `CF_API_TOKEN` (Bearer), `CF_ACCOUNT_ID`, `CF_ZONE_ID_LIVINITY_IO`.
- Rate-limited via Bottleneck.
- Retries on 429/502/503/504 with jitter.
- Wraps 4 high-level operations: `provisionUserHostnames`, `provisionAppSubdomain`, `deprovisionAppSubdomain`, `deprovisionUser`.

### Subdomain canonical format (Phase 210)

Per `platform/relay/src/subdomain-parser.ts`: `<user>-<app>` (hyphen-separated) for app subdomains; `<user>` alone for the user root. Phase 210 hardened the hyphen split with 13 vitest cases (`commit 1b478f9a`).

## 4. Live audit checklist (operator-walked, P217)

Run the audit script:
```bash
export CF_API_TOKEN=...   # token with Zone.DNS read + Zone.Settings read
export CF_ZONE_ID_LIVINITY_IO=...
bash scripts/cf-audit.sh
```

The script reports:
- All DNS records in the zone with their targets + proxy state.
- Confirmation that apex A/AAAA point at Vercel.
- Confirmation that `*.livinity.io` wildcard is proxied (orange cloud).
- TLS handshake test against `bruce.livinity.io` (or another live user subdomain).
- Cert chain summary (issuer, expiry, SANs).
- DMARC/SPF/DKIM record presence.

Pass/fail rubric:

| Check | Pass criterion |
|---|---|
| Apex A | matches Vercel `76.76.21.21` |
| Apex AAAA | matches Vercel IPv6 |
| www CNAME | `cname.vercel-dns.com` |
| Wildcard `*.livinity.io` proxied | yes (orange) |
| TLS handshake on `<user>.livinity.io` | succeeds, cert SAN includes `*.livinity.io` OR exact user.livinity.io |
| Cert expiry | >7 days remaining |
| MX | present, non-empty target |
| SPF (TXT) | `v=spf1` present |
| DMARC (`_dmarc` TXT) | `v=DMARC1; p=` present |

## 5. Per-user wildcard cert path — verification recipe

For each user with `cf_provisioned_at != NULL`:

1. `dig +short <user>.livinity.io CNAME` → expect a CF for SaaS hostname.
2. `openssl s_client -connect <user>.livinity.io:443 -servername <user>.livinity.io < /dev/null 2>/dev/null | openssl x509 -noout -subject -dates -ext subjectAltName` — expect a valid cert chain, SAN covering the subdomain.
3. `curl -sI https://<user>.livinity.io` → expect 200 / 302 (or 503 if Mini PC offline — that's a relay-side state, not a CF cert issue).

If step 2 fails: cert provisioning broken — likely root cause is `cf_provisioned_at` updated to NOW() but the actual CF custom hostname row never landed. Fix: re-run `provisionUserHostnames(username)` from a Vercel admin endpoint. Tooling for this is **carried as CARRY-P216-REPROVISION-ENDPOINT** (not part of P216 scope — operator can run the existing register flow with the user's record cleared, OR use the existing `me/tunnel-token` path).

## 6. Subdomain provisioning E2E trace

```
[user clicks "Add app" in dashboard]
     ↓
POST /api/me/app-subdomain  (auth: session cookie)
     ↓ resolves user via getSession
     ↓ reads users.username, users.cf_tunnel_id
provisionAppSubdomain(opts)   in lib/cf-saas.ts
     ↓ POST /accounts/<acc>/cfd_tunnel/<tid>/configurations (add ingress route)
     ↓ POST /zones/<zone>/dns_records (CNAME <user>-<app>.livinity.io → tunnel)
     ↓ POST /accounts/<acc>/custom_hostnames (request cert)
INSERT user_app_subdomains (user_id, app_slug, host, dns_record_id, ...)
     ↓
return { host: "<user>-<app>.livinity.io" }
```

Acceptance for CF-04:
- All 4 CF API calls return 2xx.
- DB row exists in `user_app_subdomains` post-flow.
- `dig +short <user>-<app>.livinity.io` resolves within 30s of provisioning.
- `curl https://<user>-<app>.livinity.io` returns SOMETHING (200/302/503 — the cert path is what we are testing, not the upstream Mini PC).

## 7. Known unknowns (resolve in P217 operator walk)

- **Apex Vercel A/AAAA targets** — Vercel periodically rotates; operator should re-confirm current values from Vercel dashboard.
- **`apps.livinity.io` CNAME** — post-v37 cutover, this may be DEPRECATED (Server5 was retired as the store host; Vercel takes over). If still pointing at Server5, decide: leave for legacy OR remove.
- **SPF/DKIM/DMARC** — never directly managed by LivOS code. Operator can attest these are operator-config.
- **CF for SaaS cert quota** — CF for SaaS has cert issuance quotas. With 3 users today this is far from quota; document the limit for future planning.

## 8. Automation script

See `scripts/cf-audit.sh` (introduced by P216-T2). Plain bash + curl + jq. Operator runs locally with `CF_API_TOKEN` set. Output: human-readable section + machine-readable JSON dump in `cf-audit-<date>.json` for archiving.

## 9. Carries

- **CARRY-P216-LIVE-VERIFICATION** — actual run of cf-audit.sh + recording results. Operator-walked in P217.
- **CARRY-P216-TERRAFORM** — declarative DNS config (operator decision).
- **CARRY-P216-REPROVISION-ENDPOINT** — admin endpoint to re-run `provisionUserHostnames` if CF state drifted.
- **CARRY-P216-APPS-CNAME-DECISION** — keep or remove the `apps.livinity.io` CNAME after v37 cutover.
