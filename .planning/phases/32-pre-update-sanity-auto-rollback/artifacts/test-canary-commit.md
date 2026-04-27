# Phase 32 REL-02 Canary-Commit Validation Procedure

**Status:** OPT-IN ONLY. Touches production. Do NOT run unless the user explicitly says "run the canary."

**Purpose:** Validate the FULL crash → systemd `OnFailure=` → rollback chain end-to-end on a real host. Plan 32-03's synthetic trigger (`systemctl start livos-rollback.service` against a known-good `.deployed-sha.previous`) covers ~95% of the chain — it exercises the rollback orchestrator's clone+checkout+build+restart pipeline + history JSON write + lock cleanup. This canary tests the remaining 5%: the actual `OnFailure=livos-rollback.service` directive firing AFTER `StartLimitBurst=3` exhausts within `StartLimitIntervalSec=300`.

**Why opt-in:** This procedure deliberately crashes livinityd 3 times in 5 minutes on the production Mini PC. Users WILL see ~5 minutes of LivOS unavailability while the canary deploys, crash-loops, and rolls back. Don't run this during business hours, during user demos, or when remote-access (SSH or web) to the box is the user's only management lifeline.

## Pre-conditions

Before running this canary, verify ALL of the following on the target host (Mini PC by default — Server4 ONLY with explicit confirmation):

- Phase 32 patch script `phase32-systemd-rollback-patch.sh` has been applied successfully (Plan 32-03 Tasks 3 + 4)
- `systemctl show livos.service -p RestartMode` returns `RestartMode=direct` (NOT empty — empty means systemd v < 254 and the drop-in was skipped per O-05; canary CANNOT validate auto-fire on those hosts because OnFailure= would fire on the FIRST crash, not the 3rd)
- `systemctl show livos.service -p OnFailure` returns `OnFailure=livos-rollback.service`
- `systemctl show livos.service -p StartLimitBurst` returns `StartLimitBurst=3`
- `systemctl show livos.service -p StartLimitIntervalUSec` returns `StartLimitIntervalUSec=5min` (or `300000000`)
- `systemctl is-enabled livos-rollback.service` returns `enabled`
- `/opt/livos/.deployed-sha.previous` exists AND is set to a known-good prior SHA (NOT the broken canary SHA)
- `/opt/livos/.rollback-attempted` does NOT exist (lock cleared from any prior run)
- Latest changes committed and pushed to master (so rollback target is clean)
- A second SSH session is open to the host so you can intervene if rollback wedges
- 30+ minutes of dedicated babysitting time available

## Procedure

### 1. Create canary branch from current master

```bash
git checkout master && git pull origin master
git checkout -b phase32-rollback-canary
```

### 2. Inject crash on livinityd boot

Edit `livos/packages/livinityd/source/index.ts` and add `process.exit(1)` as the FIRST executable line of the file (after imports — keep imports compileable so the build itself succeeds; we want to crash on RUN, not on BUILD):

```typescript
// At the very top of index.ts after imports:
process.exit(1);
```

Commit and push:

```bash
git add livos/packages/livinityd/source/index.ts
git commit -m "test(canary): force livinityd boot crash for Phase 32 rollback validation (DO NOT MERGE)"
git push origin phase32-rollback-canary
```

### 3. Capture current SHA on host

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "cat /opt/livos/.deployed-sha"
# Record the printed value as $EXPECTED_PREV_SHA — this is what the rollback should restore
```

### 4. Set `.deployed-sha.previous = current production SHA`

The rollback target MUST be the current good SHA (so when rollback fires after the canary deploys + crashes, it restores the host to its current good state):

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "sudo cp /opt/livos/.deployed-sha /opt/livos/.deployed-sha.previous && \
   sudo chmod 644 /opt/livos/.deployed-sha.previous"
```

### 5. Deploy canary via update.sh with branch override

Point `update.sh` at the canary branch via a `REPO_URL` override OR by manually cloning the canary branch into the host's update flow. Easiest: SSH and force-clone the canary branch where update.sh expects, then run update.sh:

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "sudo bash -c 'rm -rf /tmp/livinity-update-canary && \
   git clone --depth 1 -b phase32-rollback-canary https://github.com/utopusc/livinity-io.git /tmp/livinity-update-canary && \
   sudo BRANCH=phase32-rollback-canary REPO_URL=https://github.com/utopusc/livinity-io.git bash /opt/livos/update.sh'"
```

(If `update.sh` doesn't honor `BRANCH=` env var: edit a temporary copy of `update.sh` on the host to checkout `phase32-rollback-canary` after clone, run that copy, restore the original. Or, even simpler: temporarily fast-forward `master` to the canary commit on a fork, run update.sh against the fork, then revert.)

### 6. Watch journalctl in real time (~3-5 min)

In a SECOND terminal (keep first terminal open for emergency intervention):

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "sudo journalctl -fu livos.service -fu livos-rollback.service"
```

Expected sequence:
- `update.sh` completes successfully (canary code IS valid, just crashes on boot)
- `livos.service: Starting livinityd...`
- `process.exit(1)` triggers — `livos.service: Main process exited, code=exited, status=1/FAILURE`
- systemd auto-restart attempt 1 (no `OnFailure=` fire because `RestartMode=direct`)
- attempt 2 — same
- attempt 3 — same
- `livos.service: Start request repeated too quickly` OR `livos.service: Start limit hit, refusing to start`
- `livos.service: Failed with result 'start-limit-hit'` — unit transitions to `failed`
- `OnFailure=livos-rollback.service` triggers
- `livos-rollback.service: Starting LivOS auto-rollback to previous deployed SHA`
- `[ROLLBACK] starting at <ISO-timestamp>`
- `[ROLLBACK] reverting from <canary-sha> to <prior-sha>`
- `[ROLLBACK] cloning into /tmp/livinity-rollback-...`
- `[ROLLBACK] rsyncing livinityd source` ... etc through build steps
- `[ROLLBACK-VERIFY] @livos/config dist OK ...` ... etc for all packages
- `[ROLLBACK] history JSON written: <ts>-rollback.json`
- `[ROLLBACK] restarting livos liv-core liv-worker liv-memory`
- `livos.service: Started livinityd` (now running on prior good SHA)
- `[ROLLBACK-OK] reverted to <prior-sha> in <duration>ms`
- Total wall-clock from 3rd crash to `[ROLLBACK-OK]`: **MUST be < 2 min** (REL-02 SC-2)

## Success Assertions

After the rollback completes, run all of these and verify each:

```bash
# 1. .deployed-sha reverted to expected prior SHA
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "cat /opt/livos/.deployed-sha"
# MUST output exactly $EXPECTED_PREV_SHA from step 3

# 2. New rollback history JSON exists with status=rolled-back
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "ls -la /opt/livos/data/update-history/*-rollback.json | tail -1"
# Inspect: status MUST be \"rolled-back\", from_sha MUST be canary SHA, to_sha MUST be \$EXPECTED_PREV_SHA

# 3. livos.service is active (back on good code)
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "systemctl is-active livos.service"
# MUST output: active

# 4. /health endpoint returns 200
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "curl -fsS http://localhost:8080/health"
# MUST return HTTP 200 with valid JSON

# 5. Rollback lock cleared (rollback.sh removed it on success)
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "ls -la /opt/livos/.rollback-attempted 2>&1 | head -3"
# MUST output: ENOENT / "No such file or directory"

# 6. journalctl confirms [ROLLBACK-OK] line landed
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "sudo journalctl -u livos-rollback.service -n 200 --no-pager | grep -E '\\[ROLLBACK-OK\\]'"
# MUST match the [ROLLBACK-OK] reverted to <sha> in <ms>ms line
```

## Failure Recovery (if rollback DIDN'T fire or wedged)

If the canary deploys but rollback never fires (or rollback fires but doesn't restore the prior SHA), recover manually:

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 "sudo bash -c '\
  echo \$EXPECTED_PREV_SHA > /opt/livos/.deployed-sha && \
  rm -f /opt/livos/.rollback-attempted && \
  systemctl reset-failed livos.service && \
  bash /opt/livos/update.sh'"
```

(Replace `\$EXPECTED_PREV_SHA` with the literal SHA captured in step 3.)

If `update.sh` itself is broken because the patch script's safety net didn't auto-restore: pull the original from `/opt/livos/update.sh.pre-phase32`:

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "sudo cp /opt/livos/update.sh.pre-phase32 /opt/livos/update.sh && sudo chmod +x /opt/livos/update.sh"
```

If livinityd is wedged in any other way: `journalctl -fu livos.service -fu livos-rollback.service` to diagnose, then `systemctl reset-failed livos.service && systemctl restart livos`.

## Cleanup (mandatory after success — DO NOT skip)

The canary commit MUST NEVER be merged to master. Delete the branch from both local and origin:

```bash
git push origin --delete phase32-rollback-canary
git branch -D phase32-rollback-canary
```

Verify removal:

```bash
git branch -a | grep phase32-rollback-canary
# MUST output nothing
```

Also clean up the host-side scratch dir:

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "sudo rm -rf /tmp/livinity-update-canary /tmp/livinity-rollback-*"
```

## Risks

- **Rollback bug = no working livinityd until manual repair.** If `livos-rollback.sh` has a bug (logic error, missing dep on host, network blip mid-fetch), the host will end up with NO working livinityd. The `.rollback-attempted` lock will be set; subsequent OnFailure= fires will hit the loop guard and abort cleanly, but livinityd won't come back up until you manually intervene. Always keep an SSH session open. Always have `EXPECTED_PREV_SHA` recorded before starting.
- **systemd version drift = OnFailure= fires immediately.** If somehow `RestartMode=direct` isn't actually being honored (drop-in misnamed, daemon-reload skipped, systemd version misdetected), `OnFailure=` will fire on the FIRST crash instead of the 3rd. Pre-check that `systemctl show livos.service -p RestartMode` returns `RestartMode=direct` BEFORE step 5. If it returns empty or `RestartMode=normal`, ABORT — the canary will not exercise the burst-detection logic and the test is invalid.
- **Canary commit MUST NOT be merged to master.** A merged crash-on-boot will brick all production hosts that subsequently deploy. The cleanup section is mandatory; do not skip it.
- **Concurrent update during canary.** If a user clicks "Install Update" in the UI while the canary is mid-cycle, both `update.sh` and `livos-rollback.sh` will race for `/opt/livos/`. Coordinate: announce the canary in advance; freeze deploys for the canary window.
- **Network blip during rollback fetch.** `livos-rollback.sh` clones from GitHub; a 5-min outage during the rollback's `git clone` would leave the host stranded on the canary SHA. Mitigation: rollback's inline precheck includes a curl 5s reach test that aborts cleanly if GitHub is unreachable — but the lock is already set, so the loop guard prevents a retry until the operator clears it.
