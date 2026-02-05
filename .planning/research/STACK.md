# Open Source Project Structure Research

**Analysis Date:** 2026-02-03

## Reference Projects Analyzed

| Project | Stars | Pattern |
|---------|-------|---------|
| Umbrel | 7k+ | Docker Compose + Shell scripts |
| CasaOS | 25k+ | Go backend + Vue frontend |
| Yunohost | 2k+ | Python + Bash |
| Coolify | 35k+ | Laravel + Docker |

## Standard Open Source Repository Structure

```
project/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/           # CI/CD
│   └── FUNDING.yml
├── docs/                    # Documentation site
├── scripts/
│   ├── install.sh          # One-command installer
│   ├── update.sh           # Update script
│   └── uninstall.sh        # Clean removal
├── packages/               # Monorepo packages
├── .env.example            # Template with all variables
├── docker-compose.yml      # Optional: Docker deployment
├── LICENSE                 # MIT, Apache 2.0, or AGPL
├── README.md               # Main documentation
├── CONTRIBUTING.md         # How to contribute
├── CHANGELOG.md            # Version history
├── SECURITY.md             # Security policy
└── CODE_OF_CONDUCT.md      # Community guidelines
```

## Configuration Patterns

### 1. Environment Variables (.env)
```bash
# .env.example - Template file committed to repo
DOMAIN=localhost
HTTP_PORT=80
HTTPS_PORT=443
JWT_SECRET=  # Generated at install time
```

### 2. Config File (config.yaml/json)
```yaml
# config.yaml - User-editable settings
server:
  domain: ${DOMAIN:-localhost}
  ports:
    http: ${HTTP_PORT:-80}
    https: ${HTTPS_PORT:-443}
```

### 3. First-Run Wizard
- Detect if config exists
- Interactive prompts for required values
- Generate secrets automatically
- Validate before saving

## Documentation Requirements

### README.md (Essential)
1. Project description + screenshot
2. Features list
3. Quick start (one-liner install)
4. Requirements
5. Configuration
6. FAQ
7. Contributing link
8. License

### CONTRIBUTING.md
1. Development setup
2. Code style guide
3. PR process
4. Issue templates

### CHANGELOG.md
- Follow Keep a Changelog format
- Semantic versioning (MAJOR.MINOR.PATCH)

## Versioning & Release

### Semantic Versioning
- **MAJOR**: Breaking changes
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes

### Release Process (GitHub Actions)
```yaml
on:
  push:
    tags:
      - 'v*'
jobs:
  release:
    - Build artifacts
    - Generate changelog
    - Create GitHub release
    - Update install script CDN
```

## Key Patterns to Adopt

1. **Single install command**: `curl -fsSL https://get.livos.io | bash`
2. **No hardcoded values**: Everything configurable via env/config
3. **Self-contained**: Minimal external dependencies
4. **Graceful updates**: Backup before update, rollback on failure
5. **Clear documentation**: README should get user to working state in 5 min
6. **Community files**: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT
7. **CI/CD from day 1**: Automated testing and releases

## LivOS-Specific Recommendations

### Immediate Actions
- [ ] Create `.env.example` with all variables documented
- [ ] Add `scripts/install.sh` (use FEATURES.md template)
- [ ] Write comprehensive README.md
- [ ] Choose license (recommend AGPL for SaaS protection)
- [ ] Remove hardcoded `livinity.cloud` references
- [ ] Make all paths configurable (`/opt/livos` → `$INSTALL_DIR`)

### File Naming Convention
- Use lowercase with hyphens: `install-livos.sh`
- Config files: `livos.yaml` or `config.yaml`
- Environment: `.env` (local), `.env.example` (template)

---

*Research completed: 2026-02-03*
