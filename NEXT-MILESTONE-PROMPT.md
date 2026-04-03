# v22.0 Milestone — Livinity AGI Platform: Capability Orchestration & Marketplace

## Vizyon

Livinity'yi bir "AI Agent Marketplace + Orchestration Platform"a dönüştür. Kullanıcılar AI Chat'te konuşurken, sistem otomatik olarak ihtiyaç duyulan skill'leri, MCP'leri, tool'ları ve hook'ları keşfetsin, yüklesin ve yapılandırsın. Tek bir MCP üzerinden tüm Livinity ekosistemi erişilebilir olsun.

**KRİTİK: Auth sistemine dokunma. Mevcut streaming, block model, typewriter animasyonu çalışıyor — bunları bozma.**

---

## Araştırma Kaynakları

### 1. GSD (get-shit-done) — Context Engineering & Multi-Agent Orchestration
- **Repo:** https://github.com/gsd-build/get-shit-done
- **Anahtar Konseptler:**
  - Phase-based workflow: initialize → discuss → plan → execute → verify → ship
  - 4 paralel researcher agent (stack, features, architecture, pitfalls)
  - Wave execution: bağımsız task'lar paralel, bağımlılar sıralı
  - Her plan fresh context window'da çalışır (200k token budget) — context rot önlenir
  - XML prompt formatting: `<action>`, `<file>`, `<verification>` yapıları
  - .planning/ directory: PROJECT.md, ROADMAP.md, STATE.md, phase plans
  - Atomic git commits per task
  - Quick mode: `/gsd:quick` ile planning bypass
- **Bizim İçin Önemli:**
  - Phase-based execution pattern → Capability provisioning phases
  - Researcher agents → Intent classification + capability discovery
  - Fresh context per phase → Per-session tool loading
  - STATE.md pattern → Capability state tracking

### 2. Claude Code Templates — Component Marketplace
- **Repo:** https://github.com/davila7/claude-code-templates
- **100+ hazır component:** Agents, Commands, MCPs, Settings, Hooks, Skills
- **Anahtar Konseptler:**
  - Hierarchical naming: `development-team/frontend-developer`, `testing/generate-tests`
  - 6 component type: Agent, Command, MCP, Setting, Hook, Skill
  - `npx claude-code-templates@latest --agent X` ile tek komut kurulum
  - Dashboard: aitmpl.com — web üzerinden browse + install
  - Analytics: session monitoring, health check
- **Bizim İçin Önemli:**
  - Component type taxonomy → Livinity marketplace categories
  - One-command install → MCP-based auto-install
  - Dashboard pattern → Livinity UI agents panel redesign
  - Template structure → Skill/agent manifest format

### 3. Claude Code System Prompts — Agent Behavior Architecture
- **Repo:** https://github.com/Piebald-AI/claude-code-system-prompts
- **136+ versiyon tracked**, v2.1.87 (28 Mart 2026)
- **Anahtar Konseptler:**
  - Conditional prompt architecture: mode'a göre farklı section'lar aktif
  - 18+ builtin tool description
  - 23+ utility agent (explore, plan, security-review, batch, schedule)
  - 58 distinct system prompt module
  - 40+ conditional system reminder
  - Token budget per component (her prompt'un token maliyeti biliniyor)
  - Tool preference hierarchy: specialized tool > bash
  - Memory integration: persistent memory files across sessions
- **Bizim İçin Önemli:**
  - Conditional prompt architecture → Dynamic system prompt composition
  - Token budget tracking → Context window budget management
  - Agent creation prompts (1,110 tokens) → Auto-agent creation
  - Mode-specific behaviors → Capability-aware mode switching
  - Memory consolidation patterns → Learning loop

---

## Mevcut Altyapı (v21.1)

### Çalışan Sistemler
- **ToolRegistry:** 67 tool, policy/profile sistemi (minimal/basic/coding/messaging/full)
- **SkillLoader:** YAML frontmatter, trigger regex, hot-reload, marketplace install
- **MCP Client Manager:** Dinamik tool registration, stdio + HTTP transport
- **SubagentManager:** Per-agent tool sets, loop/schedule, conversation history
- **Skill Marketplace:** GitHub registry-based, permission dialog, install/uninstall
- **MCP Registry:** Official MCP registry API search
- **Router:** Rule-based + LLM-based intent classification
- **AI Chat UI:** Block-based streaming, typewriter animation, inline tools

### UI Panelleri (3,432 satır)
- **Agents Panel (548 satır):** List/Detail/Create + loop control + chat history
- **Skills Panel (772 satır):** Marketplace/Installed/Registries + permission dialog
- **MCP Panel (1,404 satır):** 19 featured server + search + install + config editor

### Eksik Olan
- Unified capability registry (tool + skill + MCP + hook + agent tek model)
- Semantic intent routing (embedding-based, confidence scores)
- Dynamic session provisioning (ihtiyaca göre tool yükleme)
- Auto-capability discovery (AI kendi eksik tool'unu bulup yüklemesi)
- Hook management UI ve auto-creation
- System prompt composition engine
- Learning loop (başarılı kombinasyonları öğrenme)
- Livinity Marketplace MCP (tek MCP ile tüm ekosistem erişimi)

---

## Mimari Plan

### Katman 1: Unified Capability Registry

```
┌─────────────────────────────────────────────────┐
│           Capability Registry (Redis)            │
├─────────┬──────────┬────────┬──────┬────────────┤
│  Skills │   MCPs   │ Tools  │Hooks │  Agents    │
│  (YAML) │ (config) │ (code) │(bash)│ (subagent) │
└─────────┴──────────┴────────┴──────┴────────────┘
```

Her capability bir manifest ile tanımlı:
```yaml
id: web-scraping-chrome
type: mcp
name: "Chrome Browser Control"
description: "Navigate pages, click elements, fill forms, take screenshots"
semantic_tags: ["web", "browser", "automation", "scraping", "testing"]
triggers: ["browse", "open website", "screenshot", "click", "fill form"]
provides_tools: ["navigate_page", "take_screenshot", "click", "fill_form"]
requires: []
conflicts: []
context_cost: 450  # token cost for tool definitions
tier: basic
source: marketplace  # builtin | marketplace | custom
```

### Katman 2: Intent Router + Capability Resolver

```
User: "Şu websiteden fiyatları çek ve CSV'ye yaz"
                    │
            ┌───────▼───────┐
            │ Intent Router  │
            │ (LLM + embed) │
            └───────┬───────┘
                    │
    ┌───────────────▼───────────────┐
    │     Capability Resolver        │
    │                                │
    │  Matched:                      │
    │  ├─ web-scraping (0.95)       │
    │  ├─ file-operations (0.90)    │
    │  ├─ chrome-mcp (0.88)         │
    │  └─ data-transform (0.70)     │
    │                                │
    │  Budget: 2000 tokens available │
    │  Selected: top 3 (1340 tokens)│
    └───────────────┬───────────────┘
                    │
            ┌───────▼───────┐
            │  Session with  │
            │  3 capabilities│
            │  loaded        │
            └────────────────┘
```

### Katman 3: Livinity Marketplace MCP

Tek bir MCP server (`livinity-marketplace`) tüm ekosistemi sağlar:

```typescript
// MCP Tools:
- livinity_search      // Marketplace'te ara (skills, MCPs, hooks, agents, prompts)
- livinity_install     // Capability yükle (permission check + auto-configure)
- livinity_uninstall   // Kaldır
- livinity_list        // Yüklü capability'leri listele
- livinity_recommend   // Mevcut context'e göre öneri
- livinity_create_skill    // Yeni skill oluştur ve marketplace'e ekle
- livinity_create_hook     // Yeni hook oluştur
- livinity_create_agent    // Yeni agent template oluştur
- livinity_system_prompt   // System prompt template library
- livinity_compose         // Birden fazla capability'yi birleştir
```

### Katman 4: Auto-Provisioning Engine

```
Session Start
     │
     ├── 1. Analyze user message (intent + entities)
     │
     ├── 2. Query Capability Registry (semantic match)
     │
     ├── 3. Check installed capabilities
     │        ├── Already installed? → Load into session
     │        └── Not installed? → Auto-install from marketplace
     │
     ├── 4. Resolve dependencies
     │        └── Chrome MCP needs → chrome-devtools-mcp installed?
     │
     ├── 5. Budget check (context window)
     │        └── 67 tools × ~300 tokens = 20k tokens (too much!)
     │        └── Select top 10 relevant = 3k tokens (optimal)
     │
     └── 6. Compose system prompt
              ├── Base prompt (agent identity)
              ├── Selected tool descriptions
              ├── Relevant skill instructions
              └── Context from conversation history
```

### Katman 5: Learning Loop

```
┌─────────────────────────────────────┐
│          Execution                   │
│  User asks → AI uses tools → Result │
└──────────────┬──────────────────────┘
               │
       ┌───────▼───────┐
       │   Evaluate     │
       │   - Success?   │
       │   - Tools used │
       │   - Duration   │
       │   - User happy?│
       └───────┬───────┘
               │
       ┌───────▼───────┐
       │   Learn        │
       │   - Pattern:   │
       │     "deploy" → │
       │     [shell,    │
       │      docker,   │
       │      pm2]      │
       │   - Store in   │
       │     Redis      │
       └───────┬───────┘
               │
       ┌───────▼───────┐
       │  Next Time     │
       │  Same intent → │
       │  Instant load  │
       │  (no LLM call) │
       └────────────────┘
```

---

## Phase Planı

### Phase 1: Unified Capability Registry
**Goal:** Tüm skill, MCP, tool, hook ve agent'ları tek bir registry'de birleştir
- Capability manifest format tanımla (YAML)
- Redis-backed registry oluştur (`nexus:capabilities:*`)
- Mevcut ToolRegistry, SkillLoader, McpClientManager'dan otomatik sync
- Registry API endpoints: list, search, get, register
- Semantic tag taxonomy oluştur

### Phase 2: Livinity Marketplace MCP
**Goal:** livinity.io'da çalışan MCP server — tüm ekosistem tek MCP'den erişilebilir
- `@livinity/marketplace-mcp` npm paketi oluştur
- GitHub-based skill/agent/hook registry (livinity-marketplace repo)
- Tools: search, install, uninstall, recommend, create
- Manifest validation + permission system
- Version management + conflict detection
- Community contributions: PR-based skill submission

### Phase 3: Intent Router v2
**Goal:** Kullanıcı mesajından otomatik capability seçimi
- Embedding-based semantic matching (local embedding model veya API)
- Confidence scoring + threshold filtering
- Context window budget management (token counting)
- Fallback: LLM-based classification (Kimi flash tier)
- Cache: intent → capability mapping Redis cache

### Phase 4: Auto-Provisioning Engine
**Goal:** Session başlarken otomatik tool/skill/MCP yükleme
- Session start hook: analyze intent → resolve capabilities → load
- Mid-session capability discovery: AI "bu tool yok, yükleyeyim" diyebilmeli
- Dynamic system prompt composition based on loaded capabilities
- Dependency resolution (A needs B, B needs C → install C, B, A)
- Budget optimizer: en az token ile en çok capability

### Phase 5: AI Self-Modification
**Goal:** AI kendi hook, tool, skill oluşturabilsin
- Skill auto-generation: kullanıcı "şunu yapan bir skill yaz" → skill oluştur + test + yükle
- Hook auto-creation: "her commit'ten önce lint çalıştır" → hook oluştur
- Agent template creation: "job hunting agent yap" → subagent config + system prompt + tool set
- Self-evaluation: oluşturulan capability'yi test et, başarısızsa düzelt

### Phase 6: Agents Panel Redesign
**Goal:** Profesyonel UI — capability management hub
- **Unified Dashboard:** Skills + MCPs + Hooks + Agents tek görünümde
- **Capability Cards:** Status, tier, tools provided, last used, success rate
- **Auto-Install UI:** AI önerdiğinde "Install?" dialog
- **System Prompt Editor:** Template library + custom prompt builder
- **Agent Builder:** Visual agent creation (drag-drop capabilities)
- **Analytics:** Tool usage stats, success rates, popular combinations
- **One-Click Templates:** Claude Code Templates tarzı hazır agent'lar

### Phase 7: Learning Loop
**Goal:** Kullanım pattern'lerinden öğrenme
- Execution logging: her tool call → Redis stream
- Pattern mining: hangi capability kombinasyonları birlikte kullanılıyor?
- Auto-suggestion: "Bu iş için genellikle X de kullanılıyor, yükleyeyim mi?"
- User feedback: implicit (task completed?) + explicit (rating)
- A/B testing: farklı capability setleri için başarı oranı karşılaştırma

---

## Teknik Kısıtlar

1. **AUTH'A DOKUNMA** — OAuth, JWT, API key, login akışları değişmez
2. **Streaming/Block model bozulmasın** — Mevcut typewriter + block interleave çalışıyor
3. **Nexus compiled JS** — `npm run build --workspace=packages/core` her source değişikliğinde
4. **UI build** — `pnpm --filter @livos/config build && pnpm --filter ui build`
5. **Mini PC deploy** — `ssh -i .../minipc bruce@10.69.31.68` → `sudo bash /opt/livos/update.sh`
6. **Context window budget** — 67 tool × ~300 token = 20k token. Dinamik seçim ŞART.
7. **MCP cold start** — MCP server başlatma 2-5 saniye. Lazy loading + caching gerekli.

---

## Derinlemesine Araştırma Bulguları (Ek)

### GSD Derinlemesine (44k stars)
- **Thin-orchestrator / fat-subagents pattern:** `/gsd:execute-phase` hiçbir iş yapmaz — PLAN.md okur, dependency DAG kurar, wave'lere böler, `gsd-executor` spawn eder. Orchestrator worker çıktılarını OKUMAZ, sadece completion signal alır. Context rot'un önlenmesinin sırrı bu.
- **Agent dosya formatı:**
  ```markdown
  ---
  name: gsd-executor
  tools: Read, Write, Edit, Bash, Grep, Glob
  color: yellow
  permissionMode: acceptEdits
  ---
  [Behavioral instructions]
  ```
- **Deviation rules:** Executor 3 kere auto-fix dener, başarısızsa orchestrator'a defer eder.
- **SDK:** `@anthropic-ai/claude-agent-sdk` ile headless/programmatic execution — server-side automation path.

### Claude Code Templates Derinlemesine (23.7k stars)
- **Agent routing field:** `description: "Use this agent when..."` — Claude Code bu alanı okuyarak hangi agent'ı otomatik invoke edeceğine karar veriyor. Bizim intent router için aynı pattern.
- **Agent Teams as Packages:** `deep-research-team/` dizini 16 coordinated agent içeriyor (1 orchestrator + 15 specialist). Tek unit olarak install ediliyor. **Marketplace modeli: "Research Team" install et, 16 agent birden gelsin.**
- **Category hierarchy:** `{type}/{category}/{name}.md` — flat-file marketplace yapısı.
- **Remote MCPs:** `https://mcp.service.com/mcp` HTTP endpoint — artık `npx` process gerekmiyor.

### System Prompts Derinlemesine (7k stars)
- **110+ distinct prompt string, conditional assembly:** Production agent systems statik prompt KULLANMAZ. Conditional composition kullanır.
- **İki execution model:**
  - **Subagents (Task tool):** Full context isolation. Yeni Claude instance. Expensive.
  - **Fork workers:** Parent context'i inherit eder. Subagent spawn edemez. Max 200 turn. 500-word output cap. Cheap, fast.
- **Security monitor:** Default-allow stance. Sadece specific threat signatures block eder (prompt injection, scope creep). Friction'ı minimize eder.
- **Memory 3 tier:** Session memory → Memory file selection → Dream consolidation (periodic pruning).
- **Verification specialist:** "A check without a Command run block is not a PASS — it's a skip."

### Ek Derinlemesine Bulgular (3. Araştırma)

**GSD Detay (44k stars, 90 slash command, 18 agent):**
- `.claude/commands/gsd/` — 90 markdown, `.claude/agents/` — 18 agent spec, hooks — 5 JS
- CLAUDE.md'ye marker-bounded sections yazıyor (`<!-- GSD:stack-start -->`), surgical update yapabiliyor
- PLAN.md XML formatı: `<read_first>`, `<action>`, `<verify>`, `<done>`, `<acceptance_criteria>`
- Plan-checker agent: planner output'unu 3 iterasyona kadar revize eder
- 18 agent: executor, planner, plan-checker, verifier, phase-researcher, project-researcher, research-synthesizer, roadmapper, debugger, ui-auditor, ui-checker, ui-researcher, advisor-researcher, assumptions-analyzer, codebase-mapper, integration-checker, nyquist-auditor, user-profiler

**Claude Code Templates Detay (23.7k stars, 600+ agent, 200+ command, 55+ MCP):**
- Agent description field: `"Use this agent when..."` → Claude Code proactive invocation trigger
- `.mcp.json` pre-configures MCP servers
- Agent teams: `deep-research-team/` = 1 orchestrator + 15 specialist, single install unit
- Scale: 600+ agent, aitmpl.com dashboard gerekli discovery için

**System Prompts Detay (7k stars, 110+ prompt string, 136+ version):**
- `data-agent-sdk-reference-typescript.md` — SDK reference text'in tamamı
- `agent-prompt-plan-mode-enhanced.md` — Plan mode constraint'leri
- `tweakcc` tool: compiled JS'te prompt string'leri bulup replace eder (her Claude Code update'de kırılır)
- Security monitor: 2 dosyada split (boyut nedeniyle), default-allow stance

### 5 Somut Öneri (Araştırmadan)
1. **Agent Package Format:** claude-code-templates frontmatter + `manifest.json` for marketplace metadata (version, deps, install count)
2. **Orchestration Engine:** GSD wave-execution in Nexus — DAG build → wave group → SDK headless spawn → completion signals
3. **Registry Structure:** `{type}/{category}/{name}/` flat-file + `index.json` for search. Agent teams = single installable unit.
4. **Security Model:** Default-allow per Claude Code. Per-agent `tools` list enforced at ToolRegistry level.
5. **Verification Layer:** Goal-backward verification agent (GSD pattern) — never trust executor's own report.

---

## Marketplace İçerik Kaynakları

### Skill'ler
- Mevcut `/nexus/skills/` (8 builtin skill)
- GitHub registry: `utopusc/livinity-skills`
- Community PRs ile büyüyen katalog

### MCP'ler
- 19 featured MCP (mcp-panel.tsx'te hardcoded)
- Official MCP Registry API
- Custom MCP'ler (kullanıcı oluşturur)

### Hook'lar
- Claude Code hook formatı (settings.json)
- Pre-commit, post-completion, file-change hooks
- AI-generated hooks

### Agent Template'leri
- Claude Code Templates repo'sundan adapte edilecek agent'lar
- GSD-inspired phase agents (researcher, planner, executor, verifier)
- Domain-specific agents (job hunter, server monitor, content creator)

### System Prompt'lar
- Claude Code System Prompts repo'sundan extracted (58 module, 40+ reminder)
- Mode-specific prompts (auto, learning, minimal, plan)
- Custom prompt builder

---

## Başarı Kriterleri

1. Kullanıcı "websiteden veri çek" dediğinde AI otomatik olarak Chrome MCP yükleyip kullanabilmeli
2. Yeni bir skill oluşturmak 1 komut ile mümkün olmalı
3. Marketplace'te 50+ capability bulunmalı (skills + MCPs + hooks + agents)
4. Context window bütçesi %30'dan fazla tool tanımlarına gitmemeli
5. İkinci aynı intent'te capability loading < 1 saniye (cache'den)
6. AI kendi eksik capability'sini fark edip yükleyebilmeli

---

## Öncelik Sırası

1. **Unified Capability Registry** (Phase 1) — Her şeyin temeli
2. **Agents Panel Redesign** (Phase 6) — Kullanıcı deneyimi
3. **Intent Router v2** (Phase 3) — Otomatik seçim
4. **Auto-Provisioning** (Phase 4) — Dinamik yükleme
5. **Livinity Marketplace MCP** (Phase 2) — Ekosistem erişimi
6. **AI Self-Modification** (Phase 5) — Otonom capability oluşturma
7. **Learning Loop** (Phase 7) — Sürekli iyileşme

---

Bu prompt'u `/clear` yaptıktan sonra yapıştır ve `/gsd:new-milestone` ile başlat.
