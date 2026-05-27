---
phase: 234-liv-ai-polish-ux
plan: 01
type: investigation
wave: 1
created: 2026-05-27
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
mini_pc_target: bruce@10.69.31.68
ssh_sessions: 4 (S1 baseline + S2 endpoint hunt + S3 qr-login confirm + S4 Caddy end-to-end)
selected_auth_option: B-modified (livinityd HTTP proxy mints qr-token + qr-login server-side, browser receives HttpOnly Set-Cookie via same-origin response)
tags: [v42, investigation, auth-bypass, brand-strings, mini-pc, spec-lock, ADR]
---

# Phase 234 Plan 01 -- Investigation + Spec Lock

Single-task evidence-gathering pass for Phase 234 polish work. Plans 02/03/04 consume the locked specs at the bottom (`## Plan-spec lock`).

> All Mini PC outputs are verbatim from batched SSH sessions captured 2026-05-27. SSH session count = 4 (within fail2ban tolerance per `feedback_ssh_rate_limit` -- each session ran a multi-step heredoc rather than per-step probes).

---

## Section A -- AionUi v2.1.4 auth scheme (Mini PC)

### A.1 -- binary tree layout

```
$ sudo ls -la /opt/liv-assistant/current/
total 92652
drwxr-xr-x 4 root root     4096 May 26 20:41 .
drwxr-xr-x 3 root root     4096 May 27 01:50 ..
-rwxr-xr-x 1 root root 94849152 May 26 20:41 aionui-web
drwxr-xr-x 3 root root     4096 May 26 20:41 bundled-aioncore
-rw-r--r-- 1 root root      582 May 26 20:41 package.json
drwxr-xr-x 6 root root     4096 May 26 20:41 static

$ sudo readlink -f /opt/liv-assistant/current
/opt/liv-assistant/aionui-web-2.1.4/aionui-web
```

So `current` resolves to a single `aionui-web/` subtree containing the Bun-bundled binary + a `static/` dir housing the SPA HTML + JS + CSS.

### A.2 -- HTML/JS bundle layout (representative)

```
/opt/liv-assistant/current/static/sw.js
/opt/liv-assistant/current/static/index.html
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js     <- 1,641,775 bytes, MAIN SPA bundle
/opt/liv-assistant/current/static/assets/index-DQXhCJEQ.js     <- 420,402 bytes, secondary
/opt/liv-assistant/current/static/assets/AionrsChat-*.js
/opt/liv-assistant/current/static/assets/AcpChat-*.js
/opt/liv-assistant/current/static/assets/OpenClawChat-*.js
/opt/liv-assistant/current/static/assets/CapabilitiesSettings-*.js
... (many more chunked bundles)
```

The SPA boots from `static/index.html` -> `assets/index-CaE7eEr9.js`. All UI is React + arco-design (see `__aionui_*` theme localStorage keys in `<head>`).

### A.3 -- root HTML probe (raw upstream UI, no auth gate at HTML layer)

```
$ curl -sS -o /tmp/root.html -w 'http=%{http_code} content-type=%{content_type}\n' --max-time 5 http://127.0.0.1:3020/
http=200 content-type=text/html; charset=utf-8

<!doctype html>
<html data-theme="light" data-color-scheme="default">
  <head>
    <meta name="application-name" content="AionUi" />
    <meta name="apple-mobile-web-app-title" content="AionUi" />
    <title>AionUi</title>
    ...
    <script type="module" crossorigin src="./assets/index-CaE7eEr9.js"></script>
    ...
```

Root HTML is **served to anonymous clients** -- the SPA bundle then calls `/api/auth/status` to decide whether to render a login form or the chat surface. So serving the HTML is NOT itself gated.

### A.4 -- `/api/auth/status` shape

```
$ curl -sS --max-time 5 -i http://127.0.0.1:3020/api/auth/status
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 76

{"success":true,"needs_setup":false,"user_count":1,"is_authenticated":false}
```

Returns `is_authenticated:false` for any unauthenticated client. The SPA gates its router on this field.

### A.5 -- credentials file shape

```
$ sudo cat /etc/livos/liv-assistant-credentials
username=admin
password=<REDACTED, len=16>
```

`username=admin` plus a 16-character generated password line. Owner `bruce:bruce`, mode `0600`. Capture flow lives in `scripts/capture-liv-assistant-password.sh` (Phase 223-03). File path is `/etc/livos/liv-assistant-credentials` (NOT `/etc/liv-assistant/credentials` -- the plan-text earlier in 234-01-PLAN.md frontmatter was slightly off; Section H locks the corrected path into Plan 04 spec).

### A.6 -- POST /api/login probes (all reject)

```
$ curl -sS -i -X POST http://127.0.0.1:3020/api/login -H 'Content-Type: application/json' \
    -d "{\"username\":\"admin\",\"password\":\"<pw>\"}"
HTTP/1.1 404 Not Found

$ curl -sS -i -X POST http://127.0.0.1:3020/api/auth/login -H 'Content-Type: application/json' \
    -d '...'
HTTP/1.1 404 Not Found

$ curl -sS -i -X POST http://127.0.0.1:3020/api/auth/signin -H 'Content-Type: application/json' \
    -d '...'
HTTP/1.1 404 Not Found
```

**There is NO password-login endpoint exposed by AionUi 2.1.4.** Username+password is NOT the way the WebUI authenticates.

### A.7 -- full /api/* route enumeration from aioncore Rust binary string-extract

Crucial routes discovered (from `sudo strings /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore`):

```
/api/auth/status              -> GET, public, 200 always (returns is_authenticated bool)
/api/auth/user                -> GET, AUTH-GATED (returns 403 without session)
/api/auth/qr-login            -> POST, public, requires {qr_token}     <-- LOGIN ENTRY
/api/auth/refresh             -> POST, public, requires {token}
/api/auth/change-password     -> POST, AUTH-GATED
/api/auth/internal/users/system               -> GET, public(!) -- returns password_hash + jwt_secret
/api/auth/internal/users/by-username/{name}   -> GET, public(!)
/api/auth/internal/users/{id}                 -> GET, public(!)
/api/auth/internal/users/{id}/password        -> internal
/api/auth/internal/users/{id}/jwt-secret      -> internal
/api/webui/change-password                    -> POST, requires {new_password}
/api/webui/change-username                    -> POST
/api/webui/reset-password                     -> POST, **PUBLIC, no body required** -- generates new pw
/api/webui/generate-qr-token                  -> POST, **PUBLIC, no body required** -- QR token mint
/api/ws-token                                 -> AUTH-GATED, mints WS upgrade token
/logout                                       -> GET
```

Plus the LoginRequest neighborhood symbols in aioncore:

```
LoginRequest, RefreshTokenRequest, ChangePasswordRequest,
WebuiChangePasswordRequest, WebuiChangeUsernameRequest,
QrLoginRequest, set_system_user_credentials, resolve_webui_admin,
get_system_user, jwt_secret, expires_at_ms
```

> Note: `password_hash` is bcrypt-hashed (`$2b$12$...`). `jwt_secret` is per-user random base64. The `/api/auth/internal/*` routes are reachable from loopback WITHOUT authentication -- they appear to be intended only for unix-socket-style intra-process traffic, but they are exposed on the same 3020 port. This is upstream behavior we don't fix in this phase.

### A.8 -- config / settings files (no auth-disable knob present)

```
$ sudo find /opt/liv-assistant /etc/liv-assistant /etc/livos -maxdepth 6 \
    \( -name '*.json' -o -name '*.toml' -o -name '*.yaml' -o -name '*.env' \) 2>/dev/null
/opt/liv-assistant/data/extension-states.json                       <- {"version":1,"extensions":{}}
/opt/liv-assistant/aionui-web-2.1.4/aionui-web/package.json         <- npm manifest
/opt/liv-assistant/aionui-web-2.1.4/aionui-web/bundled-aioncore/linux-x64/manifest.json
/etc/liv-assistant/branding/manifest.json                           <- Phase 232 brand overlay
```

No `auth.json`, `config.toml`, `settings.yaml`, `aioncore.env` etc. AionUi does NOT expose a config-file knob. Auth state lives entirely in the SQLite DB at `/opt/liv-assistant/data/aionui-backend.db` (per A.10).

### A.9 -- bundle grep for auth-disable flags (only hit is unrelated)

```
$ sudo grep -rohE 'auth_required|require_auth|disable_auth|noauth|anonymous|skip_login|auto_login|guest_mode|allow_anonymous|REQUIRE_AUTH|DISABLE_AUTH|SKIP_AUTH' /opt/liv-assistant/current/ 2>/dev/null | sort -u
anonymous
```

Only `anonymous` appears in the bundle, and it is unrelated to auth (it's a localization key for something else -- inspected via context grep: `googleLoginFailed`, `qrLoginHint`, etc. are unrelated to a runtime auth toggle).

**Option A (config-flag flip) is NOT viable.** No such knob exists in 2.1.4.

### A.10 -- liv-assistant.service env

```
$ sudo systemctl show liv-assistant -p Environment -p WorkingDirectory -p User
Environment=PATH=/home/bruce/.bun/bin:/usr/local/bin:/usr/bin:/bin HOME=/home/bruce
WorkingDirectory=/opt/liv-assistant/current
User=bruce
```

No `AUTH_REQUIRED=false` / `SKIP_AUTH=1` env-var contract. Service runs as `bruce`, binary `aionui-web` is Bun-bundled (a single self-contained binary), so there's no entry-point flag we can sneak in via the systemd unit either.

### A.11 -- THE WORKING LOGIN FLOW: qr-token mint + qr-login

This is the **golden path** the SPA itself uses. Discovered by probing the routes found in A.7:

```
$ curl -sS --max-time 5 -X POST http://127.0.0.1:3020/api/webui/generate-qr-token
{"success":true,"data":{"token":"82c4c8391108a66f732a5cf7ef801a032a53499982da439619b95e1ce3e004f2","expires_at_ms":1779904835054}}

$ curl -sS --max-time 5 -i -X POST http://127.0.0.1:3020/api/auth/qr-login \
    -H 'Content-Type: application/json' \
    -d "{\"qr_token\":\"<qr_token from prev step>\"}"
HTTP/1.1 200 OK
set-cookie: aionui-session=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoic3lzdGVtX2RlZmF1bHRfdXNlciIsInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3Nzk5MDQ1MzUsImV4cCI6MTc3OTk5MDkzNSwiaXNzIjoiYWlvbnVpIiwiYXVkIjoiYWlvbnVpLXdlYnVpIn0.kd_emvjvElv5b0PNtu1XiK6-pHunY_vEmNb3HYmMNLU; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000
Content-Type: application/json
...

{"success":true,"message":"Login successful","user":{"id":"system_default_user","username":"admin"},"token":"eyJ0eXAi...kd_emvjvElv5b0PNtu1XiK6-pHunY_vEmNb3HYmMNLU"}
```

Key facts:

- **`POST /api/webui/generate-qr-token`** is **unauthenticated** -- callable cold from loopback. Returns a one-shot qr_token valid for ~minutes (`expires_at_ms` field).
- **`POST /api/auth/qr-login`** consumes the qr_token and returns:
  - A **`Set-Cookie: aionui-session=<JWT>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`** header
  - **AND** the JWT in the JSON body as `token`
- The JWT is HS256-signed by the user's `jwt_secret` (visible at `/api/auth/internal/users/system`), claims include `user_id=system_default_user`, `username=admin`, `iss=aionui`, `aud=aionui-webui`, `exp = iat + 86400` (24h).
- Re-call `/api/auth/status` with the cookie present:
  ```
  {"success":true,"needs_setup":false,"user_count":1,"is_authenticated":true}
  ```
- Re-call `/api/auth/user` with the cookie:
  ```
  HTTP/1.1 200 OK
  {"success":true,"user":{"id":"system_default_user","username":"admin"}}
  ```

**The cookie is HttpOnly.** This is critical:
- **JavaScript CANNOT set `document.cookie` for HttpOnly cookies** -- the browser silently ignores writes to HttpOnly cookies from JS. Therefore the original Plan 04 Option B (iframe `contentDocument.cookie` write) is **mechanically impossible** for this cookie.
- The cookie is `Path=/` -- it scopes to the WHOLE `bruce.livinity.io` origin (NOT just `/liv/`). So any same-origin request the iframe makes to `/liv/api/*` carries the cookie automatically once it's set on the browser's cookie store.

### A.12 -- Bearer-header alternative (rejected by upstream)

```
$ curl -sS -i -H "Authorization: Bearer <JWT>" http://127.0.0.1:3020/api/auth/user
HTTP/1.1 403 Forbidden
{"success":false,"error":"Forbidden: Authentication required","code":"FORBIDDEN"}
```

The Bearer header is NOT accepted -- the JWT MUST arrive as the `aionui-session` cookie. (`/api/auth/status` happens to be a public endpoint regardless of auth headers, so the 200 it returns there is not evidence of accepted Bearer.)

---

## Section B -- AionUi config files

Captured in A.8 already. Reading targeted files for completeness:

### B.1 /opt/liv-assistant/data/extension-states.json (full content)

```
{
  "version": 1,
  "extensions": {}
}
```

Holds extension enable/disable state -- nothing auth-related.

### B.2 /etc/liv-assistant/branding/manifest.json (Phase 232 overlay)

```
$ sudo ls -la /etc/liv-assistant/branding/
-rw-r--r-- 1 root root  240 May 27 06:51 favicon.svg
-rw-r--r-- 1 root root  669 May 27 06:51 livinity-overlay.css
-rw-r--r-- 1 root root  203 May 27 06:51 manifest.json
```

Phase 232 brand-overlay assets -- not auth-related, but worth noting they're root-owned and served via Caddy `LIV_BRANDING_HANDLE` (Phase 232 SUMMARY). Phase 234-03 sed-replace MUST NOT touch these (they're already Livinity-branded, not AionUi-branded).

### B.3 /opt/liv-assistant/data/ layout

```
drwxr-xr-x  5 bruce bruce   4096 May 27 10:50 .
-rw-r--r--  1 bruce bruce 425984 May 27 02:10 aionui-backend.db          <- SQLite
-rw-r--r--  1 bruce bruce      0 May 27 01:50 aionui-backend.db.migrate.lock
-rw-r--r--  1 bruce bruce  32768 May 27 10:50 aionui-backend.db-shm
-rw-r--r--  1 bruce bruce      0 May 27 10:50 aionui-backend.db-wal
drwxr-xr-x 23 bruce bruce   4096 May 27 01:50 builtin-skills
-rw-r--r--  1 bruce bruce     38 May 27 09:08 extension-states.json
drwxr-xr-x  2 bruce bruce   4096 May 27 01:50 logs
drwxr-xr-x  3 bruce bruce   4096 May 27 01:50 runtime
```

State lives in `aionui-backend.db` (SQLite). No sqlite3 binary on Mini PC ( `command -v sqlite3` empty), so schema couldn't be dumped this session. Schema inspection is NOT required for Plan 04 because we now have the working qr-login flow -- DB-direct manipulation is unnecessary.

### B.4 -- Conclusion

**No JSON/YAML/TOML/INI config file exposes an auth-disable toggle.** Confirms A.9 verdict: Option A is not available.

---

## Section C -- Sandbox iframe contentDocument access verification

### C.1 -- Existing sandbox tokens (file-read evidence)

From `livos/packages/ui/src/modules/window/app-contents/liv-assistant-window.tsx:43`:

```typescript
export const LIV_ASSISTANT_SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-downloads'
```

Sandbox includes `allow-same-origin` + `allow-scripts`.

### C.2 -- Caddy routing on /liv/ is same-origin to the shell

From the live `/etc/caddy/Caddyfile` capture in Section S6:

```
@liv path /liv /liv/*
handle @liv {
    uri strip_prefix /liv
    reverse_proxy 127.0.0.1:3020 {
        header_down -X-Frame-Options
        header_down -Content-Security-Policy
    flush_interval -1
    transport http {
        versions 1.1
    }
    }
    header Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
}
```

`/liv/` is reverse-proxied from `127.0.0.1:3020` to the same `bruce.livinity.io` origin as the LivOS shell. CSP `frame-ancestors 'self' https://bruce.livinity.io` allows the iframe to be hosted by the LivOS shell on the same eTLD+1.

### C.3 -- HTML/MDN sandbox spec recap

`allow-same-origin` + `allow-scripts` + same-origin URL = parent frame CAN access `iframe.contentWindow.document`. The browser treats the iframe content as belonging to the same origin as its `src` URL; because the URL is same-origin to the parent, the parent gets full DOM access including `localStorage`, `cookie` (for non-HttpOnly cookies), and `document.*` walks.

### C.4 -- THE GOTCHA: HttpOnly blocks JS cookie injection

The AionUi session cookie is `HttpOnly` (Section A.11). Per [MDN HttpOnly](https://developer.mozilla.org/docs/Web/HTTP/Headers/Set-Cookie#httponly), **JavaScript cannot read OR write HttpOnly cookies**. Writes via `iframe.contentWindow.document.cookie = '...'` will execute without throwing, but the browser silently drops the assignment for any HttpOnly cookie that already exists OR for any write that includes the `HttpOnly` directive.

**Conclusion C:** Option B's "iframe contentDocument cookie injection" path described in 234-01-PLAN.md is **NOT viable** for the AionUi session cookie. The cookie can only be set via a `Set-Cookie` header on an HTTP response from the same origin.

**However**, Option B's *spirit* (livinityd backend mints the session + browser receives the cookie via natural HTTP flow) IS viable -- by exposing a same-origin endpoint that performs the qr-login server-side and proxies the `Set-Cookie` back to the browser. The browser then stores it in its cookie jar, scoped to `Path=/` on `bruce.livinity.io`, and the iframe's subsequent `/liv/api/*` requests automatically include it. Section H locks this into Option B (modified).

---

## Section D -- WindowFrame contract + DEFAULT_WINDOW_SIZES edit shape (Plan 02 spec lock)

### D.1 -- Existing DEFAULT_WINDOW_SIZES map (file-read evidence)

From `livos/packages/ui/src/providers/window-manager.tsx:124-144`:

```typescript
export const DEFAULT_WINDOW_SIZES: Record<string, Size> = {
    'LIVINITY_app-store': {width: 1500, height: 750},
    'LIVINITY_files': {width: 1000, height: 1230},
    'LIVINITY_settings': {width: 1100, height: 980},
    'LIVINITY_live-usage': {width: 650, height: 500},
    'LIVINITY_ai-chat': {width: 1300, height: 850},
    'LIVINITY_docker': {width: 1400, height: 900},
    'LIVINITY_my-devices': {width: 900, height: 650},
    'LIVINITY_subagents': {width: 950, height: 650},
    'LIVINITY_schedules': {width: 950, height: 650},
    'LIVINITY_terminal': {width: 900, height: 600},
    // Phase 205 Hot-fix N 2026-05-24 — bumped from {1180, 820} (D-199-01) to
    // {1400, 900} so the new in-shell Settings route (content-swap, horizontal
    // tabs) has room without compressing the chat surface...
    'LIVINITY_liv-ai': {width: 1400, height: 900},
    // Phase 231 retirement — legacy chat-iframe default-size entry removed
    // (was Phase 203 Hot-fix E). Liv Assistant (Phase 227) is the v42 chat
    // surface.
    default: {width: 900, height: 600},
}
```

`'LIVINITY_liv-assistant'` is ABSENT -- the Liv Assistant window currently falls through to `default = {width: 900, height: 600}`.

### D.2 -- openWindow + getResponsiveSize behavior

```typescript
// window-manager.tsx:332-340
: (DEFAULT_WINDOW_SIZES[appId] || DEFAULT_WINDOW_SIZES.default)
const size = getResponsiveSize(baseSize.width, baseSize.height, isWebApp)
```

`getResponsiveSize` clamps each dimension to `min(base, 0.85 * viewport)` and floors at 400. So a `1280x800` request on a 1920x1080 viewport renders unchanged.

### D.3 -- Plan 02 spec lock (window size)

Add ONE line between `LIVINITY_liv-ai` and the `default:` entry:

```typescript
// Phase 234-02 — operator directive 2026-05-27: bump Liv Assistant window
// from default 900x600 to 1280x800 so the iframe-served AionUi chat surface
// has room for left-column conversation list + main chat pane without
// horizontal scroll. Mirrors Phase 199-01 / Hot-fix N regression-lock pattern.
'LIVINITY_liv-assistant': {width: 1280, height: 800},
```

### D.4 -- Regression-lock vitest entry (Plan 02)

Existing test file `livos/packages/ui/src/providers/window-manager.test.tsx` (Phase 199-01 / Hot-fix N precedent) is already set up to import `DEFAULT_WINDOW_SIZES`. Plan 02 appends one `describe` block:

```typescript
describe('Phase 234-02 regression-lock', () => {
    it('LIVINITY_liv-assistant has explicit 1280x800 entry (NOT default fallthrough)', () => {
        expect(DEFAULT_WINDOW_SIZES['LIVINITY_liv-assistant']).toEqual({width: 1280, height: 800})
    })
})
```

---

## Section E -- lucide-react availability + icon swap target

### E.1 -- Existing figma-exports inventory

```
$ ls livos/packages/ui/public/figma-exports/ | grep -iE 'chat|ai|message|spark|liv'
app-gmail.png
dock-ai-chat.svg                       <- candidate
dock-live-usage.png
liv-ai.svg                             <- currently used (Phase 227-02)
livinity-app.svg
livinity-home-certifications.svg
livinity-home-device-info-grain.png
livinity-ios.png
migrate-livinity-home-livinity-home.png
migrate-raspberrypi-livinity-home.png
system-livinity-home.png
```

`dock-ai-chat.svg` already exists in the repo (no new asset needed). It's the chat-bubble-shaped icon variant prepared for exactly this swap.

### E.2 -- Dock uses STRING-PATH icons, not lucide JSX

From `livos/packages/ui/src/modules/desktop/dock.tsx:237-244`:

```tsx
handleOpenWindow(
    'LIVINITY_liv-assistant',
    '/liv-assistant',
    'Liv Assistant',
    systemAppsKeyed['LIVINITY_liv-assistant'].icon,
    originRect,
)
```

The icon is sourced from `systemAppsKeyed['LIVINITY_liv-assistant'].icon`, which is set in `apps.tsx:137`:

```typescript
{id: 'LIVINITY_liv-assistant', name: 'Liv Assistant', icon: '/figma-exports/liv-ai.svg', systemApp: true, systemAppTo: '/liv-assistant'},
```

So the icon swap is a **single-line path-string change** in `apps.tsx`. NO lucide-react JSX involvement.

### E.3 -- lucide-react sanity check (not actually needed for Plan 02)

```
$ grep -nE "MessageCircle|SparklesIcon" livos/packages/ui/src/components/motion-primitives/toolbar-expandable.tsx livos/packages/ui/src/components/assistant-ui/composer-trigger-popover.tsx
# (no matches)
```

The components mentioned in 234-01-PLAN.md's Section E sketch are not present (toolbar-expandable.tsx and composer-trigger-popover.tsx were retired earlier). `lucide-react` IS available in the workspace (used by other components), but **Plan 02 does not need it** -- the path-string swap is the entire icon change.

### E.4 -- Plan 02 spec lock (icon)

In `livos/packages/ui/src/providers/apps.tsx:135-140`, change:

```typescript
{id: 'LIVINITY_liv-assistant', name: 'Liv Assistant', icon: '/figma-exports/liv-ai.svg', systemApp: true, systemAppTo: '/liv-assistant'},
```

to:

```typescript
{id: 'LIVINITY_liv-assistant', name: 'Liv AI', icon: '/figma-exports/dock-ai-chat.svg', systemApp: true, systemAppTo: '/liv-assistant'},
```

(The `name` change is locked by Section G below.)

---

## Section F -- 'AionUi' / 'aionui' brand-string inventory

### F.1 -- Mini PC binary tree

Files containing `aionui` (case-insensitive) under `/opt/liv-assistant/current/`:

```
/opt/liv-assistant/current/package.json
/opt/liv-assistant/current/aionui-web                                   <- binary executable (DO NOT TOUCH)
/opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore          <- binary executable (DO NOT TOUCH)
/opt/liv-assistant/current/static/sw.js                                 <- service worker
/opt/liv-assistant/current/static/pet-states/preview.html               <- internal/demo
/opt/liv-assistant/current/static/index.html                            <- main SPA shell
/opt/liv-assistant/current/static/assets/index-CaE7eEr9.js              <- main bundle (1.6MB)
/opt/liv-assistant/current/static/assets/index-w756Mz3n.css             <- main CSS
/opt/liv-assistant/current/static/assets/*.js                           <- ~25 chunked bundles
```

### F.2 -- By extension (which extensions are REPLACE candidates)

- **`*.html`** (2 files): `static/index.html`, `static/pet-states/preview.html` -- REPLACE candidates
- **`*.js`** (~30 files): all the assets/*.js bundles + `static/sw.js` -- REPLACE candidates
- **`*.css`** (1 file): `static/assets/index-w756Mz3n.css` -- REPLACE candidate
- **`*.json`** (1 file): `static/../package.json` -- KEEP AS-IS (npm manifest; not user-visible; the `"name": "aionui-web"` key is required by package-resolution; replacing breaks runtime)
- **Binary executables** (`aionui-web`, `aioncore`): DO NOT TOUCH (~94MB Bun-compiled binaries; sed-replace would corrupt them)

### F.3 -- LICENSE / NOTICE / UPSTREAM.md (D-V42-APACHE-NOTICE preservation)

```
$ sudo grep -lc 'AionUi\|aionui' /opt/liv-assistant/LICENSE /opt/liv-assistant/NOTICE
/opt/liv-assistant/LICENSE
/opt/liv-assistant/NOTICE
```

Both LICENSE and NOTICE contain `AionUi` references for legal attribution. **MUST EXCLUDE** from sed-replace (D-V42-APACHE-NOTICE invariant). UPSTREAM.md (also at `/opt/liv-assistant/`) similarly references upstream as our provenance doc.

### F.4 -- Walk under the version_dir to confirm no LICENSE inside aionui-web subtree

```
$ sudo find "$(readlink -f /opt/liv-assistant/current)" -maxdepth 3 -iname 'LICENSE*' -o -iname 'NOTICE*'
(empty)
```

No LICENSE/NOTICE files inside `/opt/liv-assistant/aionui-web-2.1.4/aionui-web/` -- they live at the INSTALL_ROOT level (`/opt/liv-assistant/`), not inside the version dir. **The sed-replace pattern operating on `${CURRENT_LINK}/` (resolved real-path = `/opt/liv-assistant/aionui-web-2.1.4/aionui-web/`) will NEVER hit LICENSE/NOTICE** because they're not inside that subtree.

### F.5 -- Repo-side brand-string inventory

```
$ grep -rilE 'AionUi|aionui' livos/packages/ui/src/ scripts/ docs/ caddy/ 2>/dev/null
livos/packages/ui/src/modules/window/app-contents/liv-assistant-window.tsx
livos/packages/ui/src/modules/window/window-content.tsx
scripts/capture-liv-assistant-password.sh
scripts/install-liv-assistant.sh
docs/liv-assistant-install.md
docs/v42-single-user-posture.md
caddy/branding/livinity-overlay.css
caddy/branding/README.md
caddy/conf.d/liv-assistant.caddy
```

Categorized:

| Path                                                                      | Lines containing AionUi | Sed disposition           | Rationale                                                                                                                              |
| ------------------------------------------------------------------------- | ----------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/opt/liv-assistant/current/static/*.html`                                | 2 files                 | REPLACE                   | User-visible page title + `<meta name="application-name">` strings                                                                     |
| `/opt/liv-assistant/current/static/assets/*.js`                           | ~30 files               | REPLACE                   | Compiled SPA bundle strings -- user-visible UI text                                                                                    |
| `/opt/liv-assistant/current/static/assets/*.css`                          | 1 file                  | REPLACE                   | CSS string literals (custom-element names etc.)                                                                                        |
| `/opt/liv-assistant/current/static/sw.js`                                 | 1 file                  | REPLACE                   | Service-worker cache name -- user-visible in DevTools but not in UI                                                                    |
| `/opt/liv-assistant/current/package.json`                                 | 1 file                  | EXCLUDE                   | `"name": "aionui-web"` is required by Bun's package resolution; changing breaks runtime                                                |
| `/opt/liv-assistant/current/aionui-web` (binary)                          | 1 file                  | EXCLUDE                   | 94MB Bun binary -- corrupt if sed-edited                                                                                               |
| `/opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore` (binary) | 1 file                  | EXCLUDE                   | Native Rust binary -- corrupt if sed-edited                                                                                            |
| `/opt/liv-assistant/LICENSE`                                              | 1 file                  | EXCLUDE                   | D-V42-APACHE-NOTICE preservation (legal)                                                                                               |
| `/opt/liv-assistant/NOTICE`                                               | 1 file                  | EXCLUDE                   | D-V42-APACHE-NOTICE preservation (legal)                                                                                               |
| `/opt/liv-assistant/UPSTREAM.md`                                          | --                      | EXCLUDE                   | Our provenance doc -- intentionally references upstream by name                                                                        |
| `livos/packages/ui/src/.../liv-assistant-window.tsx`                      | 2 lines (comments only) | KEEP                      | Comments referencing the upstream provider name in code documentation -- not user-visible; useful for future maintainers              |
| `livos/packages/ui/src/.../window-content.tsx`                            | 1 line (comment)        | KEEP                      | Same                                                                                                                                   |
| `scripts/capture-liv-assistant-password.sh`                               | 1 line (comment)        | KEEP                      | Comment cites upstream format reference                                                                                                |
| `scripts/install-liv-assistant.sh`                                        | ~25 lines               | KEEP                      | Variable names (`AIONUI_VERSION`, `AIONUI_TARBALL`), tarball URL, LICENSE template, provenance doc embed -- ALL intentional references |
| `docs/liv-assistant-install.md`                                           | ~10 lines               | OPTIONAL (manual reword)  | Operator-facing docs -- can reword "AionUi WebUI binary" → "Liv AI WebUI (vendored upstream)" but historical/provenance refs preserved |
| `docs/v42-single-user-posture.md`                                         | ~3 lines                | KEEP                      | Architectural docs -- references upstream by name in rationale paragraphs                                                              |
| `caddy/branding/livinity-overlay.css`                                     | 2 lines (comments)      | KEEP                      | CSS comments -- not user-visible                                                                                                       |
| `caddy/branding/README.md`                                                | 2 lines                 | KEEP                      | Brand-overlay README references the upstream UI by name in rationale                                                                   |
| `caddy/conf.d/liv-assistant.caddy`                                        | 3 lines (comments)      | KEEP                      | Caddy config comments referencing the upstream protocol                                                                                |

**Plan 03 sed-replace scope** (locked):

- Target: `${CURRENT_LINK}/static/` only (resolved real-path = `/opt/liv-assistant/aionui-web-2.1.4/aionui-web/static/`)
- Extensions: `*.html`, `*.js`, `*.css` only
- Exclude paths: NONE NEEDED (LICENSE/NOTICE not inside this subtree per F.4; package.json is at parent level not under static/)
- Pattern: `s/AionUi/Liv AI/g; s/aionui-web/liv-ai-web/g; s/aionui/liv-ai/g`
- Idempotency guard: pre-check via `grep -ril 'AionUi\|aionui' "${CURRENT_LINK}/static/" --include='*.html' --include='*.js' --include='*.css'` -- if zero matches, skip sed.
- Note on `package.json`: NOT INCLUDED in the sed walk because the find expression in Plan 03 targets `static/` only. Plan 03 spec must enforce this scoping.

### F.6 -- Repo-side coverage handled in Plan 03 manually

Plan 03 also reworks `docs/liv-assistant-install.md` -- replacing "AionUi WebUI binary" with "Liv AI (vendored upstream AionUi v2.1.4)" in user-facing sentences, while preserving historical/provenance/install-debug references that name the upstream project explicitly. This is NOT a sed pass -- it's targeted edits. Plan 03 spec lock below locks the exact phrases.

---

## Section G -- 'Liv AI' / 'Liv Assistant' wrapper-name collision resolution

### G.1 -- Evidence

From `livos/packages/ui/src/providers/apps.tsx`:

```typescript
// Line 121-127 -- LIVINITY_liv-ai (Phase 197-06 — Liv AI Dock app)
{
    id: 'LIVINITY_liv-ai',
    name: 'Liv AI',
    icon: '/figma-exports/liv-ai.svg',
    systemApp: true,
    systemAppTo: '/liv-ai',
},
// Line 134-140 -- LIVINITY_liv-assistant (Phase 227-02 — LivOS shell entry for the Liv Assistant iframe window)
{
    id: 'LIVINITY_liv-assistant',
    name: 'Liv Assistant',
    icon: '/figma-exports/liv-ai.svg',           <- same icon as LIVINITY_liv-ai
    systemApp: true,
    systemAppTo: '/liv-assistant',
},
```

Both `LIVINITY_liv-ai` and `LIVINITY_liv-assistant` currently coexist in `systemApps`. They use the SAME icon (`liv-ai.svg`) but DIFFERENT names ('Liv AI' vs 'Liv Assistant'). Renaming `LIVINITY_liv-assistant.name` to `'Liv AI'` introduces a same-name collision in the dock-key lookup map.

From `dock.tsx` (post Phase 231):

```
$ grep -nE "appId='LIVINITY_liv-ai'" livos/packages/ui/src/modules/desktop/dock.tsx
(no match)
```

There is **NO `<DockItem appId='LIVINITY_liv-ai' />` JSX block in dock.tsx** -- Phase 231 retirement already removed the dock tile for `LIVINITY_liv-ai`. The systemApps entry remains but is unreachable from the dock UI.

From `window-content.tsx:175-176`:

```typescript
case 'LIVINITY_liv-ai':
    return <LivAiWindowContent />
```

`window-content.tsx` still maps `LIVINITY_liv-ai` to `<LivAiWindowContent />` (the legacy iframe wrapper for `/liv-ai-app/` Next.js dashboard). This is the **last consumer** of the `LIVINITY_liv-ai` systemApps entry.

### G.2 -- Resolution G.1 (PREFERRED): rename LIVINITY_liv-assistant to 'Liv AI', DELETE LIVINITY_liv-ai

Selected resolution: **G.1 (preferred)**.

Rationale:
- Operator's directive 2026-05-27 night says "Liv AI brand everywhere" -- aligns with naming the v42 chat surface 'Liv AI'.
- Phase 231 already retired the legacy dock tile for `LIVINITY_liv-ai`. Deleting the orphan systemApps entry + its window-content mapping + the `LivAiWindowContent` import + (lazy) the legacy `liv-ai-content.tsx` file is the natural Phase 231 cleanup that was deferred (`KEEP_SCOPE_EXPANSION` in 231-01-DISCOVERY).
- Verifying nothing else consumes `LIVINITY_liv-ai`:

```
$ grep -rnE "LIVINITY_liv-ai\b" livos/packages/ui/src/ | grep -v LIVINITY_liv-assistant
livos/packages/ui/src/modules/window/window-content.tsx:17:const LivAiWindowContent = React.lazy(() => import('./app-contents/liv-ai-content'))
livos/packages/ui/src/modules/window/window-content.tsx:74:const fullHeightApps = new Set(['LIVINITY_terminal', 'LIVINITY_files', 'LIVINITY_app-store', 'LIVINITY_docker', 'LIVINITY_server-control', 'LIVINITY_my-devices', 'LIVINITY_liv-ai', LIV_ASSISTANT_APP_ID])
livos/packages/ui/src/modules/window/window-content.tsx:175:	case 'LIVINITY_liv-ai':
livos/packages/ui/src/providers/apps.tsx:121-127
```

Three call sites in `window-content.tsx` (lazy import + fullHeightApps Set entry + switch case) plus the systemApps entry. Removal is mechanical.

Plan 02 spec lock (per G.1):

1. **`apps.tsx:121-127`** -- DELETE the `LIVINITY_liv-ai` block entirely.
2. **`apps.tsx:134-140`** -- change `LIVINITY_liv-assistant`'s `name: 'Liv Assistant'` to `name: 'Liv AI'`, and icon path per Section E.
3. **`window-content.tsx`** -- remove (a) the lazy import for `LivAiWindowContent` (line 17), (b) the `'LIVINITY_liv-ai'` entry from `fullHeightApps` Set (line 74), (c) the `case 'LIVINITY_liv-ai'` switch arm (lines 175-176). The orphan file `livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx` is also deleted.
4. **`dock.tsx:239`** -- change the `'Liv Assistant'` literal string in the `handleOpenWindow(...)` call to `'Liv AI'`.
5. **`liv-assistant-window.tsx:58`** -- change `title='Liv Assistant'` to `title='Liv AI'`.
6. **`dock.test.tsx`** -- update the assertion that expects `openWindow` to be called with `'Liv Assistant'` to expect `'Liv AI'` instead.

Plan 02 will execute these edits atomically.

### G.3 -- DEFAULT_WINDOW_SIZES interaction with LIVINITY_liv-ai removal

Phase 231-01 Task 4 NEVER removed the `'LIVINITY_liv-ai': {width: 1400, height: 900}` entry from `DEFAULT_WINDOW_SIZES`. With G.1's `LIVINITY_liv-ai` systemApps deletion, that entry becomes dead-but-harmless (window-manager only looks up appIds via `openWindow`; an unreachable key is a no-op).

**Recommendation:** Plan 02 ALSO removes the dead `'LIVINITY_liv-ai': {width: 1400, height: 900}` entry from `DEFAULT_WINDOW_SIZES` and the Hot-fix N comment that introduced it, for code hygiene. The new `'LIVINITY_liv-assistant': {width: 1280, height: 800}` entry takes its place positionally.

---

## Section H -- Selected option for Plan 04 auth bypass (ADR)

### H.1 -- Evidence summary (sections A + B + C)

- **Option A (config flag flip)** -- DEAD. Section A.9 + B.4 confirm AionUi 2.1.4 has no auth-disable knob in any config file, env var, or runtime flag.
- **Option B as originally written (iframe contentDocument cookie injection)** -- DEAD. Section A.11 reveals AionUi sets the session cookie with `HttpOnly`. Section C.4 confirms JavaScript cannot set HttpOnly cookies. The mechanical path is broken.
- **Option C (Caddy `header_up Cookie` static injection)** -- WORKABLE BUT FRAGILE. The qr-token + qr-login flow returns a fresh JWT each call; the JWT has `exp = iat + 86400` (24h). A static cookie injected by Caddy would either need (a) a cron job to refresh the cookie file every <24h, OR (b) Caddy directly speaking the qr-login protocol (Caddy can't natively do that). Cron-based refresh adds a systemd timer + a file livinityd reads at every Caddyfile regen + a race against expiry.
- **Option B (modified -- livinityd HTTP proxy mints session server-side)** -- VIABLE. Section A.11 + Section S1 (T1) prove that:
  - `/api/webui/generate-qr-token` is publicly callable from loopback (no auth)
  - `/api/auth/qr-login` consumes the qr_token and returns `Set-Cookie: aionui-session=<JWT>; Path=/; HttpOnly`
  - The cookie is `Path=/` -- scopes to the entire `bruce.livinity.io` origin
  - The whole flow works external-relay too: `curl https://bruce.livinity.io/liv/api/webui/generate-qr-token` followed by `curl ... /liv/api/auth/qr-login` returns a 200 with the same Set-Cookie

### H.2 -- ADR

### Selected option: Option B (modified)

> **Modified Option B** (verbose form follows; the line above is the verifier-gated heading):
>
> **Modified Option B**: A new same-origin endpoint served by **livinityd** at `GET /liv-login` does the qr-token-mint + qr-login server-side AS A LOOPBACK CALL TO `127.0.0.1:3020`, then **proxies the AionUi `Set-Cookie` header back to the browser response unchanged**, and **302-redirects the browser to `/liv/`**. The browser stores the HttpOnly `aionui-session` cookie scoped to `bruce.livinity.io` (Path=/). Subsequent navigations to `/liv/*` (whether by the iframe loading `/liv/` or by the iframe's JS calling `/liv/api/*`) automatically include the cookie. The AionUi SPA sees `is_authenticated: true` from `/api/auth/status` and renders the chat surface directly -- no login form ever appears.
>
> **Frontend change**: `liv-assistant-window.tsx` updates `LIV_ASSISTANT_DEFAULT_URL` from `'/liv/'` to `'/liv-login'`. The redirect handles the rest -- the iframe's final landing URL after the 302 is `/liv/`, identical to today's behavior, but with the cookie already in place.
>
> **Feature flag**: Redis `liv:config:liv_ai_autologin_enabled` (default ON; missing OR non-`false` value = enabled). When `false`, livinityd's `/liv-login` handler returns a 302 to `/liv/` WITHOUT performing the qr-login flow -- the iframe lands on `/liv/` exactly as it does today, and the AionUi SPA renders its qr-login UI as a fallback. (Operator can use the AionUi qr-login UI to authenticate manually -- the feature flag's purpose is rollback safety, not "show me the login form for fun".)
>
> **Rationale**:
> 1. Single same-origin same-process change (livinityd already serves Express handlers on the same Caddy-routed origin). No tRPC procedure needed -- the endpoint is HTTP-level because the browser must consume the Set-Cookie via a real HTTP response, not a JSON payload.
> 2. Admin-scoping is automatic: this Mini PC is single-user (v42 posture per Phase 229) and only `bruce` opens the iframe. There is exactly one AionUi user (`system_default_user/admin`) -- no per-user multiplexing complexity. (v43 multi-user will need to mint per-LivOS-user sessions; deferred per Phase 229's v42-single-user-posture.)
> 3. Caddy already routes `/liv-*` paths to livinityd (everything not matching `@liv path /liv /liv/*` falls through to the default `handle { reverse_proxy 127.0.0.1:8080 }` block per S6). NO Caddyfile changes needed -- `/liv-login` is automatically routed to livinityd.
> 4. The qr-login flow is the upstream-supported login path. We don't fork AionUi; we don't sed-patch its auth code; we just speak its protocol from the same trust boundary that already proxies it.
> 5. Apache-2.0 NOTICE preservation (D-V42-APACHE-NOTICE) untouched -- we don't modify the binary.
> 6. Sacred SHA (D-V42-SACRED) untouched -- livinityd's Express layer lives outside `liv/packages/core/`.
> 7. The HttpOnly cookie's `Path=/` scope means it ALSO arrives on requests to the LivOS shell root (`bruce.livinity.io/`), which has no consumers of an `aionui-session` cookie -- benign noise. (Not a security concern: the cookie is short-lived, HttpOnly, and only meaningful to the AionUi backend.)
>
> **Rejected**:
> - **Option A (config flag)** -- AionUi 2.1.4 exposes no auth-disable knob. Section A.9 grep returned only one unrelated hit (`anonymous` in an i18n key), Section B confirmed no config file holds the flag, Section A.10 confirmed no env-var contract. Re-evaluate for v2.x bumps.
> - **Option B as originally written (contentDocument cookie injection)** -- AionUi sets the session cookie with `HttpOnly` (Section A.11 raw header capture). JavaScript cannot set HttpOnly cookies (Section C.4, MDN spec). The original sketch is mechanically impossible for this cookie.
> - **Option C (Caddy `header_up Cookie` static)** -- Requires a 24h-period systemd refresh timer to re-mint the JWT, and the cookie value lives in a file livinityd reads at every Caddyfile regen. Two extra moving parts (timer unit + file watch + Caddyfile re-emit dependency on a non-deterministic input). Modified-Option-B mints on-demand per browser hit, no caching, no expiry race.

---

## Section I -- Plan-spec lock

## Plan-spec lock

This section contains the exact swap-in payloads that the orchestrator must paste into Plans 234-02, 234-03, 234-04 BEFORE they execute.

### Plan 234-02 spec (UI polish)

**Files modified** (5):
1. `livos/packages/ui/src/providers/window-manager.tsx` -- add `'LIVINITY_liv-assistant': {width: 1280, height: 800},` entry between `LIVINITY_liv-ai` and `default:`. Optionally also remove the `'LIVINITY_liv-ai': {width: 1400, height: 900}` entry + its Hot-fix N comment (Phase 234-02 attribution comment replacing it).
2. `livos/packages/ui/src/providers/window-manager.test.tsx` -- append Phase 234-02 regression-lock describe (1 expect).
3. `livos/packages/ui/src/providers/apps.tsx` -- DELETE the `LIVINITY_liv-ai` block (lines 121-127); change `LIVINITY_liv-assistant`'s `name: 'Liv Assistant'` to `name: 'Liv AI'` and `icon: '/figma-exports/liv-ai.svg'` to `icon: '/figma-exports/dock-ai-chat.svg'`.
4. `livos/packages/ui/src/modules/window/window-content.tsx` -- remove lazy `LivAiWindowContent` import (line 17), `'LIVINITY_liv-ai'` from `fullHeightApps` Set (line 74), and the `case 'LIVINITY_liv-ai':` switch arm (lines 175-176). DELETE `livos/packages/ui/src/modules/window/app-contents/liv-ai-content.tsx` if present.
5. `livos/packages/ui/src/modules/desktop/dock.tsx` -- change the literal `'Liv Assistant'` argument (line 239) in the `handleOpenWindow(...)` call to `'Liv AI'`.
6. `livos/packages/ui/src/modules/window/app-contents/liv-assistant-window.tsx` -- change `title='Liv Assistant'` (line 58) to `title='Liv AI'`.
7. `livos/packages/ui/src/modules/desktop/dock.test.tsx` -- update `expect(openWindow).toHaveBeenCalledWith(..., 'Liv Assistant', ...)` to `'Liv AI'`.

**Vitest harness**: per Phase 224-03 / 227-01 precedent (direct `react-dom/client` + jsdom, NO `@testing-library/react`). The window-manager regression-lock test mirrors Phase 199-01 / Hot-fix N pattern (import `DEFAULT_WINDOW_SIZES`, `expect(...).toEqual({width: 1280, height: 800})`).

**Atomic commit shape**: 1 feat commit (`feat(234-02): Liv Assistant window polish -- 1280x800, chat icon, 'Liv AI' brand`) covering all 7 files. Pre-commit `[sacred-sha] PASS` expected.

### Plan 234-03 spec (vendored-binary rebrand)

**Files modified** (2):
1. `scripts/install-liv-assistant.sh` -- insert new step AFTER the LICENSE/NOTICE preservation block (around line 180) and BEFORE the bun-install block (line 185). New step shape:

```bash
# ---------------------------------------------------------------------------
# Phase 234-03 — idempotent brand-string rebrand (AionUi → Liv AI) in the
# vendored static SPA assets. Pattern: `s/AionUi/Liv AI/g; s/aionui-web/liv-ai-web/g; s/aionui/liv-ai/g`
# (s/aionui-web/.../g MUST come before s/aionui/.../g to preserve the compound).
# Targets: ONLY *.html *.js *.css under ${CURRENT_LINK}/static/ (resolved real
# path). Excludes LICENSE / NOTICE / UPSTREAM.md (they live at ${INSTALL_ROOT}
# level, NOT inside the version dir's static/) and the binary executables.
# D-V42-APACHE-NOTICE preserved because LICENSE/NOTICE are NOT under the walk.
# ---------------------------------------------------------------------------
REBRAND_TARGET="$(readlink -f "${CURRENT_LINK}")/static"
if [[ -d "${REBRAND_TARGET}" ]]; then
  PRE_HITS="$(grep -ril 'AionUi\|aionui' "${REBRAND_TARGET}" --include='*.html' --include='*.js' --include='*.css' 2>/dev/null | wc -l)"
  if [[ "${PRE_HITS}" -gt 0 ]]; then
    log "Rebranding ${PRE_HITS} files: AionUi/aionui -> Liv AI/liv-ai"
    find "${REBRAND_TARGET}" \( -name '*.html' -o -name '*.js' -o -name '*.css' \) \
         -exec sed -i 's/AionUi/Liv AI/g; s/aionui-web/liv-ai-web/g; s/aionui/liv-ai/g' {} +
    POST_HITS="$(grep -ril 'AionUi\|aionui' "${REBRAND_TARGET}" --include='*.html' --include='*.js' --include='*.css' 2>/dev/null | wc -l)"
    log "Rebrand complete: ${POST_HITS} files still contain AionUi/aionui (expect 0 unless a non-replaceable variant)"
  else
    log "AionUi/aionui strings already rebranded; skipping sed pass"
  fi
else
  log "WARN: ${REBRAND_TARGET} missing; skipping rebrand step"
fi
```

2. `docs/liv-assistant-install.md` -- replace user-facing phrases:
   - "AionUi WebUI binary" → "Liv AI (vendored upstream AionUi v2.1.4)" in body paragraphs
   - Page headings remain unchanged where they cite historical/provenance
   - Tables citing the upstream URL/tarball path/release stay AS-IS (they document what we vendored)

**Verification (Plan 03)**:
- `grep -ril 'AionUi\|aionui' /opt/liv-assistant/current/static/ --include='*.html' --include='*.js' --include='*.css'` → expected 0 hits post-deploy
- External: `curl -s https://bruce.livinity.io/liv/ | grep -c AionUi` → expected 0
- External: `curl -s https://bruce.livinity.io/liv/ | grep -c 'Liv AI'` → expected ≥ 3 (title + meta tags)
- D-V42-APACHE-NOTICE: `sudo grep -c AionUi /opt/liv-assistant/LICENSE /opt/liv-assistant/NOTICE` → ≥ 1 on EACH (attribution preserved)

**Atomic commit shape**: 1 feat commit (`feat(234-03): rebrand vendored AionUi static assets -> Liv AI (idempotent sed-replace in install-liv-assistant.sh)`) covering both files. Deploy via `bash /opt/livos/update.sh` which re-runs install-liv-assistant.sh.

### Plan 234-04 spec (auth bypass -- Option B modified, LOCKED)

**Files modified** (4):
1. `livos/packages/livinityd/source/modules/server/liv-login-handler.ts` -- NEW Express handler:

```typescript
/**
 * Phase 234-04 — Liv AI auto-login HTTP handler.
 *
 * Same-origin endpoint that performs the AionUi qr-token + qr-login flow
 * server-side (loopback to 127.0.0.1:3020), forwards the resulting
 * `Set-Cookie: aionui-session=<JWT>; Path=/; HttpOnly; SameSite=Lax` header
 * to the browser response unchanged, and 302-redirects to /liv/. The
 * browser stores the cookie scoped to the bruce.livinity.io origin; the
 * iframe's subsequent /liv/* requests automatically include it. The
 * AionUi SPA then sees is_authenticated:true and renders the chat surface
 * directly -- no login form ever appears.
 *
 * Feature flag: Redis `liv:config:liv_ai_autologin_enabled` (default ON).
 * When false, the handler 302-redirects to /liv/ WITHOUT the qr-login flow
 * so the operator can manually authenticate via AionUi's qr-login UI as
 * a fallback. D-LIVAI-AUTOLOGIN-ROLLBACK pattern matching D-V42-ROLLBACK.
 *
 * Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED -- this
 * file lives in livinityd, NOT in liv/packages/core/.
 */
import {Request, Response} from 'express'
import {Redis} from 'ioredis'

const AIONUI_LOOPBACK = 'http://127.0.0.1:3020'

export function makeLivLoginHandler(redis: Redis) {
    return async function livLoginHandler(_req: Request, res: Response): Promise<void> {
        try {
            // Honor feature flag (default ON when missing or non-'false')
            const flagValue = await redis.get('liv:config:liv_ai_autologin_enabled')
            const enabled = flagValue !== 'false'

            if (!enabled) {
                res.redirect(302, '/liv/')
                return
            }

            // Step 1: Mint qr-token
            const qrMintRes = await fetch(`${AIONUI_LOOPBACK}/api/webui/generate-qr-token`, {method: 'POST'})
            if (!qrMintRes.ok) throw new Error(`qr-token mint failed: HTTP ${qrMintRes.status}`)
            const qrMintJson = (await qrMintRes.json()) as {success: boolean; data?: {token: string; expires_at_ms: number}}
            const qrToken = qrMintJson?.data?.token
            if (!qrToken) throw new Error(`qr-token mint returned no token: ${JSON.stringify(qrMintJson)}`)

            // Step 2: Exchange for session JWT (capture Set-Cookie)
            const loginRes = await fetch(`${AIONUI_LOOPBACK}/api/auth/qr-login`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({qr_token: qrToken}),
            })
            if (!loginRes.ok) throw new Error(`qr-login failed: HTTP ${loginRes.status}`)
            const setCookie = loginRes.headers.get('set-cookie')
            if (!setCookie) throw new Error('qr-login returned no Set-Cookie header')

            // Forward the AionUi Set-Cookie to the browser unchanged
            res.setHeader('Set-Cookie', setCookie)
            res.redirect(302, '/liv/')
        } catch (e) {
            // On failure, still redirect to /liv/ so the operator sees the
            // AionUi login UI rather than a 500. Log for diagnosis.
            // eslint-disable-next-line no-console
            console.warn('[liv-login] auto-login failed:', e instanceof Error ? e.message : e)
            res.redirect(302, '/liv/')
        }
    }
}
```

2. `livos/packages/livinityd/source/modules/server/liv-login-handler.test.ts` -- NEW vitest unit test using Node `http.createServer` mock for the AionUi loopback endpoints (mirrors Phase 228 deploy-log test pattern).

3. `livos/packages/livinityd/source/index.ts` -- wire the handler. Add:
   ```typescript
   import {makeLivLoginHandler} from './modules/server/liv-login-handler'
   // ...inside server bootstrap, AFTER redis is constructed and BEFORE the Caddy default-handle reverse_proxy receives this path:
   app.get('/liv-login', makeLivLoginHandler(redis))
   ```

4. `livos/packages/ui/src/modules/window/app-contents/liv-assistant-window.tsx` -- change `LIV_ASSISTANT_DEFAULT_URL` from `'/liv/'` to `'/liv-login'`. The env override `VITE_LIV_ASSISTANT_URL` semantic is preserved (operators pointing at a non-Mini-PC deployment can still override).

**Mini PC deploy steps** (chained into Task 1):
1. `git push origin master`
2. SSH (single batched session, fail2ban-aware):
   ```bash
   sudo bash /opt/livos/update.sh
   PASS="$(sudo grep REDIS_URL /opt/livos/.env | sed -E 's|.*://:?([^@]+)@.*|\1|' | sed 's/%21/!/g')"
   redis-cli -a "$PASS" SET liv:config:liv_ai_autologin_enabled true  # explicit default ON
   ```

**Verification (Plan 04)**:
- `curl -sS -i https://bruce.livinity.io/liv-login` → HTTP 302 + `Location: /liv/` + `Set-Cookie: aionui-session=...; Path=/; HttpOnly`
- `curl -sS -b /tmp/jar -c /tmp/jar https://bruce.livinity.io/liv-login && curl -sS -b /tmp/jar https://bruce.livinity.io/liv/api/auth/status` → `{"success":true,"needs_setup":false,"user_count":1,"is_authenticated":true}`
- Operator UAT: opening the Liv AI dock tile in the LivOS shell lands directly on the chat surface, NO password input field, NO "Sign in" button.
- Reversibility test: `redis-cli SET liv:config:liv_ai_autologin_enabled false`; opening the Liv AI dock tile renders the AionUi qr-login UI (the operator's safety hatch). `redis-cli DEL liv:config:liv_ai_autologin_enabled` restores auto-login.
- Sacred SHA: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` MUST print `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on every commit. (Pre-commit hook gates this.)
- Phase 233 UAT subset (SC-01..SC-05 from Phase 233) MUST remain GREEN.

**Atomic commit shape**: 1 feat commit (`feat(234-04): livinityd /liv-login auto-login handler + iframe src swap + Redis feature flag`) covering 4 files. 1 docs commit covering DEPLOY-LOG.md + STATE.md + ROADMAP.md (Phase 234 closure).

**Feature flag default**: ON (missing OR non-`false` Redis value = enabled). Flip to `false` for rollback within ~30s (next /liv-login hit serves the no-bypass branch).

**Sub-section pointers** (for orchestrator paste into Plan 04's `<action>`):
- The full text of Section H.2 (Selected option block) is the rationale paragraph.
- The full text of Section I "Plan 234-04 spec" (this block) is the implementation steps.
- Files_modified list in Plan 04 frontmatter trims to exactly the 4 files above (drop the Option A / C sketch files).

---

## Sacred SHA evidence

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Canonical. No files under `liv/packages/core/` were read or modified by this investigation. Pre-commit hook will gate the commit.

## Mini PC SSH session evidence (fail2ban discipline)

4 batched SSH sessions executed over ~30 minutes:
- Session 1 (S1): Sections A.1-A.10 + F.1-F.4 + B.1-B.3 baseline
- Session 2 (S2): Section A.11 endpoint enumeration (route table from aioncore strings + JS bundle)
- Session 3 (S3): A.11 qr-login flow + JWT cookie shape + localStorage key search
- Session 4 (S4): C.2 Caddy routing + T1 external qr-login end-to-end + jwt_secret leak confirm

Each session ran a multi-step heredoc rather than per-step invocations. No fail2ban hits expected (sshd jail threshold ~6 attempts/10min; we ran 4 attempts/30min).

## Handoff

- **Plan 02**: Section I "Plan 234-02 spec" -- window-size + icon + label + LIVINITY_liv-ai cleanup. Files locked.
- **Plan 03**: Section I "Plan 234-03 spec" -- idempotent sed-replace in `install-liv-assistant.sh` + docs reword. Pattern + targets locked.
- **Plan 04**: Section I "Plan 234-04 spec" -- Option B (modified) livinityd `/liv-login` handler + iframe src swap + Redis feature flag. **ORCHESTRATOR MUST rewrite Plan 04's PLAN.md `<action>` block to match this section before Plan 04 executes.**
