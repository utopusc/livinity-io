# Phase 133 Context — Kill Server5 Tunnel Default + Custom-Domain-Only Hero

**Created:** 2026-05-17 — discovered as Phase 132 carry-over during pushed
install.sh verification. User explicitly directed: *"Hiç bir şekilde
Server5'deki tunnel'i kullansın istemiyorum"* (no user should ever use
the Server5 tunnel relay).

## Why This Phase Exists

After Phase 132 shipped, user reported the platform dashboard's hero
widget at `https://livinity.io/dashboard` showed:

```
Online · ready when you are
Hey, lucylu.
your computer is awake.
lucylu.livinity.io
[ Open my computer ] [ Profile ]
```

…even though the user had completed a **hybrid-mode install with a
custom domain**. The `lucylu.livinity.io` URL is the Server5 tunnel
relay fallback — the user does NOT want this surface to exist.

**Stated intent:** custom domains are the canonical surface. Server5
tunnel relay is dead to the UI. Users with no custom domain configured
should see an install-pending empty state, NOT a fake tunnel URL.

## Root Cause Diagnosis (read-only probe 2026-05-17)

### Bug A — Wizard never persists the chosen domain

`/opt/platform/web/src/app/api/account/api-keys/route.ts` (the POST
handler the wizard's "Generate API Key" button hits) only mints an
API key. It does NOT touch `custom_domains` even when the wizard
emits `--mode hybrid --domain <user-domain>`. So after Generate:

- Wizard emits a one-liner with the correct `--domain` flag ✓
- VPS install runs hybrid mode correctly + Caddy provisions LE cert
  for `<user-domain>` ✓
- **Platform's `custom_domains` table stays empty for this user** ✗
- Platform never learns about the user's chosen domain

Verified via DB peek for `lucylu`:
```
SELECT u.username, cd.domain, cd.status FROM users u
  LEFT JOIN custom_domains cd ON cd.user_id = u.id
  WHERE u.username = 'lucylu';

 username | domain | status
----------+--------+--------
 lucylu   |        |       ← empty
```

### Bug C — Wizard domain input doesn't auto-prepend username

User-reported 2026-05-17: in the wizard's hybrid mode, the "Domain"
input field is a single free-text input. The user has to type the
full `${subdomain}.${parent}.${tld}` string by hand. There's no
auto-prefill from the logged-in username.

v34 vision (per `project_v34_account_tunnel_marketplace_vision` memory)
is `{user}.{domain}.{tld}` — so the wizard SHOULD pre-fill the
subdomain with `${username}` and let the user type only the parent
domain (e.g. `bruceoz.com`) after the dot.

Minimal UX fix: pre-fill the existing domain field with `${username}.`
when the user lands on hybrid mode (one-time pre-fill, fully editable
afterwards so users who want a different subdomain can override).

This shares a file (`dashboard-install.html`) with Bug A's fix, so
it folds into Plan 133-01 to avoid a duplicate deploy.

### Bug B — Dashboard hero hard-codes `${username}.livinity.io`

`/opt/landing/livinity.io/dashboard.html:707`:

```js
const url = username + ".livinity.io";
// ... later:
<div className="hero-url"><span>{url}</span> ... copy("https://" + url)
<a href={"https://" + url}>Open my computer</a>
```

The dashboard ALSO has a "Custom Domains" card (lines 829-842) that
loads `custom_domains` and lists them. But the hero widget is locked
to the tunnel-mode URL and never consults custom_domains.

So even if Bug A were fixed (custom_domain registered), the hero
would still show the tunnel URL. Both fixes are required to
materialize the user's intent.

## What This Phase Does NOT Touch

- **Server5 Caddy `*.livinity.io` wildcard routing** — out of scope.
  If a user manually types `lucylu.livinity.io` they may still land
  on the relay; this phase only removes that URL from the platform
  UI surfaces. Future v35+ work can rip out the relay entirely.
- **The 3 non-hybrid install modes** (`mode-cloud`, `mode-local-lan`,
  `mode-tunnel`) — these are valid install flows the user may still
  use; only the platform's tunnel-as-default-display is being killed.
- **Phase 132's UAT walk** — still pending; that ships separately.

## Sub-plans

| # | Plan | Bug | Files | autonomous |
|---|------|-----|-------|------------|
| 1 | 133-01 | A + C | Server5 `/opt/platform/web/src/app/api/account/api-keys/route.ts` (Bug A handler) + `/opt/landing/livinity.io/dashboard-install.html` (Bug A fetch body + Bug C subdomain pre-fill) + `pm2 restart web` | true |
| 2 | 133-02 | B + lucylu hotfix | Server5 `/opt/landing/livinity.io/dashboard.html` (live edit, no service restart) + DB INSERT for lucylu's chosen domain | false (needs operator to confirm lucylu's chosen domain string) |
| 3 | 133-03 | UAT | Operator walks fresh-user end-to-end (Flow A/B/C/D — D covers Bug C subdomain pre-fill) | false |

Plans 133-01 + 133-02 touch different files (`dashboard-install.html`
vs `dashboard.html`) and can ship in parallel. Bug C folds into
Plan 133-01 because it shares `dashboard-install.html` with Bug A's
wizard wiring change — one edit, one deploy.

## Acceptance Criteria (final-UAT in 133-03)

Pass criteria:
- New user registers → wizard → lands on hybrid mode → domain input
  is **pre-filled with `${username}.`** (their logged-in username
  followed by a dot, cursor positioned for them to type the parent
  domain).
- User types parent domain (e.g. `bruceoz.com`) after the dot →
  Generate API Key → DB shows new row in `custom_domains` with the
  full domain (`${username}.bruceoz.com`), status=`pending_dns`.
- Dashboard hero for THAT user shows their custom domain (or
  install-pending empty state if status=`pending_dns`). Never
  shows `${username}.livinity.io`.
- lucylu (existing user) sees her chosen domain in the hero after
  the operator INSERTs her domain row in 133-02.

Fail criteria (any → phase NOT complete):
- Hero shows `${username}.livinity.io` for ANY user with a configured custom_domain.
- New-user Generate doesn't INSERT into custom_domains.
- Wizard domain input is empty/free-text when user lands on hybrid mode (Bug C not closed).
- lucylu's hotfix INSERT errors (unique constraint, FK violation).

## Repo Decision (matches 132-01/02)

Both `/opt/landing/livinity.io/` and `/opt/platform/web/` are
**NOT git repositories** on Server5 (probed 2026-05-17 — same
state as 132). Edits are on-server-canonical; backups in
`*.bak-pre-133-XX-<timestamp>`. v35+ hardening: bring both trees
under git management.

## Sacred SHA Invariant

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
`liv/packages/core/src/sdk-agent-runner.ts` — preserved across
every commit in this phase. None of these plans touch repo source
files in `liv/`.

## Resume Command After /clear

> "Phase 133 başla — Server5 tunnel kill + custom-domain-only hero.
>  Read .planning/phases/133-.../133-CONTEXT.md. Run
>  /gsd-execute-phase 133-01 then 133-02 (needs operator to provide
>  lucylu's chosen domain), then operator walks 133-03 UAT."
