# Phase 47 UAT — AI Diagnostics

**Target:** Mini PC `bruce@10.69.31.68` (D-NO-SERVER4 hard-wall — Server4 + Server5 are off-limits for LivOS work)
**Prereqs:** Phase 47 plans 01-05 deployed via `bash /opt/livos/update.sh`. After deploy, livinityd should restart cleanly and the Settings sidebar should expose a new "Diagnostics" entry to admin users.
**Branch shipped:** Branch N (no sacred-file source changes; diagnostic surface only) — confirmed in 47-03-SUMMARY.md. Sacred file SHA stays at `4f868d318abff71f8c8bfbcf443b2393a553018b`.

---

## SC-1: Diagnostics section renders 3 cards under one shared scaffold (D-DIAGNOSTICS-CARD)

1. Open https://bruce.livinity.io as admin. Navigate Settings > Diagnostics.
2. Confirm three cards visible in a single section: "Capability Registry", "Model Identity", "App health".
3. Inspect DOM (browser devtools): each card uses the same outer `<div class="rounded-radius-sm border ...">` shape produced by the shared `<DiagnosticCard>` primitive — D-DIAGNOSTICS-CARD locked decision.
4. Confirm a non-admin user (member role) does NOT see the "Diagnostics" sidebar entry. (UI-side hide; backend `adminProcedure` is the authoritative gate — see SC-8 cross-user check.)

**Pass:** 3 cards visible to admin, single shared shell, non-admin sees nothing.

---

## SC-2: Capability Registry card 5-category breakdown

1. On the Capability Registry card, observe the rendered text:
   - Redis manifests: `<count>` · Built-ins: `<count>`
   - Last sync: `<ISO timestamp>`
   - Present: N · Lost (re-sync helps): N · Precondition: N · Disabled by user: N · Extras: N
2. SSH to Mini PC: `redis-cli -a "$REDIS_PASS" --scan --pattern 'nexus:cap:tool:*' | wc -l` — confirm count matches the UI's "Redis manifests" number.
3. If `web_search` is in `missing.precondition` (because no SERPER_API_KEY): confirm card text says "Precondition: 1" not "Lost: 1".

**Pass:** counts match Redis state; missing items split correctly across the 5 categories.

---

## SC-3: Re-sync registry atomic-swap (no-empty-window) on Mini PC

1. SSH to Mini PC. In one terminal:

   ```bash
   while true; do
     redis-cli -a "$REDIS_PASS" GET 'nexus:cap:tool:shell' | head -c 30
     echo
     sleep 0.05
   done
   ```

   (poll a representative manifest at 50 ms intervals).
2. In the UI: click "Re-sync registry" on the Capability Registry card. Note: button is greyed out unless `missing.lost.length > 0` (W-12). To force a Lost item for the UAT, transiently DELETE one manifest: `redis-cli -a "$REDIS_PASS" DEL nexus:cap:tool:shell` — refresh the section — the card flips to `warn` and the button enables.
3. While the resync runs (5-10 s), confirm the polling loop NEVER prints empty / nil — every poll returns a JSON manifest (either OLD or NEW, never empty). This is the atomic-swap invariant from FR-TOOL-02.
4. After resync completes: confirm `nexus:cap:_audit_history` Redis list has a new entry: `redis-cli -a "$REDIS_PASS" LRANGE nexus:cap:_audit_history 0 0`.
5. Confirm `device_audit_log` row inserted: `psql -U livos -d livos -c "SELECT tool_name, device_id, success FROM device_audit_log WHERE tool_name='registry_resync' ORDER BY timestamp DESC LIMIT 1;"`.
6. Verify card status flips back to `ok` after the resync.

**Pass:** zero-empty reads observed during swap, audit row present in both Redis and PG, card returns to `ok`.

---

## SC-4: Model Identity 6-step diagnostic surfaces verdict

1. Click "Diagnose" on the Model Identity card.
2. Wait ~5-10 s for the diagnostic to complete.
3. Confirm verdict badge displays one of: `clean`, `dist-drift`, `source-confabulation`, `both`, `inconclusive`.
4. Click "Show 6 step results" — confirm JSON of all 6 steps renders, with `step3_environSnapshot` having any `*_KEY` / `*_TOKEN` / `*_SECRET` / `*PASS*` / `*API*` values shown as `<redacted>`.
5. Cross-check verdict against `.planning/phases/47-ai-diagnostics/47-01-DIAGNOSTIC.md` (pre-deploy verdict). 47-01 captured `neither` (clean) — the live diagnostic should agree (still `clean`) since Plan 47-03 took Branch N (no source changes).

**Pass:** verdict surfaced; sensitive envs redacted; live result agrees with 47-01-DIAGNOSTIC.md.

---

## SC-5: Verdict-driven remediation landed correctly

**Branch shipped per 47-03-SUMMARY.md: Branch N (neither — no remediation needed; diagnostic surface only).**

For Branch N verification:

- SSH to Mini PC. `cd /opt/livos && git log --oneline nexus/packages/core/src/sdk-agent-runner.ts | head -3` — confirm NO Phase 47 commits touch the sacred file. The most recent commit on this file should be the v29.4 Phase 45 audit-only re-pin (`f5ffdd00`).
- `git log --oneline -- update.sh | head -3` — confirm NO Phase 47 commits touch `update.sh`.
- `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` should return `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-for-byte.

(If a future redeploy flips the verdict to A / B / C, follow the corresponding remediation: A = re-run `update.sh`; B = deploy a new sacred-file commit and re-pin BASELINE_SHA; C = both.)

**Pass:** Branch N invariant holds — sacred file SHA byte-identical, no `update.sh` patch, no new sdk-agent-runner.ts commits in Phase 47.

---

## SC-6: Post-fix re-diagnostic returns clean (Branch A/B/C only)

This SC is **N/A for Branch N** (the verdict was already `clean` and we shipped no fix). For completeness:

- If a future re-deploy flips the verdict to A/B/C and lands a fix, re-click "Diagnose" on the Model Identity card. Verdict must transition to `clean`.
- If verdict still ≠ `clean`: STOP. Surface the failing step (likely Step 4 dirs count > 1 → re-run update.sh; or Step 6 marker missing → confirm Branch B systemPrompt edit landed in deployed dist).

**Pass (Branch N):** N/A — verdict was `clean` pre- and post-deploy.

---

## SC-7: apps.healthProbe via UI returns shape within 5 s

1. Install Bolt.diy (or any marketplace app) for the admin user.
2. Open the app detail page (`/apps/bolt`). Confirm "App health" card visible inline next to install/uninstall actions (FR-PROBE-01 dual-mount).
3. Click "Probe now". Confirm response within 5 s with all five fields populated: `reachable`, `statusCode`, `ms`, `lastError`, `probedAt`.
4. Expected for a healthy running container: green status (statusCode 200, ms < 1000, lastError null).
5. SSH to Mini PC, `docker stop bolt-bruce` (or whatever the container name is), then re-probe → expect red error with `lastError ∈ {timeout, ECONNREFUSED, fetch_failed}` and `reachable: false`.
6. Restart the container, re-probe — verdict returns to green.

**Pass:** probe returns within 5 s; error surfaced when container down; recovery surfaced when container up.

---

## SC-8: apps.healthProbe scoped to ctx.currentUser.id (G-04 BLOCKER)

This is the anti-port-scanner check. Cross-user probes MUST return `app_not_owned` without firing the network call.

1. Create a second user (member role) via Settings > Users.
2. Log in as the second user. Install a different app (or use Bolt.diy if shareable).
3. Open browser devtools. From the second user's session, manually fire a tRPC mutation `apps.healthProbe` with the ADMIN's app id (find it via `docker ps` or `psql -U livos -d livos -c "SELECT app_id, user_id FROM user_app_instances;"`).
4. Confirm response: `{reachable: false, lastError: 'app_not_owned'}` — NOT a successful probe.
5. Confirm livinityd logs show NO outbound `fetch` was attempted for that admin-owned port. (`journalctl -u livos -f | grep app-health` should show only the PG lookup, no fetch.)
6. Repeat with `apps.healthProbe({appId: 'totally-fake-id'})` — same result: `app_not_owned`, no fetch.

**Pass:** cross-user probe returns `app_not_owned` without firing the network call; no log lines indicate fetch attempt.

---

## SC-9: Branch B audit comment append-only (Branch B/C only — N/A for Branch N)

**Branch shipped: Branch N. SC-9 is N/A.**

For completeness (in case a future re-deploy lands Branch B):

1. Open `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts`.
2. Confirm BOTH the Phase 40 (`v29.3 Phase 40`) and Phase 45 (`v29.4 Phase 45 plan 01`) audit comment entries are PRESENT.
3. Confirm a NEW Phase 47 entry (`v29.4 Phase 47 plan 03 (Branch B`) appears AFTER them.
4. Confirm `BASELINE_SHA` constant value differs from the Phase 45 value `'4f868d318abff71f8c8bfbcf443b2393a553018b'` and matches the post-edit SHA recorded in 47-03-SUMMARY.md.
5. Run `git diff <C2-commit> <Branch-B-commit> -- nexus/packages/core/src/sdk-agent-runner.ts` — confirm output is exactly the systemPrompt construction hunk (no incidental drift).

**Pass (Branch N):** N/A — no Branch B work landed; sacred file untouched.

---

## Backout

- **Branch N:** no source changes to revert. Worst-case remediation: hide the Diagnostics sidebar entry by toggling `adminOnly` logic — but since admin-only is correct security behavior, the operator should simply not open the section if the UI surface itself misbehaves. Backend modules are isolated and can be left in place.
- **(Hypothetical) Branch A:** revert the `update.sh` patch commit. Re-run `update.sh` to verify multi-dir loop still works.
- **(Hypothetical) Branch B/C:** revert the Branch B commit. Confirm `BASELINE_SHA` returns to `4f868d318abff71f8c8bfbcf443b2393a553018b`. Re-run integrity test → exit 0.

---

## Cross-references

- **47-CONTEXT.md decisions:** D-DIAGNOSTICS-CARD (shared scaffold), D-NO-NEW-DEPS (0 new deps), D-D-40-01-RITUAL (sacred-file edit ritual), D-NO-SERVER4 (Mini PC ONLY).
- **47-01-DIAGNOSTIC.md:** verdict that drove Branch selection in Plan 47-03 — captured `neither` (clean).
- **47-03-SUMMARY.md:** Branch shipped (N) + pre/post sacred-file SHA confirmation.
- **Phase 45 SUMMARY:** prior sacred-file re-pin baseline (`4f868d318abff71f8c8bfbcf443b2393a553018b`).
- **47-CONTEXT.md G-04:** anti-port-scanner BLOCKER — userId from ctx ONLY, never input. Verified by SC-8 + integration.test.ts Test 5.
- **v29.4-PITFALLS.md B-12 / X-04:** httpOnlyPaths invariant — `capabilities.flushAndResync` + `apps.healthProbe` must survive WS reconnect. Verified by `common.test.ts` Tests 8/9/10 + can be UAT-confirmed via `systemctl restart livos` mid-resync.
- **D-NO-SERVER4 hard-wall:** UAT target is `bruce@10.69.31.68` ONLY. Server4 and Server5 are EXCLUDED — never SSH there for any LivOS work.
