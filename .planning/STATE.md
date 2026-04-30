---
gsd_state_version: 1.0
milestone: v29.3
milestone_name: Marketplace AI Broker (Subscription-Only)
status: phase-42-shipped-locally
stopped_at: Phases 39+40+41+42 shipped LOCAL. Phase 43 (Marketplace Integration — MiroFish anchor) ready to plan. Usage limit hit on Phase 42 executor mid-final-commit (resets 7:50am PT); manually closed inline (UAT commit + SUMMARY).
last_updated: "2026-04-30T15:25:00.000Z"
last_activity: 2026-04-30 -- Phase 42 (FR-BROKER-O-01..04) executed: 5 commits + summary, 4/4 success criteria PASS, 32 livinityd + 9 nexus = 41 tests PASS, sacred file untouched (still 623a65b9...). In-process TS translation chosen over LiteLLM sidecar. OpenAI Python SDK smoke test in 42-UAT.md.
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 18
  completed_plans: 18
  percent: 66
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Last shipped milestone:** v29.2 Factory Reset (mini-milestone) — 2026-04-29
**Current milestone:** v29.3 Marketplace AI Broker (Subscription-Only) — Phases 39 + 40 + 41 + 42 shipped locally (66% done); Phase 43 next (MiroFish marketplace integration)

## Current Position

Phase: 42 ✅ SHIPPED LOCALLY (5 commits + summary); 41 ✅ SHIPPED (6 commits); 40 ✅ SHIPPED (5 commits); 39 ✅ SHIPPED (4 commits)
Next: 43 (Marketplace Integration — MiroFish anchor) — env var auto-injection + manifest flag + first end-to-end MiroFish install verification
Status: **4/6 phases done (66%)**, 26 commits ahead of origin/master, sacred file SHA untouched at `623a65b9...`
Last activity: 2026-04-30 — Phase 42 OpenAI-compat broker shipped (limit hit on final commit, closed manually)

## ▶ HUMAN HANDOFF — v29.3 Phase 39 + 40 batch handoff

### Phase 40 (FR-AUTH-01..03) durumu: BAŞARILI, lokal ✅

5 atomic commit master üzerine atıldı:

```
dd48f172 docs(40): phase summary
327d81ed test(40-05): pin Phase 40 invariants with regression tests + UAT checklist
2ba2540e feat(40-04): per-user-aware Claude card in Settings > AI Configurations
227a779f feat(40-03): per-user .claude dir + claude-login backend routes
2cf59b1f feat(40-02): add homeOverride to SdkAgentRunner for per-user OAuth isolation
b264445f docs(40-01): codebase audit
```

**Yapılan değişiklikler:**
- `nexus/packages/core/src/sdk-agent-runner.ts` — line 266 surgical edit (`opts.homeOverride || process.env.HOME || '/root'`) + JSDoc; sacred SHA Phase 39 baseline `2b3b005b...` → yeni baseline `623a65b9...`
- `nexus/packages/core/src/agent.ts` — `homeOverride?: string` AgentConfig field
- `livos/packages/livinityd/source/modules/ai/per-user-claude.ts` — YENİ modül (217 satır, 6 export)
- `livos/packages/livinityd/source/modules/ai/routes.ts` — 3 yeni tRPC route (status query, startLogin subscription, logout mutation)
- `livos/packages/ui/src/routes/settings/ai-config.tsx` — per-user UI dalı (multi-user mode aktifken)
- 2 yeni test dosyası, `test:phase40` npm script, 27-step manuel UAT

**Garantiler:**
- Sacred file: pre-edit `2b3b005b...` doğrulandı → post-edit `623a65b9...` (1 satır mod, behavior-preserving)
- `npm run test:phase40` PASS (4 yeni + 5 chained Phase 39 = 9/9)
- `per-user-claude.test.ts` PASS (5/5)
- Multi-user mode OFF olduğunda Phase 40 logic dead code (her route + UI önce `isMultiUserMode()` kontrol ediyor)
- `git push` YAPILMADI, deploy YAPILMADI

**Honest deferrals (Phase 41 scope):**
- AI Chat (`/api/agent/stream`) için per-user HOME wiring — Phase 41 broker scope; Phase 40 sadece `claude login` subprocess için HOME route ediyor
- POSIX-enforced cross-user isolation — synthetic dirs (livinityd-application-layer enforced) tercih edildi; D-40-05 + D-40-16 honest framing
- 27-step manual UAT — deploy sonrası

### Senin yapman gerekenler

**Önerilen sıra:**
1. **Code review (batch):** Phases 39 + 40 birlikte — `git show ab62df01..dd48f172`
2. **Lokal test:** `cd nexus/packages/core && npm run test:phase40` (9/9 PASS olmalı)
3. **Push + deploy (Mini PC):**
   ```bash
   git push origin master
   ssh -i .../minipc bruce@10.69.31.68 "sudo bash /opt/livos/update.sh"
   ```
4. **Manual UAT:** `.planning/phases/40-per-user-claude-oauth-home-isolation/40-UAT.md` — 27 adım Mini PC üzerinde
5. **Phase 41 başlat:** `/gsd-discuss-phase 41` (broker — büyük phase, fresh context tavsiye edilir)

**Usage limit notu:** Phase 40 executor 5-saatlik quota'yı tüketti (reset 3am PT). Phase 41 daha büyük (yeni HTTP server, format translation, ~200-300 satır kod) — spawn etmeden önce limit'in resetlenmesini bekle veya quota'na bak.

### Phase 39 (FR-RISK-01) durumu: BAŞARILI, lokal ✅

Otonom çalıştırıldı (sen uyurken), 4 commit master üzerine atıldı:

```
7f0e0d09 docs(39): phase summary — OAuth fallback closure complete
eb3c93ff test(39-03): pin OAuth-fallback closure with regression tests (FR-RISK-01)
aa338404 refactor(39-02): close OAuth fallback in ClaudeProvider.getClient (FR-RISK-01)
ab62df01 feat(39-01): caller audit for OAuth fallback closure (FR-RISK-01)
```

**Yapılan değişiklikler:**
- `nexus/packages/core/src/providers/claude.ts` — iki `authToken:` fallback (env-var + creds-file) silindi, `ClaudeAuthMethodMismatchError` typed error class eklendi
- `nexus/packages/core/src/providers/manager.ts` + `index.ts` + `api.ts` — caller reroute (audit AUDIT.md'de)
- 3 yeni test dosyası (`claude.test.ts`, `no-authtoken-regression.test.ts`, `sdk-agent-runner-integrity.test.ts`)
- `nexus/packages/core/package.json` — `test:phase39` script

**Garantiler (kanıtlanmış):**
- Sacred `sdk-agent-runner.ts` byte-identical: SHA `2b3b005bf1594821be6353268ffbbdddea5f9a3a`
- 5/5 test PASS — `cd nexus/packages/core && npm run test:phase39`
- TypeScript build temiz
- Subscription tokens artık `@anthropic-ai/sdk`'ya hiçbir koşulda ulaşamıyor — grep regression test bunu kalıcı garantiliyor

### Senin yapman gerekenler

1. **Code review:** `git show ab62df01 aa338404 eb3c93ff 7f0e0d09` — özellikle `claude.ts` deletion + caller reroutes
2. **Deploy karar:** Eğer onaylıyorsan:
   ```bash
   git push origin master
   # Sonra Mini PC'de:
   ssh -i .../minipc bruce@10.69.31.68 "sudo bash /opt/livos/update.sh"
   ```
3. **Phase 40'a devam:** Onayladığında `/gsd-autonomous --from 40` veya `/gsd-discuss-phase 40` çalıştır

### Neden Phase 40+ otonom yapılmadı

Phase 40 (Per-User OAuth + HOME isolation) sistem-seviyesi değişiklikler içeriyor:
- Linux user account oluşturma / izinler
- `SdkAgentRunner` spawn'ında HOME env var değişikliği (sacred dosyaya çok yakın çalışma)
- Multi-user mod davranış değişikliği
- Settings UI'a "Connect my Claude account" butonu

Bu phase'in kararları (root user nasıl handle edilir? single-user mode'da ne olur? cross-user permission stratejisi?) sen uyanıkken alınmalı. Phase 39 kazılmış kontrollü bir alandı; 40 ise canlı sistem üzerinde değişiklik.

Diğer phase'ler (41 broker, 42 OpenAI-compat, 43 marketplace, 44 dashboard) her biri 1-2 günlük iş — autonomous tek seans değil.

### Mevcut milestone progress

1/6 phase complete (16%). Remaining linear chain: 40 → 41 → 42 → 43 → 44.

## Roadmap Snapshot

6 phases, strictly linear, 17/17 v1 requirements mapped:

| # | Phase | Reqs | Depends on |
|---|-------|------|------------|
| 39 | Risk Fix — Close OAuth Fallback | FR-RISK-01 | — |
| 40 | Per-User Claude OAuth + HOME Isolation | FR-AUTH-01..03 | 39 |
| 41 | Anthropic Messages Broker | FR-BROKER-A-01..04 | 40 |
| 42 | OpenAI-Compatible Broker | FR-BROKER-O-01..04 | 41 |
| 43 | Marketplace Integration (Anchor: MiroFish) | FR-MARKET-01..02 | 42 |
| 44 | Per-User Usage Dashboard | FR-DASH-01..03 | 43 |

Full details: `.planning/ROADMAP.md`.

## Accumulated Context (carried from v29.2)

### Subscription-only constraint (LOCKED for v29.3 and beyond)

User uses ONLY Claude subscription mode (`sdk-subscription` via `@anthropic-ai/claude-agent-sdk` `query()`). Never BYOK / API key.

- Existing `SdkAgentRunner` (`nexus/packages/core/src/sdk-agent-runner.ts`) is **sacred** — no structural changes. All v29.3 broker work wraps it externally.
- `claude.ts:99-115` raw OAuth-fallback path will be **deleted** (not refactored) in Phase 39.
- D-NO-BYOK enforced in every phase's success criteria — every user-facing flow must read "without entering an API key" or "using their Claude subscription".

### Carry-forwards from v29.2 (separate scope, not v29.3)

These are tech debt from v29.2 — addressed via dedicated patches outside v29.3:
- install.sh env-var fallback patch (closes install.sh's own argv leak window)
- install.sh ALTER USER patch (improves install.sh's native idempotency)
- update.sh patch to populate `/opt/livos/data/cache/install.sh.cached`
- Phase 37: `factory-reset.integration.test.sh` on Mini PC scratchpad (manual, opt-in)
- Phase 38: 11 browser-based UI flow checks (manual, opt-in)

### Deferred (post-v29.3)

- v30.0 Backup unfreeze — `.planning/milestones/v30.0-DEFINED/` (8 phases / 47 BAK-* reqs already defined; needs phase renumber to start after Phase 44).
- FR-MARKET-future-01 (Dify), FR-MARKET-future-02 (RAGFlow), FR-MARKET-future-03 (CrewAI template) — anchor app for v29.3 is MiroFish only.
- FR-DASH-future-01 (cost forecasting).
- FR-OBS-future-01 (per-request audit trail / message logging).

### Deployment target

- Mini PC ONLY (`bruce@10.69.31.68`). D-NO-SERVER4 hard rule. Server4 + Server5 explicitly off-limits for any v29.3 broker / OAuth / dashboard work.

## Recently Shipped

### v29.2 Factory Reset (2026-04-29)

3-phase mini-milestone delivering one-click factory reset:
- Phase 36 (audit): install.sh AUDIT-FINDINGS.md
- Phase 37 (backend): system.factoryReset tRPC route + idempotent wipe + cgroup-escape spawn
- Phase 38 (UI): Settings > Advanced > Danger Zone with type-confirm + BarePage progress overlay

See `.planning/milestones/v29.2-ROADMAP.md` for full archive.
