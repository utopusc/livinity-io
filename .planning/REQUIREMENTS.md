# Requirements: Livinity v16.0 -- Multi-Provider AI

**Defined:** 2026-03-24
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v16.0 Requirements

Requirements for Multi-Provider AI milestone. Each maps to roadmap phases.

### Provider Infrastructure

- [x] **PROV-01**: ClaudeProvider git history'den geri yuklenir ve ProviderManager'a kaydedilir
- [x] **PROV-02**: `@anthropic-ai/sdk` bagimliligi eklenir
- [x] **PROV-03**: ProviderManager fallback dongusu Claude + Kimi ile calisir
- [x] **PROV-04**: Config semasinda provider secimi (`primary: 'claude' | 'kimi'`) bulunur

### Authentication

- [x] **AUTH-01**: Kullanici Claude API key'ini Settings'ten girebilir
- [x] **AUTH-02**: Claude API key Redis'te guvenli saklanir
- [x] **AUTH-03**: Kullanici opsiyonel olarak OAuth PKCE ile Claude'a baglanabilir

### Feature Parity

- [x] **FEAT-01**: Claude provider streaming yanit destekler
- [x] **FEAT-02**: Claude provider tool calling destekler
- [x] **FEAT-03**: Claude provider vision/multimodal destekler
- [x] **FEAT-04**: Model tier mapping calisir (haiku/sonnet/opus)

### User Interface

- [ ] **UI-01**: Settings'te provider secim toggle'i bulunur
- [ ] **UI-02**: Aktif provider durumu UI'da gorunur
- [ ] **UI-03**: Provider degistirildiginde yeni konusmalar secili provider'i kullanir

## Future Requirements

### Provider Extension

- **PROV-05**: OpenAI/GPT provider destegi
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
| PROV-01 | Phase 1 | Complete |
| PROV-02 | Phase 1 | Complete |
| PROV-03 | Phase 3 | Complete |
| PROV-04 | Phase 3 | Complete |
| AUTH-01 | Phase 3 | Complete |
| AUTH-02 | Phase 3 | Complete |
| AUTH-03 | Phase 3 | Complete |
| FEAT-01 | Phase 2 | Complete |
| FEAT-02 | Phase 2 | Complete |
| FEAT-03 | Phase 2 | Complete |
| FEAT-04 | Phase 2 | Complete |
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 4 | Pending |
| UI-03 | Phase 4 | Pending |

**Coverage:**
- v16.0 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation*
