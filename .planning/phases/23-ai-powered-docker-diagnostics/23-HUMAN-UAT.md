---
status: partial
phase: 23-ai-powered-docker-diagnostics
source: [23-VERIFICATION.md]
started: 2026-04-25T00:00:00Z
updated: 2026-04-25T00:00:00Z
---

## Current Test

[awaiting live-LLM round-trip on deployed server]

## Tests

### 1. AI Diagnose end-to-end (AID-01)
expected: Click AI Diagnose on a container with recent restarts; within 30s a plain-English `{Likely Cause, Suggested Action, Confidence}` block appears.
why_human: Code path verified — actual response quality + latency requires a live Kimi round-trip on a deployed server with `kimi login` complete.
result: [pending]

### 2. Generate from prompt end-to-end (AID-03)
expected: Open Stack Create > AI tab; enter "Nextcloud with Redis and MariaDB on port 8080"; click Generate; preview shows valid compose YAML containing services for nextcloud, redis, mariadb.
why_human: Compose-YAML correctness is a model quality property — needs live LLM.
result: [pending]

### 3. Explain CVEs end-to-end (AID-04)
expected: After a Trivy scan on `nginx:1.21`, click Explain CVEs; result includes plain-English explanation + concrete `image:tag` upgrade target.
why_human: Quality of remediation copy + tag suggestion requires Kimi response.
result: [pending]

### 4. Proactive resource-watch alert generation (AID-02)
expected: Toggle `ai-resource-watch` enabled in Settings > Scheduler; run `docker run --rm --memory 50m -d --name memhog alpine sh -c 'tail /dev/zero'`; within 5 min, an alert appears in the bell with severity=warning/critical and a Kimi-generated projection message.
why_human: Cron tick + Kimi call + PG insert + UI poll is a runtime chain — no machine test substitutes.
result: [pending]

### 5. Resource-watch dedupe regression (AID-02)
expected: With memhog still running, second cron tick should NOT generate a duplicate alert; `alertsSkippedDeduped` increments in the run-history JSON; UI shows only one alert.
why_human: Dedupe-window behavior visible only across multiple cron invocations on a deployed scheduler.
result: [pending]

### 6. AI Chat autonomous tool invocation (AID-05)
expected: Open AI Chat sidebar, ask "why is my postgres container restarting?"; the LLM autonomously invokes `docker_diagnostics({containerName: 'postgres'})` (visible in tool-call panel) and surfaces the diagnostic in the conversation.
why_human: LLM-router decision based on the tool's description is a Kimi behavior — code path verified by tool registration, behavior verified by human.
result: [pending]

### 7. httpOnlyPaths runtime check (cross-cutting)
expected: With AI Chat open and an active conversation, manually disconnect the WebSocket (DevTools > Network > Throttle to Offline briefly); diagnoseContainer / dismissAiAlert mutations still complete (they routed via HTTP, not the dead WS).
why_human: WS-disconnect behavior visible only at runtime; this is a regression check for the documented Phase 18 mutation-hang gotcha.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Notes

All 7 items can be exercised on server4 once nexus-core + livinityd + UI are deployed (PM2 restart all 5 processes). The Kimi credentials at `~/.kimi/credentials/kimi-code.json` must be present and valid (`kimi login` if expired). Resource-watch testing also needs the operator to enable the scheduler job in Settings > Scheduler (default is disabled per design).

## Gaps

(none — all items are awaiting runtime testing, not implementation gaps)
