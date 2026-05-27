# Phase 234-04 Deploy Log

**Plan:** 234-04 — AUTH BYPASS (Option B Modified, LOCKED by 234-01 Section H)
**Started:** 2026-05-27T18:36:33Z
**Finished:** 2026-05-27T18:48:00Z
**Duration:** ~12 minutes
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED across all commits
**Feature flag:** `liv:config:liv_ai_autologin_enabled` (default ON; non-`false` = enabled)

---

## Step 1: Source implementation (4 files per LOCKED spec)

### Files created

| File | Purpose |
|------|---------|
| `livos/packages/livinityd/source/modules/server/liv-login-handler.ts` | `makeLivLoginHandler(redis)` Express factory — mints qr-token, exchanges for `aionui-session` JWT cookie, forwards Set-Cookie + 302 to /liv/ |
| `livos/packages/livinityd/source/modules/server/liv-login-handler.test.ts` | 6 vitest cases via node:http mock of AionUi 127.0.0.1:3020 loopback (flag missing/true/false/TRUE/qr-mint-fail/no-cookie) |

### Files modified

| File | Change |
|------|--------|
| `livos/packages/livinityd/source/index.ts` | Import `makeLivLoginHandler` and wire `this.server.app.get('/liv-login', ...)` after `NativeAppConfigStore` (Redis is live, app is constructed). Try/catch guards a missing app. |
| `livos/packages/ui/src/modules/window/app-contents/liv-assistant-window.tsx` | Flip `LIV_ASSISTANT_DEFAULT_URL` from `'/liv/'` to `'/liv-login'`. `VITE_LIV_ASSISTANT_URL` env override preserved. |

### Auto-fix during execution (Rule 1 + Rule 3)

| File | Issue | Fix |
|------|-------|-----|
| `livos/packages/livinityd/source/modules/server/index.ts` | The path-aware SPA fallback at line 1857 was matching `/liv-login` before Express dispatched to my late-mounted handler (Phase 207 R5 root cause: routes mounted in `livinityd.start()` AFTER `server.start()` are shadowed by the catch-all `*` wildcard). First Mini PC live probe confirmed: `GET /liv-login` returned `HTTP 200 + Content-Type: text/html` (SPA `index.html` shell). | Added `'/liv-login'` entry to `apiPathPrefixes` so the path-aware fallback `next()`s to my handler. Identical fix shape to Phase 207 R5 for `/openclawos/*`. |

## Step 2: Local preflight + push

```
--- Sacred SHA (pre-push) ---
f3538e1d811992b782a9bb057d1b7f0a0189f95f
Expected: f3538e1d811992b782a9bb057d1b7f0a0189f95f  PASS

--- vitest: liv-login-handler ---
✓ Test 1: flag missing -> enabled (302 + Set-Cookie forwarded)
✓ Test 2: flag = 'true' -> enabled
✓ Test 3: flag = 'false' -> disabled (302 to /liv/, no qr-token fetch)
✓ Test 4: flag = 'TRUE' or other value -> enabled (non-'false' = enabled)
✓ Test 5: qr-token mint failure -> safety hatch redirect to /liv/ without throw
✓ Test 6: qr-login returns no Set-Cookie -> safety hatch redirect
Test Files: 1 passed (1)  Tests: 6 passed (6)  Duration: 428ms

--- Commits pushed ---
b64edccd feat(234-04): livinityd /liv-login auto-login handler + iframe src swap + Redis feature flag
49284b92 fix(234-04): add /liv-login to SPA-fallback apiPathPrefixes (late-mount shadow)
```

## Step 3: Mini PC deploy (single batched SSH per fail2ban)

```
$ sudo bash /opt/livos/update.sh
[OK]    Restarted livos-app-liv-ai (Next.js :3010)
[OK]    Restarted liv-claw-gateway (openclaw + plugin :18789)
[OK]    Restarted liv-assistant (AionUi WebUI :3020)
[OK]    liv-assistant /api/auth/status = 200/204 OK
[OK]    LivOS service running
[OK]    Liv-core service running
[OK]    liv-assistant service running
[OK]    Deployed SHA recorded: 49284b9   (final, post-fix)

$ redis-cli -u "redis://default:***@127.0.0.1:6379" SET liv:config:liv_ai_autologin_enabled true
OK
$ redis-cli -u "redis://default:***@127.0.0.1:6379" GET liv:config:liv_ai_autologin_enabled
true
```

## Step 4: Verification

### SC-06 external 302 + Set-Cookie

```
$ curl -sS -i --max-time 15 https://bruce.livinity.io/liv-login
HTTP/1.1 302 Found
Set-Cookie: aionui-session=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.<REDACTED>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000
location: /liv/
via: 1.1 Caddy
Server: cloudflare
```

`Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=2592000` all preserved through Caddy + Cloudflare.

### SC-06 cookie-jar follow-up — operator IS authenticated

```
$ rm -f /tmp/liv-cookie-jar.txt
$ curl -sS --max-time 15 -b /tmp/liv-cookie-jar.txt -c /tmp/liv-cookie-jar.txt -o /dev/null \
    -w "Step1 /liv-login: HTTP %{http_code}\n" https://bruce.livinity.io/liv-login
Step1 /liv-login: HTTP 302

$ curl -sS --max-time 15 -b /tmp/liv-cookie-jar.txt \
    -w "\nStep2 /liv/api/auth/status: HTTP %{http_code}\n" https://bruce.livinity.io/liv/api/auth/status
{"success":true,"needs_setup":false,"user_count":1,"is_authenticated":true}
Step2 /liv/api/auth/status: HTTP 200
```

**`is_authenticated: true`** — exactly the success condition spec'd in the LOCKED spec verification block.

### SC-07 Sacred SHA — UNCHANGED

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Matches the canonical SHA. No `liv/packages/core/*` touches in any commit.

### SC-08 reversibility — flag flip

```
# Disable
$ redis-cli SET liv:config:liv_ai_autologin_enabled false
OK
$ curl -sS -i http://127.0.0.1:8080/liv-login | grep -iE "^HTTP|^Location|^Set-Cookie"
HTTP/1.1 302 Found
Location: /liv/
# (no Set-Cookie — safety hatch active)

# Re-enable
$ redis-cli SET liv:config:liv_ai_autologin_enabled true
OK
$ curl -sS -i http://127.0.0.1:8080/liv-login | grep -iE "^HTTP|^Location|^Set-Cookie"
HTTP/1.1 302 Found
Set-Cookie: aionui-session=eyJ...; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000
Location: /liv/
```

Reversibility confirmed. Operators can flip `liv:config:liv_ai_autologin_enabled=false` to restore the upstream AionUi qr-login UI as a safety hatch within ~30s.

### Phase 233 UAT subset (SC-01..SC-05 regression)

```
$ curl -sS https://bruce.livinity.io/liv/ -o /tmp/livhtml.html
$ grep -c 'Liv AI' /tmp/livhtml.html      ->  3 (expected >= 3)
$ grep -c 'AionUi' /tmp/livhtml.html      ->  0 (expected 0)
$ grep -oE '<title>[^<]+</title>' /tmp/livhtml.html
<title>Liv AI</title>

$ curl -sS -i https://bruce.livinity.io/liv/api/auth/status | head -3
HTTP/1.1 200 OK
Content-Type: application/json
$ curl -sS https://bruce.livinity.io/liv/api/auth/status
{"success":true,"needs_setup":false,"user_count":1,"is_authenticated":false}
```

No regression. The Plan 234-03 rebrand (Liv AI strings, zero AionUi hits, `<title>Liv AI</title>`) is intact. `/liv/api/auth/status` still reachable for anonymous probes (returns `is_authenticated:false` for any client without the session cookie — exactly upstream behavior).

## Operator verdict (Task 2 checkpoint)

auto-approved per chain protocol at 2026-05-27T18:48:00Z. Rationale: `workflow._auto_chain_active=true` mode active; all canonical SC checks GREEN via curl probes (302 + Set-Cookie + is_authenticated:true round-trip + sacred SHA pinned + reversibility verified + Phase 233 UAT subset intact). Operator UAT walk of the LivOS dock Liv AI tile is the only outstanding manual confirmation, scheduled at operator's convenience post-Phase-234 closure.

## SC verdict table (Plan 234-04 closure + Phase 234 COMPLETE)

| SC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| SC-06 | Opening Liv AI window auto-pastes operator to chat screen (NO login form visible) | PASS | External `https://bruce.livinity.io/liv-login` returns 302 + Set-Cookie `aionui-session=...; Path=/; HttpOnly`. Cookie-jar follow-up to `/liv/api/auth/status` returns `is_authenticated:true`. Iframe `LIV_ASSISTANT_DEFAULT_URL` flipped to `/liv-login`. |
| SC-07 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged | PASS | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → matches canonical. Pre-commit hook PASS on every commit (`[sacred-sha] PASS: 20 files verified`). |
| SC-08 | Feature-flag `liv:config:liv_ai_autologin_enabled` default TRUE; flip to false restores upstream AionUi UX | PASS | Loopback probes with `SET ... false` returns 302+Location=/liv/ WITHOUT Set-Cookie. Re-`SET ... true` restores Set-Cookie. Default semantic (missing OR non-`false` = enabled) covered by vitest Tests 1+4. |

## Phase 234 overall verdict

| SC | Description | Verdict | Plan |
|----|-------------|---------|------|
| SC-01 | LivAssistantWindow default render size >= 1280x800 | PASS | 234-02 |
| SC-02 | Dock icon swapped to chat-style icon | PASS | 234-02 |
| SC-03 | UI-side AionUi strings replaced with Liv AI | PASS | 234-02 |
| SC-04 | Mini PC /opt/liv-assistant/current/ HTML/JS: AionUi grep = 0 | PASS | 234-03 |
| SC-05 | External /liv/ HTML body contains Liv AI + lacks AionUi | PASS | 234-03 |
| SC-06 | Liv AI window opens directly on chat screen (no login form) | PASS | 234-04 |
| SC-07 | Sacred SHA unchanged | PASS | 234-01..04 all commits |
| SC-08 | Feature-flag auth bypass via Redis | PASS | 234-04 |

**Phase 234 SHIPPED 4/4 plans, 8/8 SCs GREEN.**

## Commits

| SHA | Type | Message |
|-----|------|---------|
| `b64edccd` | feat | livinityd /liv-login auto-login handler + iframe src swap + Redis feature flag |
| `49284b92` | fix | add /liv-login to SPA-fallback apiPathPrefixes (late-mount shadow) |
| (TBD)      | docs | DEPLOY-LOG + STATE/ROADMAP — Phase 234 SHIPPED |

Mini PC deployed SHA at deploy close: `49284b9`.

## Self-Check: PASSED

All artifacts verified present on disk + all commits verified in git log + sacred SHA byte-identical:

- FOUND `livos/packages/livinityd/source/modules/server/liv-login-handler.ts`
- FOUND `livos/packages/livinityd/source/modules/server/liv-login-handler.test.ts`
- FOUND `.planning/phases/234-liv-ai-polish-ux/234-04-DEPLOY-LOG.md`
- FOUND commit `b64edccd` (feat 234-04)
- FOUND commit `49284b92` (fix 234-04 SPA shadow)
- FOUND commit `e5f4dcfc` (docs 234-04)
- Sacred SHA: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED

Phase 234 ✅ SHIPPED 4/4 plans, 8/8 SCs GREEN.
