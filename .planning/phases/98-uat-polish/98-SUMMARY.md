# Phase 98 — v33 UAT + Polish + Docs — SUMMARY

**Phase:** 98-uat-polish
**Wave:** 5 (final — milestone close)
**Status:** CODE-COMPLETE 2026-05-08; v33 milestone now CODE-COMPLETE pending Mini PC UAT signoff.
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED before AND after every commit.

---

## What shipped

| Task | Commit (short) | What landed |
|------|----------------|-------------|
| 98-01 | `655cbefc` | `.planning/phases/98-uat-polish/UAT-CHECKLIST.md` — Mini PC walk-through (sections A-J + sign-off block; `[ ] PASS [ ] FAIL NOTES:` per row). |
| 98-02 | `655cbefc` | `docs/webapp-launcher.md` — first user-facing docs (sections 1-11: Overview / Prerequisites / Add / Stream / Teach / Auto / Privacy / Troubleshooting / Limits / What's next / Sources). |
| 98-03 | `655cbefc` | `.planning/ROADMAP.md` — Phase 92-98 boxes flipped `[x]`; v33 milestone heading flipped to "CODE-COMPLETE pending UAT"; project-level milestone index appended for v32.0 + v33.0; footer "Last updated" bumped. `.planning/STATE.md` bumped to milestone v33.0. Memory file `project_v33_complete.md` written to user-memory dir; `MEMORY.md` index updated. |
| 98-04 | `2187e4c5` | `livos/packages/livinityd/source/index.ts` — wired `streamManager` + `webappWindowManager` singletons into `livinityd.start()`. P93 left these optional fields `undefined` at runtime; tRPC routes were `SERVICE_UNAVAILABLE`. Now: vainfo probe → persistVaapiCaps → `new StreamManager` → `new WebAppWindowManager` → `startIdleCleanup`. Logger adapter bridges `log/verbose/error` → `info/warn/error/verbose`. Shutdown stops idle cleanup. |
| 98-rollup | (this commit) | SUMMARY + final rollup. |

3 user-visible commits + this rollup. Range: `74f198c1..HEAD`.

---

## Files touched

```
.planning/phases/98-uat-polish/UAT-CHECKLIST.md   | +178   (new)
docs/webapp-launcher.md                            | +198   (new)
.planning/ROADMAP.md                               | +24 -8 (milestone close)
.planning/STATE.md                                 | +6 -6  (milestone bump)
.planning/phases/98-uat-polish/98-SUMMARY.md       | (this file)
livos/packages/livinityd/source/index.ts           | +94 -2 (lifecycle hookup)
```

Memory file (lives outside repo, not git-tracked):
```
C:/Users/hello/.claude/projects/.../memory/project_v33_complete.md   (new)
C:/Users/hello/.claude/projects/.../memory/MEMORY.md                 (index updated)
```

---

## Sacred SHA verification

| Stage | git hash-object liv/packages/core/src/sdk-agent-runner.ts |
|-------|-----------------------------------------------------------|
| Pre-flight (P98 open) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post 98-01..98-03 docs commit (`655cbefc`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post 98-04 lifecycle hookup commit (`2187e4c5`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-rollup (this commit) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

Sacred file untouched throughout v33 (Phases 92-98). Per `97-03` verification harness pattern.

---

## v33 milestone closure

Per `98-CONTEXT.md` D-98-05: milestone close happens AFTER user reports UAT PASS. This phase ships the docs + lifecycle hookup; the final flip from "CODE-COMPLETE pending UAT" → "✅ Shipped" lands as a separate post-UAT commit (or via `/gsd-audit-milestone`).

Per `feedback_milestone_uat_gate.md` ("v29.4 audit said 'passed' with 4× human_needed verifications, shipped broken"): walker's signature is the only valid milestone PASS — NO agent-side declaration overrides it.

---

## Deploy step (post-agent — user runs)

After this phase's push, run on Mini PC:

```bash
ssh -i .../minipc bruce@10.69.31.68
bash /opt/livos/update.sh
```

`update.sh` will (P93 + P95 deploy hot-fix `952226c8`):
- apt-install 18 packages including `libva-utils` (provides `vainfo`).
- Ensure `ydotoold.service` systemd unit is installed and active.
- rsync source code (P94 + P95 + P96 + P97 + P98 lifecycle hookup).
- pnpm install (sharp, @novnc/novnc, react-resizable-panels, dbus-next, etc.).
- Build `@livos/config`, UI (vite), liv core/worker/mcp-server (tsc).
- `systemctl restart livos liv-core liv-worker liv-memory`.

Then walk `.planning/phases/98-uat-polish/UAT-CHECKLIST.md` (sections A-J + sign-off).

---

## Hand-off

- v33 phases 92-98 are all `[x]` in ROADMAP.md.
- v33 milestone heading is "CODE-COMPLETE pending UAT".
- Final ✅ Shipped flip is deferred to post-UAT.
- v34 carryovers per `v33-DRAFT.md` §9 (multi-user, CDP, WebRTC, voice, mobile, marketplace, drift detection).

**Closing sacred-SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
