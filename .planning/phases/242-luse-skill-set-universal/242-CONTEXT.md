# Phase 242: Luse skill set — UNIVERSAL across all Liv AI agents — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous chain, skip_discuss)

<domain>
## Phase Boundary

Ship Luse usage documentation that any agent inside Liv AI can discover: Aion CLI, Claude Code, OpenCode, Gemini, OpenClaw. NOT a new MCP server (Phase 241 already shipped that). The deliverable is the prose + tool docs that travel with the MCP tool descriptions + per-agent skill-format shim files generated from a single canonical source.

</domain>

<decisions>
## Implementation Decisions

### Locked from prior phases (do NOT re-decide)
- **L-242-A:** Phase 241 already shipped the Luse MCP server (commit `988a6ede` + `f94a0852` chain). MCP is the universal protocol — this phase only adds the documentation layer.
- **L-242-B:** Single canonical source: `docs/luse/` (agent-agnostic markdown). Agent shims are GENERATED from canonical via `scripts/sync-luse-skills.sh`, never hand-authored separately.
- **L-242-C:** D-242-UNIVERSAL — every shim format gets identical PROSE; only wrapper frontmatter + file location differs.
- **L-242-D:** Docs-only phase — NO Mini PC deploy required, NO compiled JS, NO new tests beyond a sync-script smoke test.
- **L-242-E:** Sacred SHA preserved. Mini PC ONLY rule applies (but irrelevant since no deploy).

### Claude's Discretion
- 5 tool docs: `tools/{click,type,screenshot,key,scroll}.md`. Each ≤2 KB, with: inputs, output shape, safety preconditions, 1 minimal example.
- `LUSE.md` overview ≤4 KB: what / when-to-use / prerequisites (Mini PC running X server, Luse MCP active) / capability flags.
- `LUSE-WORKFLOW.md`: one end-to-end annotated example (screenshot → identify → click → verify) ~5 KB.
- Shim formats: `.claude/skills/luse/SKILL.md` (Claude Code format, frontmatter `name`/`description`/`allowed-tools`), plus best-effort shims for `.aion/`, `.opencode/`, `.gemini/`, `.openclaw/` skills directories (Phase 242 investigation determines exact format for each — if format unknown, ship a generic `.md` with a comment header noting it's a placeholder).
- `scripts/sync-luse-skills.sh` walks `docs/luse/`, computes content hash, writes shim files only when source changed. Idempotent. POSIX bash (no jq dependency).
- Tone: terse, factual, command-style — same voice as Phase 239 install-script comments.

</decisions>

<code_context>
## Existing Code Insights

- Phase 241 Luse MCP server registered. To find its tool descriptions: `grep -r "luse" livos/packages/livinityd/source/modules/mcp-registrar/`. The 5 tools' MCP descriptions should reference the canonical docs (`docs/luse/tools/<tool>.md`) via a relative link in the description text.
- `.claude/skills/` pattern exists in this repo — see `.claude/skills/gsd-*` for SKILL.md frontmatter shape.
- Other agents' skill systems:
  - Aion CLI: location unknown — investigation step
  - OpenCode: location unknown — investigation step  
  - Gemini: no known skill system (likely shipped as no-op + tool-discovery via MCP only)
  - OpenClaw: location unknown — investigation step

</code_context>

<specifics>
## Specific Ideas

Plan estimate: 1 plan with ~4 tasks
- Task 1: Write canonical docs (`docs/luse/LUSE.md`, 5 tool files, `LUSE-WORKFLOW.md`)
- Task 2: Write `scripts/sync-luse-skills.sh` + run it to generate initial shims
- Task 3: Update Phase 241 MCP tool descriptions to reference canonical docs (cross-link to `docs/luse/tools/<name>.md`)
- Task 4: SUMMARY.md + cross-ref Phase 241

UAT (deferred to operator, docs-only): "Operator opens any agent inside Liv AI → asks 'screenshot the desktop' → identical hint copy regardless of which agent ran it." This is a manual cross-agent test.

</specifics>

<deferred>
## Deferred Ideas

- Auto-regenerate shims on canonical-doc commit (git hook) — out of scope, manual `bash scripts/sync-luse-skills.sh` is fine.
- Per-agent format-specific frontmatter (e.g., OpenCode-specific allowed-tools list) — out of scope; ship plain MD with comment headers.
- Translation to other languages — out of scope; English-only.

</deferred>

<canonical_refs>
## Canonical References

- `.planning/phases/241-mcp-auto-add-liv-tools/241-04-SUMMARY.md` — MCP registrar architecture
- `livos/packages/livinityd/source/modules/mcp-registrar/` — Luse MCP server source
- `.claude/skills/gsd-*/SKILL.md` — SKILL.md frontmatter precedent
- ROADMAP.md Phase 242 section — the architecture description above

</canonical_refs>
