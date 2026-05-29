---
milestone: v44.0
type: operator-walk-script
target: https://bruce.livinity.io/
mini_pc_ip: 10.69.31.68
estimated_walk_minutes: 25 (mandatory) + 60 (optional Xvfb + 4h TTL skip)
created: 2026-05-29
---

# v44.0 — Operator Walk Path

**Companion doc:** `.planning/v44-UAT-CONSOLIDATED.md` (single-page UAT index — every walk step here ticks one or more rows there).
**Close script:** `scripts/close-v44-when-uat-green.sh` (operator-only — runs after walk is GREEN).
**Target browser entry:** `https://bruce.livinity.io/`
**Target SSH host:** `bruce@10.69.31.68` (Mini PC only; per HARD RULE 2026-04-27, no other deployment hosts apply to v44).

This walk is sequenced click-by-click. Every step lists the UAT item id(s) it satisfies so the operator can update `.planning/v44-UAT-CONSOLIDATED.md` row-by-row as they go.

---

## 1. Pre-flight (5 min)

1. Open a terminal on the host with SSH access to the Mini PC.

2. Run the **two sacred-SHA probes** from `.planning/v44-UAT-CONSOLIDATED.md` §2:
   ```bash
   ssh bruce@10.69.31.68 'git -C /opt/livos rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts'
   # Expected: f3538e1d811992b782a9bb057d1b7f0a0189f95f
   ssh bruce@10.69.31.68 'sha256sum /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore'
   # Expected: 293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b
   ```
   If either fails → **STOP**. Do NOT proceed to UI.

3. Confirm all 6 services are active:
   ```bash
   ssh bruce@10.69.31.68 'systemctl is-active livos liv-core liv-worker liv-memory liv-assistant caddy'
   # Expected: 6 × "active"
   ```
   If any inactive → **STOP**.

4. Confirm the v43 terminal flag is ON (gates the Phase 246 dock + admin panel):
   ```bash
   ssh bruce@10.69.31.68 'redis-cli -a "$(grep ^REDIS_URL /opt/livos/.env | sed "s/.*://;s/@.*//")" GET livos:v43:terminal_panel'
   # Expected: "true"
   ```
   If `false` or `(nil)` → flip it:
   ```bash
   ssh bruce@10.69.31.68 'redis-cli -a "<pw>" SET livos:v43:terminal_panel true'
   ```

5. Confirm deployed SHAs:
   ```bash
   ssh bruce@10.69.31.68 'cat /opt/livos/.deployed-sha'
   # Phase 246 expected: c72a87d4 or higher
   # Phase 248 deployed: 49ba196501ae481a337645970d6cef2e2ba71f7d (or higher)
   ```

---

## 2. Browser entry (2 min)

1. Open Chrome → navigate to `https://bruce.livinity.io/`.
2. Sign in if prompted (admin password or current session cookie).
3. Confirm the LivOS desktop loads with the dock visible at bottom.
4. Open DevTools (**F12**) → Console tab → **keep it open during the walk** so any red errors surface immediately. Per `feedback_milestone_uat_gate.md`: don't declare PASS without observing the live UI.

---

## 3. Terminal v2 walk (10 min) — covers Phase 246 UAT-1 .. UAT-7

### Step 3.1 — Open Terminal dock entry → satisfies UAT-1

- Click the **Terminal** tile in the dock.
- **VERIFY:** one tab named `terminal-1` opens within ~2s, prompt `bruce@bruce-EQ:~$` visible.
- **TICK:** `UAT-1` in `.planning/v44-UAT-CONSOLIDATED.md` §4.

### Step 3.2 — Add a second tab → satisfies UAT-2

- Click the **+ New** button on the tab strip.
- In tab 1, type `whoami` → expect `bruce`.
- Switch to tab 2, type `pwd` → expect `/home/bruce`.
- **VERIFY:** outputs are independent (two distinct PTYs).
- **TICK:** `UAT-2`.

### Step 3.3 — Right-click rename → satisfies UAT-3

- Right-click tab 2 → **Rename** → type `build-watch` → Enter.
- **VERIFY:** tab label updates immediately.
- **TICK:** `UAT-3`. NOTE: label reverts on F5 — that is by design (browser-local rename — see consolidated doc §7).

### Step 3.4 — Hard reload → satisfies UAT-4

- Press **F5**.
- **VERIFY:** both tabs reappear with previous scrollback replayed. (`build-watch` reverts to `terminal-2` — expected.)
- Cross-check: DevTools → Network → filter on `terminal/ws` → each tab on mount should receive a WS frame shaped `{type:"reattached", sessionId:"...", scrollback:[...]}`.
- **TICK:** `UAT-4`.

### Step 3.5 — Admin panel list → satisfies UAT-5

- Click the **Settings** dock entry → **System** section → **Active terminals** subsection.
- **VERIFY:** panel shows **2 rows**, each with session-id (truncated), `createdAt`, `lastAttachAt`, **Kill** button.
- **TICK:** `UAT-5`.

### Step 3.6 — Admin kill propagates → satisfies UAT-6

- In the admin panel, click **Kill** on the `terminal-1` row.
- **VERIFY** (within ~1s):
  1. Row disappears from admin panel (refetch fires post-mutation).
  2. The `terminal-1` tab in the terminal window shows `[session exited code=...]` or similar PTY-close indicator.
  3. After F5 reload, the expired tab no longer appears in the strip.
- **TICK:** `UAT-6`.

### Step 3.7 — Close button → satisfies UAT-7

- Right-click the remaining tab → **Close**.
- **VERIFY:**
  1. Tab disappears from the strip.
  2. Settings → Active terminals now shows 0 rows OR empty placeholder.
  3. DevTools → Application → Local Storage → `livos.v44.terminal.session.*` keys cleared.
- **TICK:** `UAT-7`. NOTE: server-side PTY remains alive until 24h GC — this is the deliberate `ws.close → no-kill` semantic (Plan 246-03).

---

## 4. Display lifecycle walk (10 min) — covers Phase 248 items A .. G

Use the **Liv AI** dock tile (NOT Terminal) for this section. All commands are natural-language requests to the agent. The agent calls the MCP tools; the operator observes the visual + Redis result.

### Step 4.1 — Open Liv AI → preparation

- Click the **Liv AI** tile in the dock (Phase 238 rebrand + 238.5 icon).
- Confirm the AionUi-vendored chat opens within the LivOS window. Wait for the agent ready prompt.

### Step 4.2 — Create Xephyr → satisfies A

- Ask: _"Create a new Xephyr display."_
- **VERIFY:** agent replies with `{display: ':10'}` (or higher); a **NEW Xephyr X-server window appears** on the operator's main desktop.
- **TICK:** `A`. Optional read-only probe:
  ```bash
  ssh bruce@10.69.31.68 'redis-cli SCAN luse:display:*'
  # Expected: at least one luse:display::N key matching what the agent reported
  ```

### Step 4.3 — Launch Firefox in display → satisfies B

- Ask: _"Launch Firefox in display `:N`."_ (use the N from Step 4.2).
- **VERIFY:** Firefox renders **INSIDE the Xephyr window**, NOT on operator's main desktop, NOT on `:1`. Result envelope: `{pid, app_name:'firefox', display:':N', kind:'binary'|'native'}`.
- **TICK:** `B`.

### Step 4.4 — Scoped screenshot → satisfies C

- Ask: _"Take a screenshot of display `:N` only."_
- **VERIFY:** returned base64 image shows ONLY Firefox-in-Xephyr; bounds 1920x1080.
- **TICK:** `C`.

### Step 4.5 — List displays mid-flow → satisfies D

- Ask: _"List all displays."_
- **VERIFY:** array includes `:N`; `running_apps` contains the Firefox PID from Step 4.3.
- **TICK:** `D`.

### Step 4.6 — Owner-scope kill ALLOWED → satisfies E

- Ask: _"Close display `:N`."_
- **VERIFY:** result `{ok:true, killed_apps_count:1}`; the **Xephyr window VANISHES** from operator's desktop. This is THE wire-level proof of the singleton `handles.get(':N')` path (vs. the D-248-01-D probe E.4 limitation — see consolidated doc §7).
- **TICK:** `E`. Optional probes:
  ```bash
  ssh bruce@10.69.31.68 'redis-cli SCAN luse:display:*'
  # Expected: empty
  ssh bruce@10.69.31.68 'pgrep -af Xephyr'
  # Expected: no :N process
  ```

### Step 4.7 — Owner-scope kill DENIED → satisfies F (or [~] N/A single-tenant)

- This requires a SECOND Liv AI session with a different `LUSE_USER_ID`. On single-tenant Mini PC this is **N/A** — mark `[~] N/A single-tenant — drift-locked by 248-01 Case 11 + 248-02 Case G` in the consolidated doc.
- If multi-tenant is enabled: open a second browser (incognito + different user), create a display in session-1, try to kill it from session-2 → expect MCP error matching `not-owner — only the session that called computer_create_display can kill this display (D-V44-DISPLAY-OWNER-SCOPED)`.
- **TICK:** `F` (or mark `[~] N/A` per above).

### Step 4.8 — computer_application + display arg → satisfies G

- Ask: _"Open gnome-calculator on a new Xephyr display."_
- **VERIFY:** agent creates display `:M`, then calls `computer_application({application:'gnome-calculator', display:':M'})`. Calc appears **INSIDE** the Xephyr window. Ask agent to clean up (`computer_kill_display({display:':M'})`).
- **TICK:** `G`.

---

## 5. Optional steps (skip unless operator has time)

### Step 5.1 — OPT-1 24h GC fast-forward (Phase 246)

- SSH:
  ```bash
  ssh bruce@10.69.31.68 'redis-cli -a "<pw>" HSET livos:pty:session:<id> lastAttachAt 2026-04-01T00:00:00Z'
  # wait up to 1h for the next ttl-gc sweep
  ssh bruce@10.69.31.68 'journalctl -u livos.service --since "1 hour ago" | grep "ttl-gc: killed idle session"'
  ```
- **VERIFY:** a `ttl-gc: killed idle session {id ...}` line appears; metadata key is gone after.
- **TICK:** `OPT-1`.

### Step 5.2 — OPT-2 rollback rehearsal (Phase 246)

- SSH:
  ```bash
  ssh bruce@10.69.31.68 'redis-cli -a "<pw>" SET livos:v43:terminal_panel false'
  # confirm UI: dock entry hidden + admin "Active terminals" panel hidden
  ssh bruce@10.69.31.68 'redis-cli -a "<pw>" SET livos:v43:terminal_panel true'
  ```
- **VERIFY:** both the Terminal dock entry AND the Settings → Active terminals panel vanish/return atomically.
- **TICK:** `OPT-2`.

### Step 5.3 — Item H Xvfb headless (Phase 248)

- Ask Liv AI: _"Create a headless Xvfb display."_
- **VERIFY:** NO window appears on the operator's desktop. Probe `ssh bruce@10.69.31.68 'xdpyinfo -display :N'` succeeds.
- Clean up: ask the agent to kill it.
- **TICK:** `H`.

### Step 5.4 — Item I 4h TTL (Phase 248)

- Long-running. **Skip unless operator can park for 4+ hours.** Alternative: rely on 8/8 vitest in 248-03.
- If walked: create a display, do NOT attach any app, wait 4h+1m, then SSH:
  ```bash
  ssh bruce@10.69.31.68 'journalctl -u livos --since "5 minutes ago" | grep "display-ttl-gc: killed idle display"'
  # Expected line: {display:':N', idleAgeMs:>14400000, owner_session:'bruce'}
  ```
- **TICK:** `I` or skip explicitly.

---

## 6. Phase 247 belt-and-braces (1 min — optional)

- SSH:
  ```bash
  ssh bruce@10.69.31.68 'cd /opt/livos && bash scripts/sync-luse-skills.sh'
  ```
- **VERIFY:** last summary line is approximately `Synced 20 shims (0 new / 0 updated / 20 unchanged)` (full idempotency).
- **TICK:** Phase 247 row in consolidated doc as `[~] drift-locked + idempotency re-confirmed`.

---

## 7. Close procedure

Once §3, §4 mandatory steps are all GREEN and the operator has filled in `.planning/v44-UAT-CONSOLIDATED.md` §10 audit trail:

1. Open `.planning/v44-UAT-CONSOLIDATED.md` and confirm every mandatory row has `[x]` (or `[~] N/A` with explicit rationale for item F only).

2. From the repo root (host with this checkout):
   ```bash
   bash scripts/close-v44-when-uat-green.sh
   ```

3. The script will:
   - Verify `.planning/v44-UAT-CONSOLIDATED.md` exists.
   - Verify the repo sacred SHA (`f3538e1d...`).
   - Refuse to run if any mandatory `[ ]` rows remain.
   - Verify the Mini PC AionUi binary sha256 (`293a49927b...`) if SSH is reachable.
   - Archive v44 SUMMARYs + consolidated doc + walk doc to `.planning/milestones/v44/`.
   - Generate `.planning/milestones/v44/v44-MILESTONE-CLOSED.md`.
   - Print the next manual step: `/gsd-complete-milestone v44.0`.

4. After GSD completes:
   ```bash
   git add .planning/ scripts/close-v44-when-uat-green.sh
   git commit -m "docs(v44): close milestone — operator UAT GREEN"
   git tag v44.0
   ```

---

## 8. If a UAT item FAILS

- **Do NOT proceed to close.**
- Capture diagnostic evidence:
  - Browser DevTools Console errors (red text — copy the full stack).
  - DevTools Network WS frames (right-click → "Save as HAR with content").
  - Mini PC journal:
    ```bash
    ssh bruce@10.69.31.68 'journalctl -u livos --since "5 minutes ago" -n 200'
    ssh bruce@10.69.31.68 'journalctl -u liv-assistant --since "5 minutes ago" -n 200'
    ```
- Open a new phase (250+) for the regression with the captured evidence.
- Leave Phase 249 in `⏳ ARTIFACT-COMPLETE / OPERATOR-PENDING` (do NOT flip ROADMAP).
- Do NOT flip the v44.0 milestone status.

---

## 9. Walk-step → UAT-id cross-reference (quick lookup)

| Step | Surface     | UAT item(s) satisfied |
| ---- | ----------- | --------------------- |
| 3.1  | Terminal    | → UAT-1               |
| 3.2  | Terminal    | → UAT-2               |
| 3.3  | Terminal    | → UAT-3               |
| 3.4  | Terminal    | → UAT-4               |
| 3.5  | Settings    | → UAT-5               |
| 3.6  | Settings    | → UAT-6               |
| 3.7  | Terminal    | → UAT-7               |
| 4.2  | Liv AI      | → A                   |
| 4.3  | Liv AI      | → B                   |
| 4.4  | Liv AI      | → C                   |
| 4.5  | Liv AI      | → D                   |
| 4.6  | Liv AI      | → E                   |
| 4.7  | Liv AI      | → F (or [~] N/A)      |
| 4.8  | Liv AI      | → G                   |
| 5.1  | SSH         | → OPT-1               |
| 5.2  | SSH + UI    | → OPT-2               |
| 5.3  | Liv AI      | → H                   |
| 5.4  | Liv AI + SSH | → I                  |
| 6    | SSH         | satisfies 247-OPT-1   |
