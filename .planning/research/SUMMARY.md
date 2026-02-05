# Research Summary

**Project:** LivOS - Self-Hosted AI-Powered Home Server OS
**Date:** 2026-02-03

## Executive Summary

This research covered four dimensions to prepare LivOS for open source release:

1. **Open Source Structure** - How successful projects organize repos
2. **CLI Installer Patterns** - One-command installation best practices
3. **Security Hardening** - Protecting secrets, sandboxing commands
4. **Refactoring Pitfalls** - Safe consolidation of duplicate code

---

## Key Findings

### Stack & Structure (STACK.md)
| Pattern | Recommendation |
|---------|----------------|
| Repository | Monorepo with clear package boundaries |
| Documentation | README, CONTRIBUTING, CHANGELOG, SECURITY, LICENSE |
| Configuration | `.env.example` template + config wizard |
| Versioning | Semantic versioning with automated releases |
| License | AGPL-3.0 (prevents SaaS exploitation) |

### CLI Installer (FEATURES.md)
| Pattern | Recommendation |
|---------|----------------|
| Install Command | `curl -fsSL https://get.livos.io \| bash` |
| Security | HTTPS only, `set -euo pipefail`, no `-k` flag |
| OS Detection | Parse `/etc/os-release`, detect architecture |
| Dependencies | Check Docker, Node.js versions before install |
| Service Manager | systemd preferred over PM2 |
| Secrets | Generate at install time with `openssl rand` |

### Security (ARCHITECTURE.md)
| Area | Current State | Target State |
|------|---------------|--------------|
| Secrets | Hardcoded in .env | Environment injection + Vault |
| Shell Commands | Blocklist (bypassable) | **Allowlist + execFile** |
| Internal APIs | No auth | API key + localhost binding |
| Rate Limiting | None | Token Bucket algorithm |
| Headers | Basic | Helmet.js full config |

### Refactoring (PITFALLS.md)
| Risk | Mitigation |
|------|------------|
| Orphaned imports | Update `@livos/livcoreai` refs before deletion |
| Lock file corruption | Regenerate pnpm-lock.yaml after changes |
| Breaking changes | Facade pattern for backwards compatibility |
| Test coverage gaps | Characterization tests before refactor |
| Polling → Events | Redis Pub/Sub + BullMQ QueueEvents |

---

## Critical Actions (Prioritized)

### Phase 1: Security (Immediate)
1. Rotate all production secrets
2. Add `.env` to `.gitignore`
3. Create `.env.example` template
4. Replace shell blocklist with allowlist

### Phase 2: Code Consolidation
1. Export SubagentManager/ScheduleManager from Nexus
2. Update LivOS imports
3. Delete livcoreai and liv/core packages
4. Delete all .bak files

### Phase 3: Code Quality
1. Add proper TypeScript types (reduce `any`)
2. Fix silent error swallowing
3. Remove hardcoded values (domain, paths)
4. Add configuration system

### Phase 4: Architecture
1. Convert polling to event-driven (Redis pub/sub)
2. Add test coverage for core AI logic
3. Implement rate limiting

### Phase 5: Open Source Prep
1. Write README.md with quick start
2. Create install.sh script
3. Add CONTRIBUTING.md, LICENSE, SECURITY.md
4. Set up GitHub Actions for CI/CD

---

## Metrics

| Metric | Before | After (Target) |
|--------|--------|----------------|
| Code Duplication | 80% (3 daemons) | 0% (1 daemon) |
| Lines to Delete | 0 | ~3,500+ |
| Hardcoded Values | Many | 0 |
| Test Coverage | Unknown/Low | >60% core logic |
| Install Time | Manual setup | <5 minutes |

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single AI Daemon | Nexus | Most complete, multi-channel |
| Service Manager | systemd | Standard, secure, reliable |
| Secrets | Env vars (v1), Vault (v2) | Progressive security |
| Event System | Redis Pub/Sub | Already using Redis |
| License | AGPL-3.0 | Protects open source |

---

*Research completed: 2026-02-03*
*Total research: 4 documents, 3,200+ lines*
