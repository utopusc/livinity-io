# v42 Single-User Posture

> **What this is:** A reference doc recording v42's deliberate single-user posture decision, the v7.0 multi-user infrastructure preserved but inactive on Mini PC, and the open design questions deferred to v43.

## Decision

v42 ships single-user (operator = `bruce`) by default. All v7.0 multi-user code paths and database tables remain in the source tree and on the Mini PC database, but are not activated. The Settings → Users → Multi-user mode toggle exists in the UI but is gated behind a known prerequisite (see below).

## Rationale

The v42 milestone goal is replacing the legacy OpenClawOS chat surface with Liv Assistant (vendored upstream AionUi 2.1.4) — Phases 222 through 232. That scope is focused: vendor the upstream binary, wrap it in a systemd unit, wire Caddy `/liv` reverse-proxy + iframe-friendly CSP headers, mount it in the LivOS shell as a dock window, and verify the Claude subscription credential path. Re-activating multi-user mid-milestone would have added: (a) per-user Liv Assistant data isolation design work (open question — see Deferred section), (b) Caddy wildcard certificate setup blocked on `CF_API_TOKEN` configuration, (c) end-to-end multi-user UAT walk on Mini PC. Each of those is a self-contained workstream — handling them inside v42 would have diluted both. Phase 229 records the decision to keep them deferred so the rationale survives across resumes.

The v7.0 multi-user surfaces are preserved verbatim in source and on the Mini PC PostgreSQL database. Nothing was deleted. Activation is reversible by flipping the Settings UI toggle once the prerequisites are met.

## Preserved multi-user surfaces (v7.0 inventory)

| Surface | Location | State |
|---|---|---|
| PostgreSQL schema | `livos/packages/livinityd/source/modules/database/schema.sql` | shipped, applied, inactive |
| Tables | `users`, `sessions`, `user_preferences`, `system_settings`, `user_app_access`, `user_app_instances`, `invites` | present in `livos` database, admin row only |
| Admin auth resolver | `is-authenticated.ts` (`ctx.currentUser`) | resolves admin via legacy JWT mapping |
| RBAC enforcement | `adminProcedure` (role hierarchy: admin > member > guest) | shipped, single admin only |
| App sharing UI | `ShareAppDialog` component | shipped, no other users to share with |
| Login screen | `/login` route (avatar grid + password) | route exists, not currently the entry point |
| App gateway middleware | `server/index.ts` (Express subdomain interceptor) | shipped, single-user path active |
| Per-user Docker compose | `installForUser()` in `apps.ts` (unique containers / 10000+ ports / volumes) | shipped, single-user invocation only |
| tRPC route namespaces | `users.*`, `invites.*`, `userApps.*` | mounted, callable by admin |

The Liv Assistant systemd unit (`liv-assistant.service`, Phase 223-02) runs as `bruce` with `HOME=/home/bruce` and a single shared `/opt/liv-assistant/data/` dir (Phase 228-01 audit). Per-user isolation for the Liv Assistant surface is an open design question — see Deferred below.

## Deferred to v43

### Per-user Liv Assistant data isolation

Liv Assistant in v42 runs as one bruce-owned process at port 3020 with one shared data dir. Multi-user activation requires choosing how multiple operator personas isolate chat history, agent state, and per-user Claude credentials. Three concrete option sketches:

- **Option A — Shared dir (v42 status quo).** All users read/write `/opt/liv-assistant/data/`. Chat history co-mingles. Acceptable for "operator + family-trusted users" trust model, but breaks per-user isolation guarantees. No new infrastructure.
- **Option B — Per-user volume-mount + multi-instance.** One `liv-assistant@<user>.service` per active user via a systemd template unit, port-allocated (`3020 + N`), mounting `~/<user>/.liv-assistant/data/` as the data dir. Requires Caddy per-subdomain routing for the `/liv` handle (e.g. `/liv` on `<user>.livinity.io` proxies to that user's allocated port). Storage + port-coordination concern.
- **Option C — Upstream AionUi multi-tenant mode.** AionUi 2.1.4 may or may not support a native multi-tenant mode. Requires upstream feature audit (read upstream README + open issues + release notes) before commit. If supported, would reduce LivOS-side work to per-user auth-token passthrough on the existing single instance.

No option is selected. Phase 229 records the question.

### Per-user Claude subscription auth

v42 ships a single shared `/home/bruce/.claude/.credentials.json` (Phase 228-01 audit). Multi-user activation needs per-user credential paths under each `/home/<user>/.claude/`, with the per-user `liv-assistant@<user>.service` (Option B above) reading `$HOME/.claude/.credentials.json` per its own `HOME` env. Edge cases: a single Claude Max subscription cannot legally back multiple end-users — multi-user activation also implies each operator persona owns their own Claude subscription (or the operator decides their family-trusted users share one subscription, accepting the ToS implications). Phase 229 names the constraint; v43 picks a path.

### Caddy wildcard certificate + CF_API_TOKEN

Multi-user activation surfaces subdomain routes like `<user>.livinity.io`. Provisioning TLS for those requires either (a) a wildcard cert via DNS-01 challenge (needs `CF_API_TOKEN` exported into the Caddy systemd service env for the Cloudflare DNS provider module), or (b) per-subdomain on-demand TLS via HTTP-01 (already supported by Phase 19.0 custom-domain machinery, but each new user triggers a fresh Let's Encrypt request). The wildcard path is simpler and is the v7.0-era recommended setup, but the `CF_API_TOKEN` is not provisioned on Mini PC today.

### v43 announcement + migration runbook

When v43 ships, it needs: a posture announcement doc (mirroring this one but recording the activation decision), a migration runbook (operator steps to flip the toggle + provision `CF_API_TOKEN` + smoke-test per-user subdomain routing), and a rollback plan (how to revert to single-user if the activation goes sideways). None of those exist today.

## How to (eventually) enable multi-user

When the v43 prerequisites are met:

1. Provision `CF_API_TOKEN` in the Caddy systemd unit env (or via systemd `EnvironmentFile=` drop-in).
2. Pick one of Options A / B / C above for Liv Assistant data isolation; implement.
3. Pick a Claude subscription policy (per-user OAuth vs shared subscription with ToS acceptance); implement.
4. In LivOS UI, visit Settings → Users → Multi-user mode → toggle on.
5. Verify wildcard cert issuance: `curl -fsSI https://<new-user>.livinity.io/` after creating a new user via the invite flow.
6. Walk the v7.0 phase artifacts in `.planning/` for the original multi-user UAT steps (search for `multi-user` in the phase summaries — the v7.0 milestone shipped a full UAT walk).

## Related phases

- **Phase 228** (Claude auth bridge): shipped the audit that confirms the shared `/home/bruce/.claude/.credentials.json` path Liv Assistant reads today.
- **Phase 223** (vendor AionUi install): shipped the `liv-assistant.service` systemd unit, install runbook (`docs/liv-assistant-install.md`), and the single shared `/opt/liv-assistant/data/` dir.
- **Phase 226** (Caddy `/liv` proxy): shipped the iframe-friendly reverse proxy that today routes `bruce.livinity.io/liv` to the single shared Liv Assistant instance. Multi-user would extend this to per-subdomain `/liv` handles.
- **v7.0 milestone** (multi-user): the original ship that introduced the 7 PostgreSQL tables, the login screen, the invite system, the per-user Docker compose templating, and the app gateway middleware. All preserved.
