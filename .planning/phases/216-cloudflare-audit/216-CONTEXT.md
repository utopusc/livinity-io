# Phase 216: Cloudflare audit + automation — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true)

<domain>
## Phase Boundary

Document + automate CF DNS state. Today CF is DNS-only (no tunnel), Vercel handles edge. Live-audit per-user wildcard cert path post-migration.

**Effort:** 1-2 days.
**Requirements:** CF-01..05 (5 REQs).
**Depends on:** Phase 210.

### Success criteria
1. DNS state documented (CF-01).
2. Per-user wildcard cert path verified live; fixed within phase if broken (CF-02, CF-03).
3. Per-user subdomain provisioning works E2E with CF API (CF-04).

</domain>

<decisions>
## Implementation Decisions (autonomous mode)

### Live audit boundary
This session does NOT have `CF_API_TOKEN` env access. Live CF API queries (`/zones/<id>/dns_records`) cannot be executed from this repo state.

**Decision:** ship a thorough CF-AUDIT.md documenting **what is known + what to verify** + a runnable `scripts/cf-audit.sh` that the operator executes locally (with `CF_API_TOKEN` set) to:
- Enumerate current DNS records (zone livinity.io).
- Verify Vercel A/AAAA targets.
- Test wildcard cert serving via `openssl s_client`.
- Trace per-user subdomain provisioning end-to-end (register a test user → check CF record landed → curl the subdomain → verify cert chain).

Operator-walked execution = CF-02/03/04 live verification, lands in P217 walkthrough.

### Scope discipline
Tasks 1-3 + automation script ship in this session. Task 4 (Terraform/wrangler config) explicit "operator decides at audit time" — defer with a marker.

</decisions>

<code_context>
## Existing CF integration (from grep)

- `platform/web/src/lib/cf-saas.ts` — full CF SaaS API client: `provisionUserHostnames`, `provisionAppSubdomain`, `deprovisionAppSubdomain`, `deprovisionUser`, with rate-limiter (Bottleneck) and retry logic. Reads `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ZONE_ID_LIVINITY_IO` from env.
- `platform/web/src/app/api/auth/register/route.ts` — register flow calls `provisionUserHostnames(username)` after user creation → UPDATEs `users.cf_tunnel_id`, `cf_tunnel_token_encrypted`, `cf_dns_record_id_apex`, `cf_provisioned_at`.
- `platform/web/src/app/api/me/app-subdomain/[app_slug]/route.ts` — per-app subdomain provisioning (Phase 140-05 + 210 hyphen-format hardening).
- `platform/web/src/app/api/dashboard/route.ts` — reads `cf_provisioned_at` + `cf_tunnel_id` to render dashboard state.
- 3 users have rows in Supabase; we will check live which ones have `cf_provisioned_at != NULL`.

</code_context>

<specifics>
## Specific ideas

- CF-AUDIT.md sections: (a) Known topology, (b) Expected DNS records, (c) Live audit checklist with curl commands, (d) Per-user cert verification recipe, (e) Subdomain E2E trace, (f) Known unknowns.
- scripts/cf-audit.sh: bash script wrapping curl calls to CF API. Reads CF_API_TOKEN from env. Outputs structured JSON + human summary.

</specifics>

<deferred>
## Deferred

- **CARRY-P216-TERRAFORM** — declarative DNS state config (operator decision; not selected today).
- **CARRY-P216-LIVE-VERIFICATION** — actual execution of cf-audit.sh and recording results. Operator-walked in P217.

</deferred>
