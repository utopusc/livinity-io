---
milestone: v44.0
name: Liv AI Tooling Depth
phases_under_uat: [246, 247, 248]
artifact_status: artifact-only
operator_status: pending
created: 2026-05-29
locked_invariants:
  - D-V44-SACRED
  - D-V44-MINI-PC-ONLY
  - D-V44-CADDY-REUSE-226-04
  - D-V44-NO-ROOT-PTY
  - D-V44-DISPLAY-XEPHYR-DEFAULT
  - D-V44-DISPLAY-OWNER-SCOPED
  - D-V44-TERMINAL-SCROLLBACK-RING
---

# v44.0 — Consolidated UAT Index

**Milestone:** v44.0 — Liv AI Tooling Depth
**Phases under UAT:** 246 (Terminal v2) · 247 (Luse skill set v2) · 248 (Display lifecycle)
**Target host:** Mini PC (`bruce@10.69.31.68`)
**Operator browser entry:** `https://bruce.livinity.io/`
**Sequenced walk path:** `.planning/v44-OPERATOR-WALK.md`
**Close script:** `scripts/close-v44-when-uat-green.sh`

---

## 1. Purpose

This file is the **v44.0 milestone-close gate**. The milestone does NOT flip to `CLOSED` until every mandatory item below is ticked `[x]`. Per project memory `feedback_milestone_uat_gate.md` (v29.4 was declared "passed" with 4× `human_needed` verifications and shipped broken), **no `human_needed` deferral substitutes for an actual operator browser walk**. Phase 249 produces this consolidated doc, the sequenced operator-walk doc, and a guarded close script — but Phase 249 does NOT execute the close. That is operator-only.

The operator walks this file row by row from a real Chrome session at `https://bruce.livinity.io/` while following the sequenced steps in `.planning/v44-OPERATOR-WALK.md`. Every walk step references a specific UAT item id here so the tick → step mapping is unambiguous. Once every mandatory row is `[x]` (or `[~] N/A` with explicit rationale where allowed), the operator runs `bash scripts/close-v44-when-uat-green.sh` from the repo root to archive v44 to `.planning/milestones/v44/` and then invokes `/gsd-complete-milestone v44.0`.

---

## 2. Pre-flight (sacred-SHA gate)

Run these probes **BEFORE** any browser UI walk. If EITHER mismatches → **STOP**, escalate, do NOT proceed to UAT.

**Repo blob sacred SHA** (`liv/packages/core/src/sdk-agent-runner.ts`):

```bash
ssh bruce@10.69.31.68 'git -C /opt/livos rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts'
# Expected: f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

**AionUi vendored binary sacred sha256** (`/opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore`):

```bash
ssh bruce@10.69.31.68 'sha256sum /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore'
# Expected: 293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b
```

**Services live** (all 6 must report `active`):

```bash
ssh bruce@10.69.31.68 'systemctl is-active livos liv-core liv-worker liv-memory liv-assistant caddy'
# Expected: 6 × "active"
```

If any FAILS → STOP. Do NOT tick any UAT row below until pre-flight is green.

---

## 3. GO/NO-GO rollup matrix

The operator updates this table as they walk. Mandatory items must all be `[x]` (or `[~] N/A` where explicitly allowed — item F only) before the close script will succeed.

| Phase     | Deliverable                                       | Mandatory items                 | Optional items   | Operator tick (M / O) | Status                |
| --------- | ------------------------------------------------- | ------------------------------- | ---------------- | --------------------- | --------------------- |
| 246       | Terminal v2 (multi-session + reattach + TTL GC)   | 7 (UAT-1 .. UAT-7)              | 2 (OPT-1, OPT-2) | `[ ] / [ ]`           | pending               |
| 247       | Luse skill set v2 (docs only)                     | N/A — drift-locked              | 1 (sync re-run)  | `[~] N/A`             | drift-locked          |
| 248       | Luse display lifecycle                            | 7 (A..G; F may be `[~] N/A`)    | 2 (H, I)         | `[ ] / [ ]`           | pending               |
| **v44.0** | **Milestone close**                               | **14 (–1 if F `[~] N/A`)**      | **4**            | **`[ ] / [ ]`**       | **OPERATOR-PENDING**  |

---

## 4. Phase 246 — Terminal v2 — mandatory UAT

**Source:** `.planning/phases/246-terminal-v2-multi-session/246-06-UAT-CHECKLIST.md`
**Build expected on Mini PC:** deployed SHA `c72a87d4` (or higher).
**Sacred file SHA-256 (disk):** `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`.

### Prereqs

- Confirm v43 flag is ON:
  ```bash
  ssh bruce@10.69.31.68 'redis-cli -a "<pw>" GET livos:v43:terminal_panel'
  # Expected: "true"
  ```
- Confirm deployed SHA ≥ c72a87d4:
  ```bash
  ssh bruce@10.69.31.68 'cat /opt/livos/.deployed-sha'
  # Expected: c72a87d4 or higher
  ```
- Open `https://bruce.livinity.io/` in Chrome. Sign in if needed. Open DevTools (F12) → Console tab → keep open during the walk.

### Items

- [ ] **UAT-1 (single-tab default — backward compat):** Click the Terminal dock entry. Expected: exactly **1 tab** labeled `terminal-1`, prompt `bruce@bruce-EQ:~$` visible within ~2s. Verifies Plan 246-04 default-single-tab + Plan 243 backward-compat boot.

- [ ] **UAT-2 (multi-tab create):** Click the "+ New" button on the tab strip. Expected: a 2nd tab `terminal-2` opens with its own prompt. Type `whoami` in tab 1 (expect `bruce`); switch to tab 2; type `pwd` (expect `/home/bruce`). Tab outputs must be independent (two distinct PTYs — confirms Plan 246-01 SessionManager isolation).

- [ ] **UAT-3 (browser-local rename):** Right-click tab 2 → Rename → type `build-watch` → press Enter. Expected: tab label updates immediately; persists across tab switches inside the same browser session. (Rename is browser-local in v44 — does NOT survive reload; see §7 Known limitations.)

- [ ] **UAT-4 (reload survives — reattach):** Press F5 (browser hard reload). Expected: both tabs reappear with their previous scrollback replayed (the WS frame is `{type:"reattached", sessionId:"...", scrollback:[...]}` — verifies Plan 246-02 ring buffer + Plan 246-03 attach protocol + Plan 246-04 localStorage tab restore). Acceptable: tab 2 label reverts from `build-watch` to `terminal-2` (rename is browser-local in v44).

- [ ] **UAT-5 (admin panel — list):** Open Settings (dock entry → Settings) → System → "Active terminals" section. Expected: a card-like panel listing **2 rows**, one per session. Each row shows: short session-id, `createdAt` timestamp, `lastAttachAt` timestamp, Kill button. Verifies Plan 246-05 ActiveTerminalsPanel + Plan 246-03 `ptySessions.listSessions` adminProcedure. (Panel auto-refreshes every 5s while the v43 flag is ON; pauses when OFF.)

- [ ] **UAT-6 (admin kill — propagates):** Click Kill on the `terminal-1` row in the admin panel. Expected within ~1s:
  1. The row disappears from the admin panel (refetch fires post-mutation).
  2. The `terminal-1` tab in the terminal window shows `[session exited code=...]` or similar PTY-close indicator.
  3. F5 reload removes the expired tab from the strip — the localStorage entry for that tab is cleared on 4404 reattach attempt (verifies Plan 246-04 stale-entry cleanup).

- [ ] **UAT-7 (close button — local lifecycle):** Right-click the remaining tab (`terminal-2` or `build-watch`) → Close. Expected:
  1. Tab disappears from the strip.
  2. Settings → Active terminals refreshes to show 0 rows (or the panel-empty placeholder).
  3. DevTools → Application → Local Storage → `livos.v44.terminal.session.*` keys cleared. Verifies Plan 246-04 close → ws.close → server-side `ws.close → no-kill` semantic. Note: PTY itself remains alive on the server until 24h idle GC fires (this is the deliberate semantic break documented in Plan 246-03 — re-open should reattach).

  *(Cross-check, optional)* `redis-cli HGETALL livos:pty:session:<id>` still returns metadata; HGETALL after 24h or manual `lastAttachAt` rewind triggers the next sweep to kill it (verifies Plan 246-05 TTL GC).

### Optional probes (operator at-leisure)

- [ ] **OPT-1 (24h GC manual fast-forward):** Rewind a session's `lastAttachAt` directly in Redis so the next sweep kills it:
  ```bash
  redis-cli -a "<pw>" HSET livos:pty:session:<id> lastAttachAt 2026-04-01T00:00:00Z
  # wait up to 1h for the next ttl-gc sweep (or restart livos to trigger immediate scan)
  journalctl -u livos.service --since "1 hour ago" | grep "ttl-gc: killed idle session"
  ```
  Expected: a `ttl-gc: killed idle session {id ...}` line appears; the metadata key is gone after. Verifies Plan 246-05 TTL GC sweepNow path end-to-end on real PTYs.

- [ ] **OPT-2 (rollback rehearsal):** Flip the v43 flag OFF for 30s:
  ```bash
  redis-cli -a "<pw>" SET livos:v43:terminal_panel false
  # confirm in the UI: dock entry hidden + admin "Active terminals" panel hidden
  redis-cli -a "<pw>" SET livos:v43:terminal_panel true
  ```
  Expected: both the Terminal dock entry AND the Settings → Active terminals panel vanish/return atomically. Verifies D-243-FLAG-ROLLBACK preserved through v44.

---

## 5. Phase 247 — Luse skill set v2 — N/A (drift-locked)

**Source:** `.planning/phases/247-luse-skill-v2-docs/247-SUMMARY.md`

Phase 247 was a **docs-only phase**. It shipped 6 new canonical docs under `docs/luse/` + 6 new `.claude/skills/luse/` shims + refreshed Aion/OpenCode/OpenClaw bundled payloads via `scripts/sync-luse-skills.sh`. The phase's UAT was the **idempotency invariant** (Phase 242 D-242-B): re-running `bash scripts/sync-luse-skills.sh` after a docs change must report `0 new / 0 updated / N unchanged` on the second invocation. This was verified inside Plan 247-02 (`15 shims (0 new / 0 updated / 15 unchanged)` on the second run).

Mark row 247 as `[~] N/A — drift-locked at Phase 247-02 idempotency test (second run = 0/0/20)` in the GO/NO-GO matrix above. The 20 in `0/0/20` includes the 5 new Phase 248 shims added by Phase 248-04 (so the operator's second-run number will now be 20, not 15, if they re-run after the Phase 248 cutover).

### Optional belt-and-braces probe (1 min)

- [ ] **247-OPT-1 (sync re-run idempotency):** Re-run the sync script on the Mini PC and confirm full no-op:
  ```bash
  ssh bruce@10.69.31.68 'cd /opt/livos && bash scripts/sync-luse-skills.sh'
  # Expected final line: "Synced 20 shims (0 new / 0 updated / 20 unchanged)"
  ```

If first run reports `5 new / 4 updated / 11 unchanged`, that means the Mini PC was behind the Phase 248-04 cutover; a SECOND run on the same host should THEN report `0 / 0 / 20`. If second run reports anything other than `0 / 0 / 20` → drift-lock broken — escalate.

---

## 6. Phase 248 — Display lifecycle — mandatory UAT

**Source:** `.planning/phases/248-luse-display-lifecycle/248-05-UAT-CHECKLIST.md`
**Deployed SHA on Mini PC:** `49ba196501ae481a337645970d6cef2e2ba71f7d`
**Sacred AionUi sha256:** `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b` (must be unchanged before flipping ROADMAP).
**Operator surface:** Browser → `https://bruce.livinity.io/` → log in → open the Liv AI shell.

This checklist is the **production singleton** path that the 5 automated probes A–E in `248-05-DEPLOY-LOG.md` could not exercise via standalone tsx invocations (per the D-248-01-D per-instance handle-Map limitation documented in Deviation 1). Item E here is what truly proves the X-server SIGTERM chain works end-to-end inside the live MCP child.

### Sacred-SHA gate (must be checked BEFORE flipping ROADMAP)

```bash
ssh bruce@10.69.31.68 'git -C /opt/livos rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts'
# Expected: f3538e1d811992b782a9bb057d1b7f0a0189f95f
ssh bruce@10.69.31.68 'sha256sum /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore'
# Expected: 293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b
```

If either mismatches → STOP, do NOT flip ROADMAP, escalate.

### Mandatory (7 items)

- [ ] **A. Create Xephyr** — In Liv AI, ask the agent: _"Create a new Xephyr display."_
  - Expected: agent returns `{display:':10'}` (or higher if previous runs left allocator counter advanced) + a NEW Xephyr window appears on the operator's main desktop. Visible nested X-server, not just text.
  - SSH probe (read-only, optional): `redis-cli SCAN luse:display:*` should now show `luse:display::N` with the same N the agent reported.

- [ ] **B. Launch Firefox in the display** — Ask: _"Launch Firefox in display `:N`."_ (use the N from item A)
  - Expected: agent calls `computer_launch_app_in_display({display:':N', app:'firefox'})`. Firefox renders INSIDE the Xephyr window (not on the operator's main desktop, not on `:1`).
  - Result envelope should be `{pid, app_name:'firefox', display:':N', kind:'binary'}` or `kind:'native'` (whichever LivOSAppResolver matches).

- [ ] **C. Scoped screenshot** — Ask: _"Take a screenshot of display `:N` only."_
  - Expected: agent calls `computer_screenshot({display:':N'})`. Returned base64 image shows ONLY the Firefox-in-Xephyr contents, NOT the operator's main desktop or other windows.
  - Quick eyeball check: image bounds should be exactly 1920x1080 (the Xephyr screen geometry), and contain Firefox chrome.

- [ ] **D. List displays mid-flow** — Ask: _"List all displays."_
  - Expected: agent calls `computer_list_displays`, returns an array including the `:N` record. `running_apps` should contain the Firefox PID from item B.
  - Bonus probe: ask the agent to compare `running_apps[0]` against `ps -ef | grep firefox` PID (it should match).

- [ ] **E. Owner-scope kill ALLOWED** — Ask the agent: _"Close display `:N`."_
  - Expected: agent calls `computer_kill_display({display:':N'})` from the same session, returns `{ok:true, killed_apps_count:1}` (1 because Firefox is the one app).
  - **The Xephyr window vanishes from the operator's desktop** — this is the wire-level proof that the production singleton `handles.get(':N')` path works (vs. the standalone-probe limitation in DEPLOY-LOG Deviation 1).
  - SSH probe: `redis-cli SCAN luse:display:*` → empty; `pgrep -af Xephyr` → no `:N` process.

- [ ] **F. Owner-scope kill DENIED** — Open a SECOND Liv AI session (different browser tab/incognito, or different user account if multi-user is enabled). Create a display in session-1, then try to kill it from session-2.
  - Expected: session-2's `computer_kill_display` returns an MCP error with text matching: `not-owner — only the session that called computer_create_display can kill this display (D-V44-DISPLAY-OWNER-SCOPED)`.
  - The X server stays alive; `redis-cli HGETALL luse:display::N` still returns all fields.
  - Then kill it correctly from session-1 to clean up.
  - **Caveat:** per Phase 248-02 D-248-02-A, owner-session is sourced from `options.userId` (LUSE_USER_ID env), which is the MCP child's identity — single-tenant Mini PC has only one MCP child, so this item only fires if you can spawn a second McpBridge child with a different `LUSE_USER_ID`. If multi-user mode is off, this item is N/A and should be marked `[~] N/A single-tenant — drift-locked by 248-01 Case 11 + 248-02 Case G` (drift-locked at vitest Case G in 248-02 + impl tested by 248-01 Case 11).

- [ ] **G. computer_application + display arg** — Ask: _"Open gnome-calculator on a new Xephyr display."_
  - Expected: agent first creates a display `:M`, then calls `computer_application({application:'gnome-calculator', display:':M'})`. Calc appears INSIDE the Xephyr window, not on the operator's main desktop.
  - The agent should then ask to clean up (kill display `:M`).

### Optional (2 items)

- [ ] **H. Xvfb headless mode** — Ask: _"Create a headless Xvfb display."_
  - Expected: agent calls `computer_create_display({mode:'xvfb'})`. NO visible window appears on the operator's desktop (Xvfb is headless).
  - SSH probe: `xdpyinfo -display :N` succeeds (proves the headless X server is live), `pgrep -af Xvfb` shows the process.
  - Clean up: agent kills it after the operator confirms.

- [ ] **I. TTL GC (4h idle threshold)** — Long-running check; skip unless operator has 4+ hours.
  - Setup: create a display, do NOT attach any app, wait 4h+1m.
  - Expected: `journalctl -u livos --since '5 minutes ago' | grep 'display-ttl-gc: killed idle display'` shows a line with `{display:':N', idleAgeMs:<>14400000, owner_session:'bruce'}`. Redis key gone. Xephyr process gone (singleton path).
  - Alternative: skip and rely on the 8/8 vitest cases in `display-ttl-gc.test.ts` (248-03 Cases 1-8, drift-locked).

---

## 7. Known limitations (do NOT block GO/NO-GO)

These are **documented limitations**, not regressions. They MUST NOT cause the operator to leave a mandatory item unticked unless the item itself fails.

- **Phase 248 Probe E.4 (cross-process X-kill):** D-248-01-D per-instance handle Map limitation. The standalone tsx probes in `248-05-DEPLOY-LOG.md` cannot exercise the production singleton `handles.get(':N')` path because each tsx invocation has a fresh `handles` Map. UAT items **E + G above exercise the production singleton path** which IS the wire-level proof. Future v45+ work may add cross-restart spawn-handle persistence.

- **Phase 246 rename is browser-local (UAT-3 → UAT-4 revert):** Tab renames live in `localStorage` only. F5 reload reverts label to auto-generated `terminal-N`. Server-side rename is a v45+ enhancement. NOT a fail — explicit in UAT-3 expected note.

- **Phase 246 PTY survives tab close (UAT-7):** Closing a tab calls `ws.close()` only — the server-side PTY keeps running and only dies on (a) explicit admin Kill, (b) 24h idle GC, or (c) livinityd restart. This is the deliberate semantic break introduced by Plan 246-03 to enable reattach.

- **Phase 246 single-user assumption:** Per-user session scoping deferred to v45 multi-user. Admin "Active terminals" panel lists all sessions regardless of which browser opened them. Single-tenant Mini PC == correct behavior for v44.

---

## 8. Close procedure (operator runs after all mandatory PASS)

Once §3 GO/NO-GO matrix shows every mandatory row at `[x]` (or `[~] N/A` where allowed — item F only for single-tenant), and §10 audit trail is filled in:

```bash
# From host that has this repo cloned (NOT inside the Mini PC):
cd /path/to/livinity-io

# Confirm consolidated doc has all mandatory items [x] before running:
grep -nE '^- \[ \] \*\*(UAT-[1-7]|[A-G]\.)' .planning/v44-UAT-CONSOLIDATED.md
# Expected: zero output (no unticked mandatory items).

# Then archive v44:
bash scripts/close-v44-when-uat-green.sh
```

The script performs the sacred-SHA precheck, the UAT tick-count gate, and the archive of v44 to `.planning/milestones/v44/`. It prints the next manual step instruction at the end.

**References:**
- `.planning/v44-OPERATOR-WALK.md` — sequenced browser walk path.
- `scripts/close-v44-when-uat-green.sh` — guarded close/archive script.

---

## 9. Source references

**Phase 246 (Terminal v2):**
- `.planning/phases/246-terminal-v2-multi-session/246-SUMMARY.md` — phase aggregate
- `.planning/phases/246-terminal-v2-multi-session/246-06-UAT-CHECKLIST.md` — full UAT source
- `.planning/phases/246-terminal-v2-multi-session/246-06-DEPLOY-LOG.md` — wire-level probe transcripts + operator deploy script
- Per-plan SUMMARYs: 246-01 through 246-06

**Phase 247 (Luse docs v2):**
- `.planning/phases/247-luse-skill-v2-docs/247-SUMMARY.md` — phase aggregate
- `.planning/phases/247-luse-skill-v2-docs/247-01-SUMMARY.md` — canonical docs
- `.planning/phases/247-luse-skill-v2-docs/247-02-SUMMARY.md` — sync script extension + idempotency proof

**Phase 248 (Display lifecycle):**
- `.planning/phases/248-luse-display-lifecycle/248-SUMMARY.md` — phase aggregate
- `.planning/phases/248-luse-display-lifecycle/248-05-UAT-CHECKLIST.md` — full UAT source
- `.planning/phases/248-luse-display-lifecycle/248-05-DEPLOY-LOG.md` — Mini PC deploy transcript + probe transcripts + Deviation 1 (D-248-01-D)
- Per-plan SUMMARYs: 248-01 through 248-05

**Milestone-close precedent:**
- `.planning/milestones/v43/v43-MILESTONE-CLOSED.md` — close-doc shape reference
- `.planning/milestones/v43/v43-UAT-CHECKLIST.md` — v43 UAT precedent

---

## 10. Audit trail

Operator fills this in when the walk completes:

```
- Date walked:                       <YYYY-MM-DD>
- Operator:                          <name>
- Mini PC SHA at walk:               <git -C /opt/livos rev-parse HEAD>
- Sacred blob SHA at walk:           <git -C /opt/livos rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts>
- Sacred AionUi sha256 at walk:      <sha256sum /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore>
- Mandatory items passed:            <N/14>   (14 = 7 Phase 246 + 7 Phase 248; subtract 1 if F [~] N/A)
- Optional items walked:             <N/4>    (4 = OPT-1, OPT-2, H, I)
- Close script run:                  yes / no
- Milestone flipped to CLOSED:       yes / no
- Notes:                             <free-text — especially flag any FAILs and which Phase 25x regression ticket they map to>
```

When all mandatory items PASS:

```
## Closed
- Date: <YYYY-MM-DD>
- Operator: <name>
- Notes: <any observations, especially around rename-revert (UAT-3 → UAT-4), PTY-survives-close (UAT-7), or display-singleton path (E)>
```
