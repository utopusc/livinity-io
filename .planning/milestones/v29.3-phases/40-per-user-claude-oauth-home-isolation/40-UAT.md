# Phase 40 Manual UAT — Per-User Claude OAuth + HOME Isolation

**Status:** Deferred to user's deploy cycle (per scope_boundaries — NO deployment in Phase 40 executor scope).
**Run on:** Mini PC (`bruce@10.69.31.68`) only. Server4 / Server5 are OFF-LIMITS (per project hard rule).
**Prereq:**
- `bash /opt/livos/update.sh` has been run after Phase 40 ships, so livinityd + nexus are rebuilt + restarted with the Phase 40 changes.
- Wildcard cert for `*.livinity.io` is set up (multi-user mode requires it; CF_API_TOKEN must be in Caddy systemd service env per MEMORY.md).

---

## Pre-Flight Checks (5 min)

A. SSH to Mini PC: `ssh -i ~/.ssh/minipc bruce@10.69.31.68`.

B. Confirm Phase 40 code is on-server:
   ```bash
   git -C /tmp/livinity-update-* log --oneline | head -8
   ```
   Expect to see commits `40-01`, `40-02`, `40-03`, `40-04`, `40-05`.

C. Confirm services are running:
   ```bash
   systemctl status livos liv-core liv-worker liv-memory --no-pager | grep -E "Active|Loaded"
   ```
   All four must be `Active: active (running)`.

D. Confirm `claude` CLI is on PATH:
   ```bash
   which claude
   ```
   If missing, `claude` CLI install is required before per-user UAT can run.

---

## ROADMAP Success Criteria — Manual Verification Steps

### Criterion 1: User A login independent of User B (FR-AUTH-01)

1. Enable multi-user mode: open https://bruce.livinity.io > Settings > Users > "Enable multi-user mode" toggle. (Confirms `livos:system:multi_user = 'true'` in Redis.)
2. Create two users: `user-a` (admin) and `user-b` (member). Note their PostgreSQL UUIDs:
   ```bash
   sudo -u postgres psql livos -c "SELECT id, username, role FROM users WHERE username IN ('user-a','user-b');"
   ```
3. Log in as `user-a` in Browser 1 (e.g., `https://user-a.livinity.io`).
4. As `user-a`: navigate to Settings > AI Configurations > Claude Account (per-user subscription) > "Sign in with Claude sub".
5. Verify the device-code prompt appears with verification URL + user code. Open the URL, enter the code, complete OAuth on `claude.ai`.
6. Verify the card flips to "Connected — your Claude subscription".
7. Verify on Mini PC:
   ```bash
   ls -la /opt/livos/data/users/<A_user_id>/.claude/.credentials.json
   ```
   Expect: file exists, owner is the livinityd Linux user (typically `bruce`), parent dir mode `drwx------` (0700).
8. In Browser 2, log in as `user-b` (e.g., `https://user-b.livinity.io`). Settings > AI Configurations > Claude Account (per-user subscription). Status should be "Not connected".
9. Verify B's per-user dir does NOT exist yet:
   ```bash
   ls /opt/livos/data/users/<B_user_id>/.claude/  # ENOENT expected
   ```
10. As `user-b`: complete the OAuth flow (different `claude.ai` account or different user code).
11. Verify B's dir now exists:
    ```bash
    ls -la /opt/livos/data/users/<B_user_id>/.claude/.credentials.json
    ```
12. Verify A's status remains "Connected" — B's flow did NOT affect A.

### Criterion 2: Cross-user file read isolation (FR-AUTH-01 — honest framing per D-40-05)

13. SSH to Mini PC as `bruce`. As `bruce` (livinityd's UID), confirm both files are readable:
    ```bash
    cat /opt/livos/data/users/<A_user_id>/.claude/.credentials.json
    cat /opt/livos/data/users/<B_user_id>/.claude/.credentials.json
    ```
    **This is EXPECTED.** Synthetic isolation = livinityd-application-layer enforced, NOT POSIX-enforced. All per-user dirs share the same UID (the livinityd process owner). See D-40-05.

14. Confirm livinityd application layer NEVER attempts to read user A's file from user B's request:
    ```bash
    sudo journalctl -u livos -f | grep "per-user claude"
    ```
    While tailing, log in as B in another window and click Sign In. Observe the verbose log line includes `user=<B_user_id>` only. No log line should reference `<A_user_id>` from B's session.

### Criterion 3: HOME=/opt/livos/data/users/A/.claude in subprocess env (FR-AUTH-03)

15. As `user-a`, click "Sign in with Claude sub" again in another browser window — keep the device-code prompt visible (don't complete it yet).
16. Quickly find the spawned `claude login` PID:
    ```bash
    ps -ef | grep "claude login" | grep -v grep
    ```
17. Inspect the env:
    ```bash
    sudo cat /proc/<PID>/environ | tr '\0' '\n' | grep '^HOME='
    ```
    **Expected:** `HOME=/opt/livos/data/users/<A_user_id>/.claude`
    **Cancel** the in-flight login from the UI to clean up the subprocess.

18. **NOTE about AI Chat scope:** Phase 40 only routes `homeOverride` through the explicit `claude login` subprocess in `spawnPerUserClaudeLogin`. Wiring `homeOverride` through `/api/agent/stream` (so the AI Chat `SdkAgentRunner` subprocess also gets per-user HOME) requires nexus's HTTP boundary to receive `user_id` from livinityd — that's **Phase 41 broker scope**.
    If you open AI Chat as user A and check `ps -ef | grep claude` for the chat subprocess, you may see `HOME=/root` (or whatever livinityd's process HOME is) — that is **NOT a Phase 40 regression**. It is the expected state until Phase 41 lands.

### Criterion 4: Settings UI per-user status accuracy + no API key field (FR-AUTH-02)

19. As `user-a`: Settings > AI Configurations. Verify the card title reads "Claude Account (per-user subscription)" (not "Claude Account").
20. Verify NO "Enter API key" / "sk-ant-..." input field is rendered in the per-user card. (DOM grep in browser DevTools: search for `placeholder="sk-ant-"` → should return ZERO matches in this card.)
21. Click Sign Out. Verify status flips to "Not connected" / "Sign in" within ~5 seconds (the mutation invalidates `claudePerUserStatus` query, triggering a refetch).
22. As `user-b` in Browser 2: verify B sees their OWN status (NOT A's). Status is "Connected" (from steps 10-11). Sign Out and verify B's status flips independently.

---

## Single-User Mode Regression (D-40-07)

23. Disable multi-user mode (Settings > Users → toggle off, or directly `redis-cli SET livos:system:multi_user false`).
24. Restart livinityd: `sudo systemctl restart livos`.
25. Log in as admin (legacy single-user path).
26. Verify Settings > AI Configurations > Claude card shows the EXISTING single-user UX:
    - Card title: "Claude Account" (NOT "(per-user subscription)").
    - "Sign in with Claude" button (Nexus PKCE OAuth path).
    - "API Key" / "sk-ant-..." input field present.
    - All existing single-user controls intact.
27. Verify the per-user card variant is NOT shown (because `claudePerUserStatusQ.data?.multiUserMode === false`).

---

## Pass / Fail

- **All 27 steps pass** → Phase 40 complete; Phase 41 (Anthropic Messages Broker) ready to plan.
- **Any step fails** → file a Phase 40 hot-patch follow-up; do not advance to Phase 41 until resolved. Capture screenshots + journalctl excerpts when filing.

## Operator Notes

- The 5-minute timeout on `spawnPerUserClaudeLogin` is hardcoded. If the Claude CLI device flow ever takes longer than 5 minutes in practice (rare; usually it's under 60s), bump the timeout in `livos/packages/livinityd/source/modules/ai/per-user-claude.ts:204`.
- The device-code regex in `per-user-claude.ts:158-160` is permissive but version-dependent. If a future `claude` CLI release changes the prompt format ("Visit X / enter code: Y") and the UI never displays a device code, check the verbose logs (`journalctl -u livos | grep "per-user claude login"`) to see the raw stdout, then update the regex.
- Per-user `.credentials.json` files are managed by the `claude` CLI itself — token refresh, re-auth, etc. all happen inside the CLI's lifecycle. LivOS does not poll or pre-empt; on-failure detection only.
