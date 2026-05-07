# Phase 98 — v33 UAT + Polish + Docs — PLAN

**Phase:** 98-uat-polish
**Wave:** 5 (final, post P92-P97)
**Type:** Documentation + verification (zero code changes)
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — verified before AND after.

---

## Pre-flight (before any task starts)

1. Confirm sacred SHA: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. If it differs, STOP and escalate (someone touched the sacred file).
2. Confirm P92, P93, P94, P95, P96, P97 SUMMARY docs all exist and report success. If any phase is `[~]` partial or `[ ]` open, STOP — P98 cannot certify what was not built.
3. Read `93-SUMMARY.md` to capture which streaming backend shipped (x11vnc / ffmpeg-x11grab / maim-loop). UAT phrasing mirrors that outcome.
4. Read `94-SUMMARY.md` and `96-SUMMARY.md` to capture the WebApp deletion cascade mechanism (Postgres FK `ON DELETE CASCADE` vs app-level cleanup). Cite in UAT-CHECKLIST footer.

If any pre-flight check fails, do not proceed. File an `/gsd-insert-phase` request to address the gap and resume P98 after.

---

## Task 98-01 — Author `UAT-CHECKLIST.md`

**Output:** `.planning/phases/98-uat-polish/UAT-CHECKLIST.md`

**Structure** (mirror P91 conventions: ACTION → EXPECTED → PASS/FAIL/NOTES; sign-off block at end):

- **Pre-flight** bullets — Mini PC reachable at `bruce@10.69.31.68`, ZeroTier up, `bash /opt/livos/update.sh` ran clean for v33 batch, `systemctl status livos liv-core liv-worker` all green, browser open at the user's LivOS URL, Chrome on Mini PC already logged into the user's Google account (per gray area G-98-05).
- **Section A — Add WebApp metadata + persistence (P92 + P94)**
  - A1 Right-click empty desktop → "Add WebApp" item visible in context menu
  - A2 Click "Add WebApp" → dialog opens; type `https://facebook.com` → metadata preview (title + favicon) populates within 3s
  - A3 Save → desktop icon appears with Facebook title + favicon; survives reload
  - A4 Repeat for `https://gmail.com` and `https://x.com` — three icons total
  - A5 Reject path — type `javascript:alert(1)` → dialog rejects with validation error
  - A6 Postgres sanity (optional, terminal): `SELECT slug, title FROM webapps;` returns 3 rows
- **Section B — Profile sharing (D-V33-01, D-V33-07)**
  - B1 Click Facebook icon → window opens streamed; user already logged in (no Google sign-in screen)
  - B2 Without closing Facebook window, click Gmail icon → second window streams; same Google account already authenticated
  - B3 Repeat for X — third window also already logged in
  - B4 Inspect any Chrome window's profile menu (top-right avatar) → all three reflect same Google identity
- **Section C — Window focus / re-launch (D-V33-04)**
  - C1 With Facebook window open, click Facebook icon AGAIN on desktop → existing window receives focus (foreground); NO duplicate window opens
  - C2 Close Facebook via Chrome ✕ → x11vnc + websockify tear down; LivOS WebApp shell shows "Stream ended" + "Reopen" button
  - C3 Click "Reopen" → fresh window spawns; same Google session preserved
- **Section D — Stream backend verified (P93 spike outcome)**
  - D1 Stream renders the Chrome window content within 5s of icon-click; not black, not all-grey, not frozen
  - D2 Mouse-move over the streamed window in LivOS browser → host Chrome cursor mirrors movement (latency tolerable: <500ms feels live)
  - D3 Type a character in a Chrome text field via the stream → keystroke registers in the host Chrome window
  - D4 Resize the LivOS WebApp shell window → VNC autoresize kicks in; no scrollbars; no clipped content
  - D5 (Footnote: stream backend is whichever P93 picked — record `x11vnc | ffmpeg-x11grab | maim-loop` in NOTES per `93-SUMMARY.md`.)
- **Section E — Teach mode (P96)**
  - E1 In the Facebook WebApp shell, switch mode pill from Watch → Teach → red pulsing recording dot appears
  - E2 In the streamed Chrome window: click the "What's on your mind" composer, type a short non-public message (do NOT post)
  - E3 Click Stop in the mode pill → Save dialog prompts for a name → enter "compose-status-draft" → save
  - E4 Skills sidebar refreshes; the saved skill appears with action count + first-screenshot thumbnail
  - E5 Open the skill replay scrubber → linear timeline of mouse/keyboard events with thumbnails; scrubbing reveals each step
  - E6 Postgres sanity (optional): `SELECT name, jsonb_array_length(action_log) FROM webapp_skills;` shows the saved skill with N events
- **Section F — Auto mode (P97)**
  - F1 Switch mode pill to Auto
  - F2 Type goal: "Open the post composer and type 'hello world' as a draft. Do not click Post." (Per gray area G-98-03 — never instruct a public post during UAT.)
  - F3 Optionally: select the saved skill from E3 as guidance
  - F4 Watch the chat panel — agent narrates each step with status_detail phrases ("Pondering…", etc.); side panel shows screenshots + clicks; bytebot tools fire with `targetWindowId` matching the WebApp's wid
  - F5 Within 60s, the streamed window shows the composer opened and the text typed; no Post click triggered
  - F6 Failure-recovery probe — type a goal that requires a non-existent UI element (e.g. "click the purple unicorn button"). Within 3 vision-validation strikes, agent emits "needs help" + pauses; UI reflects paused state
- **Section G — WebApp deletion cascade (P94 + P96)**
  - G1 Right-click the Facebook desktop icon → "Delete WebApp" → confirm
  - G2 Icon disappears from desktop; window (if open) closes; stream tears down
  - G3 Postgres sanity: `SELECT count(*) FROM webapp_skills WHERE webapp_id='<facebook-uuid>';` returns 0
  - G4 Postgres sanity: `SELECT count(*) FROM webapp_agent_sessions WHERE webapp_id='<facebook-uuid>';` returns 0
  - G5 (Footer: cascade mechanism is `<FK ON DELETE CASCADE | app-level cleanup>` — record per `94-SUMMARY.md` / `96-SUMMARY.md`.)
- **Section H — Sacred + regression**
  - H1 `git hash-object liv/packages/core/src/sdk-agent-runner.ts` (or on Mini PC if /opt/livos is git-tracked) → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
  - H2 `systemctl status livos liv-core liv-worker liv-memory` — main services green; liv-memory pre-existing acceptable per memory note
  - H3 Open `/ai-chat` (v32 path) → still works; no regression from v33 work
  - H4 Open Bytebot via Computer Operator agent → still works (P79 baseline preserved); v33 added `targetWindowId` plumbing should not regress global desktop bytebot
  - H5 Browser console (F12) on the WebApp shell page → no new red errors
- **Sign-off block** (mirrors P91 footer):
  - Date walked, Walker, Overall PASS/FAIL, Defects to file (bullets for v34 carry-over), Subjective vibe.

**Voice + format constraints:**
- English. ≤ 500 lines.
- No source code in checklist (only shell/SQL one-liners that the user types in a terminal during UAT).
- ACTION column is imperative + concrete; EXPECTED column is observable + binary; RESULT column is `[ ] PASS  [ ] FAIL  NOTES:` in every row.

**Verification (this task):**
- File exists at the path above.
- Sections A–H all present.
- Sign-off block present.
- Reference footnotes for spike outcome (D5) and cascade mechanism (G5) present so the walker knows where to look.

**Guardrail:**
- DO NOT auto-execute any UAT step from this plan. Authoring only.
- DO NOT mark `Overall PASS` in the sign-off block — that is the user's signature line.

---

## Task 98-02 — Author `docs/webapp-launcher.md`

**Output:** `docs/webapp-launcher.md` (NEW top-level `docs/` directory will be created by this write).

**Structure:**
1. **Overview** — one-paragraph "what is this": right-click desktop → add a website as a desktop app → click → window opens streamed back to LivOS with an AI panel that can watch, learn, or act for you.
2. **Prerequisites** — Mini PC user logged into Chrome on the host. v33.0 or later. Single-user only in this release.
3. **Add a WebApp** — step-by-step:
   - Right-click empty desktop area
   - Click "Add WebApp"
   - Paste URL (any HTTPS site that supports your existing browser session)
   - Confirm metadata preview
   - Save → icon appears
4. **Use a WebApp** — click the icon → window opens with live stream + AI panel + mode pill (Watch / Teach / Auto / Chat). Toolbar covers ←, →, refresh, copy URL, fullscreen, popout. Closing the Chrome window via ✕ ends the stream.
5. **Teach a Skill** — flip mode pill to Teach → red pulsing dot indicates recording → perform the action sequence in the streamed window → click Stop → name the skill → it appears in the skills sidebar for that WebApp. The skill is private to your account. **Privacy note** (per v33-DRAFT §8.3): screenshots may capture text you type during recording. Do not enter passwords or sensitive credentials while teaching.
6. **Auto Mode** — flip mode pill to Auto → optionally select a saved skill as guidance → type a goal in plain English ("draft a tweet about the weather") → the agent runs in the WebApp's window. The agent narrates steps in the chat panel and shows screenshots in the side panel. If the agent gets stuck (3 consecutive failed vision validations), it pauses and says "needs help" — you can take over manually, or refine the goal and retry.
7. **Troubleshooting** — common issues + fixes:
   - **Stream is black** — likely Chrome window not visible / minimised; click the icon again to focus, or close + reopen.
   - **"Stream ended"** — Chrome window was closed (by you or a crash); click "Reopen" to spawn a fresh window.
   - **Logged out unexpectedly** — Chrome profile issue; log in once via the streamed window; cookies persist for next time.
   - **Auto mode not finding a button** — agent vision missed the element; try (a) adding hint text in the goal ("the blue Login button at top-right"), (b) recording a Teach skill first and selecting it as guidance, (c) take over manually then resume.
   - **Skill drift after redesign** — websites change; if a Teach skill no longer works, re-record it.
   - **Window manager / x11vnc errors** — restart `livos.service` and `liv-core.service`; if persistent, file an issue with the contents of `journalctl -u livos -n 200`.
8. **Limits (v33)** — single user only; one Chrome profile shared across all WebApps; desktop-first (no mobile); skills are private to your account; no marketplace yet; CDP/WebRTC deferred.
9. **What's next** — point to `v33-DRAFT.md` §9 for v34 roadmap items.

**Voice + format constraints:**
- English. Friendly, concise, "user-first" tone (not internal architecture).
- ≤ 500 lines.
- No source code (only shell snippets in Troubleshooting where unavoidable).
- No emoji unless the user explicitly requests them later.
- Section headings in `##` and `###`; sentences short.

**Verification:**
- File exists at `docs/webapp-launcher.md`.
- Sections 1–9 present.
- Privacy note present in Teach section.

---

## Task 98-03 — Close ROADMAP.md + write project memory

**Output:**
- EDIT `.planning/ROADMAP.md`
- CREATE `C:\Users\hello\.claude\projects\C--Users-hello-Desktop-Projects-contabo-livinity-io\memory\project_v33_complete.md`

**Edits in ROADMAP.md:**
1. Top milestones section line 11: change `🟢 v33.0 WebApp Launcher + Teach/Auto Modes — Phases 92-98 (OPENED 2026-05-07; runs parallel with v32 UAT)` to `✅ v33.0 WebApp Launcher + Teach/Auto Modes — Phases 92-98 (CODE-COMPLETE <date>; pending Mini PC UAT signoff — see [.planning/phases/98-uat-polish/UAT-CHECKLIST.md])`. **Do NOT flip to fully Shipped until user reports UAT PASS** — see Pre-flight + Guardrail below.
2. v33 phase summary block (lines 116-124): flip every `[ ]` to `[x]` for Phases 92-98 (each phase's SUMMARY exists per pre-flight); preserve existing prose.
3. Project-Level Milestone Index (line ~432): append `**v33.0 WebApp Launcher + Teach/Auto Modes** (CODE-COMPLETE <date> — pending UAT)`.
4. Footer "Last updated" line: bump to today.

**Memory file body** (mirrors `project_v32_complete.md` schema):
- Title: `# v33.0 milestone — code-complete`
- Date stamp + commit-range note (P92..P98 commit hashes if available; otherwise note "see git log feat(92).. docs(98)..").
- One-paragraph what-shipped summary: WebApp Launcher (3 desktop icons → host Chrome `--new-window` → x11vnc/ffmpeg/maim stream → v32 chat panel + Watch/Teach/Auto/Chat mode pill), shared Google profile, single Mini PC user, Postgres `webapps` + `webapp_skills` + `webapp_agent_sessions`, sacred SHA preserved.
- Carry-overs to v34: per v33-DRAFT §9 (multi-user, CDP, WebRTC, voice, mobile, marketplace).
- Pending items: Mini PC UAT walk + UAT-CHECKLIST.md signoff (link).
- Sacred SHA verification: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 7 phases.
- Defects/findings: blank list to be populated post-UAT.

**Voice + format constraints:**
- ≤ 200 lines. Project memory only — no architectural notes.
- Mirror the structure of `project_v32_complete.md` for consistency.

**Verification:**
- ROADMAP.md edits applied; phases 92-98 all `[x]`; v33 heading updated.
- Memory file written; mirrors v32-complete schema.
- Sacred SHA still `f3538e1d811992b782a9bb057d1b7f0a0189f95f` after edits (no source files touched, so should be trivially preserved — verify regardless).

---

## Task 98-04 — Final commit + sacred SHA verify

**Output:** ONE commit per the commit message in `98-CONTEXT.md` §9.

**Steps:**
1. `git status` — confirm only the four expected paths are staged: `.planning/phases/98-uat-polish/UAT-CHECKLIST.md`, `docs/webapp-launcher.md`, `.planning/ROADMAP.md`, plus any `.planning/phases/98-uat-polish/98-CONTEXT.md` + `98-PLAN.md` already authored.
2. `git diff --stat liv/ livos/` — MUST be empty. If non-empty, STOP — P98 leaked a code change; revert.
3. `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. If different, STOP and escalate.
4. `git add` only the four planning + docs paths (NEVER `git add -A`).
5. `git commit` with the HEREDOC message from `98-CONTEXT.md` §9. Include `Co-Authored-By` trailer per repo convention.
6. `git status` post-commit to confirm clean tree (memory file lives outside the repo, so git won't see it — that's expected).
7. `git hash-object liv/packages/core/src/sdk-agent-runner.ts` again → still `f3538e1d`. Final guardrail.

**Verification (this task):**
- ONE commit landed.
- `git diff --stat liv/ livos/` empty across the commit.
- Sacred SHA unchanged before AND after.
- Memory file written outside repo (verify via filesystem listing of the user-memory directory).

**No push.** v33 ship is local until user runs UAT and reports PASS.

---

## Top-level guardrails (apply to ALL tasks)

1. **DO NOT close the v33 milestone unless every UAT-CHECKLIST item is ✅ confirmed by the user.**
   - Per `feedback_milestone_uat_gate.md` ("v29.4 audit said 'passed' with 4× human_needed verifications, shipped broken").
   - Per D-91-05 + D-98-02 + D-98-05.
   - The ROADMAP heading flip from `🟢 Active` → `✅ Shipped` happens in a SEPARATE follow-up commit AFTER user PASS report; the P98 ship commit only goes to "code-complete pending UAT".
2. **Sacred file is untouched.** Verify SHA pre-flight + post-commit.
3. **No source-tree edits in P98.** Defects surfaced during UAT do not get patched in P98 — they become v34 carry-overs or hot-fix phases inserted via `/gsd-insert-phase`.
4. **Batch any Mini PC SSH work into ONE invocation** if you must verify something pre-flight (per `feedback_ssh_rate_limit.md`). Default position: P98 does NOT touch Mini PC at all.
5. **English in all artifacts.** Status updates relayed to user can be Turkish per user preference, but committed files are English.
6. **No emoji in user-facing docs unless requested.**
7. **Total artifact size:** each of `98-CONTEXT.md`, `98-PLAN.md`, `UAT-CHECKLIST.md`, `docs/webapp-launcher.md` ≤ 500 lines.

---

## Wave / dependency

- P98 has no parallel siblings — it is the sole Wave 5 phase.
- Hard deps: P92, P93, P94, P95, P96, P97 all `[x]`.
- Soft deps: `93-SUMMARY.md` (spike outcome) + `94-SUMMARY.md` + `96-SUMMARY.md` (cascade mechanism) — needed for UAT phrasing branches D5 and G5.

---

## Definition of Done

- [ ] `.planning/phases/98-uat-polish/UAT-CHECKLIST.md` written, sections A–H + sign-off
- [ ] `docs/webapp-launcher.md` written, sections 1–9
- [ ] `.planning/ROADMAP.md` Phase 92-98 boxes flipped, milestone heading updated to "code-complete pending UAT", milestone-index appended
- [ ] `project_v33_complete.md` written to user memory dir
- [ ] ONE commit landed; `git diff --stat liv/ livos/` empty in commit
- [ ] Sacred SHA `f3538e1d…` verified before AND after commit
- [ ] Pushed: NO (local only until UAT PASS)
- [ ] Final flip to `✅ Shipped` deferred to post-UAT follow-up commit
