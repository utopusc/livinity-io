# Phase 258 — Research: Public App Access behind a forward_auth gate

**Date:** 2026-06-03 · Cited, real-world patterns (no assumptions).

## Cal.com (the driving example) — two-layer auth
- Public route group `(booking-page-wrapper)` — NO session check: `/[user]`, `/[user]/[type]`, `/[user]/[type]/embed`, `/booking/[uid]`, `/booking-successful/[uid]`, `/d/[link]/[slug]`, plus public APIs `/api/book/event`, `/api/book/recurring-event`, `/api/trpc/public/*`, `/api/trpc/slots/*`, `/api/trpc/availability/*`, `/api/integrations/*/webhook`.
- Auth route group `(use-page-wrapper)/(main-nav)` — calls `getServerSession`, redirects to `/auth/login`: `/event-types`, `/bookings/*`, `/availability`, `/apps`, `/settings/*`, `/settings/.../admin/*`.
- **Key insight:** Cal.com has its OWN auth for the dashboard. Even if LivOS drops its forward_auth on the subdomain, `/settings`+`/event-types` stay protected by Cal's own login; only the booking pages work anonymously. → "expose subdomain + rely on app's own auth" is valid for apps with `hasOwnAuth`.
- Source: github.com/calcom/cal.com `apps/web/app/(booking-page-wrapper)/layout.tsx` (no session) vs `(use-page-wrapper)/(main-nav)/layout.tsx` (`getServerSession`).

## Caddy carve-out pattern (LivOS generates Caddy programmatically → this fits)
**Mutually-exclusive `handle` blocks** (maintainer-recommended; first match wins):
```caddyfile
<app-user>.livinity.io {
    handle /booking* {
        request_header -Remote-User
        request_header -Remote-Role
        request_header -X-Daemon-Bearer
        reverse_proxy <container>:<port>
    }
    handle /[a-z]* {            # /username booking landing (Cal.com)
        request_header -Remote-User
        request_header -Remote-Role
        request_header -X-Daemon-Bearer
        reverse_proxy <container>:<port>
    }
    handle {                   # default catch-all = GATED (unchanged 256-04)
        forward_auth localhost:8080 { uri /auth/verify?app=<id>; copy_headers Remote-User Remote-Role }
        request_header X-Daemon-Bearer "<bearer>"
        reverse_proxy <container>:<port>
    }
}
```
Alt (negation matcher): `@protected not path /book/* …; forward_auth @protected …` — works but the `not path` list grows; `handle` blocks are clearer and let each block control headers independently.
- **Caddy CVE-2026-30851 / GHSA-7r4p-vjf4-gxv4:** `copy_headers` didn't strip client-supplied same-name headers (priv-esc) in v2.10.0–2.11.1; **fixed v2.11.2** (LivOS is on 2.11.2). Still: any header the gated block sets manually (e.g. `X-Daemon-Bearer`) is NOT auto-cleared in a public block → must explicitly `request_header -X-Daemon-Bearer` in every public block.

## Selective-bypass models in other gateways (for reference)
- **Authelia** `access_control` rules: `policy: bypass` for booking regex resources, then `one_factor` catch-all (top-to-bottom, first match).
- **Authentik** Proxy Provider "Unauthenticated Paths" (Golang regex) — but bug #6563: only one provider's value applies with multiple providers. Caddy handle-blocks avoid this.
- **oauth2-proxy** `skip_auth_routes = ["GET=^/book", "POST=^/api/book/"]` (method-scoped).

## How self-hosted platforms do "make app public"
- **YunoHost (closest model):** permission system with a `visitors` group (= public) + `protected` flag (app author marks `/admin` permission un-publishable). Runtime toggle (`yunohost user permission update myapp.main --add visitors`), no reinstall. Path-level via `conf.json.persistent` `"public": true` + `re:` regex URIs. **Adopt this: `visitors`-style toggle + `protected`/`neverPublic` flag.**
- **Cloudron:** `proxyAuth` manifest addon with `!/path` single-exclusion; auth baked at INSTALL time, no runtime toggle ("reinstall to change"). No operator "make public" UI → an explicit product gap LivOS can leapfrog with a dynamic toggle.
- **Runtipi:** whole-app "expose" only, no per-path, relies on app's own auth, generic security warning.
- **Coolify/Umbrel:** no per-path public; Umbrel has no public toggle at all.
- **Cloudflare Access:** path-scoped `Bypass` policy as a separate, narrowly-scoped app object; docs: "Bypass disables ALL security controls — scope as narrowly as possible."

## Security guardrails real products enforce (→ LivOS hard requirements)
1. **Never-public app classes:** Docker/container UIs (Portainer, Dozzle), shells (ttyd/Cockpit), DNS/network admin (AdGuard/Pi-hole admin), secret managers, the platform admin itself. → LivOS `neverPublic: true` manifest flag; toggle hidden/disabled.
2. **Strip the daemon bearer + identity headers on public routes** (LivOS-specific, critical). The `X-Daemon-Bearer` LivOS injects (Phase 253/256-04 login-gate+daemon-bearer apps) is high-privilege → it must be `request_header -X-Daemon-Bearer` in every public block; never injected on a public route.
3. **Default-private, opt-in** (never opt-out).
4. **Warn when `hasOwnAuth:false`/unknown** before making public (no fallback auth for admin surfaces).
5. **Whole-app-public forbidden for daemon-bearer/host-access apps** — enforced server-side, not just UI.

## Recommended granularity
- Default: whole-app private (256-04 unchanged).
- Level 1 — whole-app public (apps with strong own auth: Cal.com/Gitea/Vaultwarden; manifest `hasOwnAuth:true`).
- Level 2 — per-path public (Cal.com booking pages, status pages): manifest `publicAccess.paths`.

## Sources (selected)
Cal.com route groups (github.com/calcom/cal.com) · Caddy forward_auth docs + community handle-block thread · GHSA-7r4p-vjf4-gxv4 · Authelia access_control · Authentik proxy provider (#6563) · oauth2-proxy skip_auth_routes · Cloudron proxyAuth (docs.cloudron.io) · YunoHost permissions (doc.yunohost.org) · Runtipi expose · Cloudflare Access app-paths. (Full URLs in the phase research brief.)
