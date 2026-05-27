# Resume Here — v43 Continuation Plan

**Last session ended**: 2026-05-27 night, after Phase 238.10 ship.

**Operator handoff**: "Şimdi daha iyi. Plan hazırsa /clear çekip plandan devam edelim." → ready to clear context and resume from this plan.

---

## TL;DR — What's Done, What's Next

### ✅ v43 SHIPPED (11 hot-fix phases, cumulative visible-rebrand)

Operator's "HİÇ BİR Aion yazısı kalmasın + Livinity branding her yerde" theme is now FULLY COMPLETE. All surfaces visible to the operator inside `https://bruce.livinity.io/liv/` are Livinity-branded:

| Phase | What |
|-------|------|
| 238 | static/ word-boundary Aion 7→0 + logo SVG scaffold |
| 238.1 | static/ footer URLs `github.com/iOfficeAI/*` → `https://livinity.io` |
| 238.2 | data/builtin-skills/*.md → Liv AI |
| 238.3 | Default agent = Claude Code (Aion CLI visible per operator); persistence helper |
| 238.4 | iframe CSS injection + favicon SVG + theme-color #1d1d1f + Space Grotesk + Arco palette monochrome |
| 238.5 | LivOS dock tile (purple-blue → evolved to donut in 238.7) |
| 238.6 | Inline brand-mark sed (V-mountain → 'L' → evolved to donut in 238.7) |
| 238.7 | Real Livinity donut hardcoded white-on-black |
| 238.8 | CSS bg-image approach (sandbox bug — broken in adaptive flow) |
| 238.9 | 2-file split + CSS @media switch — adaptive works |
| 238.10 | Cache-bust `?v=238_10` + defensive SVG hide + theme variants |

### ⏭️ OBSOLETED: Phase 244

`/opt/liv-assistant/current/**/*.md` has zero files. All AionUi markdown lives at `data/builtin-skills/` which Phase 238.2 already covered.

### ⏸️ DEFERRED to focused planning sessions (substantial feature work)

| Phase | Why deferred |
|-------|--------------|
| **241** (MCP auto-add) | Foundational. Probe found `/api/extensions/mcp-servers` is GET-only; write API path uncertain. Needs deeper API discovery + livinityd `mcp-registrar/` module + Redis first-boot sentinel + per-tool EXISTS gate. Multi-plan. |
| **240** (Local Agents install) | HARD-depends on 241 — cannot plan until 241 ships and exposes the install/auth API surface. |
| **242** (Luse universal docs) | Docs-only but pointless without 241's MCP exposure (the docs describe a capability that requires Phase 241 to be USEFUL). Defer until 241 ships. |
| **239** (Onboarding "CLI Tools" UI) | Substantial frontend rebuild in `livos/packages/ui/`. Needs discuss-phase for UX (card layout, install-button copy, AI section removal data-loss verification). |
| **243** (Persistent UI terminal) | Substantial 4-6 plan effort (livinityd PTY module + WS endpoint + xterm.js panel + dock entry + Mini PC deploy). Needs architecture discuss (node-pty selection, WS reuse, dock UX). |
| **245** (E2E UAT + milestone close) | Operator-gated walk. Last in line. |

---

## Recommended Next-Session Sequence

1. **`/gsd-discuss-phase 241`** — deep API probe + module design decisions. Critical foundational phase that unblocks 240 + 242.
2. After 241 ships: **`/gsd-plan-phase 240`** + **`/gsd-plan-phase 242`** (both unblock once 241 exposes install/auth API).
3. **`/gsd-discuss-phase 239`** — onboarding wizard UX with operator (card layout, install button copy, AI section removal flow).
4. **`/gsd-discuss-phase 243`** — terminal panel architecture (node-pty vs node-pty-prebuilt-multiarch, WS reuse pattern from Phase 226-04/237, dock UX).
5. **`/gsd-execute-phase 245`** — operator walks all Phase 238–243 deliverables → milestone archive → v44 unblock.

---

## Critical Session Learnings (do NOT re-discover)

### 1. Caddy `replace_response` plugin is NOT installed on Mini PC

Mini PC Caddy v2.11.3 only has `caddy.logging.encoders.filter.replace` (log encoder, NOT HTTP response). Phase 232's original design of Caddy `replace` directive for HTML injection was therefore dead since Phase 232. **Workaround used**: sed-edit the on-disk `index.html` directly (Phase 238.4-E pattern). Same technique applies to any future response-rewrite needs.

### 2. AionUi's index.html on disk does NOT regenerate on restart

Phase 234-03 / 238.2 / 238.4 deploy history confirms: AionUi backend serves `/opt/liv-assistant/current/static/index.html` as-is and does NOT rewrite it on each restart. Sed-edits persist across `systemctl restart liv-assistant`.

### 3. CSS `background-image` SVGs are SANDBOXED — no `@media` adapts

When SVG is referenced via CSS `background-image: url(...)`, browsers load it in a restricted context that DISABLES the SVG's internal `@media (prefers-color-scheme)` rules. SVG media queries work ONLY for `<img>`, `<object>`, and `<link rel="icon">` references. **Workaround**: ship 2 separate SVG files (light + dark variants) and switch via CSS `@media` query on the host page.

### 4. AionUi `/api/settings/client.guid.lastSelectedAgent` drifts to `agent_type` strings

Operator UI flips `lastSelectedAgent` to `agent_type` strings like `"claude"` / `"opencode"` instead of canonical agent `id` like `"2d23ff1c"`. Phase 238.3 helper `scripts/set-default-liv-agent.sh` fires on every `update.sh` post-restart and re-normalizes to `"2d23ff1c"` (Claude Code id). Persistence chain verified working across multiple deploys this session.

### 5. Built-in skills are ON-DISK markdown, NOT binary-embedded

`/opt/liv-assistant/data/builtin-skills/` contains 24 SKILL.md + ~100 total .md files. AionUi Bun binary extracts on first start; subsequent restarts don't re-extract. Sed-replacements PERSIST. (Phase 238.1 closure had incorrectly documented these as binary-embedded — Phase 238.2 disproved.)

### 6. `/api/agents` Aion CLI entry name is binary-embedded

The "Aion CLI" agent name + `/api/assets/logos/brand/aion.svg` icon come from the AionUi Bun binary, NOT from disk. Cannot be sed-replaced without violating Phase 234-03 (binary sed → ELF corruption). To rename would require either upstream fork (D-V42-SACRED violation) or installing Caddy `replace_response` plugin for response-body rewrite. Operator-accepted to keep visible as-is (Phase 238.3 spec: "Disable etmene gerek yok cli kalabilir").

### 7. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

Pre-commit hook gates this. All 22 Phase 238.x commits this session PASSED. Never touch `liv/packages/core/src/sdk-agent-runner.ts`.

### 8. Mini PC sacred sha256 = `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`

Verified UNCHANGED across every Phase 238.x deploy. Continue to gate all future phase deploys with 4-snapshot agreement (repo pre-push + Mini PC sha256 PRE + Mini PC sha256 POST + repo POST-verify).

### 9. install-liv-assistant.sh now has 6 sed/copy steps

Run order: 234-03 (compound rebrand) → 235 (path-rewrite) → 238-A (logo overlay scaffold) → 238-B (word-boundary sed) → 238.1-C (footer redirect) → 238.2-D (builtin-skills rebrand) → 238.4-E (index.html sed + cache-bust) → 238.6-F (brand-mark sed → donut + marker class) → 238 branding asset copy (5 files now: livinity-overlay.css, favicon.svg, manifest.json, favicon-light.svg, favicon-dark.svg) → bun install → UPSTREAM.md.

### 10. Cumulative session commit list (22 commits)

`8a5e2608` → `52f1232b` → `09cb8ebf` → `a11a7746` → `515149b2` → `bf5eb863` → `c23c032e` → `0fa64cd4` → `f57d3cf7` → `33317d28` → `c2ee9974` → `fab57c5d` → `99f4ecb6` → `2fa135e9` → `94785c51` → `51126346` → `18737d3c` → `a34740d9` → `997242c8` → `7d96d167` → `d13bd1df` → `7842706a` → `56be8601` → `c4f734ed` → `75a28005`

All sacred-sha hook PASSED. All on master, pushed to origin.

---

## Mini PC Live State (verify before resuming)

Single batched SSH probe to confirm state:

```bash
SSH_KEY="C:/Users/hello/Desktop/Projects/contabo/pem/minipc"
ssh -i "$SSH_KEY" -T bruce@10.69.31.68 'bash -s' <<'EOF'
echo "=== Sacred + LICENSE ==="
sudo sha256sum /opt/liv/packages/core/src/sdk-agent-runner.ts /opt/liv-assistant/LICENSE /opt/liv-assistant/NOTICE
echo "=== Services ==="
systemctl is-active livos liv-core liv-worker liv-memory liv-assistant caddy
echo "=== Deployed SHA ==="
cat /opt/livos/.deployed-sha 2>/dev/null
echo "=== lastSelectedAgent ==="
curl -sS http://127.0.0.1:3020/api/settings/client | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("guid.lastSelectedAgent"))'
echo "=== Phase 238 verify (all zeros) ==="
echo "static word-boundary Aion: $(sudo find /opt/liv-assistant/current/static/ -maxdepth 6 -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) -not -name 'LICENSE*' -not -name 'NOTICE*' 2>/dev/null | xargs sudo grep -lE '\b(Aion|AION|aion)\b' 2>/dev/null | wc -l)"
echo "static iOfficeAI: $(sudo find /opt/liv-assistant/current/static/ -maxdepth 6 -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) 2>/dev/null | xargs sudo grep -lE 'github\.com/iOfficeAI' 2>/dev/null | wc -l)"
echo "builtin-skills Aion: $(sudo find /opt/liv-assistant/data/builtin-skills/ -type f -name '*.md' 2>/dev/null | xargs sudo grep -lE 'AionUi|AionUI|aionui' 2>/dev/null | wc -l)"
EOF
```

Expected output:
- Sacred sha256: `f3538e1d...` repo + `62f92459...` Mini PC
- LICENSE: `a515d5a7...`, NOTICE: `be9e969f...`
- 6/6 services active
- Deployed SHA: `c4f734e` (or whatever is the latest after operator's session)
- lastSelectedAgent: `2d23ff1c`
- All Phase 238 verify metrics = 0

---

## Operator Preferences Loaded This Session

- **Autonomous execution** ([feedback_autonomous]) — run GSD A-Z without interrupting
- **Full-autonomous overrides cautious gates** ([feedback_full_autonomous_no_questions]) — "soru sorma"; override planner flags
- **Turkish status updates** ([user_language]) — code/paths/commits stay English, prose Turkish
- **Subscription-only** ([feedback_subscription_only]) — Claude Code via sdk-subscription mode, never BYOK
- **Mini PC ONLY** ([feedback_minipc_is_owncloud_primary]) — Server4/Server5 off-limits for LivOS work
- **SSH discipline** ([feedback_ssh_rate_limit]) — batch read-only commands into ONE ssh session per fail2ban
- **Aion CLI agent can stay visible** (operator clarified Phase 238.3) — only DEFAULT changes to Claude Code
- **Real website logo, not approximations** (operator clarified Phase 238.7) — donut from `platform/web/public/favicon.svg`, adaptive light/dark

---

## Recommended FIRST command after /clear

```
/gsd-discuss-phase 241
```

Or if operator wants a different ordering, options are documented above in "Recommended Next-Session Sequence".
