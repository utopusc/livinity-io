# v34.x — LivOS ⇄ Claude Code Tam Entegrasyon (Master Plan)

**Vision:** LivOS UI'da chat eden kullanıcı, terminal'de Claude Code CLI'a konuşan kullanıcıyla **aynı kaliteyi** alır. Vault tabanlı persistent memory (Obsidian-uyumlu), multi-instance paralel agent, autonomous scheduler, subscription path korunarak.

**Status:** Hazırlandı 2026-05-19 — `/gsd-autonomous --from 162` ile başlatılabilir.

**Hedef tamamlanma:** Phases 162-165 sequential autonomous run (~20-25 saat agent work). Kullanıcı uyurken çalışır.

---

## Decisions Lock — Hepsi karara bağlandı, plan-phase open-question yok

### D-V34-A — SDK-direct, subprocess CLI değil

Anthropic'in `@anthropic-ai/claude-agent-sdk@0.2.85` paketi zaten bundled CC binary'yi (`cli.js` at `node_modules/.pnpm/@anthropic-ai+claude-agent-sdk*/...`) internal child process olarak çalıştırıyor. AgentSessionManager.consumeAndRelay() → query() → SDK → bundled CC binary → api.anthropic.com.

Yani biz **Claude Code'u zaten kullanıyoruz**. Eksik olan: SDK'ya doğru opsiyonları geçirmek (`cwd`, `settingSources`, vault scaffolding). Subprocess management code yazmak gerekmiyor.

**Önemli:** subprocess pattern (`spawn('claude', [...])`) ALTERNATİF. SDK-direct primary çünkü:
- Type-safe (TypeScript native)
- Daha az kod (~80% subprocess yönetim kodu yok)
- Phase 161 work tamamen reuse edilir
- Eşdeğer capability (aynı CC binary altta)

### D-V34-B — Vault path: `/home/bruce/livinity-vault/`

- bruce-owned (Obsidian app'i bruce home'dan açar)
- livinityd subprocess CWD'sini buraya set eder
- CC otomatik `<cwd>/CLAUDE.md` okur, `<cwd>/.claude/skills`, `<cwd>/.claude/commands` discover eder
- Single-user (multi-user out of scope per kullanıcı talebi)

### D-V34-C — Phase 161 helper'lar REUSE (asla silme)

| Phase 161 artefakt | v34 kullanımı |
|--------------------|---------------|
| `isComputerUseSession(convId)` helper | CWD seçim mantığı: `native:` / `webapp:` prefix → vault/surfaces/<kind>/<id>/ CWD; yoksa → vault/ default |
| Haiku model override (Phase 161-01) | Aynı pattern, `model: 'claude-haiku-4-5-20251001'` option olarak query()'ye geçer |
| `computerUseSystemPromptBuilder` DI (Phase 161-02) | LivOS overlay artık vault/surfaces/<id>/CLAUDE.md'ye yazılır; builder bu dosyayı render eder. Veya `systemPrompt` option ile dynamic injection |
| `livosAppResolver` (Phase 161-03) | mcp/server.ts wiring intact — sadece spawn env vars (LIVINITYD_API_URL, vb.) korunur |
| AgentSessionManager codebase | **Hiç silinmez** — Redis flag `liv:config:chat_backend = vault | legacy` ile toggle edilir. Default `vault` Phase 162 ship'inden sonra. |
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | UNCHANGED 4 phase boyunca |
| D-09 verbatim (`luse-system-prompt.ts`) | UNCHANGED 4 phase boyunca |
| D-NO-NEW-DEPS | UNCHANGED 4 phase boyunca |

### D-V34-D — Vault layout (FINAL)

```
/home/bruce/livinity-vault/                    # bruce:bruce, 0755
├── CLAUDE.md                                  # CC auto-loads from cwd; hub for [[wikilinks]]
├── .claude/
│   ├── settings.json                          # default model, allowed_tools, hooks
│   ├── settings.local.json                    # gitignored personal overrides
│   ├── skills/                                # CC skills (Markdown SKILL.md per dir)
│   │   └── livos-status/SKILL.md              # sample skill ile ship
│   ├── commands/                              # CC slash commands
│   │   └── livos-deploy.md                    # sample command ile ship
│   ├── agents/                                # CC SDK subagent definitions
│   └── mcp.json                               # MCP server descriptors (luse, filesystem, vb.)
├── memory/                                    # Cross-surface bellek (Obsidian native)
│   ├── feedback/                              # user corrections / preferences
│   │   ├── turkish-status.md
│   │   └── autonomous-execution.md
│   ├── user/
│   │   └── bruce-profile.md                   # rol, expertise, communication style
│   ├── projects/
│   │   └── v34-active.md                      # mevcut milestone snapshot
│   └── references/
│       ├── mini-pc.md
│       └── livinity-stack.md
├── surfaces/                                  # Surface-specific contexts
│   ├── main/                                  # Main Chat default CWD (= vault root, alias)
│   ├── webapp/<webappId>/
│   │   ├── CLAUDE.md                          # WebApp-specific entrypoint
│   │   └── .claude/settings.json              # Haiku model, computer-use tools allowed
│   └── native/<nativeAppId>/
│       ├── CLAUDE.md
│       └── .claude/settings.json
├── sessions/                                  # CC writes session JSONL transcripts here
├── inbox/                                     # Autonomous output markdown
│   └── <YYYY-MM-DD>_<HH-MM>_<agent-name>.md
└── livos-agents/                              # LivOS-managed autonomous agent definitions
    ├── nightly-backup-audit.md                # YAML frontmatter: schedule, prompt, tools
    └── pr-watcher.md
```

**Privacy:** Single-user, no isolation needed. Future multi-user could partition by /home/<user>/livinity-vault/.

### D-V34-E — Multi-instance refactor

AgentSessionManager şu an `Map<userId, ActiveSession>` — userId başına 1 session. v34'te `sessionKey` = `${userId}:${surfaceKind}:${surfaceId ?? 'default'}`. Bu, aynı kullanıcının Main Chat + Suna WebApp Chat + autonomous run'unu paralel çalıştırmasına izin verir.

Backward compat: legacy backend Redis flag set olduğunda eski `userId` key'i kullanır (zero breakage).

### D-V34-F — Default model strategy

| Surface | Default model | Override mekanizması |
|---------|--------------|-----------|
| Main Chat | `claude-opus-4-7` | UI model picker (Phase 165) OR vault/.claude/settings.json |
| WebApp Chat | `claude-haiku-4-5-20251001` | Phase 161 detection unchanged |
| NativeApp Chat | `claude-haiku-4-5-20251001` | Phase 161 detection unchanged |
| Autonomous | per-agent frontmatter `model:` field; default `claude-sonnet-4-6` | agent definition |

### D-V34-G — Autonomous budget guardrails

| Cap | Default | Override |
|-----|---------|----------|
| Per-agent budget cap | $5/run | agent frontmatter `max_budget_usd:` |
| Per-agent max turns | 20 | agent frontmatter `max_turns:` |
| Mini PC daily total cap | $50/day | Redis flag `liv:config:autonomous_daily_budget` |
| Scheduler concurrency | 3 concurrent autonomous | Redis flag `liv:config:autonomous_max_concurrent` |

### D-V34-H — Redis feature flags (rollback safety)

| Flag | Default (post-162) | Purpose |
|------|--------------------|---------|
| `liv:config:chat_backend` | `vault` | `legacy` → AgentSessionManager pre-v34 path; `vault` → new SDK-with-settings path |
| `liv:config:default_chat_model` | `claude-opus-4-7` | Main Chat default model |
| `liv:config:autonomous_enabled` | `false` (Phase 164 ship'inde `true`) | Autonomous scheduler master switch |
| `liv:config:autonomous_daily_budget` | `5000` (cents, $50) | Daily cap across all autonomous runs |
| `liv:config:autonomous_max_concurrent` | `3` | Concurrent autonomous instances |

All flags read at runtime (no service restart needed). Bool/int as strings (Redis convention).

### D-V34-I — Auth threading

SDK'nın bundled CC binary'si HOME env'ini okuyup `<HOME>/.claude/.credentials.json`'u arar. Mini PC'de:
- `/root/.claude/.credentials.json` mevcut, encrypted OAuth subscription tokens
- livinityd systemd service'i bu env'i aktif geçiriyor: `BROKER_FORCE_ROOT_HOME=true` (memory'de reference_anthropic_subscription_state.md)
- SDK subprocess INHERIT eder: `HOME=/root` set ise CC oradan okur

**Test (Phase 162-01 acceptance):** livinityd context'inde küçük TypeScript script çalıştır, `query()` ile basit prompt fire et, `claude-opus-4-7` response al, fatura `/root/.claude/.credentials.json`'a düşsün.

### D-V34-J — Hard guardrails (every phase, every commit)

1. **Sacred SHA** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — UNCHANGED
2. **D-09 verbatim** `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` — bytes UNCHANGED
3. **D-NO-NEW-DEPS** — sıfır `package.json` diff
4. **Phase 161 chat-path-untouched** — `liv:config:chat_backend=legacy` set olduğunda eski path byte-identical (regression test)
5. **Subscription-only** — `/root/.claude/.credentials.json` üzerinden auth; BYOK opens edilmedi (deferred per kullanıcı talebi)

### D-V34-K — Vault is gitignored, bootstrapped on deploy

`/home/bruce/livinity-vault/` repo'ya commit edilmez. Vault scaffolder (Phase 162-01) deploy zamanında dosyaları idempotent oluşturur:
- Yeni dosya: yaz
- Mevcut dosya: dokunma (kullanıcı edit'lerini korur)
- Şablon kaynak: `livos/packages/livinityd/source/data/vault-templates/`

User vault'u Obsidian'da açar, edit eder, Obsidian Sync'le başka cihazlara taşır (LivOS müdahale etmez).

### D-V34-L — June 15, 2026 Agent SDK credit pool

Anthropic 2026-06-15'te subscription plan'larında programmatic Agent SDK kullanımına AYRI bütçe pool'u açıyor. Bu **lehimize:**
- Autonomous agent'lar interactive Max plan cap'ine değmeyecek
- Multi-instance paralel kullanım resmi-supported

Phase 164 (autonomous scheduler) bu tarihten sonra ekonomik olarak optimum çalışır. Mevcut ay (May 2026) credit ayrımı yok — autonomous run'lar Max plan cap'ine sayılır, bütçe cap'leri kritik.

### D-V34-M — Test contract per phase

Her phase ships:
- Unit tests (source-text invariants + runtime behavior)
- Integration tests (vault'ta gerçek dosyalar, gerçek query() call mocked SDK ile)
- Live runtime probe (Phase 161'de yaptığımız synthetic WS probe pattern) — Mini PC deploy sonrası
- Sacred SHA + D-09 + D-NO-NEW-DEPS checks at every commit (pre-commit hook + plan acceptance criteria)

### D-V34-N — Operator UAT (autonomous: false steps)

Mini PC deploy + browser walk her phase'in son adımı. Per memory `feedback_full_autonomous_no_questions`: **autonomous flag override edilir, user uyuyorken UAT deferred, ship continues**. Operator UAT for v34.x bütünüyle Phase 165 sonrasına ertelenir (toplu walk).

---

## Phase Sequence

### Phase 162: Vault Scaffolding + SDK Settings Integration (Foundation)

**Goal:** Vault dizinini Mini PC'de oluştur. AgentSessionManager.consumeAndRelay()'i `cwd` + `settingSources` ile çağıracak şekilde upgrade et. Redis flag ile toggle. Phase 161 chat-path-untouched korunur, ama default artık `vault` mode.

**Plans (5):**
- 162-01: Vault scaffolder (CLAUDE.md, .claude/settings.json, memory/* templates, idempotent)
- 162-02: AgentSessionManager option upgrade (cwd + settingSources support + Redis flag gate)
- 162-03: Auth threading verification (subprocess HOME env, /root creds reach)
- 162-04: Multi-instance refactor (sessionKey from userId → userId:surfaceKind:surfaceId)
- 162-05: Tests + Mini PC deploy + live runtime probe

**Estimated:** ~6-8 saat agent work.

### Phase 163: Surface-Specific Vault Contexts + Phase 161 Helper Bridge

**Goal:** WebApp/NativeApp chat'leri vault/surfaces/<kind>/<id>/'a CWD edebilsin. Per-surface CLAUDE.md template otomatik üretilsin. Phase 161'in Haiku routing + LivOS overlay logic'i SDK options'a çevrilsin.

**Plans (4):**
- 163-01: Surface vault scaffolder (webapp + native app install hooks yazar)
- 163-02: Phase 161 isComputerUseSession → CWD seçim mantığı (claude-runner module)
- 163-03: LivOS overlay → vault/.claude/rules/livos-overlay.md (Phase 160-04 xdpyinfo invocation aynı, sadece output target dosya)
- 163-04: Tests + Mini PC deploy + WebApp+NativeApp synthetic probes

**Estimated:** ~6-8 saat.

### Phase 164: Autonomous Scheduler + Sample Agents

**Goal:** vault/livos-agents/*.md frontmatter parse, cron tetik, vault/inbox/'a writeback, dock notification.

**Plans (5):**
- 164-01: Agent definition format + frontmatter parser
- 164-02: AutonomousScheduler module (node-cron based, budget guardrails)
- 164-03: Inbox writeback (CC output → markdown file)
- 164-04: 2 sample autonomous agents (nightly-backup-audit, pr-watcher)
- 164-05: Tests + Mini PC deploy + manual trigger smoke test

**Estimated:** ~5-7 saat.

### Phase 165: Polish, Settings UI, v34.x Ship

**Goal:** Idle session reaper, model picker UI, memory linter (broken [[wikilinks]] cleanup), stats dashboard. v34 milestone close.

**Plans (4):**
- 165-01: Idle session reaper (30min idle CC subprocess kill via SDK abort)
- 165-02: Settings UI: model picker + autonomous panel (vault/livos-agents/ list + budget editor)
- 165-03: Memory linter command (`livos-vault doctor` slash command)
- 165-04: v34.x consolidated VERIFICATION + Mini PC final deploy + operator UAT instructions

**Estimated:** ~4-6 saat.

---

## Execution Protocol (for /gsd-autonomous run)

User runs `/clear` then `/gsd-autonomous --from 162`. Then sleeps. Expected sequence:

```
loop while phases remain:
  current_phase = next_in_state
  /gsd-plan-phase {current} --auto         # CONTEXT.md exists → skip discuss
  → spawns gsd-phase-researcher (optional, may skip if research_enabled=true but small phase)
  → spawns gsd-pattern-mapper (analog mapping)
  → spawns gsd-planner (writes PLAN.md files)
  → spawns gsd-plan-checker (verify)
  → revision loop max 3
  → state.planned-phase
  /gsd-execute-phase {current} --auto      # Wave-based execution
  → spawns gsd-executor per plan
  → commits atomically
  → SUMMARY.md per plan
  → gsd-verifier writes VERIFICATION.md
  state.shipped-phase, advance
  
on user wake: 4 phases shipped to Mini PC, vault live, autonomous active
```

**No questions to user** — `feedback_full_autonomous_no_questions` memory authorizes:
- Override `autonomous: false` flags in plans (treat as autonomous: true)
- Skip shared-infra confirmations (push to master, deploy to Mini PC)
- Mini PC deploy steps execute via detached bash + log poll pattern (per `reference_zerotier_unstable.md`)
- Operator browser UAT DEFERRED to user's wake (single batch)

**Failure handling:**
- Plan-phase blocked: try with `--research` flag; if still blocked, skip to next phase, document in BLOCKED.md
- Execute-phase fails: revert HEAD via `gsd-undo`; mark phase needs human; continue to next
- Mini PC deploy fails: revert via service restart from previous SHA; document; continue
- Sacred SHA / D-09 violation: STOP immediately, abort autonomous, document why

**Per-phase exit criteria** (all must hold to advance):
- All PLAN.md files have `## Status: SHIPPED` or `gsd-undo` reverted them
- VERIFICATION.md status = `PASSED` or `PASSED-with-carry-forward`
- Sacred SHA preserved (`git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts | grep -o '[a-f0-9]\{40\}'` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`)
- D-09 unchanged (`git diff <phase-start>..HEAD -- livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` = empty)
- D-NO-NEW-DEPS (`git diff <phase-start>..HEAD -- '**/package.json'` = empty)

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| SDK options shape değişmiş olur (cwd / settingSources Phase 162'de yok / yanlış isimde) | Düşük | Phase 162-01'de SDK kaynağı oku, gerçek option isimleri verify et |
| Auth threading başarısız: subprocess /root creds göremiyor | Orta | Phase 162-03 explicit test eder; fallback: bruce home'a symlink |
| vault/.claude/skills/* CC SDK tarafından yüklenmiyor (yanlış path/spec) | Düşük | Phase 162-01'de small skill ile end-to-end test |
| Mini PC ZeroTier drop during 4-phase autonomous run | Orta-Yüksek | Her Mini PC operasyonu detached + log poll pattern (Phase 161'de proven) |
| Real user (`f843156a-...`) chat'i v34 mode'a swap'lendiğinde regress | Orta | Redis flag ile rollback < 5 sn; default `vault` ama izleme + 1 hafta sonra `legacy` retire |
| Sacred SHA pre-commit hook block: refactor accidentally touches sdk-agent-runner.ts | Düşük | Her plan'da explicit acceptance criteria; hook zaten enforces |
| Autonomous agent budget overrun (Sonnet $5 limit yanlış set) | Düşük | maxBudgetUsd zorunlu, Redis daily cap separate, sample agents küçük scope |
| Obsidian Sync conflict (kullanıcı laptop'tan + Mini PC aynı anda edit) | Düşük | LivOS sadece tool çağrılarında yazar (rare); Obsidian Sync 3-way merge handles |
| June 15 Agent SDK credit ayrımı öncesi autonomous Max plan cap'i tüketir | Orta | Phase 164 ship'inde autonomous_enabled default `false`; user manuel açar |

---

## File Manifest (will be created during autonomous run)

### New files (livos/ + liv/)

```
livos/packages/livinityd/source/modules/claude-runner/   # New module Phase 162
├── index.ts
├── vault-scaffolder.ts                                   # Phase 162-01
├── instance-manager.ts                                   # Phase 162-04
├── session-key.ts                                        # Phase 162-04
├── auth-verifier.ts                                      # Phase 162-03
└── *.test.ts

livos/packages/livinityd/source/data/vault-templates/    # Phase 162-01
├── CLAUDE.md.tmpl
├── .claude/settings.json.tmpl
├── .claude/mcp.json.tmpl
├── memory/user/bruce-profile.md.tmpl
└── ...

livos/packages/livinityd/source/modules/claude-runner/surface-context.ts   # Phase 163-01
livos/packages/livinityd/source/modules/claude-runner/livos-overlay-writer.ts  # Phase 163-03

livos/packages/livinityd/source/modules/autonomous-scheduler/  # New module Phase 164
├── index.ts
├── agent-definition-parser.ts
├── scheduler.ts
├── budget-guardrail.ts
├── inbox-writer.ts
└── *.test.ts

livos/packages/ui/src/modules/settings/                # Phase 165-02
├── ChatBackendPanel.tsx
├── AutonomousAgentsPanel.tsx
└── ModelPicker.tsx
```

### Modified files

```
liv/packages/core/src/agent-session.ts                  # Phase 162-02 (cwd + settingSources options)
liv/packages/core/src/agent-session.computer-use.test.ts # Phase 162-02 + 162-04
livos/packages/livinityd/source/modules/server/ws-agent.ts # Phase 162-04 (sessionKey shape)
livos/packages/livinityd/source/index.ts                # Phase 162-01 (scaffolder boot wire-up)
livos/packages/livinityd/source/modules/computer-use/mcp/server.ts  # (untouched, Phase 161 wiring intact)
livos/packages/ui/src/hooks/use-agent-socket.ts         # Phase 165-02 (model field optionally sent)

.planning/STATE.md (every phase boundary)
.planning/ROADMAP.md (status flips per phase)
```

### Untouched (sacred / D-09)

```
liv/packages/core/src/sdk-agent-runner.ts               # SACRED — verbatim sha throughout
livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts  # D-09 verbatim
**/package.json                                          # D-NO-NEW-DEPS
livos/packages/ui/src/hooks/use-native-app-agent.ts     # Phase 161-04 contract (verification-only)
livos/packages/ui/src/hooks/use-webapp-agent.ts         # Phase 161-04 contract
```

---

## Resume Instructions (if autonomous stops mid-run)

User wakes up, runs in fresh session:

```bash
/clear
cat .planning/STATE.md | head -50          # see current position
/gsd-progress                              # full status check
```

If a phase is shipped but next hasn't started:
```bash
/gsd-autonomous --from <next-phase>
```

If a phase is mid-execution (some plans shipped, others incomplete):
```bash
/gsd-execute-phase <phase> --auto         # resumes from incomplete plans
```

If something broke:
```bash
/gsd-forensics <phase>                    # post-mortem analysis
/gsd-debug                                # systematic diagnosis if needed
```

---

## Success Criteria (v34.x milestone complete)

- [ ] Vault at `/home/bruce/livinity-vault/` exists, bruce-owned, Obsidian-loadable
- [ ] Main Chat sessions on Mini PC use `claude-opus-4-7` by default
- [ ] WebApp Chat / NativeApp Chat sessions still use `claude-haiku-4-5-20251001` (Phase 161 contract intact)
- [ ] Sacred SHA preserved across all v34 commits
- [ ] D-09 unchanged
- [ ] D-NO-NEW-DEPS preserved
- [ ] At least 1 autonomous agent fires from cron + writes to vault/inbox/
- [ ] Settings UI has model picker + autonomous agents list (read-only OK for v1)
- [ ] Redis flag `liv:config:chat_backend = vault` is default
- [ ] Phase 161 `legacy` mode still functional via flag flip (regression test passes)
- [ ] Mini PC deployed SHA matches HEAD; 4 services active; live runtime probe (similar to Phase 161 synthetic WS) passes for vault mode

---

*Master: v34-LIVOS-CC-INTEGRATION-MASTER.md*
*Prepared: 2026-05-19 (post-Phase-161-ship)*
*Approach: Hermes-informed SDK-direct integration with Obsidian vault*
*Authority: feedback_subscription_only + feedback_full_autonomous_no_questions + memory_v34_milestone_opened*
