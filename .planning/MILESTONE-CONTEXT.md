# MILESTONE-CONTEXT — v30.0 Livinity Broker Professionalization

**Captured:** 2026-05-02
**Trigger:** v29.5 hot-patch session sürecinde Bolt.diy ile yapılan canlı testler broker'ın MİMARİ olarak external API consumer'lar için yanlış tasarlandığını gösterdi.

Bu dosya `/gsd-new-milestone v30.0` workflow'u tarafından tüketilir.

## Proposed Milestone Name

**v30.0 — Livinity Broker Professionalization (Real API Endpoint Mode)**

## Goal (one sentence)

Livinity Broker'ı external/open-source app'lerin (Bolt.diy, Open WebUI, Continue.dev, Cline, vs.) **kendi system prompt'larını ve kendi tool'larını** kullanarak "gerçek bir Anthropic API key sahibi gibi" sorunsuz çalışabileceği — Bearer token auth'lu, public-endpointli, true token-streaming yapan, rate-limit-aware, multi-spec-compliant bir broker'a dönüştürmek.

## Why This Milestone Exists (Architectural Diagnosis)

v29.5 hot-patch session boyunca yapılan canlı testler **broker'ın mevcut implementasyonunun fundamental olarak yanlış olduğunu** ortaya koydu. Sorunların kökü:

### Problem 1 — Identity contamination (en kritik)

Broker bütün istekleri `/api/agent/stream` üzerinden nexus'un `SdkAgentRunner`'ına yönlendiriyor. SdkAgentRunner şunları YAPIYOR:

- **Sacred file `sdk-agent-runner.ts:264-270`** her isteğe "You are powered by Claude X.Y. The exact model ID is..." identity line'ı PREPEND ediyor
- `systemPromptOverride` undefined ise default Nexus system prompt'u DEVREYE GİRİYOR ("You are Nexus, an autonomous AI assistant running on a Linux server. You interact with users via WhatsApp, Telegram, Discord, and a web UI.")
- `mcpServers['nexus-tools']` ile Nexus'un built-in tool'ları (shell, docker_*, files_*, web_search) eklemleniyor
- IntentRouter Nexus capability'lerini context'e enjekte ediyor (Phase 22)

**Sonuç:** Bolt.diy, system prompt olarak "You are Bolt, an AI app builder..." gönderdiğinde, broker bunu Nexus identity + Nexus tools ile harmanlıyor. Model "ben Bolt'um" diye davranmıyor; karışık bir Nexus/Bolt persona ile yanıt veriyor. Aynı şey Continue.dev, Cline, Open WebUI, MiroFish ve gelecekteki HER external client için geçerli.

User'ın verbatim açıklaması:
> "Bolt.diy uzerinden yaziyorum kendisine nexus diyor. Ama api olarak kullaninca mesela kendisinin Bolt oldugunu ne yapmasinii gerektyigini system promptu olarak gondeiliyor. Bence Broker icok iyi bir sekilde guncellemek lazim cunku Her opensource proje kendi toollarini kullanmak isteyecek Direkt bir Emiri Broker uzerinden Agent a gondermek agentin Sadece livinity uzerinden calismasini saglayacak ve bu ciddi bir problem."

### Problem 2 — Block-level streaming (token streaming yok)

`sdk-agent-runner.ts:382-389` Claude Agent SDK'nın `assistant` mesajlarını AGGREGATE BLOCK olarak emit ediyor. Yani "1 2 3 4 5" prompt'u için RESPONSE TEK CHUNK'TA geliyor, token-by-token streaming OLMUYOR.

Live test (2026-05-02):
```
data: {"choices":[{"delta":{"role":"assistant","content":"1\n2\n3\n4\n5"}}]}
data: {"choices":[{"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```

İki chunk total. Bolt.diy / Vercel AI SDK / Open WebUI gibi token-streaming bekleyen client'lar bunu "non-streaming" veya "broken stream" olarak algılıyor → user error / 504 timeout.

Token streaming için broker'ın **Agent SDK'yı bypass edip direkt Anthropic streaming API'sını** kullanması gerekiyor.

### Problem 3 — Tool injection (gerçek API tarafından yapılmaz)

Agent SDK her istekte Nexus'un MCP tool'larını ekliyor (`mcpServers['nexus-tools']`, `allowedTools` array). Bu tool'lar response'larda `tool_use` block'ları üretebilir → external client'in beklemediği content. Ayrıca Bolt.diy gibi client'lar **kendi tool'larını** request'te `tools` field'ı ile gönderir, broker'ın bunları HONOR ETMESİ gerekir; mevcut implementasyon `D-42-12` kararıyla "ignore with warn log" yapıyor (`openai-router.ts:110-124`).

### Problem 4 — Auth modeli external client'lar için doğru değil

Mevcut auth:
- URL path = user identity (`/u/<userId>/v1/...`)
- Container source IP guard (yalnız 127.0.0.1 / 172.16/12 kabul)
- Bearer token IGNORED

Standart bir API consumer:
- `Authorization: Bearer sk-xxx` header bekliyor
- Public-facing endpoint istiyor (api.livinity.io)
- Per-user API key + rotation + revocation istiyor

Bu auth modeli **D-NO-BYOK kararı (Phase 39, v29.3)** ile çatışır gibi gözüküyor — ama D-NO-BYOK kullanıcının `claude_*` raw API key'ini broker'a ÇEVİRMEYİ engelliyor; broker'ın **kendi** Bearer token'ları ÜRETMESİNE engel değil. v30 boyunca clarify edilecek.

### Problem 5 — 504 timeouts on chat requests

User'ın live console log'u:
```
/api/llmcall:1 Failed to load resource: the server responded with a status of 500 ()
/api/chat:1 Failed to load resource: the server responded with a status of 504 ()
```

Bolt.diy `/api/chat` endpoint'i broker'a istek atıyor. Broker → nexus `/api/agent/stream` → Agent SDK loop → 30+ saniye sürebiliyor (max_turns=30 default, watchdog 60s). Bolt.diy timeout 30s civarı; bu da 504 üretiyor.

Direkt passthrough mode'da API çağrısı 1-3 saniyede tamamlanır.

### Problem 6 — Spec drift

OpenAI Chat Completions ve Anthropic Messages API spec'lerinde subtle requirement'lar var:
- `usage{prompt_tokens, completion_tokens, total_tokens}` non-zero (v29.5 commit `2518cf91` ile başladı, devam etmeli)
- `id` format (`chatcmpl-xxx` vs `msg_xxx`)
- `Retry-After` header (Phase 45 kısmen ele aldı)
- `X-RateLimit-*` headers (yok)
- Streaming spec — `event: message_start` / `event: content_block_delta` / etc. tam compliance (Anthropic) veya `data: {chunk}\n\ndata: [DONE]\n\n` (OpenAI) — kısmen var ama edge case'ler var

## Target Features (v30.0 Scope)

7-phase milestone proposed:

### A. Architectural Refactor

- **A1. Passthrough mode (DEFAULT for external)** — broker `/v1/messages` ve `/v1/chat/completions` istekleri Agent SDK'ya GİTMEYECEK. Bunun yerine **doğrudan Anthropic streaming API'sına forward edilecek** (Anthropic SDK direct call OR HTTP proxy to api.anthropic.com). Client'ın system prompt'u verbatim taşınacak. Client'ın tool'ları varsa o'lar honor edilecek. Identity injection KALDIRILACAK. Token-by-token streaming — Anthropic'in native SSE event'ları (`event: content_block_delta` vs.) translate edilecek.
- **A2. Agent mode (opt-in)** — `X-Livinity-Mode: agent` header (veya URL path `/u/<id>/agent/v1/...`) ile mevcut Nexus-tooled davranış aktive edilebilir. Default OFF. LivOS in-app chat zaten direkt `/api/agent/stream` kullandığı için bu mode broker'da sadece "explicitly opt-in" external use için.

### B. Auth & Public Surface

- **B1. Per-user Bearer token auth** — `liv_sk_*` formatında token'lar PG `api_keys` tablosunda. Settings UI'da "API Keys" tab — generate / list / revoke. Token validation middleware broker'ın önüne geçecek.
- **B2. Public endpoint** — Server5'te `api.livinity.io` reverse proxy. TLS terminasyonu, container IP guard kalkar (Bearer auth ile değiştirilir). Rate limit perimeter Server5'te.

### C. Spec Compliance

- **C1. True token streaming for Anthropic Messages** — `event: message_start`, `event: content_block_start`, `event: content_block_delta`, `event: content_block_stop`, `event: message_delta`, `event: message_stop` Anthropic SSE event sequence verbatim emit. Anthropic SDK passthrough zaten doğru emit ediyor; broker sadece IP guard / auth ekleyecek, payload mutate ETMEYECEK.
- **C2. True token streaming for OpenAI Chat** — Anthropic'ten gelen native stream'i OpenAI chunk'larına TRANSLATE eden adapter (mevcut `openai-sse-adapter.ts` rewrite — token-by-token translation). Yani Anthropic'in `content_block_delta` event'i geldikçe OpenAI `chat.completion.chunk` emit edilecek (1:1 mapping).
- **C3. Rate limit headers** — Anthropic API response headers'ı (`anthropic-ratelimit-requests-remaining`, `anthropic-ratelimit-tokens-remaining`, etc.) verbatim forward. OpenAI client'lar `X-RateLimit-*` namespace bekler — translation table.

### D. Model Strategy

- **D1. Model alias resolution** — friendly aliases (`opus`, `sonnet`, `haiku`) güncel Claude family'ye resolve. Auto-update logic (yeni model çıkınca config-driven). Knowledge cutoff metadata.
- **D2. Multi-provider stub** — gelecekte OpenAI / Gemini / Mistral broker'lar eklenebilmesi için interface ayrımı (broker pluggable). v30'da SADECE Anthropic implement edilecek; interface hazır olacak.

### E. Observability

- **E1. Per-token usage tracking** — `broker_usage` tablosu artık doğru `prompt_tokens` / `completion_tokens` row'ları yazacak (v29.5 fix `2518cf91` başlangıç). Per-API-key dashboard.
- **E2. Settings > AI Configuration > API Keys + Usage tabs** — generate/revoke UI + 30-day chart per key.

## Suggested Phase Breakdown (rough — roadmapper refine eder)

| Phase | Goal | Deps |
|---|---|---|
| 56 | Research spike: Anthropic SDK direct passthrough viability + Agent SDK boundaries + model selection landscape (Anthropic family + alternatives) | — |
| 57 | A1 Passthrough mode implementation — Anthropic Messages broker direct-to-anthropic.com (Agent SDK bypass) | 56 |
| 58 | C1+C2 True token streaming (Anthropic native + OpenAI translation) | 57 |
| 59 | B1 Per-user Bearer token auth — `api_keys` PG table + middleware + revocation | — (parallel) |
| 60 | B2 Public endpoint — Server5 `api.livinity.io` reverse proxy + TLS + rate-limit perimeter | 59 |
| 61 | C3 Rate limit headers + D1 model alias resolution + D2 provider interface stub | 57, 58 |
| 62 | E1+E2 Usage tracking accuracy + Settings UI (API Keys + Usage tabs) | 59 |
| 63 | Mandatory live verification: Bolt.diy + Open WebUI + Continue.dev + raw curl + Anthropic Python SDK end-to-end smoke tests on Mini PC | 57-62 |

## Locked Decisions (carry from v29.x)

- **D-NO-NEW-DEPS** preserved (broker kullanır mevcut deps + yeni Anthropic SDK eklenebilir — clarify in Phase 56)
- **D-NO-SERVER4** preserved
- **D-LIVINITYD-IS-ROOT** preserved
- **Sacred file `sdk-agent-runner.ts`** v30'da DEĞİŞMEYECEK (passthrough mode bu dosyayı bypass ediyor; agent mode hâlâ aynı dosyayı kullanır — sacred constraint sürer)
- **D-LIVE-VERIFICATION-GATE (v29.5'te eklenmiş)** — bu milestone'un Phase 63'ü ile zaten honor edilecek
- **D-NO-BYOK (v29.3 Phase 39)** — Bearer token'lar broker'ın KENDİ token'ları olacak; user'ın raw `claude_*` API key'i broker'a girmiyor (subscription-only path korunur). Phase 56 araştırmasında doğrulanacak.

## Critical Open Questions for /gsd-discuss-milestone

1. **Anthropic SDK direct passthrough vs HTTP proxy to api.anthropic.com — hangisi?** SDK SDK'nın subscription auth'unu kullanır (per-user `~/.claude` dirs); HTTP proxy basit ama Bearer token geçirilmesi gerek (D-NO-BYOK ile çatışır mı?). Phase 56 spike sonucunu bekliyor.
2. **Bolt.diy / external client'in tool'larını forward etmek mi yoksa ignore mu?** Anthropic API tool'ları native destekliyor; broker passthrough modda forward eder. Ama bazı subscription auth path'leri tool'ları reddediyor olabilir. Phase 56'da test edilecek.
3. **Agent mode hâlâ `/u/<id>/v1/messages` URL'inde mi kalsın yoksa ayrı path mi (`/u/<id>/agent/v1/...`)?** Header-based opt-in mi (`X-Livinity-Mode: agent`)?
4. **Public endpoint nerede live olacak?** `api.livinity.io` Server5 üzerinde Caddy ile mi, yoksa Cloudflare Worker mi (faster cold start, edge cache)?
5. **API key rotation policy?** Manual revoke + recreate mi, otomatik 90-day rotation mi? Default key'siz mi user'lar (kendileri opt-in mi olsun)?
6. **Rate limit policy — quota nasıl belirlenir?** Anthropic'ten gelen rate limit'i forward mu (per-user limit yok), yoksa broker da kendi quota'sını mı zorlar (token-bucket per-key)?
7. **Block-level streaming hâlâ destekleniyor mu (Agent mode için)?** Agent SDK fundamentally aggregate ediyor; agent mode'da bu kalıyor; passthrough'da fix.

## Scope Notes

**NOT in v30.0:**
- Multi-provider implementation beyond Anthropic (OpenAI, Gemini provider'ları sadece interface stub — Phase D2; gerçek implementasyon v30+)
- Mobile API key management UI (desktop only v30 için)
- Webhook events (api.livinity.io/webhooks — defer)
- Embedding API (`/v1/embeddings`) — defer (Anthropic embedding sunmuyor; OpenAI uyumlu yapmak v31+)
- Vision/multimodal request handling spec compliance (default işlemeli ama edge case test'i v30 scope'unda değil)

**In scope:**
- 7-fix architectural milestone (passthrough mode, Bearer auth, public endpoint, token streaming, spec compliance, observability, usage tracking)
- Mandatory live verification with multiple external clients (Phase 63)

## v29.5 Open Threads (carried into v30)

v29.5'in shipped commit'leri (sırasıyla `d12c9f26`, `47cd8a64`, `7ffc0402`, `a3d5b128`, `fcc3ae4d`, `2518cf91`) v30 öncesi durum:

| Konu | Status | v30 İlişkisi |
|---|---|---|
| Tool registry (A1) | ✅ Live verified | v30 etkilemez (LivOS chat path'inde kalıyor) |
| Streaming UI bundle (A2) | ✅ Live verified | v30 broker token-streaming bunu separately çözer |
| Marketplace state (A3) | ✅ Live verified | v30 etkilemez |
| Security panel (A4) | ✅ Live verified (collapsed sidebar idi) | v30 etkilemez |
| B1 verification gate | ✅ Mechanism (gsd toolkit) | v30 Phase 63 bunun ilk gerçek testi |
| Phase 55 mandatory live verify | ⏳ **PENDING** — Bolt.diy stream + model picker + relocation kararı + 14 UAT walk | v30 başlamadan v29.5 close edilmeli |

**v29.5 close öncesi yapılacaklar:**
1. `bash /opt/livos/update.sh` Mini PC'de — son commit `2518cf91` deploy
2. Bolt.diy reinstall (yeni inject-ai-provider.ts compose ile)
3. Bolt.diy chat'inde model seç → mesaj at → 504 hâlâ var mı (token fix sonrası)
4. v29.5 milestone-level audit — yeni B1 gate `human_needed` döndürür → user `--accept-debt` ile close OR Phase 55 walkthrough yapar
5. Sonra v30.0 başlar

## Lessons from v29.5 (carry forward)

- "**Mechanism passed ≠ live verified**" — B1 gate doğru çalıştı ama kullanıcı testte 3 yeni issue buldu (Bolt reinstall regression, Bolt model picker, Bolt streaming). Phase 55 live verify yapılmasaydı, v29.5 kapanacaktı `passed` deyip — aynı v29.4 hatası.
- "**Sacred file edit yapma without live verification**" — Branch N reversal v29.6'ya defer edildi. Doğru karar.
- "**SSH rate limit gerçek constraint**" — Mini PC fail2ban / network hiccup'lar var. Tek-batched SSH disipline et. v30'da diagnostic phase'leri yine bu pattern'e uy.
- "**Live patch + source patch ikiliği**" — bir live container patch yaptığında SOURCE'ı da güncelle. Reinstall'da regression engellenir.
- "**Layer of indirection findings**" — v29.5'te `platform_apps` table yoktu (asıl `apps`); livinityd compose builtin-apps.ts'ten geliyor (Server5 değil). v30'da broker source-of-truth nerede netleşmeli.

## How to Use This File

After current session is /clear'd, fresh session'da:

```
/gsd-new-milestone v30.0
```

Workflow MILESTONE-CONTEXT.md'yi tüketir, 7 phase roadmap'ini scaffold eder. **ÖNEMLİ:** v30 Phase 56 mandatory bir RESEARCH SPIKE'tır — Anthropic SDK direct passthrough viability, Agent SDK boundaries, public endpoint architecture (Caddy vs CF Workers), API key auth pattern best practices. v30 implementation phase'leri spike sonrasında planlanmalı.

**Companion artifact:** Yok bu sefer. v29.5'in `v29.4-REGRESSIONS.md`'si gibi tüm-çıktıyı-içeren fixture YOK; v30 SCRATCH değil ARCHITECTURAL — research spike v30 Phase 56'da yapılacak.

---

*Note for next session's Claude:* Bu çok büyük bir milestone. 7 phase, sacred file LİVE VERİFY zorunlu, public-facing infra (Server5 Caddy değişikliği) içeriyor, AT LEAST 3 farklı external client ile live verify gerekiyor. Roadmapper'a "fine granularity" ile spawnla — her phase 5-15 plan içerebilir. Phase 63 mandatory live verification — B1 gate'i tekrar test edecek. v30 close öncesi user attestation şart.
