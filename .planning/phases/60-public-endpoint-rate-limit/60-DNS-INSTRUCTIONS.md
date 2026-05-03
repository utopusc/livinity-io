# 60-DNS-INSTRUCTIONS — Cloudflare DNS Record for `api.livinity.io`

**Created:** 2026-05-03 (during Phase 60 Wave 3 / plan 60-04 execution)
**Wave 0 Q1 verdict:** MANUAL DASHBOARD (no IaC, no API caller scripts in repo)
**Status at execution time:** **ALREADY EXISTS** — verified via two resolvers below. No manual click needed.

---

## Required record

| Field | Value |
|-------|-------|
| Type | `A` |
| Name | `api` |
| IPv4 address | `45.137.194.102` (Server5) |
| Proxy status | **DNS only** (gray cloud — NOT proxied) |
| TTL | 5 min (300 seconds) |

The `Name: api` field expands to `api.livinity.io` because the zone is `livinity.io`.

`Proxy status: DNS only` (gray cloud) is mandatory — preserves the established
`Cloudflare DNS-only → Server5 → tunnel` topology for `*.livinity.io`. Proxied mode
would flip Cloudflare into the request path and break Caddy's on-demand TLS pattern.

## Cloudflare dashboard click path

If creating from scratch:
1. Cloudflare dashboard → Select zone `livinity.io`
2. Left nav: **DNS → Records**
3. Click **Add record**
4. Type: `A`
5. Name: `api`
6. IPv4: `45.137.194.102`
7. Proxy status: click the orange cloud icon to make it **gray** (DNS only)
8. TTL: select `5 min` (or `300` seconds in numeric mode)
9. Click **Save**

## Verification (post-create OR pre-existence check)

```bash
# Wait ≥5 min for DNS propagation per RESEARCH.md Pitfall 6 (only if record was just added).
# If the record pre-existed (as it did at Wave 3 execution), no wait needed.
dig +short api.livinity.io @1.1.1.1
dig +short api.livinity.io @8.8.8.8
# Both must return: 45.137.194.102

openssl s_client -connect api.livinity.io:443 -servername api.livinity.io < /dev/null 2>&1 \
  | grep -E "(Verify return code|subject=)"
# Expected: Verify return code: 0 (ok); subject=CN=api.livinity.io
```

## Verification at Wave 3 execution time (2026-05-03 ~07:30 UTC)

Run from Server5 (`root@45.137.194.102`), single batched ssh:

```text
=== dig api.livinity.io @1.1.1.1 ===
45.137.194.102
=== dig api.livinity.io @8.8.8.8 ===
45.137.194.102
=== dig livinity.io @1.1.1.1 (sanity) ===
45.137.194.102
```

Both resolvers returned `45.137.194.102`. **DNS state at Wave 3 execution: COMPLETE.**

The record was clearly pre-created at some earlier date — supporting evidence:
- TLS certificate for `api.livinity.io` was issued **March 19, 2026** by Let's Encrypt (E8 issuer, expiring June 17, 2026). Caddy's on-demand TLS would only have issued this if the hostname was publicly resolvable at issuance time. So DNS has been in place since at least March 19.
- Pre-Phase-60 smoke `curl --resolve api.livinity.io:443:45.137.194.102 -k https://api.livinity.io/v1/messages` completed TLS handshake successfully (cert presented matched).

## Pre-DNS path proof

Even before relying on real DNS, the Caddy → relay → admin tunnel chain was proven via:

```bash
curl -v --resolve api.livinity.io:443:45.137.194.102 --max-time 10 -k https://api.livinity.io/v1/messages
```

Result (verbatim, 2026-05-03 ~07:28 UTC):
- TLS handshake **PASS** (TLSv1.3, ALPN h2, server certificate `CN=api.livinity.io`, LE E8 issuer)
- HTTP/2 stream OPENED for `/v1/messages`
- Request proceeded into the relay → admin tunnel dispatch (Wave 2 60-03 path)

This proves `Caddy api.livinity.io block → localhost:4000 → relay dispatch` works
end-to-end at the routing layer, independent of public DNS.

## What 60-04 SUMMARY records

- DNS mechanism used: **M (manual dashboard)** — Wave 0 Q1 verdict
- DNS record state: **ALREADY EXISTS** at execution time (pre-created, verified via 2 resolvers)
- TLS certificate: **ALREADY ISSUED** (LE E8, expires Jun 17, 2026)
- Manual click required by operator: **NONE** for this plan; if record is ever
  deleted, follow the click path above to recreate.

## If DNS record is ever lost / deleted

Follow the click path above; then re-verify via `dig` from two resolvers; then
verify TLS via `openssl s_client`. Caddy will re-issue cert on first
public-DNS request via on-demand TLS (Pitfall 5 — issued once, not iteratively).

---

*Wave 3 sub-task 2 documentation — Phase 60 plan 60-04*
