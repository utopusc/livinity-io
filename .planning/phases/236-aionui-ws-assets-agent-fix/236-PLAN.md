---
phase: 236-aionui-ws-assets-agent-fix
plan: 01
type: hotfix
wave: 1
created: 2026-05-27
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
mini_pc_target: bruce@10.69.31.68
parent_phase: 235
trigger: |
  Operator live-browser test post-Phase-235 deploy. Quote: "giris yapti ama
  cok fazla hata var iconlar yuklenmiyor! Ben Cogu Seyde Auth kullanmak
  istiyorum API degil!" Browser console errors:
    - wss://bruce.livinity.io/ws REPEATED FAIL (chat unusable, must reload)
    - /api/assets/logos/brand/aion.svg 404
    - /api/assets/logos/ai-major/claude.svg 404
    - /api/assets/logos/tools/coding/opencode-light.svg 404
    - /liv/api/conversations/<id>/mode 404
    - /liv/api/conversations/<id>/model 404
    - AionUi: "Şu anda yalnızca Aion CLI özel modelleri destekliyor"
tags: [v42, hotfix, caddy, aionui, websocket, operator-blocker]
requirements: []
---

# Phase 236 — AionUi WebSocket + Assets + Agent Default Hot-Fix

## Objective

Phase 235 sed-replaced QUOTED `/api/` → `/liv/api/` in the vendored JS bundle.
That fixed string-literal API calls but missed two failure modes:

1. **Dynamic backtick-template URLs** in JS: e.g.
   `new WebSocket(\`wss://${location.host}/ws\`)` — `/ws` is interpolated, not a
   quoted literal, so sed never touched it. Result: WebSocket connects to root
   `/ws` (LivOS shell) → 404 fail → chat hangs until manual reload.
2. **Runtime-inserted DOM `src` attributes**: e.g.
   `<img src="/api/assets/logos/...">` injected via React render, not present
   as a literal in the bundled source after minification's template
   transformation. Asset 404s break AionUi's icon set (Aion, Claude, OpenCode
   logos blank).

Trying to extend the sed pass to cover dynamic URL construction is fragile
(would require AST-level rewriting). Instead, route the ROOT-relative
fallouts to the AionUi backend at Caddy via a **Referer-gated catch-all**.

## Background

- Phase 235 `LIV_ASSISTANT_HANDLE` proxies `/liv /liv/*` → `127.0.0.1:3020`
  with `uri strip_prefix /liv`. Static literal-quoted paths now correctly hit
  `/liv/api/...` and reach AionUi.
- Livinityd's own `/api/*` traffic (LivOS dashboard) flows through the
  apex catch-all `handle { reverse_proxy 127.0.0.1:8080 }`. Referer for those
  requests is `https://bruce.livinity.io/` (or `/app-store` etc.), NOT
  `/liv/...`.
- Iframe loaded at `https://bruce.livinity.io/liv/` sets Referer to
  `https://bruce.livinity.io/liv/...` for every subresource fetch.
- **Therefore a Referer-gated named matcher can disambiguate the two
  audiences losslessly.**

## Fix strategy

Add a Caddy named matcher BEFORE `@liv`:

```
@liv_subresource {
    header_regexp Referer ^https?://[^/]+/liv(/|$)
    path /api/* /ws /ws/*
}
handle @liv_subresource {
    reverse_proxy 127.0.0.1:3020 {
        header_down -X-Frame-Options
        header_down -Content-Security-Policy
    }
    header Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
}
```

Caddy v2 named-matcher block with `{ }` AND multiple conditions inside —
the matcher matches when **both** conditions are true (logical AND).

The `header_regexp Referer` matches:
- `https://bruce.livinity.io/liv/...` ✓
- `https://bruce.livinity.io/liv` ✓ (trailing-slash optional via `(/|$)`)
- `https://anything/liv/...` ✓ (defensive — relay drops origin host header)

LivOS-shell `/api/*` traffic (Referer ends in `/` or `/app-store` etc.)
does NOT match → falls through to catch-all on :8080 → unchanged behavior.

WebSocket upgrade auto-handled by Caddy's `reverse_proxy` (Phase 226-04
established this — do NOT set `header_up Connection`/`Upgrade`).

Header stripping mirrors `LIV_ASSISTANT_HANDLE` exactly (iframe-CSP safe).

## Threat model

| Mitigation | File | Notes |
|------------|------|-------|
| referrer_spoof | caddy.ts | A malicious origin could spoof `Referer: .../liv/` to reach `/api/auth/...`. AionUi backend enforces its own auth gate (qr-session cookie), so spoofed Referer alone grants no privilege escalation — only routes traffic to a different backend. No new vector. |

## Tasks

### Task 1 — Caddy patch + test extension

**Type:** auto
**TDD:** false (mirror existing `LIV_ASSISTANT_HANDLE` constant pattern; tests are
generator-output assertions, not behavioral RED→GREEN flow)

**Files:**
- Modify `livos/packages/livinityd/source/modules/domain/caddy.ts`:
  - Define new `LIV_ASSISTANT_SUBRESOURCE_HANDLE` constant
  - Emit it in all 3 site-block sites (null mainDomain :80, apex, multi-user subdomain),
    immediately BEFORE `LIV_ASSISTANT_HANDLE`
- Modify `livos/packages/livinityd/source/modules/domain/caddy.test.ts`:
  - Add new describe `Phase 236 — /api + /ws Referer-gated subresource handle`
  - Assert the matcher block + path tokens + reverse_proxy target + ordering

**Behavior:**
- Generated Caddyfile contains the literal substring `@liv_subresource {`
- Contains `header_regexp Referer ^https?://[^/]+/liv(/|$)`
- Contains `path /api/* /ws /ws/*`
- Block proxies to `127.0.0.1:3020`
- Includes `header_down -X-Frame-Options` + `header_down -Content-Security-Policy`
- Includes the `frame-ancestors` CSP set at handle scope
- Ordering: `@liv_subresource` appears BEFORE `@liv path` in apex + subdomain + null-fallback
- Phase 226-04 invariants HOLD post-236 (no regression)

**Done when:**
- `pnpm --filter livinityd vitest run source/modules/domain/caddy.test.ts` — ALL GREEN
- `pnpm --filter livinityd typecheck` — same baseline (no NEW errors)
- Single atomic commit: `feat(236-01): Caddy referer-gated /api+/ws subresource handle`

### Task 2 — AionUi default-agent investigation (single batched SSH)

**Type:** auto
**TDD:** false (investigation only — zero code change)

**Files:**
- Create `.planning/phases/236-aionui-ws-assets-agent-fix/236-AGENT-FINDINGS.md`

**Behavior:**
Single batched SSH to `bruce@10.69.31.68` with these probes inside ONE heredoc
(fail2ban discipline):

```bash
curl -s http://127.0.0.1:3020/api/agents | head -120
curl -s http://127.0.0.1:3020/api/settings/client 2>/dev/null | head -120
sudo ls /opt/liv-assistant/data/ 2>/dev/null
sudo cat /opt/liv-assistant/data/config.json 2>/dev/null | head -120
sudo ls /etc/liv-assistant/ 2>/dev/null
# Probe likely default-setting endpoints (do NOT mutate)
curl -s -i http://127.0.0.1:3020/api/agents/default 2>/dev/null | head -10
curl -s -i http://127.0.0.1:3020/api/settings/agents/default 2>/dev/null | head -10
```

Document findings in `236-AGENT-FINDINGS.md`:
- Are all 3 agents listed (Aion CLI / Claude Code / OpenCode)?
- Which is currently selected as default?
- Is there a one-shot HTTP mutation that flips default to Claude Code?
- If YES: one curl call to flip (DOCUMENT the call; only execute if low-risk).
- If NO: punt to operator UI step (document "Operator: open Liv AI → settings →
  select Claude Code agent → save").

**Done when:**
- `236-AGENT-FINDINGS.md` exists with all 7 probe outputs captured
- Findings section explicitly states APPROACH = `curl-mutation` OR `operator-ui`
- Atomic commit: `docs(236-02): AionUi default-agent investigation`

### Task 3 — Mini PC deploy + verification

**Type:** auto
**TDD:** false (deploy/verify)

**Files:**
- Create `.planning/phases/236-aionui-ws-assets-agent-fix/236-DEPLOY-LOG.md`

**Behavior:**
1. `git push origin master` (Task 1 + Task 2 commits)
2. Single batched SSH (fail2ban):
   ```
   sudo bash /opt/livos/update.sh
   sudo grep -c '@liv_subresource' /etc/caddy/Caddyfile  # expect >= 1
   sudo systemctl is-active caddy livos liv-core liv-worker liv-memory liv-assistant
   ```
3. External smoke (from orchestrator):
   ```
   curl -fsSI -H "Referer: https://bruce.livinity.io/liv/" \
     https://bruce.livinity.io/api/assets/logos/ai-major/claude.svg
   # expect HTTP 200

   curl -fsSI -H "Referer: https://bruce.livinity.io/liv/" \
     https://bruce.livinity.io/api/settings/client
   # expect HTTP 200

   curl -fsSI -H "Referer: https://bruce.livinity.io/liv/" \
     -H "Upgrade: websocket" -H "Connection: Upgrade" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Sec-WebSocket-Version: 13" \
     https://bruce.livinity.io/ws
   # expect HTTP 101

   curl -fsSI https://bruce.livinity.io/                   # expect 200
   curl -fsSI https://bruce.livinity.io/app-store          # expect 200
   curl -fsSI https://bruce.livinity.io/liv/api/auth/status  # expect 200 (P235 non-regression)
   ```
4. Sacred SHA non-regression: `git hash-object liv/packages/core/src/sdk-agent-runner.ts`
   = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

**Done when:**
- All 7 external probes return expected status codes
- All 6 services `active`
- Caddyfile contains `@liv_subresource` block live
- Sacred SHA matches
- Phase 235 path-rewrite verified non-regressed
- Atomic commit: `docs(236-03): Mini PC deploy + verification log`

## Success Criteria

- [ ] SC-01: `caddy.ts` emits `@liv_subresource` named matcher in all 3 site blocks
- [ ] SC-02: `caddy.test.ts` new assertions PASS; full file suite stays GREEN
- [ ] SC-03: livinityd typecheck baseline preserved (no NEW failures)
- [ ] SC-04: Mini PC `update.sh` EXIT 0 + 6/6 services active post-deploy
- [ ] SC-05: External WS upgrade with `Referer: .../liv/` → HTTP 101
- [ ] SC-06: External `/api/assets/...` with `Referer: .../liv/` → HTTP 200
- [ ] SC-07: External LivOS shell `/` + `/app-store` still HTTP 200 (no regression)
- [ ] SC-08: External `/liv/api/auth/status` still HTTP 200 (Phase 235 preserved)
- [ ] SC-09: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED
- [ ] SC-10: `236-AGENT-FINDINGS.md` documents Claude Code default approach
- [ ] SC-11: DEPLOY-LOG.md + SUMMARY.md + STATE.md + ROADMAP.md committed
- [ ] SC-12: Pushed to `origin/master`

## Invariants

- Sacred SHA UNCHANGED (pre-commit hook gates)
- Mini PC ONLY (HARD RULE — never Server4 or Server5 deploy)
- LICENSE/NOTICE byte-identical (Apache-2.0 attribution preserved)
- Phase 235 path-rewrite in `install-liv-assistant.sh` NOT touched
- Phase 234-04 `/liv-login` cookie flow NOT touched
- All commits live atomic (NEVER amend rule)
- SSH sessions batched (fail2ban discipline)
