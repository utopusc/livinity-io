# Phase 8 Research: Documentation

## Overview

Phase 8 creates documentation for open source release. This research covers best practices for each required document.

## Required Documents

### 1. README.md

**Purpose:** First impression, quick start guide, feature overview

**Essential Sections:**
- Project name + one-line description
- Badges (build status, license, version)
- Features list (what it does)
- Quick Start (3-5 steps to running)
- Requirements (Node.js, Docker, etc.)
- Configuration (environment variables)
- Architecture overview (brief)
- Screenshots/demo (optional but helpful)
- Contributing link
- License

**Best Practices:**
- Keep it scannable - users decide in 30 seconds
- Code blocks for all commands
- Link to detailed docs for advanced topics
- Show, don't just tell (screenshots, GIFs)

### 2. CONTRIBUTING.md

**Purpose:** Guide for developers who want to contribute

**Essential Sections:**
- Development setup (clone, install, run)
- Project structure overview
- Code style guidelines
- Testing instructions
- PR process (branch naming, commit messages)
- Issue reporting guidelines
- Code of Conduct reference

**Best Practices:**
- Make first contribution easy
- Document local development clearly
- Explain monorepo structure (pnpm/npm workspaces)

### 3. LICENSE (AGPL-3.0)

**Purpose:** Legal terms for using and distributing

**Why AGPL-3.0:**
- Requires derivative works to be open source
- Network use counts as distribution (important for server software)
- Protects against closed-source forks

**Implementation:**
- Copy standard AGPL-3.0 text
- Add copyright year and holder
- Reference in README and package.json

### 4. SECURITY.md

**Purpose:** How to report vulnerabilities responsibly

**Essential Sections:**
- Supported versions
- How to report (email, not public issue)
- Response timeline expectations
- What to include in report
- Safe harbor statement (won't prosecute good-faith researchers)

**Best Practices:**
- Provide dedicated security email
- Set response time expectations (48-72 hours acknowledgment)
- Thank researchers in advance

### 5. CHANGELOG.md

**Purpose:** Track version history and changes

**Format:** Keep a Changelog (https://keepachangelog.com)

**Sections per version:**
- Added (new features)
- Changed (changes to existing functionality)
- Deprecated (soon-to-be removed features)
- Removed (removed features)
- Fixed (bug fixes)
- Security (security fixes)

**Best Practices:**
- Start with [Unreleased] section
- Link version headers to git tags/comparisons
- Human-readable, not git log dump

## LivOS-Specific Considerations

### README Content

**Features to highlight:**
- AI assistant via WhatsApp/Telegram/Discord/Web
- Docker app management
- File manager with backup
- MCP integration for Claude/Cursor
- Single-command installation

**Quick Start should cover:**
1. System requirements
2. Run install script
3. Access web UI
4. Configure AI (API keys)
5. Start using

### CONTRIBUTING Content

**Development setup:**
- Clone repo
- pnpm install (livos/) / npm install (nexus/)
- Copy .env.example to .env
- Start Redis, PostgreSQL (via Docker Compose)
- Run dev servers

**Project structure:**
```
livinity-io/
├── livos/           # Main LivOS monorepo (pnpm)
│   ├── packages/
│   │   ├── livinityd/    # Backend daemon
│   │   ├── ui/           # React frontend
│   │   └── config/       # Shared config
├── nexus/           # AI agent (npm)
│   ├── packages/
│   │   ├── core/         # Agent daemon
│   │   └── memory/       # Embedding service
└── _archive/        # Deprecated code
```

### SECURITY specifics

**Critical areas:**
- API authentication (LIV_API_KEY)
- Shell command execution (blocklist)
- File system access
- Docker socket access

## Plan Structure Recommendation

**Wave 1 (parallel):**
- 08-01: README.md
- 08-02: CONTRIBUTING.md

**Wave 2 (parallel):**
- 08-03: LICENSE, SECURITY.md, CHANGELOG.md

All plans are autonomous (no user setup required).

## References

- Keep a Changelog: https://keepachangelog.com
- AGPL-3.0 text: https://www.gnu.org/licenses/agpl-3.0.txt
- GitHub community standards: https://docs.github.com/en/communities
