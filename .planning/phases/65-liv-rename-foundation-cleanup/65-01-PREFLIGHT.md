# Phase 65 — Pre-flight Snapshot

**Captured:** 2026-05-05T03:11:05Z
**Captured by:** 65-01 plan execution (autonomous executor, claude-opus-4.7)

## Git state at task start

- **Starting branch:** `master`
- **Starting SHA:** `640b928e5e7d8287536b405a01af3b20e075729b`
- **Branch strategy:** Working on `master` directly per project convention. Per CONTEXT D-03, since the working tree contains a non-trivial number of uncommitted changes from concurrent agents (P56/P57/P58 archive deletions, modifications to `.planning/ROADMAP.md`, etc.) AND STATE.md shows recent commits like `f04537d7` landing on master without a feature branch, switching to `liv-rename` would require either stashing or co-mingling unrelated dirty state. Decision: stay on master, record starting SHA above, treat the SHA as the rollback reference point.
- **Working tree status (at task start):** non-empty — see [working-tree dirty file inventory](#working-tree-dirty-file-inventory) below. None of these dirty files are modified by 65-01 (this plan only writes `65-01-PREFLIGHT.md` and `65-01-SUMMARY.md`); pause-and-resume safety preserved.

### Working-tree dirty file inventory

The following files were already modified/deleted at task start (not by this plan):

- Modified: `.claude/settings.local.json`, `.planning/ROADMAP.md`
- Deleted: `.claude/worktrees/hungry-hoover`, `.claude/worktrees/hungry-moser`
- Deleted: bulk archive deletions in `.planning/phases/56-research-spike/`, `.planning/phases/57-passthrough-mode-agent-mode/`, `.planning/phases/58-true-token-streaming/` and similar archive directories (concurrent-agent or earlier-cleanup work)

**These are out-of-scope for 65-01.** They will be addressed by their owning plans / cleanup commits, not here.

## Sacred file

- **Path:** `nexus/packages/core/src/sdk-agent-runner.ts`
- **SHA (start of task):** `4f868d318abff71f8c8bfbcf443b2393a553018b`
- **Expected:** `4f868d318abff71f8c8bfbcf443b2393a553018b`
- **Match:** ✅ YES — sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` confirmed unchanged at task start. SHA gate verified again at end of each task in this plan.

## Top-5 most-affected file SHAs (per v31-DRAFT 159-163)

These are the files expected to see the heaviest churn during 65-03 (import + log-string sweep). SHAs captured here let 65-03 prove "only the rename touched these files; semantic content unchanged" via diff inspection.

| File | SHA | Status |
|------|-----|--------|
| `livos/packages/livinityd/source/modules/ai/routes.ts` | `53fd472325d182d36bde555b628a8a5107303a6e` | EXISTS |
| `nexus/packages/core/src/api.ts` | `844883ba591fa462577b4065c455beff771dc2eb` | EXISTS (will become `liv/packages/core/src/api.ts` after 65-02) |
| `nexus/packages/core/src/daemon.ts` | `7be0c627dac784a8b070c0a9f65a9c41f198c570` | EXISTS |
| `nexus/packages/core/src/config/manager.ts` | `186668981e91cbed08f580dacd301a9be75a0f98` | EXISTS |
| `nexus/packages/cli/src/commands/setup.ts` | `ffc10c10e289f873e41ac8166e9d2963eba0987e` | EXISTS |

## update.sh defensive read

- **File length:** 629 lines
- **First 5 lines:**
  ```
  #!/usr/bin/env bash
  # ──────────────────────────────────────────────────────────
  # ── Phase 31 BUILD-03: root-cause fix ──
  # Trigger root cause: INCONCLUSIVE per 31-ROOT-CAUSE.md (no controlled repro).
  # BUILD-01 verify_build guard above is the safety net — if it ever fires
  ```
- **Destructive patterns found:** NONE
  - `grep -n -E "rm -rf /opt/(nexus|liv)" update.sh` returned no matches.
  - The script does NOT contain any `rm -rf /opt/nexus` or `rm -rf /opt/liv` invocation under current source.
  - Safe to read on Mini PC; not safe to execute before 65-04 (script must be updated for the new `/opt/liv/` paths) and 65-05 (Mini PC migration must run first).

## Source-side env var name inventory (NEXUS_* + LIV_*)

Captured from local repo grep across `nexus/`, `livos/`, `update.sh` (`*.ts`, `*.sh`, `*.env*`). Names only — no values. This list anchors the 65-03 sweep target.

**NEXUS_* (20 names — to be renamed to LIV_* in 65-03):**

```
NEXUS_AGENT_MAX_TOKENS    NEXUS_AGENT_MAX_TURNS    NEXUS_AGENT_TIER
NEXUS_AGENT_TIMEOUT_MS    NEXUS_API_PORT           NEXUS_API_URL
NEXUS_BASE                NEXUS_BASE_DIR           NEXUS_CONFIG
NEXUS_CORE_DIST_SRC       NEXUS_DATA_DIR           NEXUS_DIR
NEXUS_LOGS_DIR            NEXUS_LOG_LEVEL          NEXUS_OUTPUT_DIR
NEXUS_PUBLIC_URL          NEXUS_RETRY_ATTEMPTS     NEXUS_RETRY_ENABLED
NEXUS_SKILLS_DIR          NEXUS_WORKSPACE_DIR
```

**LIV_* (9 names — already exist; rename targets must NOT collide with these):**

```
LIV_API_KEY               LIV_API_URL              LIV_BROKER_SLICE_BYTES
LIV_BROKER_SLICE_DELAY_MS LIV_DIR                  LIV_KEY
LIV_PLATFORM_API_KEY      LIV_SKIP_FTS_BACKFILL    LIV_TOUR_STEPS
```

**Collision check for 65-03:**
- `NEXUS_API_URL` → `LIV_API_URL`: ⚠ COLLISION — `LIV_API_URL` already exists with a different semantic. 65-03 must reconcile (likely: keep `LIV_API_URL` as the canonical, drop the renamed `NEXUS_API_URL` if redundant).
- `NEXUS_DIR` → `LIV_DIR`: ⚠ COLLISION — `LIV_DIR` already exists. Same reconciliation needed.
- All other NEXUS_* names rename cleanly.

## Mini PC snapshot

**Captured:** 2026-05-05T03:11Z (attempted)
**Host (target):** bruce@10.69.31.68 (Mini PC — `bruce-EQ`)

### Status: UNREACHABLE at task time

- **Reason:** SSH `connect to host 10.69.31.68 port 22: Connection timed out` (exit 255 after `ConnectTimeout=20`).
- **Cause analysis:**
  - Mini PC sits on a private LAN (10.69.31.0/24) per memory `reference_minipc.md`. The executor workstation reaching it requires either being on the same LAN OR having an active VPN/tunnel.
  - At task time, no tunnel was active from this workstation. This is environmental — not a fail2ban ban (which would be `Connection refused` or `kex_exchange_identification`, not `timed out`).
  - SSH key file present and unchanged: `C:/Users/hello/Desktop/Projects/contabo/pem/minipc` (411 bytes, 0644 — matches memory `reference_minipc_ssh.md`).
- **Decision:** Per scope_guard "Single batched SSH session to Mini PC (per memory `feedback_ssh_rate_limit.md` — fail2ban will ban rapid probes)" — DO NOT retry. The single attempt has been made; further rapid attempts risk fail2ban.
- **Snapshot data NOT captured** (live):
  - systemd liv-* + `livos` unit ActiveState/SubState/WorkingDirectory paths
  - `/opt/nexus/` and `/opt/livos/` `ls -la` + `du -sh`
  - `/opt/livos/node_modules/.pnpm/@nexus+*` directory enumeration (pnpm-store quirk per memory)
  - `/opt/livos/node_modules/@nexus/core` symlink resolution
  - Live Redis `nexus:*` and `liv:*` key counts and sample values
  - Live `/opt/livos/.env` env-var name inventory

### Mitigation for 65-05

This SSH unreachability does NOT block plans 65-02, 65-03, 65-04, 65-06 — those are local-repo-only. It DOES affect 65-05's "Mini PC migration script + dry-run" plan. Recommended mitigation in 65-05:

1. **Re-attempt the Mini PC snapshot** at 65-05 entry (network state may be different by then). Use the same single-batched-SSH command shape captured below.
2. **If still unreachable at 65-05 entry:** the live cutover is by definition a USER-WALK gate (per CONTEXT D-12 and execution_safety table). The user is best positioned to either tunnel up OR walk through the dry-run from a Mini-PC-reachable host. The migration script itself can still be authored and committed in 65-05 from this workstation; only the live dry-run needs Mini PC access.
3. **Source-side env var rename is unblocked:** the env var inventory above (captured from source grep) is a sufficient ground truth for 65-03's NEXUS_* → LIV_* sweep. The `/opt/livos/.env` live inventory was a "nice to have" for confirming production already has the same set; not strictly required.

### Redis runtime keys (deferred to 65-05 live snapshot)

The single-batched SSH session below includes Redis `nexus:*` and `liv:*` `--scan` enumeration. Counts and sample keys MUST be captured at 65-05 entry time (when Mini PC is reachable) and used to gate the source-only Redis prefix rename in 65-03.

### Single-batched-SSH command (for re-use in 65-05)

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ConnectTimeout=20 \
    bruce@10.69.31.68 'bash -s' << 'SNAPSHOT_EOF'
set +e
echo "=== HOSTNAME ==="; hostname
echo "=== IP_VERIFY ==="; hostname -I 2>&1 | head -1
echo "=== DATE ==="; date -u +%FT%TZ
echo "=== SYSTEMD liv-* + livos units ==="
systemctl list-units --type=service --no-pager 2>&1 | grep -E "^[ ]*(liv-|livos|nexus)" || echo "none"
echo "=== systemd unit-file paths for liv-* + livos ==="
for u in livos liv-core liv-worker liv-memory liv-mcp-server; do
  echo "--- $u ---"
  systemctl cat "$u" 2>&1 | grep -E "^WorkingDirectory|^ExecStart|^Environment" | head -10 || echo "  (no unit)"
  systemctl is-active "$u" 2>&1 | head -1
done
echo "=== /opt/nexus/ inventory ==="
sudo ls -la /opt/nexus/ 2>&1 | head -20 || echo "  /opt/nexus/ MISSING"
sudo du -sh /opt/nexus/ 2>&1 || true
echo "=== /opt/nexus/packages/ ==="
sudo ls /opt/nexus/packages/ 2>&1 || true
echo "=== /opt/livos/ inventory ==="
sudo ls -la /opt/livos/ 2>&1 | head -20
sudo du -sh /opt/livos/ 2>&1 || true
echo "=== /opt/livos/node_modules/.pnpm/@nexus+* dirs ==="
sudo ls -d /opt/livos/node_modules/.pnpm/@nexus+* 2>&1 || echo "  no @nexus+* dirs"
echo "=== livinityd's @nexus/core symlink resolution ==="
sudo readlink -f /opt/livos/node_modules/@nexus/core 2>&1 || echo "  no symlink"
REDIS_URL_VAL=$(sudo grep -oE 'REDIS_URL=[^ ]+' /opt/livos/.env 2>/dev/null | head -1 | cut -d= -f2-)
if [ -n "$REDIS_URL_VAL" ]; then
  echo "=== Redis nexus:* keys ==="
  sudo redis-cli -u "$REDIS_URL_VAL" --scan --pattern 'nexus:*' 2>&1 | head -50
  echo "=== Redis nexus:* count ==="
  sudo redis-cli -u "$REDIS_URL_VAL" --scan --pattern 'nexus:*' 2>&1 | wc -l
  echo "=== Redis liv:* keys ==="
  sudo redis-cli -u "$REDIS_URL_VAL" --scan --pattern 'liv:*' 2>&1 | head -20
  echo "=== Redis liv:* count ==="
  sudo redis-cli -u "$REDIS_URL_VAL" --scan --pattern 'liv:*' 2>&1 | wc -l
fi
echo "=== /opt/livos/.env env-var inventory (NEXUS_* + LIV_* — values redacted) ==="
sudo grep -E '^(NEXUS_|LIV_)' /opt/livos/.env 2>&1 | sed 's/=.*/=<redacted>/' || echo "  no .env or no matching vars"
echo "=== END SNAPSHOT ==="
SNAPSHOT_EOF
```

### Expected snapshot contents (per memory + spec — for 65-05 verification)

These expectations were derived from `MEMORY.md` "Server Setup → Mini PC" + v31-DRAFT lines 124-129. 65-05 should diff its live snapshot against these expectations:

- **systemd services** (4 total — already Liv-prefix per STATE.md line 259): `livos.service` (livinityd via tsx, port 8080), `liv-core.service` (nexus core dist, port 3200), `liv-worker.service`, `liv-memory.service`. ActiveState: all `active`.
- **`/opt/nexus/`:** EXISTS, ~few-hundred-MB; subdirs `packages/{core,worker,mcp-server,memory}`.
- **`/opt/livos/`:** EXISTS, ~larger (UI + node_modules); subdirs `packages/{livinityd,ui,config}`, `update.sh`, `data/`, `.env`.
- **`/opt/livos/node_modules/.pnpm/@nexus+*` dirs:** ≥1 (pnpm-store quirk — sometimes >1, see memory).
- **`@nexus/core` symlink:** resolves into the FIRST `@nexus+core*` dir (memory note flags this as a known footgun for `update.sh`).
- **Redis `nexus:*` keys:** v31-DRAFT line 129 expects ZERO (or near-zero). Non-zero would signal that 65-03's source-only Redis prefix rename is insufficient.
- **Redis `liv:*` keys:** P67 may have created `liv:agent_run:*` keys; non-zero is fine here.
- **`/opt/livos/.env` env vars:** NEXUS_* and LIV_* both expected. Source-side inventory above is the authoritative list.

## Hard rule verification

| Rule | Verified |
|------|----------|
| Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged at start | ✅ |
| D-NO-SERVER4 (no SSH to 45.137.194.103) | ✅ — only SSH attempt was to 10.69.31.68 |
| Single-batched SSH session (fail2ban-aware) | ✅ — exactly 1 SSH invocation attempted; no retries |
| Read-only on Mini PC | ✅ — no Mini PC mutation (connection didn't even establish) |
| update.sh dry-run-equivalent verification | ✅ — defensive `head -5` + destructive-pattern grep, no execution |
| No source code mutation | ✅ — only files written are `65-01-PREFLIGHT.md` and `65-01-SUMMARY.md` |

## Rollback reference

To return repo to pre-rename state:

```bash
git checkout master
git reset --hard 640b928e5e7d8287536b405a01af3b20e075729b
# (no liv-rename branch was created, so no branch deletion needed)
```

**Preflight commit SHA:** _to be filled in by Task 2 commit step_ — this is the SHA of the commit that adds this PREFLIGHT.md to git history. To roll back the snapshot itself: `git revert <preflight-commit-sha>`.

## Cross-plan link

This file's contract with 65-05: 65-05 SHALL run the [single-batched-SSH command](#single-batched-ssh-command-for-re-use-in-65-05) above and diff its live output against the [expected snapshot contents](#expected-snapshot-contents-per-memory--spec--for-65-05-verification) section. Any field that differs MUST be flagged as a delta in 65-05's PLAN body. The Mini-PC-unreachable status of THIS task does NOT excuse 65-05 from its own live snapshot — 65-05's live cutover requires it.
