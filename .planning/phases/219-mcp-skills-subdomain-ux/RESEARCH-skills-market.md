# Skills Marketplace Research — Phase 219 T7

## Executive Summary
Investigated 7 AI-skills/agent-templates marketplaces to inform LivOS in-product Skills tab design. **Top match: OpenClaw ClawHub** (text-based SKILL.md registry with vector search + moderation). **Secondary match: majiayu000 Claude Skills Registry** (compact JSON search index + category taxonomy). **Visual reference: aitmpl.com** (stack builder UX + category tiles). Constraint: telemetry-free, shadcn/ui compatible, in-product only (not public marketplace v42).

---

## Market Leaders Ranked by Fit

### 1. OpenClaw ClawHub (BEST FIT — Market-proven)
**Why**: Canonical SKILL.md format (markdown + YAML frontmatter), 13,729+ community skills, moderation hooks, fast browsing + CLI API.

**Install primitive**: Raw file fetch + write to agent skills dir (matches our design)

**Registry shape**: No explicit registry.json; instead uses:
- `SKILL.md` (required: `name`, `description`; optional: `homepage`, `hidden`, `metadata`)
- Vector search via OpenAI embeddings (not keyword lookup)
- Moderation metadata (approval status, security analysis)
- Per-skill versioning + tags

**Card metadata**: name, description (auto-truncate), category, tags (max 5), star count, install path

**Category structure**: Inferred from skill names; ClawHub doesn't expose hierarchical categories in search — uses vector similarity instead

**Visual**: Compact skill cards, search-driven discovery (not browsable category sidebar)

**Pitfall**: Security audit found 7.5% malicious skills (1,103/14,706) — we'll need moderation gate in our own registry

---

### 2. majiayu000 Claude Skills Registry (STRONG SECONDARY)
**Why**: Lightweight JSON search index optimized for fast registry refresh, explicit category taxonomy, 955+ models / 39+ providers indexed.

**Install primitive**: Fetch raw skill markdown from source URL + install to skills dir

**Registry shape** (compact format):
```json
{
  "v": "ISO-date",
  "t": 955,
  "s": [
    {
      "n": "skill-name",
      "d": "description (max 80 chars)",
      "c": "dev",
      "g": ["tag1", "tag2"],
      "r": 42,
      "i": "github-install-path"
    }
  ]
}
```

**Category taxonomy** (`taxonomy/categories.yaml`):
- `dev`, `dat`, `des`, `tst`, `ops`, `doc`, `sec`
- Governance status per category
- Heuristic keywords for auto-categorization

**Card metadata**: name, short description, category code, tags, stars, author, license, distribution status (`compatible`/`restricted`)

**Visual**: Search index optimized for programmatic consumption (not browser-first UI reference)

---

### 3. aitmpl.com (VISUAL REFERENCE)
**Why**: Stack builder UX + category tile browsing (best visual pattern for operator discovery)

**Install primitive**: Click "+" button → add to stack → one-click multi-component deploy

**Card metadata**: logo, product name, tagline, category, category-icon, description

**Visual structure**:
- Horizontal category tabs: Skills | Agents | Commands | Settings | Hooks | MCPs | Plugins
- Grid of featured component cards (logo + name + description + "+")
- Stack builder sidebar showing `N components selected`
- Search + filter chips

**Limitation**: Not SKILL.md-based; this is proprietary aitmpl format (less portable)

---

## Decision Matrix: Feature Suitability

| Feature | OpenClaw | majiayu | aitmpl | shadcn | smithery | mcp.so |
|---------|----------|---------|--------|--------|----------|--------|
| YAML-frontmatter markdown | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| Public category taxonomy | ~ | ✓ | ✓ | ~ | ~ | ✓ |
| Vector search support | ✓ | ✗ | ~ | ✗ | ~ | ✗ |
| Telemetry-free | ✓ | ✓ | ✗ | ✓ | ~ | ✗ |
| Card-based visual UX | ✓ | ✗ | ✓ | ~ | ✓ | ✓ |
| Install via file fetch | ✓ | ✓ | ✗ | ✓ | ~ | ~ |
| Moderation system | ✓ | ✗ | ~ | ✗ | ~ | ~ |
| Verifiable source (GitHub) | ✓ | ✓ | ✓ | ✓ | ✓ | ~ |

---

## Recommended LivOS Skills Registry Schema

### `utopusc/livinity-skills` registry.json
```json
{
  "name": "Livinity Skills Registry",
  "version": "1.0.0",
  "lastUpdated": "ISO-8601",
  "categories": [
    { "code": "code-review", "label": "Code Review" },
    { "code": "frontend", "label": "Frontend Design" },
    { "code": "devops", "label": "DevOps" },
    { "code": "prompt", "label": "Prompt Engineering" },
    { "code": "brainstorm", "label": "Brainstorming" },
    { "code": "research", "label": "Web Research" },
    { "code": "debug", "label": "Debugging" }
  ],
  "skills": [
    {
      "id": "code-review-main",
      "name": "Code Review",
      "description": "Structural + security + quality review",
      "category": "code-review",
      "tags": ["static-analysis", "security"],
      "version": "1.0.0",
      "author": "Livinity Team",
      "source": "https://raw.githubusercontent.com/utopusc/livinity-skills/main/skills/code-review/SKILL.md",
      "icon": "eye",
      "featured": true
    }
  ]
}
```

### Per-Skill SKILL.md Format
```yaml
---
name: code-review
description: Structural + security + quality review for TypeScript/React code
version: 1.0.0
category: code-review
tags: ["static-analysis", "security", "typescript"]
author: Livinity Team
tools: ["gsd-code-review", "gsd-eval-review"]
---

# Code Review Skill

Performs detailed structural, security, and quality analysis...

## Rules
...
```

---

## UI Component Architecture (shadcn/ui compatible)

**Skills Tab layout**:
1. **Filter row**: Category chips (vertical scroll if >5) + search input
2. **Skill cards grid** (3-col desktop, 1-col mobile):
   - Icon (category emoji or Lucide icon)
   - Name + brief description (max 80 chars)
   - Tags (max 3, overflow "...")
   - "Install" button (filled on hover)
3. **Installed skills list** (collapsible, shows local SKILL.md files)
4. **Install modal** (confirm, show frontmatter, write path)

**Color strategy**: Use LivOS design tokens; avoid monochrome (per v36 feedback). Colorful category icons (🛠️ DevOps, 🎨 Design, 🔍 Research, etc.).

---

## Initial Skill Seeds (10 categories)

| Name | Category | 1-line Description |
|------|----------|-------------------|
| Code Review | code-review | Structural + security + quality analysis for TypeScript/React |
| Component Design | frontend | shadcn/ui + Tailwind component composition patterns |
| Docker Ops | devops | Container debugging, image optimization, compose templating |
| Prompt Tuning | prompt | Few-shot example crafting, token optimization, caching strategies |
| Brainstorm Facilitator | brainstorm | Open-ended ideation, assumption mining, divergent thinking |
| Web Research | research | Multi-source synthesis, fact-checking, citation trails |
| Debugger | debug | Runtime tracing, breakpoint strategies, memory profiling |
| Database Design | devops | Schema normalization, index tuning, migration safety |
| API Design | devops | REST vs tRPC, error response patterns, rate limiting |
| Test Strategy | code-review | Unit vs integration balance, coverage targets, flaky-test remediation |

---

## Implementation Notes

- **No public v42 surface**: This registry is in-product only (Settings > Skills tab). Publish public store separately if needed.
- **Moderation model**: Simple: verified checkmark on Livinity-authored skills; community skills default `unverified` tag. Hide malicious after manual review.
- **Search backend**: Start simple (client-side JSON grep), graduate to vector search (OpenAI embeddings) in future phase if community grows >100 skills.
- **Install UX**: Fetch SKILL.md from source → write to `~/.liv/skills/` → auto-reload agent config → show installed count in tab label.

---

**Sources**:
- [aitmpl.com](https://www.aitmpl.com/)
- [OpenClaw ClawHub](https://github.com/openclaw/clawhub)
- [majiayu000 Claude Skill Registry](https://github.com/majiayu000/claude-skill-registry)
- [MCP.so Registry](https://mcp.so/)
- [shadcn/ui Registry Docs](https://ui.shadcn.com/docs/registry/registry-json)
- [Smithery.ai](https://smithery.ai/)
