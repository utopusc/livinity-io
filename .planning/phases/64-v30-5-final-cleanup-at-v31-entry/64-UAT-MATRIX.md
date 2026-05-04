# 64-UAT-MATRIX — v29.3 + v29.4 + v29.5 carryforward UAT classification

**Phase:** 64-v30-5-final-cleanup-at-v31-entry
**Plan:** 64-02
**Generated:** 2026-05-04
**Source:** 14 carryforward UAT/VERIFICATION/AUDIT files across `.planning/milestones/v29.{3,4,5}-phases/`

---

## Discipline rule

Per memory `feedback_milestone_uat_gate.md` — the canonical UAT-discipline
rule for this project — no UAT originally marked `human_needed` is allowed
to be silently re-classified as `passed` / `script-verified` here.

The v29.4 disaster (audit said "passed" with 4× `human_needed` VERIFICATION.md,
milestone closed, deploy succeeded — but live behavior had 4 critical
regressions) is the canonical anti-pattern this matrix exists to prevent
from recurring at v30.5 close.

**Hard rule (D-05):** Any UAT that fundamentally requires a real browser
(UI rendering, PWA cache, click-flows, install dialogs, DOM-grep, modal
walk-throughs, mobile/cellular toggle, copy-to-clipboard) is classified
`needs-human-walk` even if "the backend looks healthy." Scriptable means:
API curl, systemctl, redis-cli, psql output, git hash-object, file-existence
checks. Anything browser-dependent → `needs-human-walk`, NEVER
`script-verified`.

**Reference:**
- `.planning/v29.4-REGRESSIONS.md` — autopsy of the milestone-without-UAT failure mode
- `feedback_milestone_uat_gate.md` — canonical discipline memory

---

## Vocabulary (aligned with VERIFICATION.md `status:` convention)

| Status            | Means                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| `script-verified` | Backend evidence observed (curl/systemctl/redis/psql output cited in Evidence section)         |
| `needs-human-walk`| Requires real browser interaction or click-flow; cannot be automated; user walks on Mini PC    |
| `failed`          | Regression / observed failure that was never closed                                            |
| `obsolete`        | Superseded by later phase, scope removed, or D-NO-SERVER4 forbids                              |

---

## Matrix

| #  | Milestone | Phase                                            | Source file                                                                              | Status              | Evidence summary                                                                                                                |
|----|-----------|--------------------------------------------------|------------------------------------------------------------------------------------------|---------------------|---------------------------------------------------------------------------------------------------------------------------------|
| 1  | v29.3     | 39 — risk-fix-close-oauth-fallback               | `.planning/milestones/v29.3-phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md`         | `script-verified`   | Read-only caller-inventory audit; no UI/runtime UAT; verifiable by `grep` + `git hash-object` per the audit's own Section 5     |
| 2  | v29.3     | 40 — per-user-claude-oauth-home-isolation        | `.planning/milestones/v29.3-phases/40-per-user-claude-oauth-home-isolation/40-UAT.md`    | `needs-human-walk`  | 27-step browser walkthrough (multi-user toggle, OAuth device-code prompt, 2 browsers, Settings click flows)                     |
| 3  | v29.3     | 41 — anthropic-messages-broker                   | `.planning/milestones/v29.3-phases/41-anthropic-messages-broker/41-UAT.md`               | `needs-human-walk`  | Sections A-I require 2 OAuth-completed users + browser-driven AI Chat (Section G) + cross-user HOME isolation walks             |
| 4  | v29.3     | 42 — openai-compatible-broker                    | `.planning/milestones/v29.3-phases/42-openai-compatible-broker/42-UAT.md`                | `needs-human-walk`  | Sections D-1/D-2 require live OAuth user + Python `openai` SDK round-trip; depends on Phase 41 UAT having passed first          |
| 5  | v29.3     | 43 — marketplace-integration-anchor-mirofish     | `.planning/milestones/v29.3-phases/43-marketplace-integration-anchor-mirofish/43-UAT.md` | `obsolete`          | MiroFish was DELETED from `apps` table per Phase 52 migration `0010_drop_mirofish.sql` (FR-MARKET-02 anchor no longer exists)   |
| 6  | v29.3     | 44 — per-user-usage-dashboard                    | `.planning/milestones/v29.3-phases/44-per-user-usage-dashboard/44-UAT.md`                | `needs-human-walk`  | Settings → AI Configuration → Usage section UI rendering + per-app table + admin cross-user filter chips                        |
| 7  | v29.4     | 45 — carry-forward-sweep                         | `.planning/milestones/v29.4-phases/45-carry-forward-sweep/45-VERIFICATION.md`            | `needs-human-walk`  | Source frontmatter `status: human_needed` (D-05 forbids elevation). FR-CF-04 requires live OpenAI Python SDK round-trip         |
| 8  | v29.4     | 46 — fail2ban-admin-panel                        | `.planning/milestones/v29.4-phases/46-fail2ban-admin-panel/46-UAT.md`                    | `needs-human-walk`  | 9 sections of UI walks: sidebar render, banners, modal flows, mobile cellular toggle, click-to-ban — pure browser surface       |
| 9  | v29.4     | 47 — ai-diagnostics                              | `.planning/milestones/v29.4-phases/47-ai-diagnostics/47-UAT.md`                          | `needs-human-walk`  | Diagnostics 3-card UI render + Capability Registry + Model Identity verdict + cross-user `app_not_owned` probe via DOM          |
| 10 | v29.4     | 48 — live-ssh-session-viewer                     | `.planning/milestones/v29.4-phases/48-live-ssh-session-viewer/48-UAT.md`                 | `needs-human-walk`  | WS live-tail UI tab + click-to-copy + click-to-ban modal cross-link + scroll-tolerance + RBAC 4403 close                        |
| 11 | v29.5     | 49 — mini-pc-diagnostic                          | `.planning/milestones/v29.5-phases/49-mini-pc-diagnostic/49-VERIFICATION.md`             | `failed`            | Source frontmatter `status: human_needed`; SSH BLOCKED by fail2ban self-ban; Mini PC capture never completed (3/5, 1 BLOCKED)   |
| 12 | v29.5     | 50 — a1-tool-registry-seed                       | `.planning/milestones/v29.5-phases/50-a1-tool-registry-seed/50-VERIFICATION.md`          | `needs-human-walk`  | Source frontmatter `status: passed` (mechanism); FR-A1-03 + FR-A1-04 explicitly DEFERRED to Phase 55 live walk; live AI Chat    |
| 13 | v29.5     | 51 — a2-streaming-fix                            | `.planning/milestones/v29.5-phases/51-a2-streaming-fix/51-VERIFICATION.md`               | `needs-human-walk`  | Source `status: human_needed`. Token-by-token streaming visible in browser AI Chat is the only valid test (no automatable proxy)|
| 14 | v29.5     | 52 — a3-marketplace-state                        | `.planning/milestones/v29.5-phases/52-a3-marketplace-state/52-VERIFICATION.md`           | `needs-human-walk`  | Source `status: passed` (DB mechanism); FR-A3-03 browser visit to apps.livinity.io to confirm Bolt.diy renders, MiroFish gone   |

---

## Per-row evidence

### Row 1 — Phase 39 (v29.3) — risk-fix-close-oauth-fallback

**Status:** `script-verified`
**Source:** `.planning/milestones/v29.3-phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md`
**Why eligible:** This is a read-only caller-inventory audit produced by Plan 39-01. The "verification" deliverable is a tabular grep inventory + a sacred-file SHA pin. There is no runtime UAT — no UI, no curl, no service-state assertion. The audit itself is its own verification artifact (Section 6 "Verification Status" is fully checked).
**Evidence (commands citable from the audit's own Section 5 + 6):**
```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
# Expected: 2b3b005bf1594821be6353268ffbbdddea5f9a3a (audit baseline)
# Note: this baseline has since been re-pinned in Phase 45 to
# 4f868d318abff71f8c8bfbcf443b2393a553018b — both SHAs are valid
# audit baselines for their respective phase windows.

grep -rn "authToken:" nexus/ livos/ --include="*.ts"
# Expected: zero matches outside claude.ts:94 + claude.ts:110 (the two
# lines Plan 39-02 deleted)

grep -rn "\.getClient(" nexus/packages/core/src/providers/claude.ts
# Expected: 2 self-callers only (chat() + chatStream())
```
**Caveat:** This is the only row in the matrix where `script-verified` is honest because the source artifact is itself a static inventory, not a behavior assertion. All other phases produce runtime claims that need either a live curl/redis-cli or a browser walk.

---

### Row 2 — Phase 40 (v29.3) — per-user-claude-oauth-home-isolation

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.3-phases/40-per-user-claude-oauth-home-isolation/40-UAT.md`
**Why human-walk:** 27-step browser-driven walkthrough. Includes: multi-user mode toggle in Settings UI, OAuth device-code visual prompt rendering, two-browser concurrent login (User A + User B), Settings → AI Configurations card flips, DOM-grep for `placeholder="sk-ant-"` absence, per-user subdomain navigation (`https://user-a.livinity.io`). None of this is reducible to a curl command; the OAuth device flow itself requires a human visiting `claude.ai`, entering the user code, and completing the consent screen.

**Manual steps (abbreviated — see source 40-UAT.md for full 27 steps):**
1. SSH `bruce@10.69.31.68`; verify `livos liv-core liv-worker liv-memory` all `Active: active (running)` and `which claude` resolves on PATH.
2. Open `https://bruce.livinity.io` → Settings → Users → toggle "Enable multi-user mode" ON. Confirm Redis: `redis-cli SET livos:system:multi_user true` (or check existing value).
3. Create users `user-a` (admin) and `user-b` (member); capture their PG UUIDs.
4. Browser 1: log in as user-a. Settings → AI Configurations → Claude Account (per-user subscription) → "Sign in with Claude sub". Visit device-code URL on `claude.ai`, enter code, complete OAuth.
5. Verify card flips to "Connected — your Claude subscription". On Mini PC: `ls -la /opt/livos/data/users/<A_UUID>/.claude/.credentials.json` (file exists, parent dir mode `drwx------`).
6. Browser 2 (different browser/incognito): repeat for user-b.
7. Verify A's card still shows "Connected" while B's flow runs (cross-user independence).
8. While a `claude login` subprocess is in flight: `ps -ef | grep "claude login"` → `sudo cat /proc/<PID>/environ | tr '\0' '\n' | grep '^HOME='` → expect `HOME=/opt/livos/data/users/<UUID>/.claude`.
9. DOM-grep verification: in user-a's Settings card, browser DevTools Console → search for `placeholder="sk-ant-"` → must return ZERO matches.
10. Single-user mode regression (D-40-07): toggle multi-user OFF → restart livos → verify legacy single-user "Claude Account" card with API key field reappears.

**Expected outcome:** All 27 steps pass per source UAT. Particular failure modes to watch: (a) `claude` CLI missing from PATH → step 1 blocks; (b) `CF_API_TOKEN` missing from Caddy systemd env → multi-user toggle has no wildcard cert; (c) device-code regex broken by future `claude` CLI version → step 8 finds no PID; (d) DOM-grep returns >0 matches → FR-AUTH-02 anti-API-key invariant violated.

---

### Row 3 — Phase 41 (v29.3) — anthropic-messages-broker

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.3-phases/41-anthropic-messages-broker/41-UAT.md`
**Why human-walk:** Sections A-D have curl-only smoke tests that LOOK scriptable, but the **prerequisites** require Phase 40's full browser-driven OAuth flow to have completed for at least 2 users. Section G ("AI Chat carry-forward") explicitly opens `https://<user2>.livinity.io/` in a browser and requires UI interaction. Section H toggles single-user mode via UI. Therefore the **UAT as a whole** requires a human walk; the curl smoke tests within it are necessary but not sufficient.

**Manual steps (abbreviated — see 41-UAT.md sections A-I):**
1. Prereq: Phase 40 UAT (Row 2) must already have passed; 2 users must already have completed `claude login` per-user OAuth.
2. SSH to Mini PC, get admin user UUID:
   `sudo -u livos psql livos -c "SELECT id FROM users WHERE role = 'admin' LIMIT 1;"`
3. Section A — sync `/v1/messages` smoke:
   ```bash
   curl -s -X POST http://127.0.0.1:8080/u/<ADMIN_ID>/v1/messages \
     -H 'content-type: application/json' \
     -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Reply with the single word: ok"}]}' | jq .
   ```
   Expect Anthropic Messages JSON shape with `stop_reason: "end_turn"`.
4. Section B — SSE streaming with `curl -N` and verify event order: `message_start` → `content_block_*` → `message_delta` → `message_stop`.
5. Section C — while step 4 streams, capture HOME of spawned `claude` PID via `cat /proc/<PID>/environ`. Expect `HOME=/opt/livos/data/users/<ADMIN_ID>/.claude`.
6. Section D — repeat C for a non-admin user (cross-user HOME isolation).
7. Section E — Docker container test: `docker run --rm --add-host=livinity-broker:host-gateway alpine sh -c "apk add curl && curl http://livinity-broker:8080/u/<ADMIN_ID>/v1/messages ..."`.
8. Section G — open `https://<user2>.livinity.io/` in a real browser, log in as User 2, trigger AI Chat with any prompt; capture HOME of `claude` PID and verify it points to user 2's per-user dir.
9. Section H — toggle multi-user OFF → restart livos → trigger AI Chat as admin → verify HOME=/root (legacy path).

**Expected outcome:** Sections A-D + F-H pass per UAT. Section G is the only one that requires UI interaction (per-user subdomain login + AI Chat trigger); the rest can be batched into one SSH session if Phase 40 has already completed.

**Why not `script-verified` even though A-D look automatable:** The "verification" is the cross-user HOME isolation INVARIANT, which depends on `homeOverride` being correctly resolved per-request. The only way to know this works end-to-end is to actually log in as 2 different users in 2 different browsers and trigger chats — Section G is the keystone. Curls without that are partial.

---

### Row 4 — Phase 42 (v29.3) — openai-compatible-broker

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.3-phases/42-openai-compatible-broker/42-UAT.md`
**Why human-walk:** Section D is the FR-BROKER-O-04 acceptance gate — it requires running the official `openai` Python SDK against the broker. While "running a Python script" sounds automatable, (a) the prerequisite is at least one Phase 40 OAuth user, (b) Section A explicitly says "Run **Phase 41's UAT Sections A + C + D + E** first" — which is itself `needs-human-walk` per Row 3. Since this UAT inherits Row 3's browser dependencies as prerequisites, it inherits `needs-human-walk` status.

**Manual steps (abbreviated — see 42-UAT.md):**
1. Prereqs: Rows 2 + 3 (Phase 40 + 41 UATs) must have passed; multi-user mode ON; ≥1 OAuth-completed user.
2. Section B-1 — sync `/v1/chat/completions` with `model: "gpt-4"`. Expect `id: chatcmpl-...`, `object: chat.completion`, model echoes `gpt-4` (NOT remapped to `claude-sonnet-4-6`), `choices[0].message.content` contains `SMOKE OK`.
3. Section B-2 — sync with `model: claude-sonnet-4-6` pass-through alias; expect `model` field echoes verbatim.
4. Section B-3 — sync with unknown model `foobar-llm`; expect 200 + warn log line in `journalctl -u livos | grep "unknown model"`.
5. Section C — streaming `curl -N` with `stream:true`; expect every chunk has `data: ` prefix, `object:chat.completion.chunk`, terminal `data: [DONE]`.
6. Section D-1 — install `openai` Python SDK on Mini PC: `python3 -m pip install --user openai`. Run `/tmp/openai-smoke-sync.py` — expect Claude's response printed, NO exception.
7. Section D-2 — run `/tmp/openai-smoke-stream.py` — expect chars stream out, terminate cleanly with newline.
8. Section E negative paths: unknown user_id → 404; empty messages → 400 OpenAI error shape; client `tools` field → 200 + warn log.

**Expected outcome:** B + C curls pass via single SSH session. D-1 + D-2 = the FR-BROKER-O-04 acceptance gate. E negatives are quick.

---

### Row 5 — Phase 43 (v29.3) — marketplace-integration-anchor-mirofish

**Status:** `obsolete`
**Source:** `.planning/milestones/v29.3-phases/43-marketplace-integration-anchor-mirofish/43-UAT.md`
**Why obsolete:** Phase 52 (Row 14) shipped migration `platform/web/src/db/migrations/0010_drop_mirofish.sql` that DELETED MiroFish from the Server5 `apps` table. The UAT's anchor (FR-MARKET-02 — MiroFish end-to-end install with subscription) no longer applies because there is no MiroFish app in the marketplace to install.

**Rationale:**
- Per `52-VERIFICATION.md`: "MiroFish: 0 rows (was 1 — DELETED with 14 install_history FK rows cascaded)"
- Source UAT Section A.2: "MiroFish manifest is in the sibling repo `utopusc/livinity-apps`. ... The sibling-repo PR must be MERGED into the default branch before this UAT can proceed." — this PR may not even exist anymore post-drop.
- Source UAT Section B steps 1-5 require MiroFish card to be visible in the LivOS marketplace UI. Per Phase 52, it isn't.

**Supersession pointer:** The marketplace integration mechanism (FR-MARKET-01 — `requiresAiProvider: true` flag injection of `ANTHROPIC_BASE_URL` / `LLM_BASE_URL` / `extra_hosts: livinity-broker`) is still valid — it can be re-validated against any other marketplace app that opts into the flag. But the MiroFish-specific anchor is dead.

**Carry-over for v31:** If a replacement marketplace AI-anchor app emerges (e.g., Suna's full app store presence — see `reference_server5_app_store.md`), re-run Sections C-G against that app. Until then, no replacement UAT exists.

---

### Row 6 — Phase 44 (v29.3) — per-user-usage-dashboard

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.3-phases/44-per-user-usage-dashboard/44-UAT.md`
**Why human-walk:** SC #1-#4 all require Settings → AI Configuration UI to render the Usage section, three stat cards, last-30-days bar chart, per-app table, admin "View as admin" filter chips, 80% warning banner, 429 critical banner. None of this is reducible to backend curls. Section G's sacred-file integrity check IS scriptable but is one bullet among many.

**Manual steps (abbreviated — see 44-UAT.md):**
1. Prereqs: Phase 43 marketplace integration deployed (now obsolete per Row 5); MiroFish installed for User A — **OR** use the synthetic-shortcut SQL inserts documented in Sections C/E/F.
2. Section A — deploy + verify livinityd logs show: `[usage-tracking] capture middleware mounted at /u/:userId/v1 (BEFORE broker)` (mount order matters).
3. Section B — schema verification: `psql livos -c "\\d broker_usage"` shows 9 columns; `\\di idx_broker_usage_*` shows 2 indexes.
4. Section C (SC #1) — log in as User A in browser; trigger an AI request through marketplace app (or use synthetic INSERT). Open Settings → AI Configuration → scroll to Usage section. Verify: 3 stat cards rendered, per-app table populated.
5. Section D (SC #2) — log in as admin; click "View as admin"; verify 3 filter chips + cross-user totals; log out → log in as non-admin → verify "View as admin" toggle is HIDDEN.
6. Section E (SC #3) — synthetic INSERT 161 rows; refresh Usage section; expect yellow banner "161/200 daily messages used (pro tier)".
7. Section F (SC #4) — synthetic INSERT one `endpoint='429-throttled'` row; refresh; expect red critical banner "Subscription cap reached (pro tier)" with UTC timestamp.
8. Section G — sacred-file integrity: `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → expect `623a65b9a50a89887d36f770dcd015b691793a7f` (Phase 40 baseline; subsequently re-pinned to `4f868d31...` in Phase 45).

**Expected outcome:** All 4 SCs pass via UI rendering. Synthetic shortcuts make data setup quick; the verification itself is browser-bound.

**Note on baseline drift:** The source UAT cites `623a65b9...` as the sacred-file SHA, which was the Phase 40 baseline. Phase 45 (`45-VERIFICATION.md`) re-pinned to `4f868d318abff71f8c8bfbcf443b2393a553018b`. When walking this UAT, accept either depending on which milestone the deploy snapshot reflects.

---

### Row 7 — Phase 45 (v29.4) — carry-forward-sweep

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.4-phases/45-carry-forward-sweep/45-VERIFICATION.md`
**Why human-walk (D-05 forced):** Source frontmatter `status: human_needed` (line 4). D-05 hard rule: NEVER silently elevate `human_needed` to `script-verified`. Two explicit `human_verification` items in the frontmatter:
1. FR-CF-04 — live OpenAI Python SDK round-trip with non-zero token counts in `broker_usage` row.
2. FR-CF-03 — `systemctl restart livos` mid-session, confirm `usage.getMine` + `ai.claudePerUserStartLogin` resolve via HTTP fallback within 2s of WS reconnect without UI hang.

**Manual steps:**
1. SSH to Mini PC. Confirm Phase 45 deployed: `cd /opt/livos && git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → expect `4f868d318abff71f8c8bfbcf443b2393a553018b`.
2. **Live token round-trip (FR-CF-04):** From Mini PC, run Phase 42's `openai-smoke-stream.py` against `http://127.0.0.1:8080/u/<USER_ID>/v1` with a real OAuth-completed user. Then:
   ```bash
   sudo -u postgres psql livos -c "SELECT prompt_tokens, completion_tokens, request_id, endpoint FROM broker_usage ORDER BY created_at DESC LIMIT 1;"
   ```
   Expect: `prompt_tokens > 0 AND completion_tokens > 0` (NOT both 0). The backward-compat fallback to 0 means a passing wire-format test could mask a nexus-side serialization gap; that's why this needs a live round-trip.
3. **WS reconnect survival (FR-CF-03):** Open `https://bruce.livinity.io` Settings tab in browser. SSH `sudo systemctl restart livos`. Within 2s of UI reconnecting, click controls that fire `usage.getMine` (refresh Usage section) and `ai.claudePerUserStartLogin` (Claude Account → Sign in). Verify both resolve without UI hang.

**Expected outcome:** Step 2 returns non-zero token counts (closes FR-CF-04 live gap). Step 3 mutations resolve via HTTP fallback (closes FR-CF-03 live gap). All other Phase 45 truths (sacred-file SHA, broker 429 forwarding, common.test.ts presence) are already verified by the test:phase45 chain.

---

### Row 8 — Phase 46 (v29.4) — fail2ban-admin-panel

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.4-phases/46-fail2ban-admin-panel/46-UAT.md`
**Why human-walk:** All 9 sections of the UAT are pure browser surface. Sidebar 13th-entry render, three service-state banners (yellow/red/yellow), modal open/close flows (Unban, Ban, Stage-2 self-ban gate, CIDR rejection client-side), audit log tab rendering, mobile cellular toggle, Settings backout toggle, WS reconnect mid-mutation, end-to-end SSH lockout recovery via UI alone. The headline value proposition ("operator goes from SSH-locked-out to back-in via UI alone") is intrinsically a UI walk.

**Manual steps (abbreviated — see 46-UAT.md sections 1-9):**
1. Pre-flight: deploy via `bash /opt/livos/update.sh`; verify `systemctl status livos liv-core liv-worker liv-memory` + `systemctl status fail2ban`. (`liv-memory` may already be in restart loop — pre-existing v29.3 issue, NOT a Phase 46 regression.)
2. **Section 1 — Sidebar registration:** Open `https://bruce.livinity.io` as admin. Server Management → expect "Security" as 13th sidebar item between "Activity" and "Schedules". Click → renders. `fail2ban.listJails` query polls every ~5s.
3. **Section 2 — Three banner states:** (a) `sudo systemctl stop fail2ban` → yellow banner appears within 6s; (b) `sudo mv /usr/bin/fail2ban-client /usr/bin/fail2ban-client.bak` → red "not installed" banner; (c) `mv /etc/fail2ban/jail.local jail.local.bak; systemctl restart fail2ban` → yellow "no jails configured" banner.
4. **Section 3 — Unban + whitelist:** SSH `sudo fail2ban-client set sshd banip 192.0.2.99`. UI shows row within 5s. Click Unban → modal with B-01 inline note. Verify whitelist checkbox UNCHECKED by default. Confirm. SSH verify ban removed and `get sshd ignoreip` does NOT include the IP. Re-ban .100, this time CHECK whitelist → verify .100 in `ignoreip`.
5. **Section 4 — Ban + self-ban gate (B-02 + B-03):** Normal ban of TEST-NET-2 IP `198.51.100.42`. Self-ban gate: type your current SSH source IP → expect Stage 2 modal demanding literal `LOCK ME OUT`. CIDR rejection: type `0.0.0.0/0` → client-side error, mutation does NOT fire (network tab confirms).
6. **Section 5 — Audit immutability:** UI Audit Log tab shows rows. `psql livos -c "SELECT * FROM device_audit_log WHERE device_id='fail2ban-host' LIMIT 5"` → rows present with `tool_name IN ('unban_ip','ban_ip','whitelist_ip')` and `params_digest` 64-char hex SHA-256. `UPDATE device_audit_log SET tool_name='tampered'` → expect trigger error.
7. **Section 6 — Mobile cellular toggle (B-19):** Open `https://bruce.livinity.io` on phone via cellular. Toggle "I'm on cellular" ON → expect self-ban gate suppressed.
8. **Section 7 — Settings backout (FR-F2B-06):** Settings → Advanced → "Security panel" toggle. ON by default → OFF hides sidebar entry without uninstalling fail2ban. PG row in `user_preferences` for key `security_panel_visible`.
9. **Section 8 — WS reconnect mid-mutation:** Open Security panel + DevTools Network. SSH `sudo systemctl restart livos`. Immediately click Ban an IP → POST to `/api/trpc/fail2ban.banIp` should fire on HTTP transport (NOT WS frame).
10. **Section 9 — End-to-end SSH lockout recovery:** From a different machine, force a self-ban via `sudo fail2ban-client set sshd banip <other-IP>`. From admin device, log into `https://bruce.livinity.io`, Security → Unban with whitelist checked. Retry SSH from formerly-banned machine → expect success.

**Expected outcome:** All 9 sections pass per UAT. The most important ones are 4b (LOCK ME OUT gate copy + literal-string equality) and 9 (end-to-end recovery without console access).

**Note on prior live regression:** Per `.planning/v29.4-REGRESSIONS.md` A4, the user reported "Fail2ban da yok kullaniclari manage edebilecegim" after v29.4 close — meaning the Security panel did NOT render for them. Phase 51's `update.sh` hardening (rm -rf dist + verify_build) and Phase 53's render fix should have closed this. This walk is what verifies the closure.

---

### Row 9 — Phase 47 (v29.4) — ai-diagnostics

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.4-phases/47-ai-diagnostics/47-UAT.md`
**Why human-walk:** SC-1 through SC-8 are all browser-driven. Diagnostics 3-card UI render, Capability Registry Re-sync atomic-swap (with concurrent Redis poll loop visualization), Model Identity verdict badge + JSON expand, App Health probe via UI mounting, cross-user `app_not_owned` probe via DevTools tRPC fire, RBAC sidebar hide for non-admin. None are reducible to a single curl.

**Manual steps (abbreviated — see 47-UAT.md SC-1 through SC-9):**
1. **SC-1 — 3 cards under shared scaffold:** Open `https://bruce.livinity.io` as admin → Settings → Diagnostics. Verify 3 cards: "Capability Registry", "Model Identity", "App health". DOM-verify shared `<div class="rounded-radius-sm border ...">` per D-DIAGNOSTICS-CARD. Log in as non-admin → verify Diagnostics sidebar entry HIDDEN.
2. **SC-2 — Capability Registry breakdown:** Capability Registry card text matches: `redis-cli --scan --pattern 'nexus:cap:tool:*' | wc -l`. If `web_search` lacks SERPER_API_KEY, card splits it into "Precondition: 1" not "Lost: 1".
3. **SC-3 — Re-sync atomic swap:** SSH terminal 1: poll loop `while true; do redis-cli GET 'nexus:cap:tool:shell' | head -c 30; sleep 0.05; done`. SSH terminal 2: `redis-cli DEL nexus:cap:tool:shell` to make button enable. UI: click Re-sync. Verify poll NEVER prints empty/nil during swap (atomic-swap invariant). Verify `redis-cli LRANGE nexus:cap:_audit_history 0 0` and `psql livos -c "SELECT tool_name, ... FROM device_audit_log WHERE tool_name='registry_resync' ORDER BY timestamp DESC LIMIT 1;"`.
4. **SC-4 — Model Identity diagnostic:** Click "Diagnose" on card. Wait 5-10s. Verdict badge displays one of: `clean`, `dist-drift`, `source-confabulation`, `both`, `inconclusive`. Click "Show 6 step results" → JSON renders → `step3_environSnapshot` has `*_KEY`/`*_TOKEN`/`*_SECRET`/`*PASS*`/`*API*` shown as `<redacted>`.
5. **SC-5 — Branch-N invariant:** SSH `cd /opt/livos && git log --oneline nexus/packages/core/src/sdk-agent-runner.ts | head -3` → no Phase 47 commits touch sacred file. `git hash-object` returns `4f868d318abff71f8c8bfbcf443b2393a553018b`.
6. **SC-7 — apps.healthProbe via UI:** Install Bolt.diy. Open app detail page. Click "Probe now" → response within 5s with all 5 fields populated. SSH `docker stop bolt-bruce` → re-probe → red error with `lastError ∈ {timeout, ECONNREFUSED, fetch_failed}`. Restart container, re-probe → green.
7. **SC-8 — Cross-user `app_not_owned` (G-04 BLOCKER):** Create second user (member). Log in as user 2. DevTools → fire tRPC `apps.healthProbe` with admin's app id (find via `psql -c "SELECT app_id, user_id FROM user_app_instances;"`). Expect `{reachable: false, lastError: 'app_not_owned'}`. Verify livinityd logs show NO outbound `fetch` was attempted. Repeat with `appId: 'totally-fake-id'` → same result.

**Expected outcome:** All SCs pass; SC-5 and SC-9 are N/A for Branch N (no source changes).

**Cross-reference to v29.4 regression:** A1 ("Tool registry — built-in tools missing") was diagnosed via this card showing `nexus:cap:tool:*` = 0 keys live. Phase 50 added `seed-builtin-tools.ts` boot wiring that should now populate ≥9 keys. This UAT, when walked, verifies the seed fix is visible in the Capability Registry card's "Built-ins: 9" count.

---

### Row 10 — Phase 48 (v29.4) — live-ssh-session-viewer

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.4-phases/48-live-ssh-session-viewer/48-UAT.md`
**Why human-walk:** WS-driven live tail UI is the entire feature. Steps 1-7 require: WS handshake visible in DevTools Network panel, live row append (within 1-2s of remote SSH attempt), click-to-copy with clipboard verification, click-to-ban modal cross-link with `initialIp` prepopulated, scroll-tolerance UX (`SCROLL_TOLERANCE_PX = 4`) + Resume tailing button, RBAC 4403 close on non-admin handshake. Step 8 IS scriptable (sacred-file integrity), step 9 IS scriptable (test:phase48 npm gate), but they are 2 of 9 steps.

**Manual steps (abbreviated — see 48-UAT.md steps 1-9):**
1. **Step 1 — UI loads:** Open `https://bruce.livinity.io` as admin → desktop → `LIVINITY_docker` → `Security` → `SSH Sessions` tab. Verify "Listening for SSH events…" empty-state, green Live badge, DevTools Network shows open WS to `wss://bruce.livinity.io/ws/ssh-sessions?token=...`, zero console errors.
2. **Step 2 — Live event:** From a 2nd machine: `ssh fakeuser@10.69.31.68 -o ConnectTimeout=3 -o BatchMode=yes 2>&1 | head -3`. Within 1-2s a NEW row appears in tab. Columns: Time (HH:mm:ss + ISO tooltip), Message (raw sshd MESSAGE), IP (extracted via `\bfrom\s+(\d{1,3}(?:\.\d{1,3}){3})\b`). Two icons: copy + ban (destructive variant).
3. **Step 3 — Click-to-copy:** Click copy icon → paste into URL bar → verify literal IP string. Button briefly shows "copied" for ~1.5s.
4. **Step 4 — Click-to-ban cross-link:** Click ban (destructive) icon → Phase 46 BanIpModal opens with `initialIp` PRE-POPULATED (this is the additive `initialIp?: string` prop contract). Jail dropdown defaults to first discovered (likely `sshd`). Cancel out (do NOT actually ban a real IP).
5. **Step 5 — Scroll-tolerance:** Scroll up >4px → "Resume tailing" button appears top-right. Trigger another SSH attempt → row count increases but visible scroll position does NOT jump. Click Resume → snaps to bottom, button disappears, new events auto-scroll.
6. **Step 6 — RBAC 4403:** Sign out, sign in as non-admin. Either Security entry hidden OR (via direct URL) WS handshake closes with code 4403, banner reads "Admin role required." DevTools Network shows WS close code 4403.
7. **Step 7 — Backout:** Settings → Show Security panel OFF → Security entry disappears → ON → reappears. WS reconnects on tab open. sshd + fail2ban + livos PIDs unchanged.
8. **Step 8 — Sacred file:** `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b`.
9. **Step 9 — `test:phase48` master gate:** `cd nexus/packages/core && npm run test:phase48` → exit 0; ssh-sessions tests pass 5/5 + 8/8 + 8/8.

**Expected outcome:** All 9 steps pass per source UAT. Step 4 (click-to-ban cross-link) is the killer-feature integration check.

---

### Row 11 — Phase 49 (v29.5) — mini-pc-diagnostic

**Status:** `failed`
**Source:** `.planning/milestones/v29.5-phases/49-mini-pc-diagnostic/49-VERIFICATION.md`
**Why failed:** The phase explicitly captured a BLOCKED outcome. Source frontmatter:
```
status: human_needed
must_haves_passed: 3
must_haves_partial: 1
must_haves_blocked: 1
```
The BLOCKED criteria are #1 (Mini PC single SSH captures all 9 markers — orchestrator IP fail2ban-banned) and #5 (orchestrator IP not banned at end — confirmed STILL banned). Per `feedback_milestone_uat_gate.md` — when a phase explicitly cannot complete its core deliverable due to environmental constraints that were never resolved, that's `failed` (regression-equivalent), not `needs-human-walk`.

**Failure trace (from VERIFICATION.md):**
- Criterion #1: "BLOCKED — `raw-minipc.txt` shows ban sentinel; REGRESSIONS.md cited as fallback per D-49-02"
- Criterion #5: "BLOCKED — Liveness check confirmed STILL banned; Plan 49-04 surfaced BLOCKED + partial commit deviation"
- "FR-A2-01: INSUFFICIENT EVIDENCE — Phase 51 must do local code review"
- "FR-A3-04: NEW HYPOTHESIS — `platform_apps` doesn't exist" (original hypothesis was wrong; Phase 52 schema rediscovery corrected to `apps` table)

**Why this matters for v30.5 close:**
- Phase 49's purpose was to provide ground-truth Mini PC state for Phases 50-53 to make targeted fixes against. It only partially succeeded (Server5 captured, Mini PC NOT captured → REGRESSIONS.md fallback used).
- The phase's own VERIFICATION.md explicitly says: "Per `D-LIVE-VERIFICATION-GATE` (NEW in v29.5), this phase cannot return `passed` without on-Mini-PC verification."
- The user's required action #1 from the doc: "Resolve the Mini PC fail2ban ban (any of: wait, console unban, different egress IP). This is a hard prerequisite for Phase 55 live verification."

**What can still be salvaged:** Phase 50 (seed module — Row 12) and Phase 52 (DB migration — Row 14) shipped valid mechanism work even with Phase 49's blocked diagnostic. Phase 51 (streaming — Row 13) shipped deploy-layer hardening. The `failed` classification here flags that the diagnostic data on which those fixes were based is incomplete — re-validation in v30.5 close walk is recommended.

**Carry-forward action for v31:** Per Row 11's `failed` classification, Phase 64 (this phase) inherits the obligation to either (a) re-run the Mini PC diagnostic with the orchestrator's current IP unbanned, or (b) accept that Phases 50-53 fixes were applied based on REGRESSIONS.md hypotheses that may not match live state. The honest debt position is (b) with a re-walk on Mini PC during 64-04 (Phase 63 R-series walkthrough) or 64-03 (Suna F7 fix UAT) when the user is on Mini PC anyway.

---

### Row 12 — Phase 50 (v29.5) — a1-tool-registry-seed

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.5-phases/50-a1-tool-registry-seed/50-VERIFICATION.md`
**Why human-walk:** Source frontmatter `status: passed` for the **mechanism** (4 unit tests pass). But the criteria that close FR-A1-03 (≥9 keys in `nexus:cap:tool:*` after live boot) and FR-A1-04 (live AI Chat tool invocation) are EXPLICITLY DEFERRED to Phase 55 ("DEFERRED to Phase 55" appears in the must-haves table). Phase 55 was never executed because Phase 49's BLOCKED status (Row 11) prevented the prerequisite Mini PC capture.

The `passed` mechanism status is honest at the unit-test level. The full feature acceptance requires live Mini PC walk.

**Manual steps:**
1. SSH to Mini PC. Verify Phase 50 deployed: `journalctl -u livos -n 200 --no-pager | grep -i "seed-builtin-tools"` should show the seeder ran at boot (logs typically include the count of seeded keys).
2. **FR-A1-03 — verify ≥9 keys present:**
   ```bash
   redis-cli -a "$(grep ^REDIS_URL /opt/livos/.env | cut -d= -f2 | sed 's/.*://;s/@.*//')" \
     --scan --pattern 'nexus:cap:tool:*' | wc -l
   ```
   Expect: ≥9. (BUILT_IN_TOOL_IDS has 9 ids per source — `shell`, `docker_list`, `web_search`, etc.)
3. **FR-A1-04 — live AI Chat invocation:** Open `https://bruce.livinity.io` → Nexus AI Chat → ask "Docker container'larına bakabilir misin?" or "List my running docker containers". Expect `docker_list` (or equivalent) to be invoked successfully — NOT "Error: No such tool available" which was the v29.4 regression captured in `.planning/v29.4-REGRESSIONS.md` user message.
4. **Idempotency check:** `sudo systemctl restart livos`; re-run step 2; expect SAME ≥9 keys (seeder is idempotent, doesn't double-write).

**Expected outcome:** Step 2 returns ≥9 (closes FR-A1-03 live gap). Step 3 successfully invokes a built-in tool in chat (closes FR-A1-04). The pre-fix live state per REGRESSIONS.md was 0 keys; after Phase 50 it should be 9+.

---

### Row 13 — Phase 51 (v29.5) — a2-streaming-fix

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.5-phases/51-a2-streaming-fix/51-VERIFICATION.md`
**Why human-walk:** Source frontmatter `status: human_needed`. The fix is a deploy-layer change to `update.sh` (rm -rf dist + verify_build position fix). The "test" is a real human watching token-by-token streaming in the AI Chat browser UI vs. the previous "wait for entire response then send all at once" regression. There is no scriptable proxy for "did the user perceive token-level streaming" — that's an inherently human visual judgment.

The verification doc itself says (line 47-50): "Run `bash /opt/livos/update.sh` on Mini PC, observe deploy duration (should be ≥1m 30s, NOT 1m 2s) ... Confirm dist mtime is fresh post-deploy ... AI Chat with >2s prompt — token-by-token streaming visible".

**Manual steps:**
1. SSH to Mini PC: `sudo bash /opt/livos/update.sh`.
2. **Deploy duration check:** Time the deploy. Expect ≥1m 30s, NOT the suspicious 1m 2s captured pre-fix in REGRESSIONS.md (1m 2s was too short for vite build + nexus core build + livinityd compile).
3. **dist mtime freshness:** `ls -la /opt/livos/livos/packages/ui/dist/index.html` — mtime should match the deploy time, not be hours old.
4. **Live streaming test:** Open `https://bruce.livinity.io` → AI Chat. Hard-reload (Ctrl+Shift+R) to clear PWA cache. Type a prompt that should produce >2s of output, e.g., "Write me a 3-paragraph essay about cats." Watch the response area:
   - PASS: Tokens appear progressively (word-by-word or chunk-by-chunk).
   - FAIL: Spinner shows for full duration, then entire response appears at once (the v29.4 regression).
5. **Model identity sanity check (FR-MODEL-02 follow-up):** Type "Hangi modelsin?" 3 times. Verify consistent model identification (should say "Claude" or model name reliably, not confabulate or say "I don't know").

**Expected outcome:** Step 4 = visible token-by-token streaming. If still batched, the Phase 51 hypothesis (deploy-layer cache) was wrong and the actual root cause is server-side buffering in nexus core — escalate to a follow-up phase per source VERIFICATION.md note. Step 5 likely STILL fails (Branch N was taken — no sacred-file edit) and that's accepted technical debt for v29.6/v31.

---

### Row 14 — Phase 52 (v29.5) — a3-marketplace-state

**Status:** `needs-human-walk`
**Source:** `.planning/milestones/v29.5-phases/52-a3-marketplace-state/52-VERIFICATION.md`
**Why human-walk:** Source frontmatter `status: passed` for the DB mechanism (migration committed, MiroFish row deleted, `apps` table validated). But FR-A3-03 ("live marketplace shows correct state") is explicitly DEFERRED to Phase 55, and Phase 55 never ran. The DB state can be verified via psql (scriptable) but the user's actual complaint was "Bolt tamamen silinmis Store uzerinden!!!" + "Miro Fish kalkmamis!" — a UI rendering claim. Even with correct DB state, the public store UI on Server5 may have stale Next.js cache. Verifying that requires opening `https://apps.livinity.io` in a browser.

**Manual steps:**
1. **DB sanity (scriptable, can be batched into the larger walk):** SSH to Server5 (via `contabo_master` key, NOT minipc key):
   ```bash
   ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master root@45.137.194.102 \
     'sudo -u postgres psql platform -c "SELECT slug, name, featured, verified FROM apps WHERE slug IN (\"bolt-diy\", \"mirofish\");"'
   ```
   Expect: 1 row for `bolt-diy` (featured=true, verified=true), 0 rows for `mirofish`.
2. **Live UI verification (FR-A3-03):** Open `https://apps.livinity.io` (or `https://livinity.io/store`) in browser. Hard-reload to bypass any Cloudflare/CDN/Next.js cache. Search/browse:
   - Bolt.diy SHOULD be visible (rendering correctly).
   - MiroFish should NOT appear in any category.
3. **From LivOS marketplace UI:** Open `https://bruce.livinity.io` → Apps → Marketplace. Same verification as step 2 but through the LivOS frontend.
4. If step 2 or 3 still shows MiroFish or hides Bolt.diy: cache invalidation gap — investigate Server5 platform Next.js deploy + Cloudflare cache. Per VERIFICATION.md: "platform Next.js UI cache (if any) not invalidated this phase — out of scope".

**Expected outcome:** Step 1 confirms DB is correct (already known from Phase 52 close). Steps 2-3 are the actual user-facing verification that the regression closed.

**Carry-forward note:** Server5 cache invalidation is the open follow-up. If Step 2 fails despite Step 1 passing, this becomes a Phase 64-03 or Phase 64-05 quick-task (depending on triage outcome).

---

## Summary counts

- `script-verified`: **1** (Row 1 — Phase 39 read-only audit)
- `needs-human-walk`: **11** (Rows 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14)
- `failed`: **1** (Row 11 — Phase 49 blocked diagnostic)
- `obsolete`: **1** (Row 5 — Phase 43 MiroFish anchor dropped)
- **Total:** **14 rows**

## v30.5 close — what the user must do before milestone close

Per `feedback_milestone_uat_gate.md`, the **11 `needs-human-walk` rows** are
the honest debt that must be acknowledged before v30.5 closes (or
explicitly accepted via `--accept-debt` like v30.0 was). Of those 11:

- **6 are pure browser UI walks** (Rows 2, 6, 8, 9, 10, 13) — must be done in a real browser session on `https://bruce.livinity.io`
- **5 require browser + curl/psql combos** (Rows 3, 4, 7, 12, 14) — can be batched into one Mini PC SSH session if Phase 40 OAuth has already happened

The **1 `failed` row** (Phase 49) is not actionable in this matrix — it
flags that Phases 50-53 were built on incomplete diagnostic data; the
remediation is to re-walk Phase 49's diagnostic with current orchestrator
IP unbanned, ideally combined with Rows 12-14 walks.

The **1 `obsolete` row** (Phase 43) needs no action — MiroFish is gone.

The **1 `script-verified` row** (Phase 39) is closed by virtue of the
audit's own self-contained nature.

---

## D-NO-SERVER4 honored

No row in this matrix targets Server4 (45.137.194.103). Per `MEMORY.md`
hard rule: Server4 is OFF-LIMITS. The only servers walked here are:
- **Mini PC** (`bruce@10.69.31.68`) — primary deploy target for all v29.3-v29.5 work
- **Server5** (`root@45.137.194.102`) — Row 14 only, for the public app
  store DB query (read-only psql) and the public UI verification (browser)

---

*Generated by Phase 64 plan 64-02 on 2026-05-04. Source files
read but not modified per `<sacred_boundary>`.*
