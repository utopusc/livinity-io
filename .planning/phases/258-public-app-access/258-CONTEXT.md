# Phase 258: Public App Access — Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Source:** Operator request (share-by-link for apps like Cal.com) + cited research (`258-RESEARCH.md`)

<domain>
## Phase Boundary

Add a **secure-by-default, opt-in** feature that lets an operator expose an app — or specific path prefixes of it — to the public internet WITHOUT the LivOS login, for share-by-link use cases (Cal.com booking pages, public status/landing pages, shared dashboards). Today the Phase 256-04 `forward_auth /auth/verify` gate protects EVERY app subdomain. This phase makes that gate selectively bypassable per app/path, with HARD guardrails so admin/host-access apps can never be exposed and the daemon bearer is never leaked onto a public route.

The whole point is the inverse of the 256/257 hardening, so the security interlocks are the spine of the phase — they are NOT optional polish.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Granularity (both modes — research-backed)
- Default: whole-app PRIVATE (256-04 unchanged — no regression for any existing app).
- `whole-app` public: drop the gated catch-all; for apps with their own auth (`hasOwnAuth:true`, e.g. Cal.com/Gitea/Vaultwarden).
- `paths` public: specific path prefixes public on an otherwise-gated subdomain (Cal.com booking pages, status pages). This is the primary Cal.com-driven mode.

### WS-A — Manifest + per-install config
- Manifest fields (`apps/schema.ts`): `publicAccess?: { mode: 'none'|'whole-app'|'paths'; paths?: string[]; hasOwnAuth?: boolean }` (app-author declared support + suggested public prefixes + own-auth signal) and `neverPublic?: true` (admin/host-access apps).
- Per-install operator setting (the chosen mode + effective paths) persisted in the app-instance config (where per-user app install state lives). This is the runtime toggle (no reinstall — beats Cloudron's install-time model).

### WS-B — Caddy emit (the carve-out)
- In `caddy.ts`, for a public-configured app emit **mutually-exclusive `handle` blocks** (research Method B): each public path prefix → `reverse_proxy` WITH `request_header -Remote-User -Remote-Role -X-Daemon-Bearer`; the catch-all `handle` keeps `forward_auth /auth/verify` + daemon-bearer injection unchanged. `whole-app` drops the gated block but KEEPS the header-strip block.
- Preserve the 256-04 forward_auth + the existing daemon-bearer injection for the GATED portion exactly.

### WS-C — Hard guardrails (server-side enforced, not just UI)
- An app is **PUBLIC-FORBIDDEN** if ANY of: `neverPublic:true`; injects the daemon bearer in its standard flow (256-04 login-gate+daemon-bearer apps); has `/var/run/docker.sock` / `privileged` / `network_mode:host`; or `requiresLocalAiClis`. The enable-public API REJECTS these (403); the UI hides/locks the toggle with a reason.
- The daemon bearer is **NEVER** injected into a public `handle` block; identity headers (`Remote-User`/`Remote-Role`) + `X-Daemon-Bearer` are stripped in every public block (Caddy ≥2.11.2 fixes copy_headers, but manually-set headers need explicit `-` delete — confirmed in RESEARCH).
- Default = private; opt-in only. The app OWNER (or an admin) may enable public access for their OWN non-forbidden app (it's their app/data) — not strictly admin-only, but never for forbidden apps. Interlocks with 257 WS-C sanitizer + 256-04 bearer path.

### WS-D — UX (Share dialog)
- A "Public access" section in the app Share/settings dialog: locked+disabled with a reason for `neverPublic`/forbidden apps; pre-filled suggested public paths from the manifest for `paths` mode; a `whole-app` toggle with a confirmation ("Anyone with the link can reach [app] without logging into LivOS. [App] has [its own / no detected] login. Continue?"); show the generated public URL after enabling. Runtime Caddy reload, no reinstall.

### Cross-cutting
- Mini PC only deploy (Server4/5 off-limits). Preserve ALL 256/257 gains + agent autonomy + curated apps. SC regression: apps without `publicAccess` behave EXACTLY as today.
- Follow repo test discipline (livinityd vitest; caddy.ts has `caddy.test.ts`). Add tests asserting: public block strips the bearer; forbidden apps rejected; gated catch-all unchanged.
</decisions>

<canonical_refs>
## Canonical References
- `258-RESEARCH.md` (this dir) — Cal.com route split, Caddy handle-block carve-out, the CVE/header-strip requirement, YunoHost/Cloudron/Cloudflare models, the never-public app classes.
- `livos/packages/livinityd/source/modules/domain/caddy.ts` + `caddy.test.ts` — the 256-04 forward_auth + daemon-bearer emit this phase extends. READ the current per-app-subdomain block emit first.
- `livos/packages/livinityd/source/modules/apps/schema.ts` — manifest schema (add `publicAccess`/`neverPublic`).
- `livos/packages/livinityd/source/modules/apps/apps.ts` + `routes.ts` — app install/config + the admin-gate (257 WS-C) + the daemon-bearer apps (256-04 commits `640b5717`/`4830a8a8`); the public-forbidden enforcement lives near here.
- `livos/packages/livinityd/source/modules/server/index.ts:~1188` — the `/auth/verify` forward_auth endpoint (256-04); the gated path keeps using it.
- `SECURITY-AUDIT.md` + `256-DEPLOY-LOG.md` — the daemon-bearer / docker.sock / requiresLocalAiClis app classes that are the never-public set.
</canonical_refs>

<specifics>
## Specific Ideas
- Suggested default `publicAccess.paths` for Cal.com (ship as the manifest example): `["/booking", "/booking-successful", "/d/", "/api/book", "/api/trpc/public", "/api/trpc/slots", "/api/trpc/availability", "/[a-z]"]` (the trailing `/[a-z]*` covers the `/username` landing — but order matters; the gated catch-all must remain LAST).
- The header-strip in public blocks is the single most important security line — make it a non-removable part of the emit (not driven by config).
- `neverPublic` detection should reuse the same signals 257 WS-C uses (docker.sock / privileged / requiresLocalAiClis) + the 256-04 daemon-bearer flag, so there is ONE source of truth for "privileged app".
</specifics>

<deferred>
## Deferred Ideas
- Rate-limiting / WAF / bot protection for public routes (future — public routes are unauthenticated attack surface).
- Per-visitor analytics on public links.
- Custom public domains (Runtipi-style mapping) — reuse the existing subdomain for now.
- Public-link expiry / one-time links.
</deferred>

---

*Phase: 258-public-app-access*
*Context gathered: 2026-06-03*
