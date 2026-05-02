# Phase 47: AI Diagnostics — Context

**Gathered:** 2026-05-01
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss=true)

<domain>
## Phase Boundary

Restore Nexus's missing built-in tools (shell, docker_*, files, web_search), surface model-identity verdict + apply correct remediation (deployment OR source path), and give every authenticated user a self-service marketplace-app reachability probe — all under one shared `diagnostics-section.tsx` scaffold.

**Requirements:** FR-TOOL-01, FR-TOOL-02, FR-MODEL-01, FR-MODEL-02, FR-PROBE-01, FR-PROBE-02

**Success Criteria (9):**
1. Settings > Diagnostics renders 3 cards (Capability Registry / Model Identity / App Health) under one shared scaffold — D-DIAGNOSTICS-CARD ~25% LOC saving.
2. Capability Registry card: Redis manifest count + built-in count + syncedAt + 3-way categorization (`missing_lost` / `missing_precondition` / `disabled_by_user`).
3. Re-sync registry: atomic-swap via `capability:_pending:*` temp prefix → swap-pointer flush → drop old prefix. User overrides re-applied AFTER resync. Integration test on isolated Redis DB index 15.
4. Model Identity 6-step diagnostic returns verdict (`dist-drift` / `source-confabulation` / `both` / `neither`).
5. Verdict-driven branched remediation: A (update.sh patch) / B (sacred-file surgical edit per D-40-01) / C (both).
6. Post-fix re-diagnostic returns `clean`.
7. `apps.healthProbe(appId)` returns `{reachable, statusCode, ms, lastError, probedAt}` within 5s undici timeout.
8. `apps.healthProbe` is `privateProcedure` (NOT admin) — scoped to `user_app_instances WHERE user_id = ctx.currentUser.id AND app_id = $1`. Mirrors v29.3 Phase 44 `usage.getMine` pattern. Anti-port-scanner.
9. If Branch B taken: integrity test re-pinned a SECOND time, audit comment quotes the systemPrompt construction diff; no incidental drift.

**Depends on:** Phase 45 ✅ (FR-CF-02 sacred SHA re-pinned to `4f868d31...`; Phase 47 Branch B may add ONE surgical edit on top per D-40-01 ritual).

</domain>

<decisions>
## Implementation Decisions

**Locked decisions:**
- D-NO-NEW-DEPS: 0 new npm/apt deps. `undici` already in stack for the probe.
- D-DIAGNOSTICS-CARD: A1 + A2 + A4 share single `diagnostics-section.tsx` scaffold (~25% LOC saving per architecture research).
- D-D-40-01-RITUAL: any sacred-file edit (Branch B) follows Phase 40 ritual (pre-edit SHA verify → behavior-preserving change → post-edit SHA verify → integrity test re-pinned with audit comment).
- D-NO-SERVER4: Mini PC only.
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts`: current SHA `4f868d31...` (Phase 45 baseline). Branch B may re-pin to a NEW SHA.

**FR-TOOL-01/02 (registry):**
- New tRPC route `capabilities.diagnoseRegistry` (admin) returns `{redisManifestCount, builtInToolCount, syncedAt, categorizedList: { expectedAndPresent, missing: { lost, precondition, disabledByUser }, unexpectedExtras }}`.
- New tRPC route `capabilities.flushAndResync` (admin) — atomic-swap via temp prefix `capability:_pending:*`. NO Redis MULTI required because Phase 22 capability registry already uses key prefixing; the swap is a Redis `RENAME` or pattern-replace at the end.
- User overrides preserved by querying `user_capability_overrides` table BEFORE flush, re-applying AFTER resync.
- Distinction between `missing_lost` (Redis lost it — resync helps) vs `missing_precondition` (e.g. `web_search` needs API key — resync won't help) is critical to avoid false-positive diagnostic noise.

**FR-MODEL-01/02 (model identity):**
- 6-step diagnostic runs ON Mini PC via SSH from livinityd (read-only commands; D-NO-SERVER4):
  1. curl broker `/v1/messages` with `messages: [{role: user, content: "What model are you?"}]`
  2. inspect `response.model` field
  3. snapshot `/proc/<claude-pid>/environ` of any active claude CLI subprocess
  4. `ls -la /opt/livos/node_modules/.pnpm/@nexus+core*/` to detect pnpm-store dist drift
  5. `readlink -f` resolved nexus/core dist path
  6. `grep` deployed dist for system-prompt identity-line marker
- Verdict computed from collected outputs; 4 buckets surfaced.
- **Branch A (dist drift):** patch `update.sh` line that does `find ... -name '@nexus+core*' | head -1` → `tail -1`. ~30 LOC. NO sacred-file edit.
- **Branch B (source confabulation):** surgical edit at sacred file's system-prompt construction site:
  - FROM: `systemPrompt: "<raw text>"`
  - TO: `systemPrompt: { type: 'preset', preset: 'claude_code', append: "<raw text>" }` per Anthropic Agent SDK preset feature.
  - Phase 40 D-40-01 ritual MANDATORY. New BASELINE_SHA re-pinned in integrity test with audit comment quoting the diff.
- **Branch C (both):** both fixes ship as separate atomic commits.

**FR-PROBE-01/02 (app health):**
- New tRPC route `apps.healthProbe(appId)` — `privateProcedure` (NOT admin per success criterion 8).
- Probe target derives from app's docker-compose published port + per-user subdomain (e.g. `bolt.{username}.livinity.io`).
- `undici.fetch` with 5s timeout. Returns shape `{reachable, statusCode, ms, lastError, probedAt}`.
- PG scoping via `user_app_instances WHERE user_id = ctx.currentUser.id AND app_id = $1` (mirror of Phase 44 `usage.getMine`).
- UI: green check / yellow warning / red error inline status card on app detail page.
- A3 (Bolt.diy proxy reachability) folds into A4 health probe — the probe surfaces the proxy error in 2s vs 20min SSH diagnosis.

**UI scaffolding (D-DIAGNOSTICS-CARD):**
- New `livos/packages/ui/src/routes/settings/diagnostics/diagnostics-section.tsx` — single section component hosting 3 cards.
- New `livos/packages/ui/src/routes/settings/diagnostics/registry-card.tsx`, `model-identity-card.tsx`, `app-health-card.tsx`.
- Settings sidebar entry "Diagnostics" added per D-DIAGNOSTICS-CARD pattern.

**httpOnlyPaths additions:** `'capabilities.flushAndResync'` (mutation) + `'apps.healthProbe'` (mutation if probe is mutable; query if cached). Mirror Phase 45/46 namespacing pattern.

</decisions>

<code_context>
## Existing Code Insights

- v22.0 `nexus/packages/core/src/capability-registry/` has the existing sync-from-4-sources flow. FR-TOOL-02 reuses `syncFromAllSources()` after flush.
- v29.3 Phase 41 broker module pattern (5-file shape) for the on-Mini-PC diagnostic module.
- v29.3 Phase 44 `usage.getMine` privateProcedure pattern for FR-PROBE-01.
- v29.3 Phase 40 sacred-file ritual (D-40-01) — Plan 47-XX Branch B follows EXACTLY.
- Phase 45 sacred-file integrity test re-pinning audit comment format.
- Phase 46 Settings UI pattern for the new Diagnostics section sidebar entry.

</code_context>

<specifics>
## Specific Ideas

- Plan 47-01: Pre-flight diagnostic on Mini PC capturing baseline `response.model` + pnpm-store dir state + dist marker grep + claude CLI environ snapshot. Sets ground truth for Branch decision.
- Plan 47-02: FR-TOOL backend (capabilities.diagnoseRegistry + flushAndResync) + atomic-swap impl + integration test on isolated Redis DB.
- Plan 47-03: FR-MODEL backend (model-identity diagnostic module) + Branch A `update.sh` patch OR Branch B sacred-file surgical edit (decision derived from 47-01 verdict; if neither: skip remediation, ship diagnostic surface only and document `verdict: neither` outcome).
- Plan 47-04: FR-PROBE backend (apps.healthProbe privateProcedure + scoping query).
- Plan 47-05: UI shared diagnostics-section.tsx scaffold + 3 cards + Settings sidebar entry + httpOnlyPaths additions + test:phase47 npm script + 47-UAT.md.
- Test infrastructure: bare tsx + node:assert/strict for backend unit/integration tests. `apps.healthProbe` integration test mocks undici.

</specifics>

<deferred>
## Deferred Ideas

- Probe history persistence (FR-DIAG-future-01) — single-snapshot probe sufficient for v29.4.
- Sync history audit log (FR-AUDIT-future-01) — Redis sync timestamp + audit-log table reuse already covers minimum.
- AI keyword detection in phase goal triggers AI integration phase workflow — manually skipped (workflow.ai_integration_phase=true config but Phase 47 is diagnostic plumbing, not AI system development per se).

</deferred>
