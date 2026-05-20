# Phase 184: v38.0 Mini PC Deploy + UAT + Milestone Close

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 184 + § Success Criteria (20 items)
**Wave:** 5 (FINAL — depends on all 171-183)

<domain>
## Phase Boundary

Deploy v38.0 to Mini PC. Run migration script (Phase 173). Live probes covering all 20 success criteria. Consolidated `v38-VERIFICATION.md`. STATE + ROADMAP milestone close.

**Phase 184 sonu:**
- All v38 commits pushed + `bash /opt/livos/update.sh` deployed
- Migration script (Phase 173) auto-ran: `/root/livinity-vault → /root/liv`, sessions migrated to ChatItems
- All 4 services active for ≥5 min post-restart
- Sacred SHA + D-09 + Phase 161-167 + Phase 169 guard files byte-identical pre/post deploy
- New boot log entries present: `[vault-items] N items loaded`, `[liv-scaffolder] Liv root agent registered`, `[agent-schedule] N agents scheduled`
- 12+ live probes pass: tree CRUD, sidebar drag-drop, Add Project/Agent/Chat, Liv greets + creates Item, scheduled agent runs, inbox appears, Vault Graph controls panel functional, mobile tablet→terminal/phone→bubble, Settings new groups, MCP panel functional, no Phase 168 SessionSidebar reachable, `tmux list-sessions` shows no status line
- `v38-VERIFICATION.md` written with all 20 success-criteria mapped to PASS / PASS-pending-OperatorUAT
- STATE.md updated: v38.0 milestone CODE-COMPLETE-AND-LIVE-VERIFIED
- ROADMAP.md updated: v38.0 close marker
</domain>

<decisions>

### Plan 184-01: Pre-deploy guard sweep + push
- `git push origin master` (all v38 commits)
- SSH Mini PC → verify pre-deploy SHA inventory (9+ guard files)
- All 4 services active for ≥5 min
- Acceptance: pre-deploy SHA captured to deploy log

### Plan 184-02: Run update.sh (detached + log poll) + migration verify
- Detached SSH + nohup pattern (ZeroTier-unstable safety)
- Verify post-deploy: `.deployed-sha` matches HEAD, services up, migration ran (`/root/liv/` exists, items/ populated, `.backups/v35-cc-sessions.json` exists)
- All 9+ sacred SHAs byte-identical pre/post
- Acceptance: deploy exits 0, 4/4 services active, all guards preserved

### Plan 184-03: Live smoke probes (12+ probes)
- P1 vault item CRUD: `vault.items.create` → `list` returns it
- P2 sidebar drag-drop: move ChatItem between Projects via tRPC, verify tree.json
- P3 Add Project / Agent / Chat: each creates correct files on disk
- P4 Liv root agent greet: `claude --print` via `~/liv/settings/liv-rootagent.md` returns sensible greeting
- P5 Liv tool dispatch: invoke `create_item` MCP tool → ChatItem appears in tree
- P6 Scheduled agent: register a cron `* * * * *` agent → wait 90s → inbox entry present
- P7 Vault Graph endpoint: 7 type colors verified in client palette, controls panel returns shaped JSON
- P8 Mobile route: simulate tablet viewport → `<CcTerminal>` mounted; phone viewport → `<MobileBubbleChat>` mounted
- P9 Settings panels: AI Chat Settings reads/writes Redis keys; MCP panel lists servers
- P10 Phase 168 deletion: `grep -r "SessionSidebar\|NewSessionButton\|cc-pty-router" livos/packages/ui/src/ | wc -l` = 0
- P11 tmux status off: `tmux list-sessions` doesn't show status line in attached terminal
- P12 dangerously-skip default: spawn new session, verify `ps aux | grep claude | grep -- --dangerously-skip-permissions`
- P13 Regression (Phase 162/163/167): existing WebApp/NativeApp surfaces still work
- Acceptance: 10+/13 PASS; remainder marked deferred-to-OperatorUAT

### Plan 184-04: v38-VERIFICATION.md
- NEW `.planning/phases/184-v38-deploy-uat/v38-VERIFICATION.md`
- Frontmatter: status, verified_at, deployed_sha, all guard SHAs, probe results, total_commits_v38
- Sections: Executive Summary, Phase-by-Phase Outcomes (14 rows), Live Probe Results, Sacred Guardrail Audit, Master Plan Success Criteria Mapping (20 items), Operator UAT § Browser Walk (12 steps), Carry-overs
- Acceptance: file ≥350 lines, frontmatter parses as YAML

### Plan 184-05: STATE + ROADMAP milestone close + safety wind-down
- MOD `.planning/STATE.md` — Current Position → v38.0 CODE-COMPLETE-AND-LIVE-VERIFIED
- MOD `.planning/ROADMAP.md` — append v38.0 close marker
- Safety wind-down: confirm `autonomous_enabled` Redis flag honored
- Final commits + push
- Acceptance: STATE + ROADMAP updated, both commits pushed to origin/master
</decisions>

<canonical_refs>
- Master plan § Success Criteria (20 items)
- v35-VERIFICATION.md (Phase 170 template to mirror)
- `reference_zerotier_unstable` (detached SSH + log poll requirement)
- `feedback_ssh_rate_limit` (batch SSH commands)
- Phase 165-04 + 170 verification doc patterns
</canonical_refs>

<specifics>

| Plan | Files | autonomous |
|------|-------|------------|
| 184-01 | Pre-deploy probe (no file changes; deploy log only) | true |
| 184-02 | Run update.sh + post-deploy verify (no source changes) | true |
| 184-03 | Live probes via SSH (no file changes) | true (1 checkpoint:human-verify for the browser walk § of UAT) |
| 184-04 | NEW phases/184/v38-VERIFICATION.md | true |
| 184-05 | MOD STATE.md + ROADMAP.md | true |

**Sacred guards (refuse to mark CODE-COMPLETE on drift):** Sacred SHA + D-09 + Phase 161-02 + Phase 162-01 + Phase 162-02 + Phase 163 + Phase 164 + Phase 165-01 + Phase 166 cc-pty (additive in 167.2/183) + Phase 167 cc-terminal (additive in 181) + Phase 169 vault-graph (additive in 179). Phase 168 SessionSidebar etc. are EXPECTED to be DELETED post Phase 175.

</specifics>

<deferred>
- Real Liv root agent screenshot via luse-driver (interactive operator walk) → operator UAT § Browser Walk
- Two-tab cross-attach indicator visual verification → operator UAT
- Mobile device real-world test (iPad + Android tablet + iPhone) → operator UAT
- `@livos/cli` npm publish → v38.1
- All v38.x carryover items from master plan § Carry-overs
</deferred>

---

*Phase: 184-v38-deploy-uat*
*Wave: 5 (FINAL — depends on 171-183)*
*Estimated: ~1 day agent work (deploy + probes + verification doc)*
*Closes: v38.0 Liv Agent Platform milestone*
