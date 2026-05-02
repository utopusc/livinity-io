---
gsd_state_version: 1.0
milestone: v29.5
milestone_name: v29.4 Hot-Patch Recovery + Verification Discipline
status: complete
last_updated: "2026-05-02T19:35:00Z"
last_activity: "2026-05-02 — v29.5 closed via --accept-debt; v30.0 milestone ready to bootstrap"
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v29.5 closed)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Last shipped milestone:** v29.5 v29.4 Hot-Patch Recovery + Verification Discipline — 2026-05-02 (closed via `--accept-debt`; live verification work carried to v30.0)
**Current focus:** Bootstrapping v30.0 Livinity Broker Professionalization (passthrough mode, Bearer auth, public endpoint, true token streaming, spec compliance, observability)

## Deferred Items

Items acknowledged and deferred at v29.5 milestone close on 2026-05-02:

| Category            | Item                                                            | Status         |
|---------------------|-----------------------------------------------------------------|----------------|
| verification_gap    | Phase 49 (mini-pc-diagnostic) — `human_needed`                  | carried-to-v30 |
| verification_gap    | Phase 51 (a2-streaming-fix) — `human_needed`                    | carried-to-v30 |
| quick_task          | 260425-sfg-v28-0-hot-patch-bundle-tailwind-sync-bg-             | missing        |
| quick_task          | 260425-v1s-v28-0-hot-patch-round-2-activity-overflo             | missing        |
| quick_task          | 260425-x6q-v28-0-hot-patch-round-3-window-only-nav-             | missing        |
| uat-walk            | 4 v29.4 UATs (45/46/47/48) — un-executed pending Mini PC walk    | carried-to-v30 |
| uat-walk            | 6 v29.3 carry-forward UATs (39-44) — un-executed                 | carried-to-v30 |
| uat-walk            | 4 v29.5 UATs (49/50/51/52/53/54) — synthesized from SUMMARY only | carried-to-v30 |

**v30.0 Phase 63 (mandatory live verification)** is the canonical close-out for all 14 carry-forward UATs PLUS the 3 external client (Bolt.diy / Open WebUI / Continue.dev) smoke tests for v30's new architecture.

## Forensic Trail

- 2026-05-02 — `/gsd-new-milestone v29.5` invoked. PROJECT.md updated. STATE.md reset.
- 2026-05-02 — REQUIREMENTS.md filled (26 reqs across 6 categories: A1/A2/A3/A4/B1/VERIFY).
- 2026-05-02 — gsd-roadmapper produced ROADMAP.md (7 phases, 49-55, 100% coverage).
- 2026-05-02 — Phases 49-54 executed (6 phases / 6 plans / 8 hot-patch commits). Phase 55 (live verification) NEVER executed.
- 2026-05-02 — Live Bolt.diy testing surfaced 3 new architectural issues (block-level streaming, identity contamination, OpenAI-Like compat) that exceeded v29.5 hot-patch scope.
- 2026-05-02 — `MILESTONE-CONTEXT.md` seeded for v30.0 Livinity Broker Professionalization (commit `d59b1b51`).
- 2026-05-02T19:35Z — `/gsd-complete-milestone v29.5 --accept-debt` invoked. Forensic gate override entry written to `MILESTONES.md`. Phases 49-54 archived to `.planning/milestones/v29.5-phases/`. Roadmap and requirements archived. v29.5 closed.

## Next Steps

1. **`/gsd-new-milestone v30.0`** — Workflow consumes `.planning/MILESTONE-CONTEXT.md` to scaffold the 7-phase Broker Professionalization roadmap (Phases 56-63). The old paused "v30.0 Backup & Restore" definition in `.planning/milestones/v30.0-DEFINED/` is superseded by this new v30.0 — Backup & Restore work renumbers to a future milestone.
2. **Phase 56 mandatory research spike** — Anthropic SDK direct passthrough viability + Agent SDK boundaries + Claude API model selection landscape + public endpoint architecture (Caddy vs CF Workers) + Bearer token auth patterns (`liv_sk_*` ergonomics + revocation strategies). Must complete before Phase 57 can plan.
3. After Phase 56 spike, plan Phase 57 (passthrough mode) with full implementation context.

## Locked Decisions Carried into v30.0

- **D-NO-NEW-DEPS** — preserved (broker may add Anthropic SDK if Phase 56 spike justifies it)
- **D-NO-SERVER4** — preserved (Mini PC + Server5 only)
- **D-LIVINITYD-IS-ROOT** — preserved
- **Sacred file `nexus/packages/core/src/sdk-agent-runner.ts`** at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — DO NOT TOUCH in v30. Passthrough mode bypasses this file entirely. Agent mode keeps current behavior.
- **D-LIVE-VERIFICATION-GATE** (added v29.5 Phase 54) — milestones cannot close `passed` without on-Mini-PC UAT execution per relevant phase. v30.0 Phase 63 is the first real-world test where the gate must pass cleanly (not via `--accept-debt`).
- **D-NO-BYOK** (v29.3 Phase 39) — broker user's raw `claude_*` API key is NEVER accepted. v30 introduces broker-issued `liv_sk_*` Bearer tokens; subscription-only path preserved underneath.
- **D-51-03** (Branch N reversal deferred) — model identity preset switch in `sdk-agent-runner.ts` deferred until Phase 56 spike clarifies whether deploy-layer fix was sufficient or sacred edit is still needed.
