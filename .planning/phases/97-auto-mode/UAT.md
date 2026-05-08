# Phase 97 — Auto Mode UAT

End-to-end walk-through against the Mini PC LivOS deploy
(`bruce@10.69.31.68`). Run after `bash /opt/livos/update.sh` has shipped
the P97 commits.

## Pre-flight

- [ ] **Sacred SHA pre-check**: on a clean repo,
  `bash scripts/verify-sacred-sha.sh` returns PASS.
- [ ] Mini PC has `maim`, `xdotool`, `xclip`, `wmctrl` installed
  (`which maim && which xdotool` returns non-empty paths).
- [ ] `update.sh` ran cleanly; `systemctl status livos liv-core` shows
  both services active.
- [ ] User is logged in as `bruce` on the Mini PC console (X11 session,
  not headless).

## Step-by-step

### 1. Open a WebApp (P94 + P95)

1. Open the LivOS UI in a browser, sign in as the admin user.
2. Click **+ Add WebApp**, choose any saved WebApp (or create one with a
   simple URL like `https://example.com`).
3. Confirm the streaming panel renders the live Chrome window.
4. Server-side: `xdotool search --name "LivOS WebApp"` returns at least
   one wid. Note it.

| Step | PASS / FAIL | Notes | Deviation? |
|------|-------------|-------|------------|
| WebApp opened, wid captured | | | |

### 2. Switch to Teach mode and record (P96)

1. Click the mode pill, switch to **Teach**.
2. Inside the WebApp, perform a small skill: 3 clicks (e.g. on
   `<a>` links) + 1 keystroke (Tab or Enter on a focused button).
3. Click **Save**, give it a name (e.g. `uat-test-skill-1`).
4. Confirm the skill appears in the sidebar list.
5. Server-side:
   `psql -d livos -c "SELECT id, skill_name, jsonb_array_length(action_log->'events') AS n FROM webapp_skills ORDER BY created_at DESC LIMIT 1;"`
   shows the new row with the right event count.

| Step | PASS / FAIL | Notes | Deviation? |
|------|-------------|-------|------------|
| Teach mode entered | | | |
| Recording captured >= 4 events | | | |
| Skill saved + visible | | | |
| webapp_skills row inserted | | | |

### 3. Switch to Auto mode and Run

1. Click the mode pill, switch to **Auto**.
2. Pick the saved skill from the dropdown.
3. (Optional) Type a free-form goal in the text field.
4. Click **Run**.
5. Watch the live event stream in the AI panel.

Expected:
- The wrapper auto-invokes `webapp_replay_skill` (or prepends the rendered
  block to the first user task — P97-06 path). The agent's first turn
  references at least one detail from the recorded skill (e.g. mentions
  "click at (X, Y)").
- The first two recorded steps are replayed against the live window via
  `maim -i <wid>` + `xdotool --window <wid>` (visible in the Chrome
  window — the cursor moves and clicks happen *inside* the WebApp).
- Each step is followed by a `validation:pass` line.

| Step | PASS / FAIL | Notes | Deviation? |
|------|-------------|-------|------------|
| Run started, agent referenced skill | | | |
| First recorded step replayed against the right window | | | |
| Second recorded step replayed | | | |
| `validation:pass` line observed | | | |

### 4. Force needs_help

1. Mid-run, manually close the target tab in Chrome (the page content
   the recording was made against).
2. The next step should validate-fail. Wait through 3 consecutive fails.
3. Expected: a `needs_help` SSE chunk appears in the panel; the run
   pauses (no further turns dispatched).
4. Type a chat message to resume.

| Step | PASS / FAIL | Notes | Deviation? |
|------|-------------|-------|------------|
| 1st validation:fail observed | | | |
| 2nd validation:fail observed | | | |
| 3rd validation:fail → needs_help chunk | | | |
| Run paused (no further turns) | | | |
| User message resumes the run | | | |

### 5. Soft cap rejection

1. Open a 4th WebApp and try to start an Auto-mode run on it while 3
   others are active.
2. Expected: clean UI error message, NOT a generic 500. Backend log
   should include `MCP_INSTANCE_CAP_EXCEEDED`.

| Step | PASS / FAIL | Notes | Deviation? |
|------|-------------|-------|------------|
| 4th Auto-start rejected | | | |
| Error code surfaced | | | |

### 6. Idle reap on Chrome window close

1. With one Auto-mode run active, close the WebApp's Chrome window.
2. Within 60s the per-WebApp bytebot MCP child process should exit.
3. Verify with: `ps -ef | grep BYTEBOT_TARGET_WINDOW_ID` — should no
   longer list the closed instance.

| Step | PASS / FAIL | Notes | Deviation? |
|------|-------------|-------|------------|
| Chrome window closed | | | |
| Per-WebApp MCP child gone within 60s | | | |

### 7. Host-display ad-hoc still works

1. Outside any WebApp, in a chat session, ask the agent to run a
   computer-use action against the host display (e.g. `take a screenshot`).
2. Expected: works exactly as it did pre-P97 — the host-display
   `bytebot` MCP server (no `:webapp:` suffix) handles it; tools have
   no windowId default.

| Step | PASS / FAIL | Notes | Deviation? |
|------|-------------|-------|------------|
| Host-display screenshot works | | | |

## Sacred close-out

Run this at the end of the UAT, after every step is PASS or has a
P98-targeted carryover note:

```
$ bash scripts/verify-sacred-sha.sh
[verify-sacred-sha] PASS: liv/packages/core/src/sdk-agent-runner.ts = f3538e1d811992b782a9bb057d1b7f0a0189f95f

$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Both outputs MUST match. Locked SHA: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

## Carryover

Anything filed as "deviation" above goes into a P98 plan, not a P97 fix.
Out-of-scope per 97-CONTEXT:
- Auto-redact of sensitive content in skill context (deferred per Q3).
- Per-step structured tags (deferred to v34).
- Cross-WebApp shared skills.
- Mobile UI / voice goal entry.
