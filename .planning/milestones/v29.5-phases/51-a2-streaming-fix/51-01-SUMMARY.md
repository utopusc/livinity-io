---
phase: 51
plan: 01
status: complete
date: 2026-05-02
---

# Plan 51-01 — A2 Streaming Regression Fix (deploy-layer)

## Outcome

**COMPLETE (mechanism)** — defensive UI build hardening landed in `update.sh`. Live verification deferred to Phase 55. FR-MODEL-02 Branch N reversal explicitly DEFERRED per D-51-03.

## Files Modified

| File | Diff |
|------|------|
| `update.sh` | UI build block: +13 lines comment + 1 line `rm -rf dist` added; `verify_build` line moved from BEFORE to AFTER `npm run build` |

## Sacred File Status

**UNTOUCHED.** `nexus/packages/core/src/sdk-agent-runner.ts` SHA remains `4f868d318abff71f8c8bfbcf443b2393a553018b`. No D-40-01 ritual triggered this phase.

## What changed (semantically)

Pre-Phase-51 UI build sequence:
```bash
verify_build "@livos/ui" "/opt/livos/packages/ui/dist"  # no-op on existing install (passes because old dist exists)
npm run build 2>&1 | tail -5                             # vite — could be cache-hit no-op OR silent skip
```

Post-Phase-51 UI build sequence:
```bash
rm -rf dist                                              # GUARANTEES vite produces fresh output
npm run build 2>&1 | tail -5                             # vite reseed
verify_build "@livos/ui" "/opt/livos/packages/ui/dist"  # POST-condition check (matches function contract)
```

Why this fixes A2 (streaming) AND likely A4 (Security panel):
- v29.4 deploy was 1m 2s end-to-end. Vite alone is ~30-60s on this project. Either UI build was a phantom no-op (vite cache hit) or it silently produced no output. Either way, dist was stale.
- New streaming UI code (Phase 48 SSH viewer) and Security panel sidebar entry (Phase 46) were in source but not in dist.
- PWA service worker fetched the OLD dist's precache manifest (unchanged hash) → no SW update event → browser kept serving old bundle.
- `rm -rf dist` forces fresh vite output every deploy. Hash changes. PWA `registerType: 'autoUpdate'` triggers SW update. Browser refreshes on next visit.

## FR-A2-04 Deferral (Branch N reversal)

The user's complaint ("hala kim oldugunu bilmiyor hangi model oldugunu") is the model-identity regression originally tracked as FR-MODEL-02 in v29.4 Phase 47. Phase 47 took Branch N (verdict=neither, sacred file untouched) based on the `response.model` field showing the right ID. The user disagrees: the model COLLOQUIALLY says wrong identity.

We DO NOT reverse Branch N in Phase 51. Reasons (D-51-03):
1. Streaming and identity are SEPARATE behaviors with different root causes. Bundling them risks mis-attribution if Phase 55 live-verify shows partial fix.
2. Identity remediation REQUIRES sacred file edit (stronger prompt assertions OR SDK preset mode). D-40-01 ritual: byte-counted, BASELINE_SHA pin update, audit comment. None of this is reversible.
3. Without Mini PC SSH access (banned by fail2ban as of Phase 49), we CANNOT live-verify any sacred file edit empirically. v29.4's lesson: "audit `passed` requires live UAT". Shipping an unverified sacred edit repeats the mistake.
4. FR-A2-04 is conditional ("If FR-MODEL-02's Branch N decision is reversed..."). We choose NOT to reverse → conditional satisfied by deferral with rationale documented.

**Recommended follow-up (not in v29.5):** After Phase 55 live-verifies whether the deploy fix alone restores streaming, a separate phase (e.g., v29.6 Phase 56) addresses model identity if still broken. That phase batches sacred file edit + integrity test BASELINE_SHA update + audit comment.

## What to look for in Phase 55 live verification

After Mini PC ban resolves and a fresh `bash /opt/livos/update.sh` runs:

1. **Deploy duration:** should now be ≥1m 30s (vite full build, no cache). If still 1m 2s, the fix is NOT being applied — investigate update.sh-on-server-vs-repo drift (per `feedback_update_sh_drift.md` memory).
2. **dist mtime:** `stat /opt/livos/livos/packages/ui/dist/index.html` should show fresh timestamp (within seconds of deploy completion).
3. **dist content fingerprint:** `ls /opt/livos/livos/packages/ui/dist/assets/ | sort` should differ from pre-deploy snapshot.
4. **Streaming behavior:** AI Chat with prompt expected to take >2s should show token-by-token streaming. If still buffered, root cause is upstream (server-side buffer in nexus core, NOT the deploy layer) — escalate to follow-up phase.
5. **Security panel render:** Server Management sidebar should now show 13 entries including "Security". If still missing, root cause is in Phase 53's scope (DB default / sidebar filter logic) AND/OR PWA SW didn't auto-update — escalate.
6. **Model identity:** Test "Hangi modelsin?" three times. If user reports still wrong, schedule the v29.6 follow-up phase for FR-MODEL-02 surgical edit.

## Requirement Coverage

- **FR-A2-02** (targeted fix applied) — `update.sh` deploy-layer hardening ✓
- **FR-A2-04** (Branch N reversal documentation) — explicit deferral with rationale documented in CONTEXT.md, this SUMMARY, and below in PROJECT.md update ✓
- **FR-A2-03** (live token streaming) — DEFERRED to Phase 55

## Phase 51 status

Mechanism complete. Live verification deferred to Phase 55 per ROADMAP success criterion #4. Sacred file SHA preserved.
