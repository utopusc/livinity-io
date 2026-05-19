# Phase 160 — Luse LivOS Overlay + Haiku Routing — CONTEXT

**Trigger:** Phase 159 ship sonrası operator Luse MCP review istedi (2026-05-19). Static review 4 sorun + 1 yeni gereksinim ortaya çıkardı.

**Status:** READY-TO-EXECUTE (CONTEXT + 6 PLAN.md hazır)
**Created:** 2026-05-19
**Depends on:** Phase 159 ✅

## What this phase is

Luse MCP (`livos/packages/livinityd/source/modules/computer-use/`) Bytebot'tan **byte-for-byte verbatim** kopyalanmış (D-09/D-12 invariant). LivOS'ta çalışırken 4 noktada drift var; ek olarak operator computer-use loop için maliyet/hız optimizasyonu istedi (Haiku model).

## Five workstreams

### Workstream A — Haiku model routing for computer-use (operator's explicit request)

Operator: *"computer use icin haiku modelini istiyorum yani Claude a chat den yazinca opus yada sonnet ile goruseyim ama pc kontrol olunca haiku olsun"*

**Goal:** Agent loop'ta Luse computer-use tool'ları çağrıldığında model `claude-haiku-4-5-20251001`'e route edilsin. Normal AI Chat panel + WebApp chat input Opus/Sonnet (`claude-sonnet-4-6` veya `claude-opus-4-7`) kullanmaya devam etsin.

**Why:** Computer-use loop screenshot + click cycle çok turn içerir, her turn pahalı bir Opus call'u yapar. Haiku 4.5 vision capable, daha hızlı + daha ucuz, screenshot-grounded coordinate çıkarımı için yeterli. Chat'in akıl yürütme kalitesini kaybetmemek için sadece computer-use path'e izole.

**Approach:** Agent runner construction time'da `mode: 'computer-use' | 'chat'` flag'i ekle. Computer-use mode'da model override = haiku. Chat mode'da existing config (Opus/Sonnet) korunur.

### Workstream B — LivOS system prompt overlay (P1 from review)

Bytebot prompt verbatim "Firefox/Thunderbird/VS Code/1Password" + "1280x960 display" + "ONLY ACCESS APPLICATIONS VIA DESKTOP ICONS" diyor — hiçbiri LivOS'ta doğru değil.

**Goal:** Verbatim contract'ı kırma (upstream sync'i korunsun). Onun yerine prompt-builder layer'da LivOS-specific overlay PREPEND et:

```
[LIVOS CONTEXT — PREPENDED TO BYTEBOT VERBATIM PROMPT BELOW]
You are operating LivOS, NOT a generic Linux desktop.
- This is the LivOS shell: React frontend + dock + Windows Manager panel
- Desktop apps available right now: <runtime list from windowManager.windows + apps.native.list>
- Display resolution: <runtime read from xdpyinfo for active display>
- App launcher: use `computer_application` with LivOS app names like 'n8n', 'libreoffice', 'docker', NOT 'firefox' etc.
- WebApp URL pattern is <app>-<user>.livinity.io (dash, NOT dot — e.g. n8n-bruce.livinity.io)
- Below is the upstream Bytebot prompt verbatim. Where it conflicts with this context, this context wins.
─────────────────────────
[BYTEBOT VERBATIM PROMPT FOLLOWS]
```

**Why:** D-09 verbatim contract honored (Bytebot prompt bytes unchanged). Upstream sync future-proof. LivOS context dinamik runtime'dan gelir, hardcode değil.

### Workstream C — `computer_application` LivOS launcher integration (P2 from review)

Şu an enum sadece Bytebot apps: `firefox, thunderbird, 1password, vscode, terminal, desktop, directory`. LivOS apps (n8n, LibreOffice, Docker, native app'leri) bu tool üzerinden açılamıyor.

**Goal:** APP_MAP'i extend et — LivOS app discovery: WebApps (apps.list query) + Native apps (apps.native.list query) + classic Bytebot apps (binary check, retained for parity).

Handler:
- LivOS app match (WebApp/Native) → `windowManager.openWindow(appId)` çağır
- Classic Bytebot app match → mevcut binary spawn flow
- Match yoksa → error

Schema enum dinamikleştirilemez (MCP protocol static), o yüzden enum kaldırılır + free-form string + handler tarafında runtime validation.

**Why:** Agent'ın "n8n aç" diyebilmesi için. Phase 159'da LibreOffice gibi native app'ler artık registry'li (registerCloseHandler) — agent bunları launcher'dan açabilmeli, sonra kontrol edebilmeli.

**Note on domain pattern:** Operator clarified URL pattern is `n8n-bruce.livinity.io` (dash separator), NOT `n8n.bruce.livinity.io` (subdomain). Tüm reference + system prompt overlay bunu kullanır.

### Workstream D — Dynamic coordinate space in prompt (P4 from review)

Prompt hardcoded "1280 x 960" diyor — gerçek display'ler 1920x1080 (master `:1`) ve 1280x720 (native `:10+`). LLM yanlış koordinat boşluğunda akıl yürütüyor.

**Goal:** Prompt overlay'de display size'ı runtime `xdpyinfo` ile çek; `LUSE_TARGET_DISPLAY` env'ine göre doğru display'in size'ı verilsin.

**Why:** Modern multimodal LLM (Claude) screenshot'a ground'lıyor ama text hint ile tutarlılık varsa coordinate accuracy artar. ~10-20% improvement bekleniyor.

### Workstream E — `computer_read_file` path sandbox (P3 from review)

Şu an arbitrary path okuyabiliyor. `LUSE_USER_ID` env'i geçiliyor ama path traversal koruması yok.

**Goal:** Allowlist + path traversal regex:
- Allowed: `/home/<user>/`, `/tmp/luse-*/`, `/opt/livos/data/uploads/<userId>/`
- Denied: her şey (`/etc/passwd`, `/opt/livos/.env`, vb. çıkar)

Symlink resolution: `realpath` ile çöz, sonra allowlist'e karşı match et.

**Why:** Production hardening. LLM-controlled file read sandbox edilmeli — özellikle agent jailbreak senaryosu varsa.

## Out of scope (deferred)

- Per-WebApp Luse MCP instance soft cap (Phase 97-05 var, değeri tune'lama ayrı iş)
- Verbatim contract komple bırakma (D-09 violation — major architectural change, ayrı discussion gerekir)
- Bytebot upstream sync (manuel periyodik iş, automation gerekmiyor şimdi)

## Files to read (executor agents için)

### Workstream A (Haiku routing)
- `liv/packages/core/src/agent.ts` — agent loop construction
- `liv/packages/core/src/agent-session.ts` — session manager
- `liv/packages/core/src/api.ts` — API call site (model id)
- `liv/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` — runner factory
- `liv/packages/core/src/liv-agent-runner.ts` — Liv-specific runner
- `liv/packages/core/src/sdk-agent-runner.ts` — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ⚠️ NOT modify

### Workstream B (prompt overlay)
- `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` — DO NOT modify body (verbatim contract)
- `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` — overlay injection point
- `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` — env var threading

### Workstream C (computer_application)
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` — handler (line ~657 `computer_application`)
- `livos/packages/livinityd/source/modules/computer-use/native/window.ts` — APP_MAP (line 56)
- `livos/packages/livinityd/source/modules/computer-use/luse-tools.ts` — schema (line 417 `_applicationTool`)
- `livos/packages/ui/src/providers/window-manager.tsx` — openWindow API
- `livos/packages/livinityd/source/modules/apps/native-routes.ts` — native app list

### Workstream D (dynamic display size)
- `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` — has display reading
- Workstream B overlay'e bağlı

### Workstream E (file sandbox)
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` — `computer_read_file` handler
- `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` — file write pattern (reference)

## Hard guardrails

1. **Sacred SHA** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — preserve across all commits
2. **D-09 verbatim contract** — `luse-system-prompt.ts` body bytes UNCHANGED. All LivOS context goes in prompt-builder overlay, not in the verbatim file
3. **D-NO-NEW-DEPS** — no new npm packages. Use existing ioredis, MCP SDK, etc.
4. **Domain pattern** — every reference uses `<app>-<user>.livinity.io` (dash), NEVER `<app>.<user>.livinity.io` (dot)
5. **Chat path untouched** — AI Chat panel + WebApp chat input keep current model config (Opus/Sonnet). Only computer-use call sites get Haiku override.
6. **Test pattern** — source-text invariants per existing webapp-floating-action-bar.test.tsx (no @testing-library/react)
7. **Atomic commits per task** — `feat(160-NN):` / `chore(160-NN):` / `fix(160-NN):` prefixes

## Plans (6 total, 3 waves)

| # | Plan | Wave | Files | Tasks |
|---|---|---|---|---|
| 01 | Haiku routing for computer-use loop | 1 | agent-runner-factory, liv-agent-runner, api.ts | 2 |
| 02 | LivOS system prompt overlay (verbatim-preserving) | 1 | agent-prompt-builder, luse-mcp-config | 2 |
| 03 | computer_application LivOS launcher | 2 | tools.ts, window.ts (APP_MAP), luse-tools.ts (schema) | 3 |
| 04 | Dynamic display size via xdpyinfo | 2 | agent-prompt-builder (uses Plan 02 overlay scaffold) | 1 |
| 05 | computer_read_file path sandbox | 2 | tools.ts | 2 |
| 06 | Verification sweep + UAT | 3 | 160-VERIFICATION.md | 2 |

## Expected duration

~1-1.5 saat full execute (Plan 02 + 03 ana iş, diğerleri küçük). Plan 03 dynamic discovery için runtime check'leri kapsadığından en uzun task.

## Resume prompt (after /clear)

```
v37 Phase 160 — Luse LivOS Overlay + Haiku Routing.

Read first:
- .planning/phases/160-luse-livos-overlay-haiku-routing/160-CONTEXT.md (this file)
- 160-01-PLAN.md through 160-06-PLAN.md

Run: /gsd-execute-phase 160

5 workstream A-E full autonomous. Plan 06 UAT operator-driven (Mini PC bash /opt/livos/update.sh + chat test with computer-use + manual app launch).

Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
```
