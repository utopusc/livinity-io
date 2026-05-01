# Phase 40 — Read-Only Codebase Audit

**Date:** 2026-04-30
**Status:** Read-only audit — no source files modified.
**Purpose:** Single source of concrete coordinates for Plans 02-05.

---

## Section 1 — Sacred File Coordinates (for Plan 02)

### Pre-edit SHA verification

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
2b3b005bf1594821be6353268ffbbdddea5f9a3a
```

**Match against Phase 39 baseline `2b3b005bf1594821be6353268ffbbdddea5f9a3a`: YES.**

Sacred file is unchanged since Phase 39 shipped. Plan 02 may proceed with the surgical edit per D-40-01 / D-40-02.

### HOME assignment line location

```
$ grep -n "HOME: process.env.HOME" nexus/packages/core/src/sdk-agent-runner.ts
266:      HOME: process.env.HOME || '/root',
```

**Confirmed: exactly ONE match at line 266.** Matches CONTEXT.md prediction.

### 5-line context around line 266 (for unambiguous Edit-tool match)

```typescript
    // Minimal subprocess environment to avoid leaking secrets (Pitfall 12)
    const safeEnv: Record<string, string | undefined> = {
      HOME: process.env.HOME || '/root',
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      NODE_ENV: process.env.NODE_ENV || 'production',
      LANG: process.env.LANG || 'en_US.UTF-8',
      // ANTHROPIC_API_KEY is handled by the SDK internally
    };
```

(Indentation = 6 spaces on the HOME line. Trailing comma. The Edit tool will match this verbatim.)

### Plan 02 edit specification (per D-40-02)

**Target line 266:**
- Before: `      HOME: process.env.HOME || '/root',`
- After:  `      HOME: this.config.homeOverride || process.env.HOME || '/root',`

**`this.config.homeOverride` access pattern is valid** — sdk-agent-runner.ts already uses `this.config.X` extensively:
- `this.config.stream` (line 176)
- `this.config.sessionId` (line 183)
- `this.config.nexusConfig` (line 184)
- `this.config.maxTurns` (line 194)
- `this.config.tier` (line 196)
- ... 10+ more usages

Constructor at line 170 stores `config: AgentConfig`. The new `homeOverride` field on AgentConfig will be accessible identically.

### AgentConfig interface coordinates (in agent.ts — NON-sacred)

```
$ grep -n "interface AgentConfig\|^}" nexus/packages/core/src/agent.ts | head -5
17:}
19:export interface AgentConfig {
70:}
```

**`interface AgentConfig` declared at line 19; closing brace at line 70.** New `homeOverride?: string` field goes inside this block.

Recommended insertion position: **after `nexusConfig?: NexusConfig;` (line 23) and before `maxTurns?: number;` (line 24)** — keeps the optional-config-overrides grouped logically.

### Integrity test re-pin spec (per D-40-11 / D-40-15)

File: `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` (line 31).

Current constant:
```typescript
// Baseline SHA recorded in .planning/phases/39-risk-fix-close-oauth-fallback/39-AUDIT.md Section 5.
// Computed via: git hash-object nexus/packages/core/src/sdk-agent-runner.ts
const BASELINE_SHA = '2b3b005bf1594821be6353268ffbbdddea5f9a3a';
```

After Plan 02 edits the sacred file, capture new SHA via `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` and update the constant + add the documenting comment per the plan's Task 3 spec.

---

## Section 2 — Backend Integration Coordinates (for Plan 03)

### Multi-user gate Redis key — canonical pattern

```
$ grep -rn "livos:system:multi_user" livos/packages/livinityd/source/
livos/packages/livinityd/source/modules/apps/apps.ts:759:		const multiUserEnabled = await this.#livinityd.ai.redis.get('livos:system:multi_user')
livos/packages/livinityd/source/modules/apps/apps.ts:834:		const val = await this.#livinityd.ai.redis.get('livos:system:multi_user')
livos/packages/livinityd/source/modules/apps/apps.ts:843:		await this.#livinityd.ai.redis.set('livos:system:multi_user', enabled ? 'true' : 'false')
livos/packages/livinityd/source/modules/server/index.ts:356:				const multiUserEnabled = await this.livinityd.ai.redis.get('livos:system:multi_user')
livos/packages/livinityd/source/modules/server/index.ts:514:								const multiUserEnabled = await this.livinityd.ai.redis.get('livos:system:multi_user')
```

**Canonical pattern (5 call sites):**
- Redis key: `livos:system:multi_user`
- Value when ON: string `'true'` (NOT boolean true).
- Read: `await <livinityd-ref>.ai.redis.get('livos:system:multi_user')`
- Truthy check: `=== 'true'`

Plan 03's `isMultiUserMode()` helper must match this pattern verbatim.

### ctx.currentUser shape (from is-authenticated.ts:32)

```typescript
ctx.currentUser = {
  id: dbUser.id,           // string (UUID from PostgreSQL users.id)
  username: dbUser.username,
  role: dbUser.role,       // 'admin' | 'member' | 'guest'
}
```

Two paths set `currentUser`:
1. Multi-user JWT (line 28 `payload.userId`): real user lookup via `findUserById()`.
2. Legacy single-user JWT (line 38, no `userId` claim): maps to admin via `getAdminUser()`.

Plan 03 routes use `ctx.currentUser.id` — works in both modes. If absent → 401.

### Existing Claude routes in ai/routes.ts

```
$ grep -n "claudeStartLogin\|getClaudeStatus\|claudeLogout\|claudeSubmitCode\|setClaudeApiKey" \
       livos/packages/livinityd/source/modules/ai/routes.ts
231:	getClaudeStatus: privateProcedure.query(async ({ctx}) => {
252:	setClaudeApiKey: privateProcedure
284:	claudeStartLogin: privateProcedure.mutation(async ({ctx}) => {
313:	claudeSubmitCode: privateProcedure
345:	claudeLogout: privateProcedure.mutation(async ({ctx}) => {
```

`claudeLogout` block ends at **line 371** (verified: `})` at line 371). Next non-empty line is `// ── Provider Management ──────────────────────────────────` at **line 373**.

**Recommended insertion point:** between line 371 and line 373 — Plan 03 adds 3 new procedures inside the `// ── Claude Auth ──` section.

### Existing tRPC subscription pattern (already imported)

```
$ grep -n "observable\|subscription:\|^import" livos/packages/livinityd/source/modules/ai/routes.ts
1:import {z} from 'zod'
2:import {observable} from '@trpc/server/observable'
3:import {TRPCError} from '@trpc/server'
4:import * as fs from 'fs'
5:import * as path from 'path'
6:
7:import {privateProcedure, router} from '../server/trpc/trpc.js'
8:import {getUserPreference, setUserPreference} from '../database/index.js'
...
621:			return observable<{type: string; data: unknown}>((emit) => {
```

`observable` is **already imported** at line 2. Plan 03 does NOT need to add this import. There is one existing subscription pattern at line 621 in this file — Plan 03 can mirror its emit/cleanup shape.

`TRPCError` is also already imported at line 3 — Plan 03 reuses it.

### Per-user dir creation pattern (from apps.ts)

```typescript
// apps.ts:892
const userDataDir = `${this.#livinityd.dataDirectory}/users/${user.username}/app-data/${appId}`
await fse.mkdirp(userDataDir)
```

**Note divergence from D-40-04:** apps.ts uses `username` for filesystem paths, but D-40-04 mandates `<user_id>` (UUID) for the per-user `.claude/` dir. **Plan 03 follows D-40-04 (UUID) — the rationale (rename-safety) is documented in the new module's docstring.**

`livinityd.dataDirectory` resolves to `/opt/livos/data` on Mini PC (see livos/packages/livinityd/source/index.ts line 127: `this.dataDirectory = path.resolve(dataDirectory)`).

`fse.mkdirp` from `fs-extra` is the project convention. Plan 03 may use either `fse.mkdirp` (consistent with apps.ts) OR `fs.promises.mkdir(..., {recursive: true, mode: 0o700})` — both work; the latter sets mode bits in one call.

### Subprocess invocation pattern in ai module

```
$ grep -n "execFile\|child_process\|spawn(" livos/packages/livinityd/source/modules/ai/routes.ts \
                                              livos/packages/livinityd/source/modules/ai/index.ts
(no matches)
```

**Plan 03 introduces the first subprocess in the ai module.** Use `node:child_process` `spawn` for streaming stdout (device-code parsing).

### `claude` CLI path

Best-effort discovery:
```
$ which claude  # not installed on planner's Windows machine
```

On Mini PC: assume `claude` resolves via PATH (subprocess `env.PATH` inherits `process.env.PATH`). If runtime spawn fails with ENOENT, that's a Mini-PC-side `claude` CLI install issue, not a code defect.

### Recommended new tRPC route names (per D-40-08/09)

| Route | Type | Purpose |
|-------|------|---------|
| `claudePerUserStatus` | `privateProcedure.query` | Returns `{multiUserMode, authenticated, method?, expiresAt?}` for the calling user |
| `claudePerUserStartLogin` | `privateProcedure.subscription` | Spawns `claude login --no-browser`, emits device-code + success/error events |
| `claudePerUserLogout` | `privateProcedure.mutation` | Deletes per-user `.credentials.json` |

All three: gated behind `isMultiUserMode()` early return (D-40-07).

---

## Section 3 — UI Coordinates (for Plan 04)

### File + size

`livos/packages/ui/src/routes/settings/ai-config.tsx` — **547 lines total.**

### Existing Claude integration points (state + queries + mutations + JSX)

```
$ grep -n "claudeStartLogin\|getClaudeStatus\|claudeLogout\|claudeSubmitCode\|setClaudeApiKey\|isClaudeConnected\|claudeAuthMethod" \
       livos/packages/ui/src/routes/settings/ai-config.tsx
21:	const [claudeApiKey, setClaudeApiKey] = useState('')
22:	const [claudeApiKeySaved, setClaudeApiKeySaved] = useState(false)
23:	const [claudeOAuthCode, setClaudeOAuthCode] = useState('')
24:	const [claudeOAuthData, setClaudeOAuthData] = useState<{verificationUrl: string} | null>(null)
30:	const claudeStatusQ = trpcReact.ai.getClaudeStatus.useQuery()
35:	const isClaudeConnected = claudeStatusQ.data?.authenticated ?? false
36:	const claudeAuthMethod = claudeStatusQ.data?.method
54:	const setClaudeApiKeyMutation = trpcReact.ai.setClaudeApiKey.useMutation({...})
64:	const claudeStartLoginMutation = trpcReact.ai.claudeStartLogin.useMutation({...})
72:	const claudeSubmitCodeMutation = trpcReact.ai.claudeSubmitCode.useMutation({...})
81:	const claudeLogoutMutation = trpcReact.ai.claudeLogout.useMutation({...})
136:	const handleSaveClaudeApiKey = () => {...}
142:	const handleClaudeOAuthLogin = () => {...}
146:	const handleSubmitClaudeCode = () => {...}
311:	{/* -- Claude Provider -------------------------------------- */}
313:	<h2 className='text-body font-semibold'>Claude Account</h2>
317:	isClaudeConnected ? 'border-brand/50 bg-brand/5' : 'border-border-default bg-surface-base'
320:	{claudeStatusQ.isLoading ? (...
325:	) : isClaudeConnected ? (
329:	Connected to Claude
332:	Authenticated via {claudeAuthMethod === 'api_key' ? 'API key' : ...}.
337:	onClick={() => claudeLogoutMutation.mutate()}
467:	<TbLogin className='h-4 w-4' /> Sign in with Claude
```

### Claude card JSX boundaries

- **Comment marker:** Line 311 — `{/* -- Claude Provider -------------------------------------- */}`
- **Card opens:** Line 312 (a `<div className='space-y-4'>` block)
- **`<h2>Claude Account</h2>`:** Line 313
- **Status card div:** Lines 315-318
- **Card body (4-way conditional render):** Lines 320-476
  - `claudeStatusQ.isLoading` branch: 320-324
  - `isClaudeConnected` branch (Connected + Sign Out): 325-353
  - `claudeOAuthData` branch (OAuth in progress, code input): 354-408
  - "Not connected" branch (API key + OAuth start): 409-476
- **Card div closes:** Line 477
- **Outer `</div>` (entire Claude Provider section):** Line 478

**Plan 04's wrap target:** Lines 311-478 (the entire Claude Provider section). Plan 04 wraps this entire block in a ternary on `isMultiUserMode`.

### UI sole consumer check

```
$ grep -rn "claudeStartLogin\|claudePerUserStartLogin" livos/packages/ui/src/
livos/packages/ui/src/routes/settings/ai-config.tsx:64:	const claudeStartLoginMutation = trpcReact.ai.claudeStartLogin.useMutation({
livos/packages/ui/src/routes/settings/ai-config.tsx:143:		claudeStartLoginMutation.mutate()
```

**Confirmed: `ai-config.tsx` is the SOLE consumer of `claudeStartLogin` in the UI.** Plan 04's edits stay confined to this one file.

### Plan 04 user-visible behavior contract (per D-40-08)

| Mode | Behavior |
|------|----------|
| `multi_user_mode === false` (single-user) | UI behavior **unchanged**. Existing PKCE OAuth flow (`claudeStartLogin` → `claudeSubmitCode`) keeps working. Existing API key entry preserved. |
| `multi_user_mode === true` (multi-user) | Each logged-in user sees their **own** connection status via `claudePerUserStatus`. "Sign in" button calls Plan 03's `claudePerUserStartLogin` subscription, which spawns server-side `claude login --no-browser` with HOME set to that user's synthetic dir. UI displays the device code + verification URL inline (per D-40-09). |

---

## Section 4 — Tests Inventory (for Plan 05)

### Existing test scripts

```json
// nexus/packages/core/package.json scripts
"test:phase39": "tsx src/providers/claude.test.ts && tsx src/providers/no-authtoken-regression.test.ts && tsx src/providers/sdk-agent-runner-integrity.test.ts"
```

Only one script (`test:phase39`). No vitest, no jest, no mocha. Plan 05 adds `test:phase40`.

### Existing test files (Phase 39)

```
$ ls nexus/packages/core/src/providers/*.test.ts
nexus/packages/core/src/providers/claude.test.ts
nexus/packages/core/src/providers/no-authtoken-regression.test.ts
nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts
```

### BASELINE_SHA constant (Plan 02 must update)

```
$ grep -n "BASELINE_SHA\|2b3b005bf1594821" nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts
5: * to its pre-Phase-39 state (recorded as BASELINE_SHA below).
11: * BASELINE_SHA below, AND (b) document the change in a Phase 39 follow-up note,
31:const BASELINE_SHA = '2b3b005bf1594821be6353268ffbbdddea5f9a3a';
46:  if (actual !== BASELINE_SHA) {
49:      `  Expected SHA: ${BASELINE_SHA}\n` +
53:      `  1. Update BASELINE_SHA in this test to the new SHA (run: git hash-object ${sacredFile}).\n` +
```

**Constant lives at line 31.** Surrounded by 2 comment lines (29-30) explaining its source.

Plan 02 edit target:
- Replace lines 29-31 with the updated comment + new SHA per the plan's Task 3 specification.

### Assertion library convention

```
$ grep -rn "node:assert" nexus/packages/core/src/providers/
nexus/packages/core/src/providers/claude.test.ts:13:import assert from 'node:assert/strict';
nexus/packages/core/src/providers/no-authtoken-regression.test.ts:14:import assert from 'node:assert/strict';
nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts:18:import assert from 'node:assert/strict';
```

**Canonical: `import assert from 'node:assert/strict';` — `node:assert/strict` is the Phase 39 / Phase 40 convention.** No vitest, no jest in package.json. Test runner: `npx tsx <test-file.ts>`.

### Plan 05 test contract

| Test file | Purpose | Assertions | Where it lives |
|-----------|---------|------------|----------------|
| `nexus/packages/core/src/providers/sdk-agent-runner-home-override.test.ts` | Sacred file behavior contract per D-40-13 | 4 source-grep assertions | nexus |
| `livos/packages/livinityd/source/modules/ai/per-user-claude.test.ts` | Per-user dir helper invariants per D-40-14 | 5 unit tests | livinityd |
| **Updated:** `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` | BASELINE_SHA re-pinned to new post-Phase-40 SHA | 1 assertion (Plan 02 update) | nexus |
| **Preserved:** `npm run test:phase39` | Phase 39 regression suite | 5 assertions (now against new baseline) | nexus |

### Phase 39 regression preservation

After Plan 02 re-pins BASELINE_SHA:
- `claude.test.ts` — unaffected (tests claude.ts behavior, not sacred file).
- `no-authtoken-regression.test.ts` — unaffected (greps claude.ts only).
- `sdk-agent-runner-integrity.test.ts` — passes against NEW baseline.

**`npm run test:phase39` MUST still exit 0.** Verified by Plan 02 Task 3 step 4 + Plan 05 chained inside `test:phase40`.

---

## Plan Readiness Summary

| Plan | Has all required coordinates? | Ready to execute? |
|------|-------------------------------|-------------------|
| 40-02 (sacred edit) | YES — line 266 confirmed, AgentConfig at line 19-70, BASELINE_SHA at line 31 | YES |
| 40-03 (per-user backend) | YES — Redis key + insertion point (line 371→373) + ctx.currentUser shape | YES |
| 40-04 (UI per-user-aware) | YES — ai-config.tsx Claude card at lines 311-478, sole consumer | YES |
| 40-05 (tests + UAT) | YES — node:assert/strict + tsx, BASELINE_SHA spec captured | YES |

No source files were modified by this plan. `git status` should show only `40-AUDIT.md` as new.
