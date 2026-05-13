# Phase 112: WebApp Subdomain Gateway Proxy Fix (n8n routing) - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Fix livinityd's subdomain gateway middleware so requests to `<app>.<domain>` (e.g. `n8n.test.livinity.live`) are proxied to the per-app container (e.g. `127.0.0.1:5678`) instead of serving livinityd's own UI. Currently DNS wildcard + Caddy TLS resolve correctly to livinityd, but livinityd returns its own dashboard HTML for every subdomain — making every installed WebApp unreachable from the browser.

**Driver:** v34 mainserver UAT (2026-05-13T22:03Z) — wildcard `*.test.livinity.live` DNS + LE cert + Caddy `reverse_proxy 127.0.0.1:8080` all verified green, `livos:domain:subdomains` Redis has the `n8n` entry, but `curl -H "Host: n8n.test.livinity.live" http://127.0.0.1:8080` returns livinityd's CSP-stamped UI HTML instead of n8n's homepage. Hypothesis: gateway middleware in `livos/packages/livinityd/source/server/index.ts:150-200` reads `domainInfo.appMapping[subPrefix]` from `livos:custom_domain:*` namespace but NOT `livos:domain:subdomains` (where actual subdomain → app/port mappings live). Two systems are not wired together. Without this fix, every WebApp install ends with "container running but browser can't reach it" — blocks v34 App Store end-to-end.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting (`workflow.skip_discuss=true`). Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Locked Constraints (from ROADMAP)
- **D-112-NO-CADDY-CHANGE:** Caddy config is correct. Don't touch Caddyfile or DNS — fix is purely livinityd middleware.
- **D-112-NO-LIVOS-AUTH-BYPASS:** subdomain proxy still passes through livinityd auth (session cookie / API key) for apps that require it. Public apps (n8n with own auth) pass through unauthenticated only if the app's own manifest declares `public: true`.
- **D-112-SACRED-SHA-UNTOUCHED:** `sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` not in scope.

### Direction (from ROADMAP)
- **Investigate first** (no code changes until root cause confirmed): trace gateway middleware end-to-end against the Redis keys actually used by `apps.ts installForUser()` and the subdomain registration path. Identify exactly where the lookup diverges from the registration.
- **Fix the lookup mismatch:** either (a) make gateway consult `livos:domain:subdomains` alongside `livos:custom_domain:*`, or (b) ensure subdomain registrations also write into the namespace gateway already reads. Pick whichever matches existing patterns better (zero schema drift if avoidable).
- **Live UAT on mainserver:** restart livinityd → reload `n8n.test.livinity.live` in browser → see n8n's actual UI (not livinityd's dashboard) → install another app → its subdomain also works.

</decisions>

<code_context>
## Existing Code Insights

**Suspect files** (to be confirmed by Plan-phase research):
- `livos/packages/livinityd/source/server/index.ts:150-200` — gateway middleware
- `livos/packages/livinityd/source/modules/apps.ts` — `installForUser()` writes subdomain registration
- Redis key namespaces: `livos:domain:subdomains` (registered apps) vs `livos:custom_domain:*` (custom-domain mappings)

**Reference handoff:** `.planning/v34-HANDOFF-2026-05-13.md` Issue 2 documents the symptom + curl evidence.

**Recent related commits:**
- `e6e57e7f` fix(v34): appToUrl preserves full hostname for custom domains — fixed Bug A (frontend was mis-stripping subdomain); current Bug B is backend gateway.

</code_context>

<specifics>
## Specific Ideas

**Live evidence to reproduce on mainserver before any fix:**
```bash
ssh root@154.53.56.75 'curl -sIL -m 5 -H "Host: n8n.test.livinity.live" http://127.0.0.1:8080 | head -10'
# Currently returns: HTTP/1.1 200 + livinityd CSP headers (wrong)
# Expected after fix: HTTP/1.1 200/302 with n8n response (or proxy upstream headers)
```

**Redis verification commands:**
```bash
ssh root@154.53.56.75 'source /opt/livos/.env && redis-cli -a "${REDIS_PASSWORD:-LivRedis2024!}" --no-auth-warning HGETALL livos:domain:subdomains'
ssh root@154.53.56.75 'source /opt/livos/.env && redis-cli -a "${REDIS_PASSWORD:-LivRedis2024!}" --no-auth-warning KEYS "livos:custom_domain:*"'
```

</specifics>

<deferred>
## Deferred Ideas

- Multi-tenant per-user subdomain routing (e.g. `bruce.n8n.domain` style) — out of scope for this hotfix; current single-user mainserver assumption is sufficient.
- WebSocket upgrade handling for the proxied apps — only if Plan-phase research surfaces an n8n-specific WS requirement; otherwise punt to Phase 110 or v34.x.

</deferred>
