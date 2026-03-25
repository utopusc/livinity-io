# Requirements: Livinity v16.0 -- Multi-Provider AI

**Defined:** 2026-03-24
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v16.0 Requirements

Requirements for Multi-Provider AI milestone. Each maps to roadmap phases.

### Provider Altyapı

- [ ] **PROV-01**: ClaudeProvider git geçmişinden geri yüklenir ve ProviderManager'a kaydedilir
- [ ] **PROV-02**: `@anthropic-ai/sdk` bağımlılığı eklenir
- [ ] **PROV-03**: ProviderManager fallback döngüsü Claude + Kimi ile çalışır
- [ ] **PROV-04**: Config şemasında provider seçimi (`primary: 'claude' | 'kimi'`) bulunur

### Kimlik Doğrulama

- [ ] **AUTH-01**: Kullanıcı Claude API key'ini Settings'ten girebilir
- [ ] **AUTH-02**: Claude API key Redis'te güvenli saklanır
- [ ] **AUTH-03**: Kullanıcı opsiyonel olarak OAuth PKCE ile Claude'a bağlanabilir

### Özellik Paritesi

- [ ] **FEAT-01**: Claude provider streaming yanıt destekler
- [ ] **FEAT-02**: Claude provider tool calling destekler
- [ ] **FEAT-03**: Claude provider vision/multimodal destekler
- [ ] **FEAT-04**: Model tier mapping çalışır (haiku/sonnet/opus)

### Kullanıcı Arayüzü

- [ ] **UI-01**: Settings'te provider seçim toggle'ı bulunur
- [ ] **UI-02**: Aktif provider durumu UI'da görünür
- [ ] **UI-03**: Provider değiştirildiğinde yeni konuşmalar seçili provider'ı kullanır

## Future Requirements

### Provider Genişletme

- **PROV-05**: OpenAI/GPT provider desteği
- **PROV-06**: Per-conversation provider switching
- **PROV-07**: Multi-provider simultaneous (A/B comparison)

## Out of Scope

| Feature | Reason |
|---------|--------|
| OpenAI/GPT support | Only Claude + Kimi for now |
| Multi-provider simultaneous | One provider at a time |
| Per-conversation provider switching | Global setting only |
| Provider-specific tool formats in UI | Abstracted away by AIProvider interface |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | — | Pending |
| PROV-02 | — | Pending |
| PROV-03 | — | Pending |
| PROV-04 | — | Pending |
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| FEAT-01 | — | Pending |
| FEAT-02 | — | Pending |
| FEAT-03 | — | Pending |
| FEAT-04 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |

**Coverage:**
- v16.0 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after initial definition*
