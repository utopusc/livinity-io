# Requirements: LivOS Open Source Release

**Defined:** 2026-02-03
**Core Value:** One-command deployment of a personal AI-powered server that just works.

## v1 Requirements

### AI Consolidation

- [ ] **AICON-01**: Delete livcoreai package entirely (livos/packages/livcoreai/)
- [ ] **AICON-02**: Delete liv/core package entirely (livos/packages/liv/)
- [x] **AICON-03**: Export SubagentManager from Nexus core package ✓
- [x] **AICON-04**: Export ScheduleManager from Nexus core package ✓
- [x] **AICON-05**: Export AgentEvent type from Nexus core package ✓
- [ ] **AICON-06**: Update LivOS AiModule imports to use Nexus exports
- [ ] **AICON-07**: Verify AI chat functionality works after migration
- [x] **AICON-08**: Delete all .bak files from repository ✓

### Security

- [x] **SEC-01**: Remove hardcoded secrets from all .env files ✓
- [x] **SEC-02**: Create .env.example template with all required variables documented ✓
- [x] **SEC-03**: Add .env to .gitignore (prevent future commits) ✓
- [ ] **SEC-04**: Rotate all production secrets on server
- [ ] **SEC-05**: Add API key authentication to memory service (port 3300)
- [ ] **SEC-06**: Add API key authentication to internal Nexus endpoints

### Code Quality

- [x] **QUAL-01**: Remove all hardcoded domain references (livinity.cloud -> config) ✓
- [x] **QUAL-02**: Remove all hardcoded path references (/opt/livos, /opt/nexus -> config) ✓
- [x] **QUAL-03**: Create centralized configuration system for paths and domains ✓
- [x] **QUAL-04**: Reduce `any` type usage in livcoreai/daemon.ts (now Nexus) ✓
- [x] **QUAL-05**: Reduce `any` type usage in livinityd modules ✓
- [x] **QUAL-06**: Fix silent error swallowing - add proper logging to catch blocks ✓
- [x] **QUAL-07**: Add error aggregation/monitoring hooks ✓

### Open Source Preparation

- [ ] **OSS-01**: Create install.sh script with OS detection
- [ ] **OSS-02**: Create install.sh script with dependency checking (Docker, Node.js)
- [ ] **OSS-03**: Create install.sh script with interactive config wizard
- [ ] **OSS-04**: Create install.sh script with systemd service setup
- [ ] **OSS-05**: Create install.sh script with secret generation
- [ ] **OSS-06**: Write comprehensive README.md with quick start guide
- [ ] **OSS-07**: Write README.md with feature list and screenshots
- [ ] **OSS-08**: Write README.md with configuration documentation
- [ ] **OSS-09**: Create CONTRIBUTING.md with development setup
- [ ] **OSS-10**: Create CONTRIBUTING.md with PR process
- [ ] **OSS-11**: Add LICENSE file (AGPL-3.0)
- [ ] **OSS-12**: Create SECURITY.md with vulnerability reporting process
- [ ] **OSS-13**: Create CHANGELOG.md with version history
- [ ] **OSS-14**: Create .env.example with all variables documented

## v2 Requirements

*Deferred to future milestone:*

### Security (Advanced)
- **SEC-V2-01**: Replace shell command blocklist with allowlist
- **SEC-V2-02**: Implement container sandboxing for command execution
- **SEC-V2-03**: Add rate limiting to AI/LLM API endpoints
- **SEC-V2-04**: Implement Token Bucket algorithm for rate limiting
- **SEC-V2-05**: Integrate secrets manager (Vault/Doppler)

### Architecture
- **ARCH-V2-01**: Convert daemon polling to event-driven (Redis pub/sub)
- **ARCH-V2-02**: Add test coverage for AgentLoop
- **ARCH-V2-03**: Add test coverage for Brain
- **ARCH-V2-04**: Add test coverage for tool execution
- **ARCH-V2-05**: Implement proper CI/CD pipeline with GitHub Actions

### Features
- **FEAT-V2-01**: Update script (livos update command)
- **FEAT-V2-02**: Uninstall script
- **FEAT-V2-03**: Backup/restore configuration
- **FEAT-V2-04**: Health check endpoint

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app | Web-first approach, mobile later |
| Multi-tenancy | Single-user home server focus |
| Cloud hosting | Self-hosted only |
| Payment/billing | Free open source |
| Shell allowlist refactor | Requires extensive testing, v2 |
| Rate limiting | Nice-to-have, not blocking release |
| Full test coverage | Incremental approach in v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AICON-01 | Phase 4 | Pending |
| AICON-02 | Phase 4 | Pending |
| AICON-03 | Phase 3 | Complete |
| AICON-04 | Phase 3 | Complete |
| AICON-05 | Phase 3 | Complete |
| AICON-06 | Phase 4 | Pending |
| AICON-07 | Phase 4 | Pending |
| AICON-08 | Phase 1 | Complete |
| SEC-01 | Phase 2 | Complete |
| SEC-02 | Phase 2 | Complete |
| SEC-03 | Phase 2 | Complete |
| SEC-04 | Phase 7 | Pending |
| SEC-05 | Phase 7 | Pending |
| SEC-06 | Phase 7 | Pending |
| QUAL-01 | Phase 5 | Complete |
| QUAL-02 | Phase 5 | Complete |
| QUAL-03 | Phase 1 | Complete |
| QUAL-04 | Phase 6 | Complete |
| QUAL-05 | Phase 6 | Complete |
| QUAL-06 | Phase 6 | Complete |
| QUAL-07 | Phase 6 | Complete |
| OSS-01 | Phase 9 | Pending |
| OSS-02 | Phase 9 | Pending |
| OSS-03 | Phase 9 | Pending |
| OSS-04 | Phase 9 | Pending |
| OSS-05 | Phase 9 | Pending |
| OSS-06 | Phase 8 | Pending |
| OSS-07 | Phase 8 | Pending |
| OSS-08 | Phase 8 | Pending |
| OSS-09 | Phase 8 | Pending |
| OSS-10 | Phase 8 | Pending |
| OSS-11 | Phase 8 | Pending |
| OSS-12 | Phase 8 | Pending |
| OSS-13 | Phase 8 | Pending |
| OSS-14 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 29 total
- Complete: 14 (QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06, QUAL-07, AICON-08, SEC-01, SEC-02, SEC-03, AICON-03, AICON-04, AICON-05)
- Pending: 15
- Unmapped: 0

---
*Requirements defined: 2026-02-03*
*Last updated: 2026-02-04 after Phase 6 completion*
