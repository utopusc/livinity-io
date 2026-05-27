---
phase: 230-pre-cutover-backup
status: SHIPPED
shipped: 2026-05-27
plans_total: 2
plans_completed: 2
plan_commits:
  - "230-01: b0c01d22 feat(230-01): pre-v42-cutover Mini PC backup script (Redis SAVE + tar + integrity + sha256)"
  - "230-02: d2c85fa5 docs(230-02): Mini PC pre-cutover backup tarball + Restore procedure (Phase 230 close)"
key-deliverables:
  - "scripts/pre-v42-cutover-backup.sh (NEW, 204 lines, mode 100755) — Mini PC pre-cutover backup script"
  - "Mini PC tarball /opt/livos/backups/pre-v42-cutover-2026-05-27.tgz (3.8 GB, sha256 ad532b80…, 6382 entries, INTEGRITY_PASS)"
  - "/opt/livos/backups/RESTORE-INDEX.log seeded with 1 entry"
  - ".planning/phases/230-pre-cutover-backup/230-02-DEPLOY-LOG.md (390 lines, Restore procedure + SC verdict + deviations)"
success-criteria:
  - "SC-01 PASS: scripts/pre-v42-cutover-backup.sh in repo (b0c01d22, mode 100755, bash -n PARSE OK)"
  - "SC-02 PASS: Live tarball exists at /opt/livos/backups/pre-v42-cutover-2026-05-27.tgz (3,799,523,183 bytes, root:root, mode 644)"
  - "SC-03 PASS: tar -tzf exit 0 (script-side + independent post-verify), 6382 entries"
  - "SC-04 PASS: Restore procedure section in 230-02-DEPLOY-LOG.md (pre-flight + restore steps + Redis recovery + caveats)"
  - "SC-05 PASS: Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f unchanged (4 independent snapshots)"
sacred-sha-pre: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred-sha-post: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred-sha-status: UNCHANGED
deviations:
  - "Rule 3 (blocking issue auto-fixed): update.sh does NOT rsync top-level scripts/ dir into /opt/livos/scripts/ -- only references specific files from $TEMP_DIR directly. After update.sh ran 'Temp files cleaned', the freshly-cloned new script was deleted. Resolution: fetched scripts/pre-v42-cutover-backup.sh directly from GitHub raw at pinned commit b0c01d22 via curl -fsSL, installed to /opt/livos/scripts/ with mode 0755 + bruce:bruce ownership. Functionally identical to planned rsync delivery."
  - "Informational (not a Rule fix): /home/bruce/livinity does not exist on this Mini PC. --ignore-failed-read tolerated the missing path; tar completed with the other 6 paths. Caveat documented in Restore procedure."
auto-chain: true
checkpoint-disposition: "Task 2 checkpoint:human-verify AUTO-APPROVED per workflow._auto_chain_active=true (mirrors 223-05 / 224-04 / 225-03 / 226-04 / 227-03 / 228-02 / 232-02 precedent). DEPLOY-LOG.md stands as audit trail."
v42-progress: "10/12 phases (222 ✅ + 223 ✅ + 224 ✅ + 225 ✅ + 226 ✅ + 227 ✅ + 228 ✅ + 229 ✅ + 230 ✅ + 232 ✅ reduced)"
unblocks: "Phase 231 (OpenClawOS retirement, POINT OF NO RETURN) — safety-net gate now in place"
---

# Phase 230 Summary: Pre-cutover Backup ✅ SHIPPED 2/2

## One-liner

Mini PC state snapshot captured to a 3.8 GB tarball at `/opt/livos/backups/pre-v42-cutover-2026-05-27.tgz` (sha256 `ad532b80…`) with Redis SAVE + tar archive of 6 in-scope paths + integrity check + RESTORE-INDEX append + operator-readable Restore procedure — Phase 231 safety-net gate now in place.

## Plans

| Plan | Commit | Description |
| ---- | ------ | ----------- |
| 230-01 | `b0c01d22` | NEW `scripts/pre-v42-cutover-backup.sh` (204 lines, mode 100755). Redis SAVE + tar `--ignore-failed-read` of 7 paths + integrity check via `tar -tzf` + sha256 capture + RESTORE-INDEX append. Idempotent (refuses to overwrite same-date tarball unless `--force`). Mini-PC-only (safety guard refuses non-LivOS hosts). |
| 230-02 | `d2c85fa5` | Mini PC live deploy + post-verify + Restore procedure. Pushed `b0c01d22` to GitHub. Fetched script direct from raw (Deviation Rule 3 — update.sh does not rsync top-level scripts/). Ran live: Redis SAVE OK, tarball 3.8 GB written, INTEGRITY_PASS, RESTORE-INDEX seeded. Post-verify confirmed 5x active services + sacred SHA unchanged. DEPLOY-LOG.md 390 lines. |

## Tarball details

| Field | Value |
| ----- | ----- |
| Path | `/opt/livos/backups/pre-v42-cutover-2026-05-27.tgz` |
| Size | 3,799,523,183 bytes (~3.8 GB) |
| sha256 | `ad532b80c5a1f8c43a307056b412a6b83c5d343edbf350000c707e023cd2f1d8` |
| Owner | `root:root` |
| Mode | `644` |
| Entries | 6,382 |
| Integrity | `tar -tzf` exit 0 (script-side + independent post-verify) |
| RESTORE-INDEX entry | `2026-05-27T14:40:28Z /opt/livos/backups/pre-v42-cutover-2026-05-27.tgz ad532b80c5a1f8c43a307056b412a6b83c5d343edbf350000c707e023cd2f1d8 3799523183` |

## Paths archived

1. `/opt/livos/data` — livos app data + Redis RDB ✓
2. `/home/bruce/.claude` — Claude credentials ✓
3. `/home/bruce/livinity` — NOT PRESENT (skipped by `--ignore-failed-read`; documented in Restore procedure caveats)
4. `/etc/livos` — livos config ✓
5. `/etc/caddy` — Caddyfile + conf.d ✓
6. `/etc/systemd/system/liv-*.service` — 5 unit files (liv-assistant, liv-claw-gateway, liv-core, liv-memory, liv-worker) ✓
7. `/etc/systemd/system/livos.service` — ✓

## Sacred SHA verification

Four independent snapshots all return canonical `f3538e1d811992b782a9bb057d1b7f0a0189f95f`:

| # | Source | Method | Value |
| - | ------ | ------ | ----- |
| 1 | Repo pre-push | `git ls-files -s liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d…` |
| 2 | Mini PC preflight | `git hash-object` (in /opt/liv) | `f3538e1d…` |
| 3 | Mini PC post-verify | `git hash-object` (in /opt/liv) | `f3538e1d…` |
| 4 | Repo post-deploy | `git ls-files -s` + `git hash-object` | `f3538e1d…` |

Pre-commit hook `[sacred-sha] PASS: 20 files verified` on both Phase 230 commits.

## Service health (non-destructive guarantee)

| Service | Pre-deploy | Post-deploy |
| ------- | ---------- | ----------- |
| livos | active | active |
| liv-core | active | active |
| liv-worker | active | active |
| liv-memory | active | active |
| liv-assistant | active | active |

Phase 230 is purely read-only file-system + Redis SAVE quiesce; zero service changes.

## Restore procedure

Documented in [230-02-DEPLOY-LOG.md](230-02-DEPLOY-LOG.md) `## Restore procedure` H2 section. Operator-readable copy-paste rollback steps for Phase 231 (POINT OF NO RETURN):

1. Pre-flight (read-only): `sudo stat / sudo sha256sum / sudo tar -tzf $TARBALL > /dev/null` — confirm sha256 = `ad532b80…`.
2. Restore (destructive): `sudo systemctl stop` 5 services → `sudo tar -xzf $TARBALL -C /` → `sudo systemctl daemon-reload` → `sudo systemctl start` 5 services → curl smoke.
3. Redis state: RDB inside `/opt/livos/data/` loads automatically on next start; verify with `redis-cli DBSIZE`.
4. Caveats: tar restore is destructive (overwrites in-place edits); tarball does NOT include `liv/packages/core/` source (code rollback is `git checkout` + `update.sh`); sacred SHA held repo-side; `/home/bruce/livinity` absent at backup time; Mini PC only.

## Deviations

**Deviation 1 (Rule 3 — blocking issue auto-fixed):** Plan posited that `bash /opt/livos/update.sh` would self-rsync `scripts/pre-v42-cutover-backup.sh` into `/opt/livos/scripts/`. Reality: `update.sh` does NOT rsync the top-level repo `scripts/` directory; it only references specific scripts from its `$TEMP_DIR/scripts/` clone (e.g. `install-liv-assistant.sh`) directly. After `update.sh` completed and ran `Temp files cleaned`, the freshly-cloned new script was deleted from the temp dir before we could copy it. **Resolution:** STEP 2c in DEPLOY-LOG.md fetches the script directly from GitHub raw at the pinned Plan 230-01 commit (`b0c01d22`) via `curl -fsSL`, installs to `/opt/livos/scripts/pre-v42-cutover-backup.sh` with mode 0755 + `bruce:bruce` ownership. Same content, same behavior. This deviation did NOT affect any SC verdict.

**Deviation 2 (informational — not a Rule fix):** `/home/bruce/livinity` (operator data root) does not (yet) exist on this Mini PC. The script's `--ignore-failed-read` flag correctly tolerated this (`tar: /home/bruce/livinity: Warning: Cannot stat: No such file or directory`), and the archive completed cleanly with the other 6 paths captured. Documented in the Restore procedure caveats section so a future operator knows the tarball does not include that path. Future fresh backups will pick it up if the directory is created.

## Follow-up considerations

- **update.sh script delivery gap:** If future phases author scripts that need to land at `/opt/livos/scripts/`, either (a) extend update.sh with an `rsync $TEMP_DIR/scripts/ $LIVOS_DIR/scripts/` step (would require careful preservation of existing `start-livos.sh`), or (b) handle delivery in the per-phase deploy plan via direct `curl` from GitHub raw (this phase's pattern). No code change made — this is a documented observation only.
- **`/home/bruce/livinity` re-capture:** When the v38.3 operator data root is created on Mini PC (per `feedback_v38_3_drop_vault_concept`), a fresh `pre-v42-cutover-backup.sh --force` run will capture it. The current tarball reflects the actual on-disk state at 2026-05-27 14:40 UTC, which is what Phase 231 rollback needs.

## v42 milestone status

Phase 230 closes 2/2 → v42.0 milestone advances: **10/12 phases shipped** (222 ✅ + 223 ✅ + 224 ✅ + 225 ✅ + 226 ✅ + 227 ✅ + 228 ✅ + 229 ✅ + 230 ✅ + 232 ✅ reduced). Remaining: Phase 231 (OpenClawOS retirement — UNBLOCKED, gated on Phase 233 GREEN) + Phase 233 (E2E UAT).

## Self-Check

| Claim | Verified |
| ----- | -------- |
| scripts/pre-v42-cutover-backup.sh exists, mode 100755 | ✓ git ls-files -s shows `100755` |
| Plan 230-01 commit b0c01d22 | ✓ git log --oneline |
| Plan 230-02 commit d2c85fa5 | ✓ git log --oneline |
| Tarball /opt/livos/backups/pre-v42-cutover-2026-05-27.tgz exists, 3.8 GB | ✓ stat in STEP 3 |
| sha256 ad532b80… matches | ✓ script-side + post-verify both report same value |
| INTEGRITY_PASS | ✓ STEP 3 |
| RESTORE-INDEX seeded | ✓ STEP 3 tail shows 1 entry |
| Sacred SHA UNCHANGED | ✓ 4 independent snapshots |
| 5 services still active | ✓ STEP 3 POST-DEPLOY 5-SERVICE HEALTH |

## Self-Check: PASSED
