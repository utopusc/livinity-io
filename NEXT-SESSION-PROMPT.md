# Devam Edilecek İşler — Livinity v22.0 Post-Deploy Fixes

## Mevcut Durum

v22.0 milestone tamamlandı ve deploy edildi. `mcp.livinity.io` marketplace 3275 item ile çalışıyor. Ama birçok şey yarım kaldı veya düzgün çalışmıyor. Bu prompt'taki sorunları sırayla düzelt.

**KRİTİK: Auth sistemine, streaming/block modele, typewriter animasyonuna DOKUNMA. Bunlar çalışıyor.**

---

## 1. Marketplace Arama Fix (livinity_search)

### Sorun
- Multi-word query (`resume cv`, `career job search`) 0 sonuç dönüyor — kelimeler AND olarak aranıyor, OR olmalı
- Author'da arama yapılmıyor — `proficiently` araması 0 dönüyor ama `proficientlyjobs` author'lu 7 item var
- Case sensitivity sorunu olabilir

### Düzeltme
**Dosya:** `nexus/packages/core/src/marketplace-mcp.ts` — `createSearchTool()` içindeki filter fonksiyonu

Şu anki mantık:
```typescript
entries.filter((entry) => {
  const nameMatch = entry.name.toLowerCase().includes(query);
  const descMatch = entry.description.toLowerCase().includes(query);
  const tagMatch = entry.tags.some((t) => t.toLowerCase().includes(query));
  return nameMatch || descMatch || tagMatch;
});
```

Olması gereken:
- Query'yi boşluklara göre split et → her kelimeyi ayrı ara → OR mantığı
- `entry.author` field'ında da ara
- `entry.category` field'ında da ara
- `entry.install_command` field'ında da ara (kullanıcı "proficiently" diye arayabilir)

```typescript
const words = query.split(/\s+/).filter(w => w.length > 1);
entries.filter((entry) => {
  const haystack = [
    entry.name, entry.description, entry.author, entry.category,
    ...(entry.tags || []), ...(entry.triggers || [])
  ].join(' ').toLowerCase();
  // OR: herhangi bir kelime eşleşirse sonuç dön
  return words.some(word => haystack.includes(word));
});
```

### Test
- `livinity_search query="resume cv"` → prof:tailor-resume, prof:cover-letter, prof:apply vs. dönmeli
- `livinity_search query="proficiently"` → proficientlyjobs author'lu 7 item dönmeli
- `livinity_search query="career job search"` → job/career ile ilgili onlarca sonuç dönmeli

---

## 2. Agent System Prompt Template (Profesyonel)

### Sorun
AI agent oluştururken system prompt çok kısa ve jenerik kalıyor. "Web tarayıcısı ile iş başvuru sitelerine erişebilir" gibi yüzeysel.

### Düzeltme
**Dosya:** `nexus/packages/core/src/daemon.ts` — `create_agent_template` tool'unun system prompt'unu iyileştir

Agent oluşturulurken AI'a şu template'i takip etmesini söyle (BASE_SYSTEM_PROMPT veya agent-session.ts'deki Self-Modification section'ına ekle):

```markdown
## Agent Creation Guidelines

When creating a new agent, generate a DETAILED system prompt following this structure:

### 1. Identity & Role (2-3 sentences)
- Who is this agent? What is its expertise?
- What domain does it operate in?

### 2. Goals (bullet list)
- Primary goal
- Secondary goals
- Success metrics

### 3. Available Tools & How to Use Them
- List specific tools this agent should use
- When to use each tool
- Tool chains (e.g., "search → analyze → report")

### 4. Workflow Steps
- Step-by-step process the agent follows
- Decision points (if X then Y)
- Error handling ("if blocked, try alternative")

### 5. Output Format
- How to present results to the user
- Reporting structure
- Progress updates

### 6. Constraints & Safety
- What NOT to do
- Rate limits to respect
- User approval gates

### 7. State Management
- What to remember between runs
- How to track progress
- Where to store findings
```

### Uygulama
`daemon.ts`'deki Self-Modification system prompt section'ına bu template'i ekle. AI yeni agent oluştururken bu yapıyı takip etsin.

---

## 3. Agent Workspace (`.agents/{name}/` dizini)

### Sorun
Agent'lar hiçbir şeyi persist etmiyor. Ne yaptığını, nereye kadar geldiğini, bulgularını kaydetmiyor. GSD'nin `.planning/` dizini gibi bir yapı lazım.

### Tasarım
Her agent için `data/agents/{agent-id}/` dizini oluştur:

```
data/agents/is-basvuru-asistani/
├── config.json          # Agent config (system prompt, tools, schedule)
├── state.json           # Current state (last run, iteration, progress)
├── history/             # Run history
│   ├── 2026-03-29-001.json  # Each run's input/output
│   └── 2026-03-29-002.json
├── findings/            # Persistent findings
│   ├── jobs-found.json      # Found jobs list
│   └── applications.json    # Submitted applications
└── memory/              # Agent-specific memory
    └── notes.md         # Agent's own notes
```

### Uygulama
1. **SubagentManager.create()** → dizin oluştur
2. **SubagentManager.recordRun()** → history/ altına kaydet
3. **Agent execution** → state.json güncelle (lastRun, iteration, currentTask)
4. **Agent tools** → findings/ altına veri kaydet (agent-specific `agent_save` tool)
5. **Agent UI** → config panelde findings/ ve history/ göster

### Yeni Tool'lar (agent scope'unda)
```typescript
// agent_save — agent'ın kendi workspace'ine veri kaydetmesi
agent_save({ key: "jobs-found", data: [...] })

// agent_load — agent'ın kendi verisini okuması
agent_load({ key: "jobs-found" })

// agent_state — agent'ın durumunu güncellemesi
agent_state({ progress: "3/10 jobs applied", currentTask: "applying to Google" })
```

---

## 4. Agent Chat UI = AI Chat UI (Birebir Aynı)

### Sorun
Agent chat'i `ChatMessageItem` ile render ediliyor ama agent'lar `executeSubagent` tRPC mutation ile çalışıyor — yanıt tek seferde geliyor. Streaming, thinking indicator, tool progress yok.

### Kısa Vadeli Fix (Şimdi yapılabilir)
Agent history mesajlarının mevcut `ChatMessageItem` render'ı düzgün çalışsın:
- Markdown render edilsin (şu an düz text)
- Code blocks syntax highlighted olsun
- Uzun mesajlar collapse/expand olsun

### Uzun Vadeli Fix (WebSocket entegrasyonu)
Agent execution'ını da `/ws/agent` WebSocket üzerinden yap:
1. `executeSubagent` mutation yerine WebSocket'e `{type: 'start_agent', agentId, message}` gönder
2. Backend'de agent execution'ı da `AgentSessionManager` üzerinden çalıştır
3. Streaming, thinking, tool progress aynı `useAgentSocket` hook'u ile gelir
4. Agent chat component'ı AI Chat ile aynı `ChatMessageItem` + `StreamingMessage` kullanır

Bu büyük bir refactor — agent execution pipeline'ını WebSocket'e taşımak lazım.

---

## 5. livinity_install MCP Kurulum Fix

### Sorun
`livinity_install id="mcp:memory"` → `Install failed: Invalid server name "memory-/-knowledge-graph"` hatası. MCP name'de `/` ve özel karakter var.

### Düzeltme
**Dosya:** `nexus/packages/core/src/marketplace-mcp.ts` — MCP install case'inde server name sanitization

```typescript
// Mevcut (hatalı):
const serverName = (entry.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-')...

// Düzeltme: catalog'daki id'den al, name'den değil
const serverName = capabilityId.replace('mcp:', '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
```

Ayrıca builtin catalog'daki MCP'lerin name'leri düzeltilmeli — `Memory / Knowledge Graph` yerine `memory` olmalı.

---

## 6. Tier: flash → haiku

### Sorun
Bazı yerlerde hâlâ `flash` tier var. Claude SDK'da `flash` yok, `haiku` var.

### Düzeltme
Grep ile tüm `flash` referanslarını bul ve `haiku` yap:
- `nexus/packages/core/src/daemon.ts` — built-in agent'lar
- `nexus/packages/core/src/agent-session.ts` — budget tier mapping
- `mcp-marketplace/catalog.ts` — builtin catalog items
- Agent create form UI'da zaten düzeltildi

```bash
grep -rn "'flash'" nexus/packages/core/src/ livos/packages/ui/src/ --include="*.ts" --include="*.tsx"
```

---

## 7. mcp.livinity.io Auto-Sync Tüm Kaynaklar

### Mevcut Durum
- claude-code-templates: ✅ auto-sync (her 6 saatte git pull + parse)
- Extra kaynaklar (KWP, claude-skills, ECC, Salesably, Proficient, MarketingSkills): ❌ Sadece başlangıçta static JSON'dan yükleniyor, auto-sync yok

### Düzeltme
`sync-github.ts`'ye tüm repo'ları da clone/pull + parse ekle. Tek bir `syncAll()` fonksiyonu:
1. claude-code-templates (mevcut)
2. anthropics/knowledge-work-plugins
3. alirezarezvani/claude-skills
4. affaan-m/everything-claude-code
5. Salesably/salesably-marketplace
6. proficientlyjobs/proficiently-claude-skills
7. coreyhaines31/marketingskills

Her 6 saatte hepsi güncellenir.

---

## 8. POST /api/capabilities Endpoint

### Sorun
UI'dan install butonu çalışmıyor — `POST /api/capabilities` endpoint'i yok.

### Düzeltme
**Dosya:** `nexus/packages/core/src/api.ts`

```typescript
app.post('/api/capabilities', async (req, res) => {
  const { name, type, description, provides_tools, semantic_tags, source } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });
  const manifest = { id: `${type}:${name}`, type, name, description, ... };
  await capabilityRegistry.registerCapability(manifest);
  res.status(201).json({ id: manifest.id, success: true });
});
```

Ayrıca `ai.installMarketplaceCapability`'yi `httpOnlyPaths`'e ekle:
**Dosya:** `livos/packages/livinityd/source/modules/server/trpc/common.ts`

---

## 9. IntentRouter — Şu An Devre Dışı

### Durum
`ws-agent.ts`'de IntentRouter devre dışı bırakıldı çünkü CapabilityRegistry'de sadece 4 item vardı. Şimdi 3275+ item var ama IntentRouter hâlâ kapalı.

### Ne Zaman Aktifleştirilmeli
CapabilityRegistry'nin sync'i düzgün çalışır hale geldiğinde. Şu an registry sadece 4 item sync ediyor (2 MCP + 2 agent). 67+ tool'un da registry'ye eklenmesi lazım — `capability-registry.ts`'deki `syncTools()` method'u tools'ları da capability olarak kaydetmeli.

### Düzeltme Sırası
1. `capability-registry.ts` → `syncTools()` düzelt — tüm tool'ları capability olarak kaydet
2. Test et — registry'de 67+ capability olmalı
3. `ws-agent.ts` → IntentRouter'ı tekrar aktifleştir
4. Test et — AI'a mesaj yaz, intent routing çalışsın

---

## Öncelik Sırası

1. **Arama fix** (5 dk) — En çok kullanıcıyı etkileyen
2. **livinity_install MCP name fix** (5 dk) — Kurulum çalışsın
3. **flash → haiku** (5 dk) — Hatalı tier referansları
4. **POST /api/capabilities** (10 dk) — UI install butonu
5. **Agent system prompt template** (15 dk) — Profesyonel agent'lar
6. **Agent workspace dizin yapısı** (30 dk) — State persistence
7. **Agent chat WebSocket** (2+ saat) — Streaming/thinking/tool progress
8. **Auto-sync tüm kaynaklar** (30 dk) — Marketplace güncel kalması
9. **IntentRouter aktivasyonu** (1 saat) — Dynamic tool selection

---

## Deploy Bilgileri

- **Mini PC**: `ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68`
- **Server5 (relay+marketplace)**: `ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master root@45.137.194.102`
- **Deploy**: `sudo bash /opt/livos/update.sh` (Mini PC'de)
- **Marketplace restart**: `pm2 restart marketplace` (Server5'te)
- **Nexus build**: `npm run build --workspace=packages/core` (source değişikliğinde)
- **UI build**: `pnpm --filter @livos/config build && pnpm --filter ui build`
- **Redis cache temizle**: `redis-cli -a LivRedis2024! DEL nexus:marketplace:index`

---

## Dosya Haritası

| Dosya | Ne yapar |
|-------|----------|
| `nexus/packages/core/src/marketplace-mcp.ts` | 5 livinity_* tool (search/install/uninstall/recommend/list) |
| `nexus/packages/core/src/capability-registry.ts` | Unified registry — sync, list, search, register |
| `nexus/packages/core/src/intent-router.ts` | TF-IDF scoring, caching, budget management |
| `nexus/packages/core/src/agent-session.ts` | Agent loop, tool execution, system prompt |
| `nexus/packages/core/src/daemon.ts` | Tool registration, system prompt, create_hook/agent tools |
| `nexus/packages/core/src/index.ts` | Nexus startup wiring |
| `nexus/packages/core/src/api.ts` | REST API endpoints |
| `nexus/packages/core/src/lib.ts` | Exports for livinityd |
| `livos/packages/livinityd/source/modules/server/ws-agent.ts` | WebSocket agent, IntentRouter wiring |
| `livos/packages/livinityd/source/modules/ai/routes.ts` | tRPC routes (capabilities, prompts, analytics, agents) |
| `livos/packages/ui/src/routes/ai-chat/index.tsx` | Main AI Chat page — sidebar tabs, panels |
| `livos/packages/ui/src/routes/ai-chat/agents-panel.tsx` | Agent list + detail + chat + edit/delete |
| `livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx` | MCP server management (19 featured, search, config) |
| `livos/packages/ui/src/routes/ai-chat/skills-panel.tsx` | Skill marketplace + installed + registries |
| `livos/packages/ui/src/routes/ai-chat/chat-messages.tsx` | Chat message rendering (blocks, tools, markdown) |
| `livos/packages/ui/src/hooks/use-agent-socket.ts` | WebSocket hook for streaming agent messages |
| `/opt/platform/marketplace/src/index.ts` | mcp.livinity.io Express API (Server5) |
| `/opt/platform/marketplace/src/catalog.ts` | Builtin 27 items |
| `/opt/platform/marketplace/src/sync-github.ts` | Auto-sync from claude-code-templates |
| `/opt/platform/marketplace/src/cct-catalog.json` | Parsed CCT data (2781 items) |
| `/opt/platform/marketplace/src/extra-catalog.json` | Extra sources (467 items) |
