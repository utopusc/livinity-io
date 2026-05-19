# Phase 165: Polish, Settings UI, v34.x Ship

**Gathered:** 2026-05-19
**Status:** Ready for planning (autonomous, depends on Phase 164 SHIPPED)
**Source:** v34-LIVOS-CC-INTEGRATION-MASTER.md, success criteria

<domain>
## Phase Boundary

Phase 162-164 fonksiyonel altyapıyı kurdu. Phase 165 user-visible polish:
- Idle CC session reaper (Map'te biriken bağlanmamış subprocess'leri 30dk sonra abort)
- Settings UI panel: model picker (Main Chat için), autonomous agents list + budget editor
- Memory linter (broken [[wikilinks]] cleanup utility)
- v34.x milestone consolidated VERIFICATION + Mini PC final deploy

**Phase 165 sonu = v34.x milestone CODE-COMPLETE.** Operator UAT browser walk son adım (autonomous değil, user wake'te yapar).

</domain>

<decisions>
## Implementation Decisions

### Plan 165-01: Idle Session Reaper

**File:** `livos/packages/livinityd/source/modules/claude-runner/idle-reaper.ts`

**Logic:**
- Check every 5 min: for each active session, if `lastMessageTime + 30min < now`: abort
- Use existing `session.abortController.abort()` pattern from Phase 161
- Log reap event: `[claude-runner/reaper] aborted idle session sessionKey=X conversationId=Y idle_for_min=Z`
- Redis flag override: `liv:config:idle_reap_min` (default 30)

**Test:**
- Mock now() forward by 31 min
- Verify abort fires
- Verify session removed from Map

### Plan 165-02: Settings UI — Model Picker + Autonomous Panel

**Files (UI, Phase 159+ pattern):**
- `livos/packages/ui/src/modules/settings/ChatBackendPanel.tsx` (NEW)
  - Reads `liv:config:chat_backend` (vault | legacy) — toggle
  - Reads `liv:config:default_chat_model` — dropdown (Opus 4.7 / Sonnet 4.6 / Haiku 4.5)
  - "Apply" button → tRPC mutation → Redis update; livinityd reads at next session start (no restart needed)
- `livos/packages/ui/src/modules/settings/AutonomousAgentsPanel.tsx` (NEW)
  - Reads `vault/livos-agents/*.md` via new tRPC endpoint `autonomous.list`
  - Shows: name, schedule, enabled status, last run, total cost-to-date
  - Toggle enabled (writes back to vault file via tRPC `autonomous.toggle`)
  - Budget cap editor (Mini PC daily cap)
  - "Run now" button (manual trigger)
- Wire up in main Settings route (existing module)

**tRPC routes:** `livos/packages/livinityd/source/modules/server/trpc/autonomous-router.ts` (NEW)
- `autonomous.list` — return array of parsed agent definitions + last run stats
- `autonomous.toggle({name, enabled})` — update vault file frontmatter
- `autonomous.runNow({name})` — manual trigger (bypass schedule)
- `autonomous.getDailySpend` — return today's spend across all agents
- All under `adminProcedure` (RBAC enforced)

### Plan 165-03: Memory Linter Slash Command

**Skill location:** `vault-templates/livos-status/SKILL.md` already present from Phase 162. Add new: `vault-templates/livos-vault-doctor/SKILL.md`:

```markdown
---
name: livos-vault-doctor
description: Audit vault for broken [[wikilinks]] and orphaned memory files
---

# Vault Doctor

Use Read + Glob to scan all .md files in vault/. For each file:

1. Extract all [[wikilink]] references
2. Verify target file exists at vault/memory/<topic>.md or similar matching path
3. Report broken links + suggested fixes (rename, create stub, or remove link)
4. Also identify "orphaned" files in vault/memory/ that nothing links to

Output a single Markdown report. Do NOT fix automatically — just report.
```

User runs `/livos-vault-doctor` in Main Chat → CC executes skill via vault settings → reports.

### Plan 165-04: v34.x Consolidated VERIFICATION + Mini PC Final Deploy

**Doc:** `.planning/phases/165-cc-integration-polish/v34-VERIFICATION.md`

**Sections:**
1. **Phase 162 outcomes verified live:** vault exists, AgentSessionManager vault mode default, sacred SHA preserved across all v34 commits
2. **Phase 163 outcomes verified live:** surface vault dirs created on app install, Phase 161 contract intact (Haiku still fires for native:/webapp:)
3. **Phase 164 outcomes verified live:** at least 1 autonomous agent fires successfully (sample manually triggered), inbox entry present
4. **Phase 165 outcomes verified live:** idle reaper ran ≥1 time (check journal), Settings UI loads, vault-doctor command runs
5. **v34.x Success Criteria** (from master plan) — checklist with PASS/PENDING per item
6. **Operator UAT (autonomous: false)** — instructions for user's wake-up walk:
   - Open `bruce.livinity.io`, send "test" in Main Chat → expect Opus 4.7 response with CLAUDE.md context (e.g., agent knows bruce's role)
   - Open Settings → ChatBackend panel → verify can flip vault ⇄ legacy
   - Open Settings → Autonomous panel → see sample agents listed
   - Trigger nightly-backup-audit manually → verify inbox entry appears within 60s
   - Open Obsidian app on user's laptop, open `~/livinity-vault/` (via Obsidian Sync or manual copy) → see memory/ structure
   - Open `bruce.livinity.io` → install n8n WebApp → verify `vault/surfaces/webapp/n8n/CLAUDE.md` created → open n8n Chat → verify still Haiku-routed

**Deploy:** Standard Mini PC `update.sh` after each Plan 165 ship; final consolidated push at v34 close.

</decisions>

<canonical_refs>
- Master + Phase 162/163/164 contexts
- All existing UI Settings panels: `livos/packages/ui/src/modules/settings/` (pattern to follow)
- tRPC router conventions: `livos/packages/livinityd/source/modules/server/trpc/`
</canonical_refs>

<deferred>
- Multi-user vault scoping (v37+ if/when multi-tenant ships)
- BYOK API key support (rejected by user, locked decision)
- LIVOS.md global memory layer (master plan called "extra", v37+)
- Dock notification badges for new inbox entries (separate UX phase)
</deferred>

---

*Phase: 165-cc-integration-polish*
*Depends on: Phase 164 SHIPPED*
*Approach: autonomous*
*Estimated: ~4-6 saat*
*Closes: v34.x milestone CODE-COMPLETE*
