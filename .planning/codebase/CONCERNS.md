# Codebase Concerns

**Analysis Date:** 2026-02-03

## Critical Security Issues

**Exposed .env with Production Secrets:**
- Issue: `.env` file in `livos/` contains hardcoded production API keys and secrets
- Files: `livos/.env`
- Exposed:
  - GEMINI_API_KEY (plain text)
  - REDIS_URL with password
  - JWT_SECRET (256-bit hex)
  - LIV_API_KEY
- Impact: If this file is committed or leaked, all authentication is compromised
- Fix approach:
  1. Rotate all secrets immediately
  2. Add `livos/.env` to `.gitignore`
  3. Use environment variable injection from CI/CD or Secrets Manager

**Shell Command Execution Blocklist is Incomplete:**
- Issue: Shell executor blocklist can be bypassed with alternative syntax
- Files:
  - `livos/packages/livcoreai/src/shell.ts`
  - `nexus/packages/core/src/shell.ts`
- Missing patterns:
  - `rm -r /` (without -f flag)
  - `curl | bash`, `wget -O- | sh` (download-and-execute)
  - `nc`, `ncat` (reverse shells)
  - `python -c`, `perl -e` (code execution)
  - Environment variable exfiltration: `echo $JWT_SECRET`
  - File read: `cat /etc/shadow`, `cat ~/.ssh/id_rsa`
- Impact: AI agents can execute dangerous commands via shell tool
- Fix approach: Implement allowlist instead of blocklist, or use container sandboxing

## Tech Debt

**Code Duplication Across Packages:**
- Issue: Near-identical daemon implementations exist in multiple locations
- Files:
  - `livos/packages/livcoreai/src/daemon.ts` (1499 lines)
  - `livos/packages/liv/packages/core/src/daemon.ts` (2039 lines)
  - `nexus/packages/core/src/daemon.ts` (2371 lines)
- Impact: Bug fixes must be applied in 3 places; inconsistencies inevitable
- Fix approach: Extract shared daemon logic to a common package; use inheritance or composition

**Backup Files Polluting Codebase:**
- Issue: `.bak` files committed to repository
- Files:
  - `livos/packages/livcoreai/src/daemon.ts.bak`
  - `livos/packages/liv/packages/core/src/daemon.ts.bak`
  - `livos/packages/liv/node_modules/@liv/core/src/daemon.ts.bak`
  - `livos/packages/livinityd/node_modules/@livos/.ignored_livcoreai/src/daemon.ts.bak`
- Impact: Confusion about which files are authoritative; bloated repo
- Fix approach: Delete `.bak` files; add `*.bak` to `.gitignore`

**Excessive Use of `any` Type:**
- Issue: Widespread use of `as any` type casting bypasses TypeScript safety
- Files: Throughout codebase, notably:
  - `livos/packages/livcoreai/src/daemon.ts` (7+ occurrences)
  - `livos/packages/livcoreai/src/api.ts`
  - `livos/packages/livcoreai/src/agent.ts`
- Pattern: `(process.env.AGENT_TIER as any)`, `(err as any).code`, PM2 process parsing
- Impact: Runtime errors not caught at compile time
- Fix approach: Define proper types for environment variables, error objects, PM2 responses

**Silent Error Swallowing:**
- Issue: Many `catch` blocks with empty bodies or minimal logging
- Files: `livos/packages/livcoreai/src/daemon.ts` lines: 239, 381, 544, 630, 746, 1465
- Patterns:
  - `} catch { /* keep raw */ }` - swallows PM2 parsing errors
  - `} catch { /* memory service might be down */ }` - ignores memory failures
  - `.catch(() => {})` - silent failures in Redis operations
- Impact: Errors go unnoticed; debugging is difficult
- Fix approach: At minimum log errors; implement error aggregation/monitoring

## Known Bugs

**Test Suite Disabled:**
- Symptoms: Widget integration tests have `@ts-nocheck` and are skipped
- Files: `livos/packages/livinityd/source/modules/widgets/widget.integration.test.ts`
- Evidence: Comment says "TODO: Re-enable this, we temporarily disable TS here since we broke tests"
- Impact: No test coverage for widget functionality; regressions go undetected
- Fix approach: Fix API compatibility issues; re-enable TypeScript checking

**Self-Reflection Never Executes:**
- Symptoms: selfReflect() early returns when `recentMessages` is empty
- Files: `livos/packages/livcoreai/src/daemon.ts` lines 1423-1435
- Issue: `recentMessages` array is never populated (always empty)
- Impact: Self-reflection feature is dead code
- Fix approach: Implement conversation history retrieval from Redis

## Performance Bottlenecks

**Daemon Polling Loop:**
- Problem: Main loop uses fixed 30-second interval regardless of load
- Files: `livos/packages/livcoreai/src/daemon.ts` line 111
- Evidence: `DAEMON_INTERVAL_MS=30000` in `.env`
- Impact:
  - Low latency for idle periods (wasteful polling)
  - Delayed processing when messages arrive (up to 30s wait)
- Fix approach: Implement event-driven inbox processing; use Redis pub/sub

**Large Daemon Files:**
- Problem: Monolithic daemon files exceed 1500-2300 lines
- Files:
  - `nexus/packages/core/src/daemon.ts` - 2371 lines
  - `livos/packages/liv/packages/core/src/daemon.ts` - 2039 lines
- Impact: Slow IDE performance; difficult to navigate; merge conflicts
- Fix approach: Extract tool registration, handler registration into separate modules

## Fragile Areas

**Skill Hot-Reload Mechanism:**
- Files: `livos/packages/livcoreai/src/skill-loader.ts` lines 351-378
- Why fragile:
  - Uses `fs.watch` which behaves differently on different OSes
  - Cache-busting with `?t=` query params may not work reliably
  - No debouncing on rapid file changes
- Safe modification: Test on Linux (production) not just Windows dev
- Test coverage: None detected

**YAML Frontmatter Parser:**
- Files: `livos/packages/livcoreai/src/skill-loader.ts` lines 129-193
- Why fragile: Custom YAML parser, not standard compliant
- Limitations:
  - No nested objects
  - No multiline strings
  - No special characters in values
- Fix approach: Use established YAML library (js-yaml or yaml)

## Missing Critical Features

**No Rate Limiting:**
- Problem: AI API calls and tool executions have no rate limiting
- Blocks: Production deployment with multiple users
- Files: Tool registration in daemon doesn't implement rate limits
- Impact: Single user could exhaust API quota; DoS potential

**No Authentication on Internal APIs:**
- Problem: Internal services (Cognee memory, Firecrawl) accessed without auth
- Files: `livos/packages/livcoreai/src/daemon.ts` lines 501, 477
- Evidence: `fetch('http://localhost:3300/add')` - no auth headers
- Impact: Anyone on local network can add/query memories

## Test Coverage Gaps

**Core AI Logic Untested:**
- What's not tested:
  - `AgentLoop` (livos/packages/livcoreai/src/agent.ts)
  - `Brain` LLM interactions (livos/packages/livcoreai/src/brain.ts)
  - `Daemon` inbox processing (livos/packages/livcoreai/src/daemon.ts)
- Risk: Core agent behavior could break silently
- Priority: High

**Tool Execution Untested:**
- What's not tested: All registered tools (docker, pm2, files, shell, scrape, memory)
- Files: Tool definitions in `daemon.ts` registerTools()
- Risk: Tool failures in production
- Priority: High

## Scaling Limits

**In-Memory Inbox Queue:**
- Current capacity: Unbounded array
- Files: `livos/packages/livcoreai/src/daemon.ts` line 45
- Evidence: `private inbox: InboxItem[] = [];`
- Limit: Memory exhaustion if messages pile up
- Scaling path: Move to Redis queue; add backpressure

**Single-Instance Daemon:**
- Current capacity: 1 concurrent request processing
- Limit: Sequential inbox processing blocks on LLM calls
- Scaling path: Worker pool; separate inbox processor from daemon loop

## Dependencies at Risk

**Gemini SDK Hardcoded:**
- Risk: No fallback if Gemini API is unavailable
- Files: `livos/packages/livcoreai/src/brain.ts`
- Evidence: Only Gemini models implemented despite infrastructure for multi-provider
- Impact: Full outage if Gemini goes down
- Migration plan: Implement Anthropic/OpenAI fallback per existing Brain architecture

## Configuration Issues

**Hardcoded Paths:**
- Issue: Multiple hardcoded paths assume Linux production environment
- Files:
  - `livos/packages/livcoreai/src/shell.ts` line 21: `cwd = '/opt/livos'`
  - `nexus/packages/core/src/shell.ts` line 21: `cwd = '/opt/nexus'`
  - Log paths: `/opt/livos/logs/livos.log`
- Impact: Development on Windows requires workarounds
- Fix approach: Use configuration for paths; detect environment

## Architectural Concerns

**Nexus vs LivOS vs Liv Package Confusion:**
- Issue: Three similar AI daemon packages with unclear boundaries
- Packages:
  - `livos/packages/livcoreai/` - AI daemon for LivOS
  - `livos/packages/liv/packages/core/` - Another AI daemon
  - `nexus/packages/core/` - WhatsApp/Telegram focused daemon
- Impact: Developers don't know which to modify
- Fix approach: Document package purposes; consolidate if appropriate

**TODOs Marked for Refactoring:**
- Files with explicit TODO markers:
  - `livos/packages/livinityd/source/modules/jwt.ts:40` - "TODO: Only used for legacy auth server verification"
  - `livos/packages/livinityd/scripts/validate-manifests.ts:6` - "TODO: Integrate into livinity-apps CI"
  - `livos/packages/livinityd/source/modules/dbus/dbus.ts:1` - "TODO: Move this into a system submodule"
  - `livos/packages/livinityd/source/modules/cli-client.ts:10` - "TODO: Maybe just read the endpoint from data dir"

---

*Concerns audit: 2026-02-03*
