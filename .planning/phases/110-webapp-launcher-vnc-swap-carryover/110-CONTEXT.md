# Phase 110 — WebApp Launcher VNC Swap Carry-over — CONTEXT

**Status (entry):** carry-over rollup; the source-tree code already shipped in v33 across `9a61d78a..351bcb62` (Phase 99-01..99-04, 11 commits, 66/66 vitest cases green) and is currently live on Mini PC `bruce@10.69.31.68` at deployed SHA `1df2ec6` (post-Phase 111 + tunnel + cmdk cleanup). What was missing: the Phase 99 rollup never *closed* — Plan 99-05 was queued, partially executed (`cd6f442a` drafted SUMMARY, `66f6b75e` flipped Phase 99 to `[~]` PARTIAL-PASS pending Phase 100 follow-up) but no Phase 99 plan ever produced a `[x]` SHIPPED-with-runtime-smoke artifact for the carry-over closure proof. Phase 110 is that closure.

**Driver:** ROADMAP.md line 124 — `### Phase 110: Phase 99 WebApp Launcher VNC Swap (carry-over)` was placeholder-skeletoned in v34.0 milestone open (2026-05-12) but never planned. The "implement x11vnc per-window spawn logic" wording in that ROADMAP entry is misleading — that work *already exists* in `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` (290 lines, shipped `909cca8e` + `e2fc8d39` 2026-05-08). Phase 99-RESEARCH.md and 99-SUMMARY.md confirm the canonical x11vnc argv (`-id 0xHEX -rfbport <port> -localhost -shared -forever -noxdamage -nopw`) is locked, empirically verified against bruce's GNOME-on-Xorg + Mutter session, and that the wire-format mismatch trigger (P93 fMP4 vs noVNC RFB) is RESOLVED for the single-stream case.

**What Phase 110 actually does:** **CLOSURE ONLY.** No source-tree changes. The plan
1. Re-verifies the in-tree x11vnc backend is healthy by spawning an ephemeral `x11vnc` against bruce's `:0` Xorg display on a dedicated loopback port (5933), capturing the RFB 003.008 handshake banner with `nc`, then immediately killing the test process.
2. Writes the rollup artifacts that should have been written in 99-05 but never were: **110-SUMMARY.md** (rollup), one **operator-pending UAT row** appended to `.planning/phases/98-uat-polish/UAT-CHECKLIST.md`, **ROADMAP.md** Phase 110 entry flipped from skeleton to CODE-COMPLETE-PLUS-RUNTIME-SMOKE, and a new **STATE.md** section documenting the closure.
3. Re-verifies sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` and scope (no `liv/packages/core/` or `livos/packages/ui/` edits in the closure commit).
4. Single `docs(110-01)` commit + push.

**Why now:** v34.0 milestone is at 7/8 phases shipped (per STATE.md `progress.completed_phases: 7`). Phase 110 is the last open v34.0 phase before the milestone can flip to CODE-COMPLETE. The browser-walked UAT (the operator opens https://bruce.livinity.io, clicks a WebApp icon, observes the noVNC handshake + bidirectional input on the live deployed code) is documented as **OPERATOR-PENDING** in UAT-CHECKLIST.md; it is NOT executed as part of this plan because Mini PC is the user's active OwnCloud (per memory `feedback_minipc_is_owncloud_primary`) and disrupting an existing user session for an in-CLI browser-walk is unacceptable. The runtime smoke test against `:0` is the strongest non-disruptive evidence we can collect from Claude-side; the operator-binding UAT happens in the operator's own browser window when they're already at the dashboard.

## Locked Decisions

| ID | Decision |
|----|----------|
| **D-110-NO-RECODE** | Phase 110 closure is `.planning/` only. Zero source-tree changes. The Phase 99 commits (`9a61d78a..351bcb62`) already shipped the code and are currently live on Mini PC at deployed SHA `1df2ec6`. Re-coding the same work would create commit-history confusion and break sacred SHA accounting. |
| **D-110-NO-FMPEG-REGRESSION** | Phase 93 fMP4 path (`fmp4-fanout.ts`, `encoder-args.ts` fmp4 branches, `pipewire-portal.ts`, `geometry-tracker.ts`) untouched. The desktop-stream native app continues to work via `Fmp4Fanout` for `mode:'desktop'`. The smoke test exercises ONLY the new vnc-window path — it spawns `x11vnc` directly against `:0` on a dedicated port, NOT through livinityd's vnc-bridge (which would risk allocating the next per-stream port from the [15900,16100) ring and interfering with a hypothetical live WebApp stream). |
| **D-110-OPERATOR-PENDING-UAT** | Browser-walked UAT row goes in UAT-CHECKLIST.md as **OPERATOR-PENDING** (a new result state alongside PASS/FAIL/SKIP). Phase 110 is **CODE-COMPLETE-PLUS-RUNTIME-SMOKE** without the browser walk; **SHIPPED** flips only after the operator (bruce) confirms in chat they walked it themselves at a time of their choosing. This honors `feedback_milestone_uat_gate.md` (UAT is mandatory) AND `feedback_minipc_is_owncloud_primary.md` (do not disrupt OwnCloud sessions). |
| **D-110-SACRED-SHA** | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across the closure commit. Pre-commit hook gates this; this plan re-verifies via `git hash-object` before `git add`. |
| **D-110-NO-PROD-IMPACT** | No edits to Mini PC scripts (`livos/install.sh`, `livos/update.sh`). The smoke test is run-by-claude over SSH, not invoked by any auto-deploy pipeline. The smoke test x11vnc process is killed via `pkill` immediately after the handshake banner is captured (`-timeout 30` already bounds it as a secondary defense). |
| **D-110-EPHEMERAL-LOCALHOST-ONLY** | Smoke test x11vnc binds `-localhost -rfbport 5933` (NOT a port from the production [15900,16100) ring; NOT externally accessible). Smoke test `nc` connects to `127.0.0.1:5933`. Zero exposure to ZeroTier or LAN. |

## Threat Surface (smoke test)

| Boundary | Risk | Mitigation |
|----------|------|------------|
| Local machine ↔ Mini PC SSH | OpenSSH key auth (contabo_master.minipc); existing | Existing key, existing user |
| Mini PC `:0` ↔ ephemeral x11vnc | bruce's session screen-readable through new TCP listener | `-localhost` bind + `pkill` cleanup; smoke test runs <5s; port 5933 is non-production |
| livinityd live state | Smoke test could collide with a live WebApp stream's port | Dedicated port 5933 outside production [15900,16100) ring; no allocation request to vnc-bridge.ts |
| Sacred runner | Closure commit must not touch `liv/packages/core/` | Pre-commit hook + manual `git hash-object` verify in plan |

## Read-list

Same as 110-01-PLAN.md `<read_first>` block.

## Carry-over inheritance from Phase 99

Already documented in `99-SUMMARY.md` lines 124-130:
- **No new carryovers** beyond what 99-SUMMARY.md captured.
- **fMP4 path orphaned for WebApp use case but ALIVE for `mode:'desktop'`.** Inventory (do NOT delete in Phase 110 — out of scope): `streaming/fmp4-fanout.ts`, `streaming/encoder-args.ts` (fmp4 branches), `webapps/pipewire-portal.ts`, `webapps/geometry-tracker.ts`.
- **Pre-existing broken test** `livinity-broker/passthrough-streaming-integration.test.ts > Phase 58 final gate` — broken since Phase 65 rename + Phase 77 SHA bump. NOT introduced by Phase 99/110. Out of scope.
- **Multi-stream + UI redesign work** — owned by Phase 100 (`100-multi-stream-window-redesign/`), already partial-shipped (`PARTIAL-PASS 2026-05-08`, plans 100-01..100-08-03 in tree). Phase 110 closes the protocol-swap rollup ONLY; the routing/concurrency/UI gaps are Phase 100's domain.

## Sacred SHA evidence trail

Phase 99 commit range (already preserved):
- `9a61d78a` docs(99-01): record Mini PC x11vnc -id <wid> live verification (PASS) — sdk-agent-runner.ts SHA = `f3538e1d…`
- `986f24e4` test(99-02): add failing vitest spec for vnc-bridge.ts — same
- `909cca8e` feat(99-02): implement vnc-bridge.ts (spawn x11vnc + WS↔TCP byte pipe) — same
- `e2fc8d39` docs(99-02): record vnc-bridge.ts TDD ship — 12/12 vitest green — same
- `53f05e5f` refactor(99-03): introduce discriminated-union StreamSession (kind:'fmp4') — same
- `72c09c61` test(99-03): add 5 failing vitest cases for vnc-window kind — same
- `7ad594d8` feat(99-03): startStream({mode:"vnc-window"}) + getSession + stopStream(vnc) — same
- `79a09e3d` docs(99-03): record StreamManager discriminated-union ship — same
- `a6dfd763` feat(99-04): WebAppWindowManager.spawn() swaps to mode:'vnc-window' — same
- `6b50c02f` feat(99-04): /ws/stream/:streamId dispatches on session.kind (fmp4|vnc) — same
- `351bcb62` docs(99-04): record WindowManager swap + WS dispatch ship — same
- `cd6f442a` docs(99-05): draft 99-SUMMARY.md (pending Mini PC UAT) — same
- `66f6b75e` docs(99-05/100): close Phase 99 PARTIAL-PASS, queue Phase 100 — same

Phase 110 closure commit will continue the chain. Pre-commit hook is now live (per Phase 100 line `Sacred-SHA pre-commit hook live` / commit `2f973413`); the closure commit cannot land if sdk-agent-runner.ts is touched.
