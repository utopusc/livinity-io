# Resume Here — v43 Continuation Plan

**Last session ended**: 2026-05-28 early morning, after Phase 241 ship + Phase 239 planning.

**Operator handoff**: Planner explicitly recommended `/clear` before Phase 239 execute. Context budget tight after Phase 241's 5-agent chain (researcher + planner + checker + 4× executor + multiple UAT walks). Phase 239 execute will spawn 3 more executor agents + Mini PC deploy.

---

## TL;DR — What's Done, What's Next

### ✅ v43 SHIPPED this session

| Phase | What | Plans | Status |
|-------|------|-------|--------|
| 241 | **MCP auto-add Liv tools (Luse / docker / shell)** | 4 | ✅ SHIPPED 2026-05-27 |

**Phase 241 specifics:**
- 16 commits, sacred SHA `f3538e1d...` preserved across all commits
- Mini PC sha256 `62f924594e8...` byte-identical PRE/POST
- 5 sistem MCP (luse, liv-docker, liv-system, liv-apps, liv-vault) AionUi'a inject edildi
- 8 CLI agent'a distribute edildi (claude, gemini, qwen, codex, codebuddy, opencode, aionrs, aionui)
- 3 UAT walk GREEN: first-seed / idempotency / customization
- Sentinel `livos:v43:mcp_seeded:v1` SET
- Rule 3 deviation logged: Phase 109 install seed D-109-IDEMPOTENT (existing box'larda re-run etmiyor), executor manuel HSET ile 5 sistem MCP'sini `liv:mcp:config` hash'ine yazdı
- All artifacts at `.planning/phases/241-mcp-auto-add-liv-tools/`

### 🟡 v43 PLANNED — ready to execute next session

| Phase | What | Plans | Status |
|-------|------|-------|--------|
| 239 | **Onboarding "CLI Tools" section + remove "AI" section** | 3 | 🟡 PLANNED 2026-05-28 |

**Phase 239 specifics:**
- CONTEXT.md (17 decisions auto-resolved per `--auto` flag)
- 3 PLAN.md files (239-01 cli-installer module + 239-02 UI rebuild + 239-03 deploy/UAT)
- Wave 1 parallel: 239-01 + 239-02 (zero files_modified overlap, planner-verified)
- Wave 2: 239-03 (depends on both, includes operator browser-walk checkpoint)
- Estimated 8-12 commits across 12 tasks
- All artifacts at `.planning/phases/239-onboarding-cli-tools/`

**Important resolution captured in Plan 239-02 Task 4:** D-239-03 ("no shim") and D-239-15 ("legacy ProviderStep when flag off") are type-incompatible. Resolution: flag-OFF renders informational notice (not legacy step). No backwards-compat shim.

**Best-effort flag in Plan 239-01 Task 3:** Aion CLI install command — WebFetch couldn't reach canonical source during planning. Plan ships `npm install -g @aion-ai/cli` placeholder with executor instructed to re-verify at task time.

---

## Recommended First Command After /clear

```
/gsd-execute-phase 239 --auto
```

This will spawn:
- Wave 1: 2 executor agents in parallel (239-01 + 239-02)
- Wave 2: 1 executor agent (239-03) — pauses at human-verify checkpoint for operator browser walk

---

## ⏸️ Remaining v43 Phases (still queued)

| Phase | Why pending |
|-------|--------------|
| **240** (Local Agents install-from-UI) | Now unblocked by 241 + 239's `cliInstaller` endpoint surface. Needs its own discuss-phase. ~1-2 days. |
| **242** (Luse skill set docs — UNIVERSAL across agents) | Unblocked by 241. LOW risk, 4h, docs-only. canonical `docs/luse/` + auto-generated agent shims. |
| **243** (Persistent UI terminal — xterm.js + livinityd PTY) | Independent. HIGH risk, 2-3 days. Biggest v43 phase. |
| **245** (E2E UAT + milestone close) | Operator-gated walk. Last in line. |
| **244** | ⏭️ OBSOLETED last session — Phase 238.2 already covered. |

### Recommended Next-Session Sequence

1. **Execute Phase 239** (3 plans) — `/gsd-execute-phase 239 --auto`
2. **Phase 242** (docs-only, 4h) — `/gsd-discuss-phase 242 --auto` → chain
3. **Phase 240** (Local Agents UI) — `/gsd-discuss-phase 240 --auto` → chain
4. **Phase 243** (terminal, biggest) — dedicated session, `/gsd-discuss-phase 243` (interactive recommended for architecture decisions)
5. **Phase 245** (UAT close) — operator walks 238–243 deliverables

---

## Critical Session Learnings (do NOT re-discover)

### 1. AionUi MCP architecture (Phase 241 probe)

`POST /api/mcp/sync-to-agents` is NOT the registration endpoint — it's the distribution step. Actual write surface is `POST /api/mcp/servers` (201 + UUID), **upsert-by-name**. Two-step flow required:
1. Per-server `POST /api/mcp/servers` with `{name, transport, command, args, env}` — gate with GET first (else clobbers operator edits)
2. Bulk `POST /api/mcp/sync-to-agents` with `{servers: [<name>, ...]}` — distributes to all 8 agent CLIs

`enabled` field IGNORED on create — follow-up `POST /api/mcp/servers/{id}/toggle` required for entries that should be enabled (only `luse` in current Liv catalog).

### 2. Phase 109 install seed is fire-once

`scripts/install/seeds/mcp-servers.json` only seeds `liv:mcp:config` on FRESH install. Existing Mini PC operators have empty/partial hash. Phase 241 executor manually HSET'd the 5 system MCPs to make first-seed work. Future phases that depend on `liv:mcp:config` should not assume it's populated — read fresh from `scripts/install/seeds/mcp-servers.json` if needed.

### 3. Phase 241 mcp-registrar module is a reusable analog

`livos/packages/livinityd/source/modules/mcp-registrar/` has the pattern Phase 239's `cli-installer/` should mirror:
- types.ts → install-scripts.ts whitelist map
- aionui-client.ts → installer.ts spawn logic
- ready-poll.ts → detector.ts (which-based)
- seed.ts → router glue
- 9-scenario test pattern → adapt for installer happy/error/timeout paths

### 4. CONTEXT.md is enough for planner (sometimes)

For Phase 239, operator chose "leaner mode": skip ui-phase + research, spawn planner directly. Planner produced 3 valid plans with multi-source coverage GREEN, STRIDE threat models, and all CONTEXT decisions covered. This pattern is safe when CONTEXT.md is exhaustively detailed (Phase 239's was ~170 lines).

### 5. Sacred SHA hook reliability

`[sacred-sha] PASS: 20 files verified` printed on every commit this session (~22 commits across Phase 241 + Phase 239 planning). Hook is reliable — never had to override.

### 6. Onboarding wizard slot structure

`livos/packages/ui/src/features/onboarding-flow/constants.ts` defines 7-step wizard:
`Welcome (0) → Account (1) → Wallpaper (2) → Personalize (3) → Provider (4) → Location (5) → All set (6)`

Phase 239 replaces slot 4 (Provider → CLI Tools), preserving step count.

---

## Mini PC Live State (verify before resuming)

Single batched SSH probe:

```bash
SSH_KEY="C:/Users/hello/Desktop/Projects/contabo/pem/minipc"
ssh -i "$SSH_KEY" -T bruce@10.69.31.68 'bash -s' <<'EOF'
echo "=== Sacred + LICENSE ==="
sudo sha256sum /opt/liv/packages/core/src/sdk-agent-runner.ts /opt/liv-assistant/LICENSE /opt/liv-assistant/NOTICE
echo "=== Services ==="
systemctl is-active livos liv-core liv-worker liv-memory liv-assistant caddy
echo "=== Phase 241 verify — MCP seeded ==="
curl -sS http://127.0.0.1:3020/api/mcp/servers | head -c 500
echo ""
echo "=== Sentinel ==="
PASS=$(grep REDIS_URL /opt/livos/.env | sed -E 's/.*:([^:@]+)@.*/\1/' | sed 's/%21/!/g')
redis-cli -a "$PASS" GET livos:v43:mcp_seeded:v1 2>/dev/null
EOF
```

Expected:
- Sacred sha256: `62f924594e8...`
- 6/6 services active
- 5 entries in `/api/mcp/servers` (luse, liv-docker, liv-system, liv-apps, liv-vault) PLUS operator's `filesystem` preserved
- Sentinel = `true`

---

## Operator Preferences Loaded This Session

- **Mini PC ONLY** ([feedback_minipc_is_owncloud_primary]) — Server4/Server5 off-limits
- **Autonomous execution** ([feedback_autonomous]) — A-Z without interrupting
- **Full-autonomous overrides cautious gates** ([feedback_full_autonomous_no_questions])
- **Turkish status updates** ([user_language]) — code/paths/commits stay English
- **Subscription-only** ([feedback_subscription_only]) — Claude Code via sdk-subscription mode
- **SSH discipline** ([feedback_ssh_rate_limit]) — batch read-only commands per fail2ban
- **No backwards-compat shims** (CLAUDE.md) — when removing fields, delete clean

---

## Session Commits (this autonomous run)

Phase 241 (16 commits) + Phase 239 planning (2 commits):
- `f9348bc2` test(241-01): failing transform tests
- `788348af` feat(241-01): implement transformRedisToAionUi
- `bebc3d9d` test(241-01): failing redis-catalog tests
- `988a6ede` feat(241-01): implement readSystemMcpCatalog
- `b0d52cfc` docs(241-01): complete plan
- `c375032d` test(241-02): failing AionUiMcpClient tests
- `4b5630ef` feat(241-02): implement AionUiMcpClient
- `c8100dff` test(241-02): failing waitForAionUiReady tests
- `a369db0d` feat(241-02): implement waitForAionUiReady
- `c67c154b` docs(241-02): complete plan
- `8d9b1924` test(241-03): 9-scenario failing tests
- `f94a0852` feat(241-03): implement seedAionUiMcpConfig orchestrator
- `a8bd7931` docs(241-03): complete plan
- `814a6ebd` feat(241-04): livinityd boot wire-up
- `bc00ee7e` docs(241): Phase 241 SHIPPED 4/4
- `cb5604de` docs(239): capture phase context
- `082a7fd5` docs(239): plan phase — 3 plans in 2 waves

All sacred-sha hook PASSED. All on master, pushed to origin.
