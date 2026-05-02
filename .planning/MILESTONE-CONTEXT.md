# MILESTONE-CONTEXT — v29.5 Hot-Patch Recovery (v29.4 Live Regression Sweep)

**Captured:** 2026-05-02
**Trigger:** User reported 4 critical regressions immediately after v29.4 deploy (`7c811e5` deployed `success` 1m 2s on Mini PC). Audit said `passed` but UAT was deferred — live behavior reveals breakage.

This file is consumed by `/gsd-new-milestone v29.5` per its workflow. Step 2 detects it and presents the summary for confirmation.

## Proposed Milestone Name

**v29.5 — v29.4 Hot-Patch Recovery + Verification Discipline**

## Goal (one sentence)

Close the four user-reported v29.4 regressions (Nexus tool registry empty, streaming gone, Bolt.diy missing + MiroFish still present, Fail2ban Security panel not rendering) and establish a **mandatory live-verification gate** so future milestones cannot ship `passed` without on-Mini-PC UAT.

## Why this milestone exists

User testing IMMEDIATELY after the v29.4 deploy revealed:

> **Cunku artik duzgun calismiyor mk** — "Because nothing works properly anymore"

Specific complaints (verbatim):
- "streaming tamamiyla gitmis artik tamamen butun islemi bitirdikten sonra gonderiyor" — streaming totally gone, AI sends entire response after processing finishes
- "hala kim oldugunu bilmiyor hangi model oldugunu" — still doesn't know what model it is (FR-MODEL-02 Branch N was the wrong call)
- "Bolt tamamen silinmis Store uzerinden" — Bolt.diy completely deleted from store
- "Miro Fish kalkmamis" — MiroFish hasn't been removed (despite being dropped at v29.3 close)
- "Fail2ban da yok kullaniclari manage edebilecegim" — no Fail2ban panel for managing users
- "Suan hic bir degisiklik goremiyorum" — I can't see any changes at all

Past Deploys panel confirms `7c811e5` deploy succeeded — but **deploy success ≠ feature working**. v29.4 audit said `passed` because integration check + tests were green; but the audit accepted "human_needed" UAT deferrals as routine. Live verification was never run.

## Diagnostic Findings (captured 2026-05-02 via SSH before fail2ban auto-banned the orchestrator)

See `.planning/v29.4-REGRESSIONS.md` for full diagnostic transcript. Key findings:

**Mini PC live state:**
- `git log` on `/opt/livos`: NO GIT (rsync-deployed — matches memory)
- `livos.service` / `liv-core.service` / `liv-worker.service` / `liv-memory.service`: all `active`
- Redis DBSIZE: 310 keys (not empty)
- **`nexus:cap:*` prefix: 126 keys total** — but **`nexus:cap:tool:*` = 0 keys** ← smoking gun for missing built-in tools
- `nexus:capabilities:*` (the prefix my Phase 47 audit assumed): 1 key (essentially empty)
- Phase 47 capabilities.ts uses correct `nexus:cap:` prefix at line 174 ✓
- BUILT_IN_TOOL_IDS lists 9 tools: shell, docker_run/ps/logs/stop, files_read/write/search, web_search
- pnpm-store: only ONE `@nexus+core*` dir — no dist drift
- Mini PC fail2ban auto-banned the orchestrator's IP after rapid SSH probes (~6 SSH calls within 10 min) — confirming Fail2ban itself works; the gap is the missing UI

**Critical implementation gap (NOT live-verified, but high-confidence root cause):**
- Phase 47-02 SUMMARY noted `D-WAVE5-SYNCALL-STUB` — the `flushAndResync.syncAll` is a documented stub. **Production Re-sync writes ZERO keys to `nexus:cap:_pending:*`** because there's no real seed flow for built-in tools.
- This is what I labeled "tech debt" in the v29.4 audit but is actually a **fundamental missing feature**: even if user clicks "Re-sync registry" from the UI, nothing repopulates `nexus:cap:tool:*`.
- The Phase 22 `capability-registry/syncTools()` flow that should auto-seed on livinityd boot is either not running, not wired correctly, or the registry got truncated by a v29.2 factory reset and never rebuilt.

## Target Features (4 fixes + 1 process change)

### A. v29.4 Live Regressions

- **A1. Tool registry restoration** — built-in tools (shell, docker_run/ps/logs/stop, files_read/write/search, web_search) MUST appear in `nexus:cap:tool:*` after livinityd boot. Two paths to investigate before fixing:
  - Path 1: Phase 22 `capability-registry/syncTools()` flow — does it run on every livinityd boot? Is it idempotent? Does it require some prerequisite (like Redis being writable, or a config flag)?
  - Path 2: Direct seed — write a `seed-builtin-tools.ts` module that runs on livinityd startup and unconditionally writes the 9 built-in tool manifests to Redis, idempotently.
  - Recommended: Path 2 (defensive — survives factory resets, partial syncs, registry corruption).
  - Acceptance: Mini PC `redis-cli KEYS 'nexus:cap:tool:*'` returns ≥9 keys; Nexus chat can call `shell`, `docker_*`, `files_read`, `web_search`.

- **A2. Streaming regression** — root cause UNKNOWN. v29.4 didn't change `nexus/packages/core/src/api.ts` or `sdk-agent-runner.ts` (per Phase 45 audit-only re-pin + Phase 47 Branch N — sacred file byte-identical). So either:
  - A pre-v29.4 commit (v43.x model bump) introduced a buffer that v29.4 inherited
  - A UI change (PWA service worker, build artifact) is buffering responses client-side
  - The 1m 2s deploy duration is suspiciously short — vite build alone is ~37s. update.sh may be skipping the UI build, leaving stale browser bundle.
  - Diagnostic: SSH to Mini PC, `cat /opt/livos/data/cache/install.sh.cached/update.sh.log | tail -50` to see if vite build ran, OR run `ls -la /opt/livos/livos/packages/ui/dist/` to check build timestamp.
  - Acceptance: AI Chat shows token-by-token streaming for any prompt taking >2s.

- **A3. Marketplace state — Bolt.diy missing, MiroFish present** — these live in Server5's platform PG (NOT Mini PC). Need to verify:
  - `SELECT id, name, status FROM platform_apps WHERE id IN ('bolt.diy', 'mirofish');` from Server5
  - Bolt.diy was seeded in v43.11 commit `f4f208a7` — may have been wiped by some factory reset OR never propagated to Server5
  - MiroFish was "dropped" at v29.3 close per user direction — but the manifest seed entry in platform_apps was never UPDATEd to status='archived' or DELETEd
  - Re-seed Bolt.diy + un-seed MiroFish via Server5 SQL or admin UI
  - Acceptance: `livinity.io/marketplace` (browser) shows Bolt.diy in Featured/Dev Tools; MiroFish absent.

- **A4. Fail2ban Security panel not rendering** — Phase 46 added 13th SECTION_ID 'security' inside `LIVINITY_docker`. User says they don't see it. Possible causes:
  - UI build not deployed (1m 2s deploy too short — see A2)
  - PWA service worker serving stale cached UI bundle
  - `user_preferences.security_panel_visible` defaults to OFF instead of ON (FR-F2B-06 said default ON — verify default in DB schema/migration)
  - Sidebar `useMemo` filter incorrectly hides 'security' when feature flag is undefined (instead of treating undefined as visible)
  - Diagnostic: SSH to Mini PC + browser hard-reload + `redis-cli HGET nexus:user:<id>:preferences security_panel_visible`
  - Acceptance: Server Management → 13-entry sidebar with "Security" entry; opening Security shows JailStatusCard + UnbanModal + AuditLog tabs.

### B. Process Change (CRITICAL — must land in this milestone)

- **B1. Mandatory live-verification gate before milestone close** — the v29.4 disaster proves `/gsd-audit-milestone` returning `passed` is INSUFFICIENT signal to close a milestone. New rule:
  - `/gsd-complete-milestone` SHOULD HARD-BLOCK if any `*-VERIFICATION.md` has `status: human_needed` AND those UAT items haven't been live-checked
  - Workflow change: add a `live_verification_required: true` config flag (default true); `complete-milestone` queries audit + counts human_needed phases + asks "have you actually run the UAT? (yes/no)" — defaulting to yes auto-blocks
  - Alternative: cheaper — at audit time, surface "human_needed UAT count" as the FIRST headline metric; if non-zero, audit status is `human_needed` (NOT `passed`)
  - This is the **single most important** v29.5 deliverable because it prevents ALL future regressions of this class.
  - Acceptance: re-running `/gsd-audit-milestone v29.4` produces status `human_needed` (not `passed`) until the 4 regressions are fixed AND UAT has been executed live.

## Locked Decisions (carry from v29.4)

- **D-NO-NEW-DEPS** preserved.
- **D-NO-SERVER4** preserved (Mini PC + Server5 only, Server4 still off-limits).
- **D-LIVINITYD-IS-ROOT** preserved.
- **Sacred file** `nexus/packages/core/src/sdk-agent-runner.ts` at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`. v29.5 likely DOES need a sacred-file edit for A2 (model identity preset switch) — Branch N was the wrong call.
- **D-LIVE-VERIFICATION-GATE (NEW)** — milestones cannot close `passed` without on-Mini-PC UAT execution per relevant phase. Adds a hard checkpoint to `complete-milestone`.

## Scope Notes

**NOT in v29.5:**
- New chat UIs, marketplace anchor apps, multi-LLM routing
- v30.0 Backup unfreeze (still paused)
- B3b active SSH gateway via cloudflared (still deferred)

**In scope:**
- 4 v29.4 regressions (A1-A4)
- 1 process change (B1 verification gate)

## Suggested Phase Breakdown (rough — roadmapper will refine)

| Phase | Goal | Dependencies |
|---|---|---|
| 49 | Mini PC live diagnostic + force-rebuild update.sh check (read-only — captures fixture for A1-A4) | — |
| 50 | A1 Tool registry built-in seed module + livinityd boot wire-up + integration test on isolated Redis | 49 |
| 51 | A2 streaming root-cause investigation + fix (UI build, sacred file edit, OR systemPrompt preset) | 49 |
| 52 | A3 Bolt.diy re-seed + MiroFish un-seed on Server5 platform DB | 49 |
| 53 | A4 Security panel render investigation + fix (PWA cache, user_preferences default, sidebar filter) | 49 |
| 54 | B1 Live-verification gate added to /gsd-complete-milestone workflow | — |
| 55 | Milestone-level verification: deploy, walk all 5 phase UATs end-to-end, verify each regression CLOSED on live Mini PC | 50, 51, 52, 53, 54 |

Phase numbering continues from v29.4's last phase (48). Phase 55 is the **mandatory live-verification phase** that every future milestone should mirror.

## Open Questions for /gsd-discuss-milestone

1. **A1 Tool registry — Path 1 (fix syncTools) or Path 2 (defensive eager seed)?** Path 2 is safer but adds startup latency. Path 1 fixes root cause but may not survive future factory resets.
2. **A2 streaming — what's the FIRST thing to check?** Recommend update.sh log first (cheap), then UI bundle timestamp, then service worker, then sacred file (D-40-01 ritual cost).
3. **A3 marketplace — re-seed via SQL or admin UI?** SQL is faster; admin UI proves the flow works. Recommend SQL for Bolt.diy now + manifest fix for whatever wiped it.
4. **A4 Fail2ban — is it deployment OR PWA cache?** Test with hard-reload (Ctrl+Shift+R) BEFORE assuming server-side bug.
5. **B1 verification gate — hard-block or soft-warn?** Hard-block prevents repeat of v29.4. Soft-warn keeps current ergonomics. Recommend hard-block but with `--accept-debt` override flag for genuine emergencies.

## Lessons Learned from v29.4

These belong in the user's project memory and Claude's reasoning over future milestones:

- **`status: human_needed` from gsd-verifier is NOT equivalent to `passed`.** It's a DIFFERENT outcome — code mechanism passes but live verification is pending. Treating it as auto-acceptable for milestone close is the bug.
- **Audit `passed` requires zero `human_needed` AND live UAT executed AND user confirmation.** The user explicitly said autonomous earlier — but autonomous doesn't mean skip-UAT; it means "don't pause for me on routine decisions." Live verification is NOT routine.
- **`audit-only` re-pins (Phase 45 C2) are safe; surgical edits (Phase 40 D-40-01) require live behavior testing.** Branch N (no edit) ALSO requires live behavior testing — verdict=neither based on `response.model` field alone is insufficient evidence.
- **Phase-level test:phaseN suites prove code correctness at the unit/integration level only.** They don't prove deploy correctness, PWA cache invalidation, registry seed flow, or end-to-end browser→livinityd→nexus→broker→Anthropic→back-to-browser pipelines.
- **Mini PC SSH limit + fail2ban = self-DoS risk.** Diagnostic plans that SSH frequently MUST sleep between calls or batch into a single SSH session. Future plans: ALWAYS run all read-only commands in ONE SSH invocation.

## How to use this file

After `/clear`, run:

```
/gsd-new-milestone v29.5
```

The workflow detects this MILESTONE-CONTEXT.md, presents the summary for confirmation, and proceeds to research → requirements → roadmap. Suggested answers to the 5 open questions above are pre-baked in this doc.

**Companion artifact:** `.planning/v29.4-REGRESSIONS.md` — full diagnostic transcript from this session, including exact SSH command outputs, Redis state snapshots, and source code analysis. Read this BEFORE planning any v29.5 phase to avoid re-running diagnostics that already produced ground truth.
