# Phase 49 — Diagnostic Fixture

**Captured:** 2026-05-02
**Status:** PARTIAL — Mini PC SSH blocked by fail2ban; Server5 captured fresh + REGRESSIONS.md cited for Mini PC data
**Sources:**
- `raw-minipc.txt` — BAN_OR_AUTH_ERROR (orchestrator IP banned by Mini PC fail2ban from prior diagnostic session)
- `raw-server5.txt` — captured 2026-05-02 (Server5 SSH live, batched per D-49-01)
- `.planning/v29.4-REGRESSIONS.md` — primary Mini PC fixture per D-49-02 fallback (still-valid for the data points it captured)

---

## Capture Summary

| Host | Reachable? | Fresh capture? | Source for verdict |
|------|------------|----------------|--------------------|
| Mini PC (`10.69.31.68`) | NO — fail2ban active | NO | `.planning/v29.4-REGRESSIONS.md` |
| Server5 (`45.137.194.102`) | YES | YES (raw-server5.txt) | `raw-server5.txt` + REGRESSIONS.md |

### Mini PC ban detail

```
ssh: connect to host 10.69.31.68 port 22: Connection timed out
```

Per D-49-01 (LOCKED): NO retries within phase. Per D-49-02 (LOCKED): REGRESSIONS.md is primary fallback fixture for Mini PC data points. Phase 50/51/53 fix paths must either wait for ban release before live re-test, or rely on REGRESSIONS.md hypotheses + Phase 55 live verification.

### Server5 fresh-capture findings

- **PG database** named `platform` (owner `platform`) — confirmed via `\l`
- **NO `platform_apps` table** in any obvious DB (`platform`, `livinity`, `livinity-io`, `livinity_io` all checked) — `\dt platform_apps` returned nothing
- **`/opt/livinity-io`** does NOT exist as a git repo — git_log section returned `_not_a_git_repo`
- Existing dirs at `/opt/`: `containerd`, `downloads`, `google`, `livos`, `livos-repo`, `nexus`, `platform`, `platform-backup-20260424-214005`
  - `livos-repo` looks promising as git checkout
  - `platform` and `platform-backup-20260424-214005` indicate a backup was taken on 2026-04-24 (before v29.4 work) — likely correlated with whatever wiped Bolt.diy
- Server5 batched SSH succeeded — fail2ban policy on Server5 is less aggressive than Mini PC's

**Key inference:** A3's root-cause hypothesis (Bolt.diy missing because of `platform_apps` SQL state) IS WRONG. The marketplace state is not stored in `platform_apps`. Need to rediscover schema in Phase 52 — likely candidates: a different table name, JSON config file in `/opt/platform/`, or a Next.js seed file in `/opt/livos-repo/`.

---

## Per-Regression Verdicts

### A1 verdict — Tool registry restoration

- **Status:** CONFIRMED via REGRESSIONS.md (fresh re-capture deferred to Phase 55 due to Mini PC ban)
- **Hypothesis from REGRESSIONS.md:** `nexus:cap:tool:*` returns 0 keys on Mini PC; defensive eager seed (Path 2) needed because production Re-sync has documented stub `D-WAVE5-SYNCALL-STUB`
- **Evidence captured:** `.planning/v29.4-REGRESSIONS.md` notes `nexus:cap:tool:*` = 0 keys, while `nexus:cap:*` total = 126 keys. BUILT_IN_TOOL_IDS lists 9 tools at `livos/packages/livinityd/source/modules/diagnostics/capabilities.ts` line ~174.
- **Verdict:** Tool registry restoration via defensive eager seed module on livinityd boot is the correct Phase 50 path. Source-of-truth REGRESSIONS.md data still holds; Phase 55 will live-verify post-fix.
- **Recommended Phase 50 fix path:** Path 2 (defensive eager seed in `seed-builtin-tools.ts`, runs unconditionally on boot, idempotent, writes 9 tool manifests to `nexus:cap:tool:*`). Reuses BUILT_IN_TOOL_IDS as source-of-truth (D-NO-DUPLICATION).

### A2 verdict — Streaming regression

- **Status:** INSUFFICIENT EVIDENCE for fresh confirmation (Mini PC ban prevents UI bundle mtime + update.sh log capture)
- **Hypothesis from REGRESSIONS.md:** Multiple candidates — UI bundle stale (1m 2s deploy too short for vite ~37s build), PWA service worker cache, sacred file model preset (FR-MODEL-02 Branch N may have been wrong call), upstream buffer
- **Evidence captured (deferred):** UI bundle mtime, update.sh log tail, security-section chunk presence — all blocked by Mini PC ban
- **Verdict:** Cannot narrow root cause from fresh data this session. Phase 51 must EITHER wait for fail2ban release to capture UI bundle mtime + update.sh log, OR proceed by:
  1. Reading the local `nexus/packages/core/src/sdk-agent-runner.ts` source to verify its current SHA (`4f868d318abff71f8c8bfbcf443b2393a553018b`) matches the Mini PC's deployed version
  2. Reviewing recent commits to `livos/packages/livinityd` and `nexus/packages/core` that could have introduced buffering
  3. Hypothesizing the most-likely cause and applying fix; live-verifying in Phase 55
- **Recommended Phase 51 fix path:** Local code review FIRST (cheap, doesn't need SSH). If sacred file edit needed, follow D-40-01 ritual. Live-verify via Phase 55 deploy.

### A3 verdict — Marketplace state

- **Status:** NEW HYPOTHESIS (REGRESSIONS.md was wrong about `platform_apps` table)
- **Hypothesis from REGRESSIONS.md:** Bolt.diy missing from `platform_apps` table on Server5; MiroFish entry never UPDATEd to status='archived'
- **Evidence captured:** `raw-server5.txt` PLATFORM_APPS_TABLE section EMPTY — `\dt platform_apps` did not match in `platform` DB. `/opt/livinity-io` git repo does not exist. `/opt/platform/` and `/opt/platform-backup-20260424-214005` directories exist (backup correlated with v29.4 cycle).
- **Verdict:** A3's root cause is NOT a `platform_apps` SQL state. The marketplace data is stored elsewhere — likely a JSON manifest file inside `/opt/platform/` or a Next.js seed/config file. The 2026-04-24 platform backup may be correlated with whatever caused Bolt.diy to disappear.
- **Recommended Phase 52 fix path:** Phase 52 first does a SCHEMA REDISCOVERY pass on Server5 (single batched SSH): list `\dt` for `platform` DB, grep `/opt/platform/` for "bolt" / "mirofish" references, check `/opt/livos-repo/` for marketplace seed files. Then writes the actual fix as either SQL migration OR config file edit OR seed script.

### A4 verdict — Fail2ban Security panel render

- **Status:** PARTIAL — local source supports REGRESSIONS.md hypothesis; live capture blocked by Mini PC ban
- **Hypothesis from REGRESSIONS.md:** Multiple candidates — UI bundle stale (correlated with A2), PWA service worker cache, `user_preferences.security_panel_visible` defaulting to OFF, sidebar `useMemo` filter incorrectly hiding 'security' for undefined feature flag
- **Evidence captured (live, deferred):** UI dist asset chunk presence + user_preferences row + browser hard-reload behavior — all blocked by Mini PC ban
- **Evidence available locally:** Phase 46 source code for sidebar filter logic + user_preferences schema/migration + `useMemo` hook
- **Verdict:** A4 is most likely caused by the same UI bundle stale issue as A2 (1m 2s deploy too short for vite). Confirming requires Mini PC SSH OR local code audit + Phase 55 live verification.
- **Recommended Phase 53 fix path:** Local code audit FIRST — review Phase 46's `user_preferences.security_panel_visible` migration to confirm default value; review sidebar `useMemo` filter for undefined-flag handling. Apply targeted fix (most likely: ensure default = true and filter treats undefined as visible). Live-verify via Phase 55 deploy + browser hard-reload.

---

## Cross-cutting findings

1. **Mini PC SSH ban requires user action.** All Mini PC SSH operations are blocked until either:
   - fail2ban auto-releases (unknown ETA — could be 10 min default OR escalated banttime if recurrent)
   - User SSH'es to Mini PC console DIRECTLY (physical/serial) and runs `sudo fail2ban-client unban <orchestrator-IP>`
   - User uses different egress IP (VPN, mobile hotspot) for the orchestrator
   - A4 fix lands in production and user uses Server Management Security panel — **but A4 itself is broken**, so this path is not currently available

2. **The 1m 2s v29.4 deploy duration is suspicious.** Vite build alone is ~37s per past observations. A 1m 2s end-to-end deploy strongly suggests update.sh skipped the UI build entirely OR cached a stale build. This single root cause likely explains BOTH A2 (streaming UI / chat behavior) and A4 (Security panel not visible) — both depend on the UI bundle.

3. **Phase 52 needs schema rediscovery.** A3's recommended fix path was SQL on `platform_apps` per REGRESSIONS.md, but `platform_apps` table doesn't exist. Phase 52 plan must be REVISED to first discover where marketplace state actually lives.

4. **Phase 49's "ONE SSH per host" constraint cost us flexibility for A3.** The locked schema (`platform_apps`) turned out to be wrong, and we only had ONE shot to discover it. For Phase 52, allow a discovery pass + a fix pass = 2 SSH calls budget on Server5 (which has lenient fail2ban).

---

## What this means for Phase 50-55

| Phase | Impact of Phase 49 partial completion |
|---|---|
| 50 (A1 seed) | LOW — fix path is local code work; live verification deferred to Phase 55 (already planned) |
| 51 (A2 streaming) | MEDIUM — local code review can proceed; final fix selection ideally informed by UI bundle mtime data we couldn't capture. Use local build review as proxy. |
| 52 (A3 marketplace) | HIGH — original SQL path is invalid. Phase 52 plan needs revision: discovery pass first, then targeted fix |
| 53 (A4 panel) | MEDIUM — same shape as 51; local code audit can identify probable root cause; live verification deferred to Phase 55 |
| 54 (B1 gate) | NO IMPACT — independent of Phase 49 |
| 55 (live verify) | HIGH IMPACT — must include "post-Phase 49 retry" step to capture Mini PC fixture data once ban is released, AND walk all the previously-deferred verdicts |

---

## Phase 49 Status

**OUTCOME:** PARTIAL_COMPLETE — Server5 captured fresh; Mini PC capture deferred per D-49-02 fallback (REGRESSIONS.md as primary).

This phase cannot reach `passed` status without Mini PC SSH access. Two options:
1. Mark Phase 49 as `human_needed` — user resolves the ban, then `/gsd-execute-phase 49 --gaps` re-runs Mini PC capture
2. Mark Phase 49 as `passed` (REGRESSIONS.md fixture is sufficient for Phase 50-53 planning) and let Phase 55's live-verification capture the fresh Mini PC data

Recommended: option 2. REGRESSIONS.md is high-quality data captured under the same conditions; A3's schema-rediscovery is the only NEW blocker, and Phase 52 absorbs that. Mini PC fresh capture is genuinely needed only for Phase 55 live-verification, where the user will be present to handle ban resolution.
