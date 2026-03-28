---
phase: 19
slug: ai-chat-streaming-visibility
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (no UI test framework configured) |
| **Config file** | none |
| **Quick run command** | Manual: send message in AI Chat, observe streaming |
| **Full suite command** | Manual: full interaction test (thinking -> tool exec -> streaming -> final message) |
| **Estimated runtime** | ~30 seconds per manual test |

---

## Sampling Rate

- **After every task commit:** Visual verification — send a message, observe streaming behavior
- **After every plan wave:** Full interaction test: send message, observe thinking -> tool execution -> streaming text -> final message
- **Before `/gsd:verify-work`:** All 3 success criteria verified visually in browser
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | CHAT-01, CHAT-02 | manual-only | Visual verification | N/A | ⬜ pending |
| 19-01-02 | 01 | 1 | CHAT-01, CHAT-02 | manual-only | Visual verification | N/A | ⬜ pending |
| 19-01-03 | 01 | 1 | CHAT-03 | manual-only | Visual verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework setup needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Partial answer streams as markdown below status overlay | CHAT-01 | Visual UI behavior requiring live WebSocket + agent backend | 1. Send message in AI Chat 2. Observe streaming text below status overlay 3. Verify markdown renders correctly |
| Tool calls, thinking, steps visible in real-time | CHAT-02 | Visual UI behavior requiring live agent tool execution | 1. Send task requiring tools (e.g., "list files in /tmp") 2. Observe thinking indicator, tool badges, step list 3. Verify real-time updates |
| Streaming -> finalized message transition | CHAT-03 | Visual transition behavior | 1. Send message 2. Wait for response to complete 3. Verify status overlay disappears and full response renders as proper message |

---

## Validation Sign-Off

- [ ] All tasks have manual verification instructions
- [ ] Sampling continuity: manual verification after each commit
- [ ] Wave 0: no setup needed
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
