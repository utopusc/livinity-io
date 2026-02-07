# Roadmap: LivOS Open Source Release

## Overview

This roadmap transforms LivOS from a production codebase with hardcoded values and duplicate AI implementations into a clean, secure, open-source project that anyone can install with a single command. The journey moves through foundation work (config system, cleanup), security hardening, AI consolidation, code quality improvements, documentation, and finally the installer script that makes it all accessible.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Config system and repository cleanup ✓
- [x] **Phase 2: Security Foundation** - Remove exposed secrets and prevent future leaks ✓
- [x] **Phase 3: AI Exports** - Export shared managers from Nexus for LivOS consumption ✓
- [ ] **Phase 4: AI Migration** - Update imports and delete duplicate packages
- [x] **Phase 5: Configurability** - Remove hardcoded domains and paths ✓
- [x] **Phase 6: TypeScript Quality** - Reduce any types and fix error handling ✓
- [x] **Phase 7: Security Hardening** - API authentication and secret rotation ✓
- [x] **Phase 8: Documentation** - README, CONTRIBUTING, and community files ✓
- [x] **Phase 9: Installer** - One-command install script with setup wizard ✓
- [ ] **Phase 10: Release** - Final validation and public release preparation

## Phase Details

### Phase 1: Foundation
**Goal**: Establish centralized configuration system and clean up repository cruft
**Depends on**: Nothing (first phase)
**Requirements**: QUAL-03, AICON-08
**Success Criteria** (what must be TRUE):
  1. Centralized config module exists that other code can import
  2. Config module supports paths, domains, and service URLs
  3. All .bak files removed from repository
  4. Repository is clean of temporary/backup artifacts
**Plans**: 2 plans in 1 wave (parallel execution)

Plans:
- [x] 01-01-PLAN.md - Create @livos/config package with Zod schemas for paths, domains, services
- [x] 01-02-PLAN.md - Delete 4 .bak files and add *.bak to .gitignore

### Phase 2: Security Foundation
**Goal**: Remove exposed secrets and establish secure configuration patterns
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. No hardcoded secrets exist in committed .env files
  2. .env.example exists with all required variables documented
  3. .env is in .gitignore preventing future secret commits
  4. Developer can set up environment from .env.example alone
**Plans**: 1 plan

Plans:
- [x] 02-01-PLAN.md - Complete .gitignore coverage and create canonical .env.example template

### Phase 3: AI Exports
**Goal**: Export SubagentManager, ScheduleManager, and AgentEvent from Nexus
**Depends on**: Phase 1
**Requirements**: AICON-03, AICON-04, AICON-05
**Success Criteria** (what must be TRUE):
  1. SubagentManager is exported from Nexus core package
  2. ScheduleManager is exported from Nexus core package
  3. AgentEvent type is exported from Nexus core package
  4. Exports are importable by external packages
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md - Create lib.ts exports and update package.json with exports field

### Phase 4: AI Migration
**Goal**: Migrate LivOS to use Nexus exports and delete duplicate packages
**Depends on**: Phase 3
**Requirements**: AICON-06, AICON-07, AICON-01, AICON-02
**Success Criteria** (what must be TRUE):
  1. LivOS AiModule imports from Nexus exports (not livcoreai)
  2. AI chat functionality works end-to-end after migration
  3. livcoreai package (1,499 LOC) is deleted
  4. liv/core package (2,039 LOC) is deleted
  5. No orphaned imports or broken references remain
**Plans**: TBD

Plans:
- [ ] 04-01: Update LivOS imports to use Nexus
- [ ] 04-02: Delete duplicate AI packages

### Phase 5: Configurability
**Goal**: Remove all hardcoded domains and paths, use config system
**Depends on**: Phase 1
**Requirements**: QUAL-01, QUAL-02
**Success Criteria** (what must be TRUE):
  1. No hardcoded "livinity.cloud" references in codebase
  2. No hardcoded "/opt/livos" or "/opt/nexus" paths in codebase
  3. All domains and paths read from centralized config
  4. Application works with custom domain/path configuration
**Plans**: 4 plans in 2 waves

Plans:
- [x] 05-01-PLAN.md - Extend @livos/config and replace backend domain references
- [x] 05-02-PLAN.md - Replace frontend domains and infrastructure paths
- [x] 05-03-PLAN.md - Replace Nexus hardcoded paths
- [x] 05-04-PLAN.md - Replace skills hardcoded output paths

### Phase 6: TypeScript Quality
**Goal**: Improve type safety and error handling across codebase
**Depends on**: Phase 4 (proceeding independently - typing work is isolated)
**Requirements**: QUAL-04, QUAL-05, QUAL-06, QUAL-07
**Success Criteria** (what must be TRUE):
  1. any type usage reduced in Nexus daemon modules
  2. any type usage reduced in livinityd modules
  3. Catch blocks have proper error logging (not silent swallowing)
  4. Error aggregation hooks exist for monitoring
**Plans**: 3 plans in 2 waves

Plans:
- [x] 06-01-PLAN.md - Error infrastructure: aggregation hooks and fix silent catch
- [x] 06-02-PLAN.md - Nexus type improvements: daemon.ts, api.ts, router.ts
- [x] 06-03-PLAN.md - livinityd type improvements: ai/routes.ts, ai/index.ts, logger.ts

### Phase 7: Security Hardening
**Goal**: Add authentication to internal APIs and rotate production secrets
**Depends on**: Phase 2
**Requirements**: SEC-04, SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. Memory service (port 3300) requires API key authentication
  2. Internal Nexus endpoints require API key authentication
  3. All production secrets have been rotated
  4. New secrets are documented in .env.example
  5. Daemon memory service calls include X-API-Key header
**Plans**: 4 plans in 2 waves

Plans:
- [x] 07-01-PLAN.md - Add API key auth to Memory service (port 3300)
- [x] 07-02-PLAN.md - Add API key auth to Nexus API (port 3200)
- [x] 07-03-PLAN.md - Rotate production secrets (GEMINI_API_KEY, JWT_SECRET, LIV_API_KEY)
- [x] 07-04-PLAN.md - Update daemon.ts memory service calls with X-API-Key header

### Phase 8: Documentation
**Goal**: Create comprehensive documentation for open source release
**Depends on**: Phase 5, Phase 6
**Requirements**: OSS-06, OSS-07, OSS-08, OSS-09, OSS-10, OSS-11, OSS-12, OSS-13
**Success Criteria** (what must be TRUE):
  1. README.md exists with quick start, features, and configuration docs
  2. CONTRIBUTING.md exists with development setup and PR process
  3. LICENSE file exists (AGPL-3.0)
  4. SECURITY.md exists with vulnerability reporting process
  5. CHANGELOG.md exists with version history
**Plans**: 3 plans in 2 waves

Plans:
- [x] 08-01-PLAN.md — Rewrite README.md with comprehensive documentation
- [x] 08-02-PLAN.md — Create CONTRIBUTING.md and CODE_OF_CONDUCT.md
- [x] 08-03-PLAN.md — Create LICENSE, SECURITY.md, and CHANGELOG.md

### Phase 9: Installer
**Goal**: Create one-command install script with interactive setup
**Depends on**: Phase 2, Phase 5, Phase 7, Phase 8
**Requirements**: OSS-01, OSS-02, OSS-03, OSS-04, OSS-05, OSS-14
**Success Criteria** (what must be TRUE):
  1. install.sh detects OS and architecture
  2. install.sh checks and installs dependencies (Docker, Node.js)
  3. install.sh runs interactive configuration wizard
  4. install.sh sets up systemd service
  5. install.sh generates secure secrets automatically
  6. .env.example includes all installer-required variables
  7. Fresh install works end-to-end on Ubuntu 22.04
**Plans**: 3 plans in 3 waves (sequential)

Plans:
- [x] 09-01-PLAN.md — Core installer with OS detection, error handling, and dependencies
- [x] 09-02-PLAN.md — Interactive configuration wizard with whiptail TUI
- [x] 09-03-PLAN.md — systemd services, Redis config, and complete installation flow

### Phase 10: Release
**Goal**: Final validation and preparation for public GitHub release
**Depends on**: All previous phases
**Requirements**: None (validation phase)
**Success Criteria** (what must be TRUE):
  1. All 29 v1 requirements marked complete
  2. Install script tested on fresh Ubuntu 22.04 VPS
  3. AI chat works end-to-end on fresh install
  4. No hardcoded secrets or personal references in codebase
  5. Repository ready for public visibility
**Plans**: TBD

Plans:
- [ ] 10-01: End-to-end validation on fresh VPS
- [ ] 10-02: Final cleanup and release preparation

---

## Milestone: v1.2 — Visual Impact Redesign

**Overview**: v1.1 established semantic tokens but kept identical CSS output. v1.2 changes actual token VALUES to make every component visibly improved.

### v1.2 Phases

- [x] **Phase 1: Token Foundation** - Update semantic token values for surfaces, borders, text, and shadows
- [ ] **Phase 2: Component Visual Fixes** - Apply targeted visual fixes to components that need more than token value changes

### Phase 1: Token Foundation
**Goal**: Change the actual CSS values behind semantic tokens so every component in the UI becomes visibly improved
**Depends on**: Nothing (first phase)
**Requirements**: TF-01, TF-02, TF-03, TF-04, TF-05, TF-06
**Success Criteria** (what must be TRUE):
  1. Surface opacities increased: surface-base 0.06, surface-1 0.10, surface-2 0.16, surface-3 0.22
  2. Border opacities increased: border-subtle 0.10, border-default 0.16, border-emphasis 0.30
  3. Elevation shadows have white inset glow highlights and stronger outer opacity
  4. Text secondary/tertiary more readable: 0.65 and 0.45
  5. Sheet-shadow and dialog shadow insets use proper top-edge highlight technique
**Plans**: 1 plan in 1 wave

Plans:
- [x] 01-01-PLAN.md — Update all token values in tailwind.config.ts (TF-01 to TF-06)

### Phase 2: Component Visual Fixes
**Goal**: Apply targeted visual fixes to components that need more than just token value changes
**Depends on**: Phase 1
**Requirements**: CV-01, CV-02, CV-03, CV-04, CV-05, CV-06, CV-07, CV-08
**Success Criteria** (what must be TRUE):
  1. Dock has 1px border, surface-1 background, 12px padding
  2. Dock items have 60% icon ratio, visible glow, smoother spring
  3. Sheet shows wallpaper color (brightness 0.38), has top border
  4. Dialog uses border-default for visible edges
  5. File list has hover states and larger icons
  6. Menus have visible hover and larger radius
  7. Windows have border-emphasis for clear floating edges
  8. Buttons have 1px highlight and taller desktop heights
**Plans**: 4 plans in 1 wave (parallel execution)

Plans:
- [ ] 02-01-PLAN.md — Dock container + dock items visual fixes (CV-01, CV-02)
- [ ] 02-02-PLAN.md — Sheet + Dialog + Window visual fixes (CV-03, CV-04, CV-07)
- [ ] 02-03-PLAN.md — File Manager + Menu visual fixes (CV-05, CV-06)
- [ ] 02-04-PLAN.md — Button highlight and height adjustments (CV-08)

## Progress

### v1.0 Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete | 2026-02-04 |
| 2. Security Foundation | 1/1 | Complete | 2026-02-04 |
| 3. AI Exports | 1/1 | Complete | 2026-02-03 |
| 4. AI Migration | 0/2 | Not started | - |
| 5. Configurability | 4/4 | Complete | 2026-02-04 |
| 6. TypeScript Quality | 3/3 | Complete | 2026-02-04 |
| 7. Security Hardening | 4/4 | Complete | 2026-02-04 |
| 8. Documentation | 3/3 | Complete | 2026-02-04 |
| 9. Installer | 3/3 | Complete | 2026-02-05 |
| 10. Release | 0/2 | Not started | - |

### v1.2 Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Token Foundation | 1/1 | Complete | 2026-02-07 |
| 2. Component Visual Fixes | 0/4 | Planned | - |

---
*Roadmap created: 2026-02-03*
*Total phases: 10 (v1.0) + 2 (v1.2) | Total plans: 30 (estimated)*
*Coverage: 29/29 v1 requirements mapped*
