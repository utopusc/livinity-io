# Phase 98 — v33 UAT + Polish + Docs — CONTEXT

**Wave:** 5 (final — sequential after P92-P97 shipped)
**Status:** Active (planning)
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) — MUST be unchanged before AND after this phase. Verified at planning time = match.

---

## 1. Mission

Close out v33.0 with three deliverables, no code:

1. **`UAT-CHECKLIST.md`** — comprehensive Mini PC walk-through of the WebApp Launcher + Teach/Auto flow. Sections cover: add 3 WebApps (`facebook.com`, `gmail.com`, `x.com`), Google profile sharing across all three, window focus / re-launch behaviour, x11vnc/ffmpeg fallback verification (per P93 spike outcome), teach a skill, run Auto mode against a goal, autonomy + needs-help recovery, WebApp deletion cascade (skills + sessions), sacred SHA + service health regression. PASS/FAIL/NOTES per item.
2. **`docs/webapp-launcher.md`** — first user-facing docs for the WebApp Launcher feature: how to add a WebApp, how to teach a skill, how to use Auto mode, troubleshooting (stream black, login dropped, skill drift, auto-mode stuck).
3. **ROADMAP close + memory update** — mark v33 phases ✅ in `.planning/ROADMAP.md`, append milestone summary, write `project_v33_complete.md` to user memory directory.

NO code changes — those belong to P92-P97. P98 is documentation and verification only.

---

## 2. Source documents read

- `.planning/v33-DRAFT.md` (v2) — milestone master plan; §5 Phase 98 entry on lines 214-228, §4 locked decisions D-V33-01..08, §7 risks
- `.planning/ROADMAP.md` — v33 entry lines 108-148; Phase 98 line 124
- `.planning/phases/91-uat-polish/UAT-CHECKLIST.md` — v32 reference structure (sections A-J, ACTION/EXPECTED/RESULT columns, sign-off block) — adopted as template
- `.planning/phases/91-uat-polish/91-CONTEXT.md` — reference for context-doc structure
- Memory: `feedback_milestone_uat_gate.md` — never declare milestone passed without UAT
- Memory: `feedback_ssh_rate_limit.md` — fail2ban; batch all read-only Mini PC commands into ONE ssh invocation
- Memory: `reference_zerotier_unstable.md` — ZT peer drops; long ops must be `nohup`'d, no >30s foreground sessions

---

## 3. In scope

- **UAT script authorship** — comprehensive PASS/FAIL/NOTES walk-through covering every locked decision in v33-DRAFT §4 plus deferred-to-UAT carry-overs from P93 (spike outcome confirm), P95 (resize, mode pill states), P96 (recording fidelity), P97 (autonomy + 3-strikes recovery).
- **WebApp deletion cascade** verification — explicit UAT step that deleting a WebApp also deletes its rows in `webapp_skills` + `webapp_agent_sessions` (Postgres `ON DELETE CASCADE` or app-level cleanup; whichever P94/P96 chose).
- **Window focus / re-launch behaviour** — clicking icon when a WebApp window already exists must focus existing window (per D-V33-04), not duplicate.
- **x11vnc / ffmpeg fallback verification** — branch on P93 spike outcome: if x11vnc-on-Mutter worked, the UAT confirms that path; if fallback (ffmpeg x11grab cropped, or maim-loop MJPEG) shipped, the UAT confirms the fallback path. Phrasing in checklist accommodates both.
- **User-facing docs** — `docs/webapp-launcher.md` (CREATE; new top-level `docs/` directory). Audience: Mini PC end-user (the user themselves + future LivOS users when multi-user lands). No internal architecture; just "how to use".
- **ROADMAP close** — flip Phase 92-98 to `[x]`, change v33 milestone heading from `🟢` Active to `✅` Shipped (after UAT signoff), append milestone summary block.
- **Memory update** — write `project_v33_complete.md` per project-memory schema rules (project memory only, mirrors `project_v32_complete.md` structure). NO architectural memory file (the architecture lives in code + DRAFT).

---

## 4. Out of scope

- **Any code changes** — bug fixes, polish, new components, schema tweaks. If UAT surfaces defects, file them as v34 carry-over or insert a hot-fix phase via `/gsd-insert-phase`. P98 itself ships zero source-tree edits.
- **Touching `liv/packages/core/`** — sacred SHA preserved. Not negotiable.
- **Mini PC deploy execution** — orchestrator runs `bash /opt/livos/update.sh`; P98 only authors the UAT script the user walks. No SSH commands as part of P98 commit.
- **New WebApp metadata extractor logic, window manager logic, stream window UI, teach hook, auto-mode bytebot extension** — those are P92/P93/P95/P96/P97 deliverables; P98 only validates them.
- **Architectural memory file** — per memory system rules, architecture lives in code + design docs; project memory captures milestone outcomes only.
- **Cross-WebApp shared skills marketplace, multi-user Chrome profiles, CDP-based control, WebRTC streaming, voice control** — all v34+ per v33-DRAFT §9.

---

## 5. Gray areas (flag for user during UAT walk, do NOT auto-resolve)

| ID | Question | Recommended default |
|----|----------|---------------------|
| G-98-01 | How to objectively validate Auto-mode autonomy success? E.g. "post a Facebook status saying X" — manual eyeball confirm in browser, or graph-API check, or screenshot-diff vs expected? | **Manual eyeball confirm** for v33 (visual proof in the streamed window + post visible on facebook.com). Skill text content + AI-narrated step log in chat panel are secondary evidence. Defer API-based assertion to v34. |
| G-98-02 | UAT environment — Mini PC live (the user's only deployment) or staging clone? | **Mini PC live.** Per project memory, Mini PC is the only LivOS deployment that matters. No staging clone exists. ZeroTier instability mitigated by user-local SSH or browser-from-LAN. |
| G-98-03 | Should Auto-mode UAT post a real public message to facebook/x.com from the user's account, or use a private/test post? | **Recommend private/draft.** UAT goal is autonomy validation, not public output. Suggest the user run goals like "open the post composer and type a draft, then stop" rather than "post publicly". Phrase the checklist accordingly. |
| G-98-04 | Cascade-delete UAT — does v33 use Postgres FK `ON DELETE CASCADE` on `webapp_skills.webapp_id` and `webapp_agent_sessions.webapp_id`, or app-level cleanup in `webapps.delete` tRPC mutation? | **Branch in checklist:** the UAT step confirms both behaviours regardless of mechanism — after delete, `SELECT count(*) FROM webapp_skills WHERE webapp_id=…` returns 0 AND no orphan agent session rows remain. P94 / P96 SUMMARY docs will record which mechanism shipped. |
| G-98-05 | "Same Google profile login persists across all 3 WebApps" UAT — does the user actually log in to Google during UAT (PII risk on the documented checklist), or assume already-logged-in baseline? | **Assume already-logged-in baseline.** Pre-flight bullet states "Pre-condition: Chrome on Mini PC already has user logged into Google account". UAT only confirms persistence (cookies survive across WebApps), not first-login flow. |
| G-98-06 | Spike-outcome branch in UAT — at planning time we don't know if P93 picked x11vnc, ffmpeg, or maim-loop. How do we phrase UAT? | **Single conditional step:** "Confirm stream renders the Chrome window content (not black; not flickering). Stream backend is whichever P93 selected — see `93-SUMMARY.md` for which one. Behavioural expectation is the same: visible live frames at >5fps." |
| G-98-07 | UAT-walker assumed identity — Mini PC user `bruce` is the only v33 supported user. UAT explicitly tied to that user, OR generic "logged-in LivOS user"? | **Explicitly `bruce` on Mini PC.** v33 is single-user (D-V33-07). Multi-user UAT is v34 work. |

---

## 6. Verification gates

| Gate | Method | Pass criterion |
|------|--------|----------------|
| Sacred SHA preserved | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (before AND after P98 commit) |
| UAT-CHECKLIST.md present | file presence + section headers | All sections A–H present with PASS/FAIL/NOTES columns + sign-off block |
| webapp-launcher.md present | file presence + section headers | Sections: Overview, Add a WebApp, Use a WebApp, Teach a Skill, Auto Mode, Troubleshooting, Limits |
| ROADMAP closed | grep `\[x\]` count for Phase 92-98 lines | All 7 phases checked; v33 heading flipped `🟢 Active` → `✅ Shipped` (only after user UAT signoff confirms PASS) |
| Memory updated | file present in user memory dir | `project_v33_complete.md` written; mirrors `project_v32_complete.md` schema |
| No code touched | `git diff --stat liv/ livos/` | empty (zero source-tree edits in P98 commit) |

---

## 7. Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-98-01 | UAT-CHECKLIST.md mirrors P91 structure (sections, columns, sign-off block) | Consistency with shipped v32 UAT format; reduces cognitive load on the walker |
| D-98-02 | UAT is a script the user walks — P98 does NOT auto-execute it | Per `feedback_milestone_uat_gate.md`; per `reference_zerotier_unstable.md` (no long foreground SSH); per D-91-05 precedent |
| D-98-03 | Sections lettered A–H by domain (deploy precheck / metadata-add / window-launch+focus / stream / teach / auto / cascade-delete / sacred+regression) | Domain grouping matches the user's mental model (one feature per section); prior P91 used same lettering |
| D-98-04 | docs/webapp-launcher.md goes at top-level `docs/` (NEW directory) | First user-facing doc in the repo; future docs (multi-user, agent dev) join the same folder. Top-level placement signals "user-facing" vs `.planning/docs/` (internal) |
| D-98-05 | UAT does not gate ROADMAP close — close happens AFTER user reports PASS | Cannot self-certify per `feedback_milestone_uat_gate.md`; P98 commit ships the docs + checklist; final flip to ✅ Shipped is a post-UAT edit committed separately if needed |
| D-98-06 | Auto-mode UAT recommends draft/private posts (G-98-03) | Avoid public-output side-effects from a UAT exercise; preserves user's social-media reputation; autonomy verification doesn't require public posting |
| D-98-07 | Spike-outcome branching uses behavioural assertions, not implementation assertions | Stream backend may be x11vnc OR ffmpeg OR maim-loop depending on P93 outcome; UAT cares about "frames visible at >5fps", not "x11vnc daemon present" |
| D-98-08 | Memory file scope is project memory only — no architectural memory file | v33 architecture lives in `v33-DRAFT.md` v2 + code + P92-P97 SUMMARY docs; user-memory holds milestone outcome + carry-over only (mirrors `project_v32_complete.md`) |

---

## 8. Files this phase will touch

**CREATE:**
- `.planning/phases/98-uat-polish/UAT-CHECKLIST.md`
- `docs/webapp-launcher.md`
- `C:\Users\hello\.claude\projects\C--Users-hello-Desktop-Projects-contabo-livinity-io\memory\project_v33_complete.md`

**EDIT:**
- `.planning/ROADMAP.md` (Phase 92-98 checkboxes + v33 milestone heading + summary entry in milestone index)

**UNTOUCHED:**
- `liv/packages/core/src/sdk-agent-runner.ts` (sacred)
- All other `liv/` and `livos/` source files
- All v33 SUMMARY docs (read-only references)

---

## 9. Commit plan

ONE commit when complete:

```
docs(98): v33 UAT checklist + webapp-launcher user docs + roadmap close

- .planning/phases/98-uat-polish/UAT-CHECKLIST.md: Mini PC walk-through
  for WebApp Launcher + Teach/Auto modes (sections A-H, PASS/FAIL/NOTES)
- docs/webapp-launcher.md: first user-facing docs (Add/Use/Teach/Auto/
  Troubleshooting)
- .planning/ROADMAP.md: Phase 92-98 closed; v33 milestone summary appended
  (flipped to Shipped only after user UAT signoff confirms PASS)
- memory/project_v33_complete.md: milestone-outcome capture per memory schema

Phase: 98-uat-polish
Wave: 5 (final — milestone close)
Sacred SHA f3538e1d UNTOUCHED.
```

NOT pushed.

---

## 10. Out-of-scope reminders (re-stated for clarity)

- No source-tree edits.
- No Mini PC SSH commands as part of P98 execution.
- No declarations of milestone success ahead of user-walked UAT.
- No new architectural memory.
- No emoji additions to the user-facing doc unless the user explicitly requests them later.
