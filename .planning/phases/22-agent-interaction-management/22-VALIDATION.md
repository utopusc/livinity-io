---
phase: 22
slug: agent-interaction-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no project-level test infrastructure exists |
| **Config file** | None |
| **Quick run command** | `npm run build --workspace=packages/core` (nexus build check) |
| **Full suite command** | Manual verification against running server |
| **Estimated runtime** | ~30 seconds per manual test |

---

## Sampling Rate

- **After every task commit:** Build verification (nexus build + UI tsc)
- **After every plan wave:** Manual verification against running server
- **Before `/gsd:verify-work`:** All 3 requirements manually verified with running services
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | AGNT-04, AGNT-05 | build | `npm run build --workspace=packages/core` | N/A | ⬜ pending |
| 22-01-02 | 01 | 1 | AGNT-04, AGNT-05 | build | `npx tsc --noEmit` | N/A | ⬜ pending |
| 22-02-01 | 02 | 2 | AGNT-04, AGNT-05 | manual-only | Visual verification | N/A | ⬜ pending |
| 22-02-02 | 02 | 2 | AGNT-06 | manual-only | Visual verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — all requirements are manual-only due to requiring running services (Nexus, Redis, AI provider). No automated test infrastructure to create.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Send message to agent, see response | AGNT-04 | Requires running Nexus + Redis + AI provider | 1. Open AI Chat 2. Go to Agents tab 3. Click agent 4. Type message 5. Verify response appears |
| View loop iteration/state, start/stop | AGNT-05 | Requires running LoopRunner with active loop | 1. Create a loop agent 2. Open Agents tab 3. Click loop agent 4. Verify iteration count and state 5. Click stop/start |
| Create agent from compact form | AGNT-06 | Requires running Nexus + Redis | 1. Open Agents tab 2. Click "New Agent" 3. Fill name/description/tier 4. Submit 5. Verify agent appears in list |

---

## Validation Sign-Off

- [ ] All tasks have build verification or manual instructions
- [ ] Sampling continuity: build check after each commit
- [ ] Wave 0: no setup needed (no test infrastructure)
- [ ] Feedback latency < 30s for build checks
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
