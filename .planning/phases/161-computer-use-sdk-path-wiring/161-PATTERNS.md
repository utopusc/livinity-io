# Phase 161: Computer-Use SDK Path Wiring — Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 7 (4 source modify, 3 test extend/new)
**Analogs found:** 7 / 7 (100% — all freshest from Phase 160 ship)

---

## File Classification

| Patch | File | Role | Data flow | Closest Analog | Match |
|-------|------|------|-----------|----------------|-------|
| 161-01 | `liv/packages/core/src/agent-session.ts` | modify-existing (detection + tier override) | request-response (SDK relay) | `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts:179-197` (Phase 160-01 Haiku routing) | **exact** |
| 161-01 | `liv/packages/core/src/agent-session.computer-use.test.ts` | new-test-file (detection + invariants) | request-response | `liv/packages/core/src/agent-session.test.ts` (tsx + node:assert) + `agent-runner-factory.test.ts:536-612` (Phase 160-01 source-text + runtime body-injection style) | **exact** |
| 161-02 | `liv/packages/core/src/agent-session.ts` (same file as 161-01) | modify-existing (DI option in `AgentSessionManagerOptions`) | request-response | `liv/packages/core/src/agent-session.ts:177` (existing DI constructor) | **exact** (same interface — additive) |
| 161-02 | `livos/packages/livinityd/source/modules/server/ws-agent.ts` | modify-existing (construct builder closure, pass into manager) | event-driven (WS handler) | `livos/packages/livinityd/source/modules/server/ws-agent.ts:152-185` (existing `IntentRouter` getCapabilities closure pattern) | **exact** (same closure idiom) |
| 161-03 | `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` | modify-existing (construct `livosAppResolver` with HTTP fetch closures) | request-response (HTTP → MCP child) | `livos/packages/livinityd/source/modules/server/ws-agent.ts:154-176` (HTTP fetch + X-Api-Key + AbortSignal pattern) | **exact** |
| 161-03 | `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` | modify-existing (descriptor env block + interface fields) | config | `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts:313-320` (Phase 160-02 `LIVOS_USER_SLUG` / `LIVOS_DOMAIN_ROOT` baseEnv extension) | **exact** (same env-block pattern, just adds 2 more keys) |
| 161-03 | `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` | extend (vitest invariants + env-thread tests) | request-response | `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` (existing `resolveDisplay` env precedence tests) | **exact** |
| 161-04 | `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` | extend (prefix-emit invariant only) | event-driven | `livos/packages/ui/src/hooks/use-native-app-agent.test.ts:51-53` (existing `native:` prefix invariant) | **exact** (same file, additive) |

---

## Pattern Assignments

### `liv/packages/core/src/agent-session.ts` (modify — Patch 161-01 + 161-02)

**Analog A (for 161-01 Haiku routing):** `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts:184-197`

```typescript
// Phase 160-01 — Haiku routing for computer-use loops.
// When mode === 'computer-use', force Haiku 4.5 regardless of caller-supplied
// model. Computer-use loops run 10-50+ turns per task; Haiku is vision-capable
// and ~5-10x cheaper than Sonnet/Opus while sufficient for screenshot-
// grounded coordinate extraction. Chat path (AI Chat panel + WebApp chat)
// keeps existing model — only THIS factory branch routes Haiku.
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts untouched.
const mode = opts.mode ?? 'chat'
let resolvedModel: string | undefined
let resolvedTier: 'haiku' | 'sonnet' | 'opus' | undefined
if (mode === 'computer-use') {
    resolvedModel = 'claude-haiku-4-5-20251001'
    resolvedTier = 'haiku'
}
```

**Lift verbatim:** the `'claude-haiku-4-5-20251001'` dated literal AND the `Phase 161-01` comment block style. Adapt the trigger from `mode === 'computer-use'` (broker arg) to `session.conversationId?.startsWith('native:') || session.conversationId?.startsWith('webapp:')` (SDK path signal).

**Detection insertion site (agent-session.ts line ~320, immediately after existing `tier` derivation):**
- Current code: `const tier = model ?? agentDefaults?.tier ?? 'sonnet';` (line 320)
- Change `const` → `let` so override is permitted, OR introduce a new `effectiveTier` variable. **Recommendation (planner discretion per CONTEXT D-161-B):** keep `tier` as `let`, override in-place — cascade naturally hits lines 568/589/683/698.

**SDK call site override (agent-session.ts line 698):**
- Current: `model: tierToModel(tier),`
- Patched: `model: isComputerUseSession ? 'claude-haiku-4-5-20251001' : tierToModel(tier),`
- Reason: `tierToModel('haiku')` returns un-dated `'claude-haiku-4-5'` (see `sdk-agent-runner.ts:166`). The dated form `claude-haiku-4-5-20251001` is the verbatim contract literal Phase 160-01 ships to the API — both broker and SDK paths must converge on the same string.

---

**Analog B (for 161-02 DI option):** `liv/packages/core/src/agent-session.ts:177` (existing constructor)

```typescript
constructor(opts: { toolRegistry: ToolRegistry; nexusConfig?: NexusConfig; intentRouter?: IntentRouter; redis?: Redis; learningEngine?: LearningEngine }) {
    this.toolRegistry = opts.toolRegistry;
    this.nexusConfig = opts.nexusConfig;
    this.intentRouter = opts.intentRouter ?? null;
    this.redis = opts.redis ?? null;
    this.learningEngine = opts.learningEngine ?? null;
}
```

**Lift verbatim:** the optional-field-with-null-default pattern. Add ONE new field:

```typescript
// New field on AgentSessionManagerOptions (and same-name private member)
computerUseSystemPromptBuilder?: () => Promise<string>
```

Then in constructor:
```typescript
this.computerUseSystemPromptBuilder = opts.computerUseSystemPromptBuilder ?? null;
```

**System prompt selector at agent-session.ts line 558-561 (current):**

```typescript
const systemPrompt = intentResult
    ? composeSystemPrompt(BASE_SYSTEM_PROMPT, intentResult.capabilities)
    : BASE_SYSTEM_PROMPT;
```

**Patched form (D-161-C):**

```typescript
let systemPrompt: string;
if (isComputerUseSession && this.computerUseSystemPromptBuilder) {
    systemPrompt = await this.computerUseSystemPromptBuilder();
} else if (intentResult) {
    systemPrompt = composeSystemPrompt(BASE_SYSTEM_PROMPT, intentResult.capabilities);
} else {
    systemPrompt = BASE_SYSTEM_PROMPT;
}
```

**Critical cascade points:** isComputerUseSession derivation must happen BEFORE line 558 (system-prompt branch) AND BEFORE line 568 (`budgetByTier[tier]`). Easiest = derive immediately after line 320.

---

### `livos/packages/livinityd/source/modules/server/ws-agent.ts` (modify — Patch 161-02)

**Analog:** `livos/packages/livinityd/source/modules/server/ws-agent.ts:152-185` (existing IntentRouter closure pattern, same file)

```typescript
// IntentRouter — fetches capabilities from nexus API, uses livinityd Redis for caching
// brain is null in livinityd context (LLM fallback skipped — keyword matching only)
const livApiUrl = process.env.LIV_API_URL || 'http://localhost:3200'
const apiKey = process.env.LIV_API_KEY || ''

const intentRouter = new IntentRouter({
    redis: ai.redis,
    getCapabilities: async () => {
        try {
            const res = await fetch(`${livApiUrl}/api/capabilities?status=active`, {
                headers: apiKey ? {'X-Api-Key': apiKey} : {},
                signal: AbortSignal.timeout(5000),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json() as {capabilities: CapabilityManifest[]}
            return data.capabilities
        } catch (err: any) {
            opts.logger.error('IntentRouter: failed to fetch capabilities from nexus', err.message)
            return []
        }
    },
    learningEngine,
})

const sessionManager = new AgentSessionManager({
    toolRegistry: lazyToolRegistry,
    // IntentRouter disabled — scoped tool selection filters out MCP tools.
    // intentRouter,
    redis: ai.redis,
    learningEngine,
})
```

**Lift verbatim:** the closure-as-DI-callback shape. Add new import for the prompt builder, then extend the `AgentSessionManager` constructor call:

```typescript
import {buildLuseSystemPromptWithOverlayResolved} from '../ai/agent-prompt-builder.js'

// ... existing closure construction ...

const sessionManager = new AgentSessionManager({
    toolRegistry: lazyToolRegistry,
    // IntentRouter disabled — see above
    redis: ai.redis,
    learningEngine,
    // Phase 161-02 — DI callback for SDK-path LivOS overlay. The builder
    // closes over per-server context (userSlug/domainRoot defaults match
    // luse-mcp-config.ts:318 hard-coded defaults until per-user JWT
    // resolution lands in a future plan).
    computerUseSystemPromptBuilder: async () => {
        return buildLuseSystemPromptWithOverlayResolved({
            userSlug: 'admin',
            domainRoot: 'livinity.io',
        })
    },
})
```

---

### `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` (modify — Patch 161-03)

**Analog (HTTP fetch closures):** `livos/packages/livinityd/source/modules/server/ws-agent.ts:154-172` (verbatim same idiom)

**Analog (resolver construction):** `livos/packages/livinityd/source/modules/computer-use/native/window.ts:467-519` (defaultLivosAppResolver signature)

```typescript
export async function defaultLivosAppResolver(
    name: string,
    deps: {
        listWebApps: () => Promise<Array<{id: string; subdomain?: string; name?: string}>>
        listNativeApps: () => Promise<Array<{id: string; name?: string; iconUrl?: string}>>
        userSlug: string
        domainRoot: string
        proto?: 'http' | 'https'
    },
): Promise<LivosAppMatch | null> {
    // ... DASH-form URL `${proto}://${sub}-${deps.userSlug}.${deps.domainRoot}/` ...
}
```

**Analog (registration call site to extend):** `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts:145-150` (current `registerLuseTools` call)

```typescript
registerLuseTools(server as never, {
    defaultWindowId,
    defaultDisplay,
    redis,
    userId: process.env.LUSE_USER_ID ?? 'admin',
})
```

**Patch shape (lift fetch idiom from ws-agent.ts:154-172, insert before `registerLuseTools` call):**

```typescript
// Phase 161-03 — construct livosAppResolver via env-thread + HTTP fetch.
// Mirrors ws-agent.ts:154-172 IntentRouter getCapabilities closure pattern.
// Falls through to undefined when any env var is missing — registerLuseTools
// without livosAppResolver = pre-Phase-160-03 APP_MAP behavior (fail-open).
const livinitydApiUrl = process.env.LIVINITYD_API_URL  // NEW env name (see Landmine #5)
const livApiKey = process.env.LIV_API_KEY
const luseUserSlug = process.env.LUSE_USER_SLUG
const luseDomainRoot = process.env.LUSE_DOMAIN_ROOT

let livosAppResolver: ((name: string) => Promise<LivosAppMatch | null>) | undefined
if (livinitydApiUrl && livApiKey && luseUserSlug && luseDomainRoot) {
    const fetchAppList = async (proc: string): Promise<any[]> => {
        try {
            const res = await fetch(`${livinitydApiUrl}/trpc/${proc}?input=`, {
                headers: {'X-Api-Key': livApiKey},
                signal: AbortSignal.timeout(5000),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json() as {result: {data: any[]}}
            return data.result?.data ?? []
        } catch (err: any) {
            // Phase 161-03 — distinct log prefix to avoid colliding with the
            // `[luse-mcp] open_livos_app ...` IPC channel that parent livinityd
            // parses to drive windowManager.openWindow (see mcp/tools.ts:756).
            process.stderr.write(
                `[luse-mcp] resolver: ${proc} fetch failed: ${err.message}; returning []\n`,
            )
            return []
        }
    }

    livosAppResolver = (name: string) => defaultLivosAppResolver(name, {
        listWebApps: () => fetchAppList('webapp.list'),
        listNativeApps: () => fetchAppList('apps.native.list'),
        userSlug: luseUserSlug,
        domainRoot: luseDomainRoot,
    })
}

registerLuseTools(server as never, {
    defaultWindowId,
    defaultDisplay,
    redis,
    userId: process.env.LUSE_USER_ID ?? 'admin',
    livosAppResolver,  // Phase 161-03 — undefined falls through to APP_MAP
})
```

**Import addition at top of file:**

```typescript
import {defaultLivosAppResolver, type LivosAppMatch} from '../native/window.js'
```

**Stderr IPC discipline (D-161-D, Landmine #3):** all new log lines use the `[luse-mcp] resolver: ...` prefix. Test invariant: no resolver log line matches `^\[luse-mcp\] open_livos_app`.

---

### `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` (modify — Patch 161-03)

**Analog:** Same file, `buildLuseConfig` `baseEnv` block at lines 313-328 (Phase 160-02 already added `LIVOS_USER_SLUG` / `LIVOS_DOMAIN_ROOT` here).

```typescript
// Phase 160-02 — LivOS overlay context for the MCP child.
const baseEnv: Record<string, string> = descriptor
    ? {
            DISPLAY: descriptor.display,
            [LUSE_TARGET_DISPLAY_ENV]: descriptor.display,
            LUSE_REDIS_URL: luseRedisUrl,
            LIVOS_USER_SLUG: descriptor.userSlug ?? 'admin',
            LIVOS_DOMAIN_ROOT: descriptor.domainRoot ?? 'livinity.io',
        }
    : {
            DISPLAY: env.LUSE_DISPLAY ?? ':1',
            XAUTHORITY:
                env.LUSE_XAUTHORITY ??
                env.XAUTHORITY ??
                '/run/user/1000/gdm/Xauthority',
            LUSE_REDIS_URL: luseRedisUrl,
        }
```

**Lift verbatim:** extend the `baseEnv` block — same idiom, just adding more keys:

```typescript
const baseEnv: Record<string, string> = descriptor
    ? {
            DISPLAY: descriptor.display,
            [LUSE_TARGET_DISPLAY_ENV]: descriptor.display,
            LUSE_REDIS_URL: luseRedisUrl,
            LIVOS_USER_SLUG: descriptor.userSlug ?? 'admin',
            LIVOS_DOMAIN_ROOT: descriptor.domainRoot ?? 'livinity.io',
            // Phase 161-03 — env-thread for MCP child livosAppResolver.
            // Per Landmine #5 (RESEARCH Q8): use LIVINITYD_API_URL (NOT LIV_API_URL —
            // that name already means liv-core port 3200 in ws-agent.ts:154).
            LIVINITYD_API_URL: env.LIVINITYD_API_URL ?? 'http://localhost:8080',
            LIV_API_KEY: env.LIV_API_KEY ?? '',
            LUSE_USER_SLUG: descriptor.userSlug ?? 'admin',
            LUSE_DOMAIN_ROOT: descriptor.domainRoot ?? 'livinity.io',
        }
    : {
            DISPLAY: env.LUSE_DISPLAY ?? ':1',
            XAUTHORITY: env.LUSE_XAUTHORITY ?? env.XAUTHORITY ?? '/run/user/1000/gdm/Xauthority',
            LUSE_REDIS_URL: luseRedisUrl,
            // Host-display branch — pass-through from process.env when set
            // (no descriptor → no per-user context → resolver may fall through).
            ...(env.LIVINITYD_API_URL ? {LIVINITYD_API_URL: env.LIVINITYD_API_URL} : {}),
            ...(env.LIV_API_KEY ? {LIV_API_KEY: env.LIV_API_KEY} : {}),
            ...(env.LUSE_USER_SLUG ? {LUSE_USER_SLUG: env.LUSE_USER_SLUG} : {}),
            ...(env.LUSE_DOMAIN_ROOT ? {LUSE_DOMAIN_ROOT: env.LUSE_DOMAIN_ROOT} : {}),
        }
```

**Note on `LIVOS_USER_SLUG` vs `LUSE_USER_SLUG`:** Phase 160-02 chose `LIVOS_*` prefix for overlay rendering inside the child (read by `buildLuseOverlay`). Phase 161-03 needs the same values for the `defaultLivosAppResolver`'s URL synthesis (different code path). RESEARCH Q4 calls these `LUSE_USER_SLUG` / `LUSE_DOMAIN_ROOT`. Planner can either (a) re-use the existing `LIVOS_*` names (single source of truth, mcp/server.ts reads `process.env.LIVOS_USER_SLUG`) OR (b) add parallel `LUSE_*` names. CONTEXT.md D-161-D explicitly uses `LUSE_*` names — recommend that, keeping LIVOS_* for overlay and LUSE_* for resolver (clean separation of concerns, two consumers don't share an env key).

---

### `liv/packages/core/src/agent-session.computer-use.test.ts` (new — Patch 161-01)

**Analog A (test runner):** `liv/packages/core/src/agent-session.test.ts` (tsx + `node:assert/strict`)

```typescript
import assert from 'node:assert/strict';
import { createInputChannel, AgentSessionManager } from './agent-session.js';

async function testInputChannelPushAndYield() {
    const channel = createInputChannel();
    // ...
    assert.equal(result.done, false);
    console.log('  PASS: createInputChannel push causes generator to yield');
}

async function main() {
    console.log('agent-session.test.ts');
    // ... run tests ...
    console.log('All tests passed!');
}

main().catch((err) => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
```

**Analog B (source-text invariant + runtime-injection pattern):** `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.test.ts:536-612` (Phase 160-01 test contract template)

```typescript
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename160 = fileURLToPath(import.meta.url)
const __dirname160 = dirname(__filename160)

describe('Phase 160-01 — Haiku routing for computer-use', () => {
    const FACTORY_SRC = readFileSync(
        join(__dirname160, 'agent-runner-factory.ts'),
        'utf8',
    )

    it('contains literal mode === computer-use guard', () => {
        expect(FACTORY_SRC).toMatch(/mode === 'computer-use'/)
    })

    it('contains literal claude-haiku-4-5-20251001 override', () => {
        expect(FACTORY_SRC).toMatch(/claude-haiku-4-5-20251001/)
    })

    it('preserves Phase 160-01 marker comment', () => {
        expect(FACTORY_SRC).toMatch(/Phase 160-01/)
    })

    it('Sacred SHA marker present for sdk-agent-runner', () => {
        expect(FACTORY_SRC).toMatch(
            /Sacred SHA: liv\/packages\/core\/src\/sdk-agent-runner\.ts untouched/,
        )
    })

    describe('runtime body injection', () => {
        // ... vi.fn() stub on upstream POST, assert body.tier + body.model
    })
})
```

**Lift adapted for 161-01 (tsx assert version since liv/packages/core uses node:assert NOT vitest):**

```typescript
// agent-session.computer-use.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentSessionManager } from './agent-session.js';

const SRC = readFileSync(resolve(__dirname, 'agent-session.ts'), 'utf8');

function testSourceContainsHaikuDatedLiteral() {
    assert.match(SRC, /claude-haiku-4-5-20251001/);
    console.log('  PASS: agent-session.ts contains dated Haiku literal');
}

function testSourceContainsConvIdPrefixGuard() {
    assert.match(SRC, /startsWith\(['"]native:['"]\)/);
    assert.match(SRC, /startsWith\(['"]webapp:['"]\)/);
    console.log('  PASS: detection literals present');
}

function testSourceContainsPhase161Marker() {
    assert.match(SRC, /Phase 161-01/);
    console.log('  PASS: Phase 161-01 marker comment present');
}

function testSourceContainsSacredShaMarker() {
    assert.match(SRC, /sdk-agent-runner\.ts/);
    console.log('  PASS: sacred SHA marker present');
}

function testIsComputerUseSessionPureHelper() {
    // If detection is extracted to a pure helper, assert its behavior
    // (planner discretion per CONTEXT D-161-A).
    // assert.equal(isComputerUseSession('native:xyz:abc'), true);
    // assert.equal(isComputerUseSession('webapp:xyz:abc'), true);
    // assert.equal(isComputerUseSession('plain-uuid'), false);
    // assert.equal(isComputerUseSession(undefined), false);
}

function testConstructorAcceptsBuilderOption() {
    const mockRegistry = { listFiltered: () => [], get: () => null } as any;
    const builder = async () => 'FAKE PROMPT';
    const manager = new AgentSessionManager({
        toolRegistry: mockRegistry,
        computerUseSystemPromptBuilder: builder,
    });
    // No throw = pass; option accepted without runtime error.
    assert.ok(manager);
    console.log('  PASS: AgentSessionManager accepts computerUseSystemPromptBuilder');
}
```

**Runtime body-injection test (Phase 160-01 style):**
The broker test stubs the upstream POST with `captureUpstreamPost()`. Phase 161-01 SDK path needs an equivalent — stub `query()` from `@anthropic-ai/claude-agent-sdk`. **Planner discretion per RESEARCH Q6:** preferred approach is to extract the detection + override into a pure helper (`isComputerUseSession()` + `resolveComputerUseModel()`) and unit-test those in isolation. Skip the full `consumeAndRelay` integration test (too complex without proper SDK mocking).

---

### `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` (extend — Patch 161-03)

**Analog:** Same file, existing `resolveDisplay` env precedence tests (lines 24-115).

```typescript
import {describe, it, expect, vi} from 'vitest'
import {resolveDisplay} from './server.js'

describe('resolveDisplay — Phase 102-06 env precedence', () => {
    it('Test 1: LUSE_TARGET_DISPLAY=:10 set → effective display is :10', () => {
        const env: NodeJS.ProcessEnv = {LUSE_TARGET_DISPLAY: ':10'}
        const writeWarn = vi.fn()
        const result = resolveDisplay({env, writeWarn})
        expect(result).toBe(':10')
        expect(writeWarn).not.toHaveBeenCalled()
    })
    // ...
})
```

**Lift adapted for Phase 161-03:** add a new `describe` block. Source-text invariants come first (cheap), then optional resolver-construction unit tests if planner extracts the construction into a pure helper:

```typescript
describe('Phase 161-03 — livosAppResolver env-threaded construction', () => {
    const SERVER_SRC = readFileSync(
        join(__dirname, 'server.ts'),
        'utf8',
    )

    it('reads LIVINITYD_API_URL env var', () => {
        expect(SERVER_SRC).toMatch(/process\.env\.LIVINITYD_API_URL/)
    })

    it('reads LIV_API_KEY env var', () => {
        expect(SERVER_SRC).toMatch(/process\.env\.LIV_API_KEY/)
    })

    it('reads LUSE_USER_SLUG env var', () => {
        expect(SERVER_SRC).toMatch(/process\.env\.LUSE_USER_SLUG/)
    })

    it('reads LUSE_DOMAIN_ROOT env var', () => {
        expect(SERVER_SRC).toMatch(/process\.env\.LUSE_DOMAIN_ROOT/)
    })

    it('imports defaultLivosAppResolver from native/window', () => {
        expect(SERVER_SRC).toMatch(/defaultLivosAppResolver/)
        expect(SERVER_SRC).toMatch(/from\s+['"]\.\.\/native\/window/)
    })

    it('uses AbortSignal.timeout(5000) per ws-agent.ts pattern', () => {
        expect(SERVER_SRC).toMatch(/AbortSignal\.timeout\(5000\)/)
    })

    it('uses distinct stderr prefix [luse-mcp] resolver: (no collision with open_livos_app IPC)', () => {
        expect(SERVER_SRC).toMatch(/\[luse-mcp\]\s+resolver:/)
        // Defensive — ensure the new logs do NOT use the open_livos_app prefix
        // (Landmine #3 / D-161-D stderr IPC discipline).
        const newResolverBlock = SERVER_SRC.match(/Phase 161-03[\s\S]*?registerLuseTools/)?.[0] ?? ''
        expect(newResolverBlock).not.toMatch(/^\s*\[luse-mcp\]\s+open_livos_app/m)
    })

    it('passes livosAppResolver into registerLuseTools options', () => {
        expect(SERVER_SRC).toMatch(/livosAppResolver/)
    })
})
```

---

### `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` (extend — Patch 161-04)

**Analog:** Same file, existing lines 51-53.

```typescript
it('mints conversation IDs with native: prefix', () => {
    expect(SRC).toMatch(/`native:\$\{nativeAppId\}:\$\{rand\}`/)
})
```

**Lift adapted for 161-04 (single complementary invariant per RESEARCH Q5):**

```typescript
it('passes the native: prefix verbatim through agent.sendMessage (no mutation)', () => {
    // Defensive: if a future refactor strips/normalizes the prefix before
    // forwarding to useAgentSocket.sendMessage, this fires red.
    expect(SRC).toMatch(/agent\.sendMessage\([^,]+,\s*undefined,\s*convId\b/)
})

it('Phase 161-04 — prefix emit invariant (downstream signal to AgentSessionManager)', () => {
    // The native: prefix carries the computer-use session-type signal all the
    // way to AgentSessionManager.consumeAndRelay (verified end-to-end in
    // RESEARCH Q1 trace). Any future refactor that mutates conversationId
    // before WS send breaks the SDK-path Haiku routing.
    expect(SRC).toMatch(/`native:\$\{nativeAppId\}:\$\{rand\}`/)
})
```

**No code change to `use-native-app-agent.ts`.** Symmetric extension to `use-webapp-agent.unit.test.tsx` if it doesn't already lock the `webapp:` prefix (RESEARCH Q5 confirms prefix is unconditional in source).

---

## Shared Patterns

### Phase 160 invariant style (applies to all new test surfaces in 161)

**Source:** `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.test.ts:536-612` (Phase 160-01) AND `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts:359-404` (Phase 160-02)

**Apply to:** every new test block in 161-01, 161-03, 161-04

**Two-layer test contract (Phase 160 established):**
1. **Source-text invariants** — grep-verifiable assertions via `readFileSync(SRC) + expect(SRC).toMatch(/.../)`. Cheap, lock the literal strings (`'claude-haiku-4-5-20251001'`, `'native:'`, `'webapp:'`, env var names).
2. **Runtime body-injection asserts** — only where SDK mocking is tractable. For SDK-path tests in `liv/packages/core`, use tsx + node:assert and prefer pure-helper extraction over end-to-end `consumeAndRelay` mocking.

```typescript
// Pattern: SRC = readFileSync once at module top; describe block matches
const SRC = readFileSync(resolve(__dirname, 'TARGET_FILE.ts'), 'utf8')

describe('Phase 161-XX — DESCRIPTOR', () => {
    it('contains literal LITERAL_NAME', () => {
        expect(SRC).toMatch(/LITERAL_NAME/)
    })
    it('preserves Phase 161-XX marker comment', () => {
        expect(SRC).toMatch(/Phase 161-XX/)
    })
    it('Sacred SHA marker present for sdk-agent-runner', () => {
        expect(SRC).toMatch(/sdk-agent-runner\.ts/)
    })
})
```

### HTTP fetch pattern (applies to 161-03)

**Source:** `livos/packages/livinityd/source/modules/server/ws-agent.ts:160-172`

**Apply to:** new `livosAppResolver` HTTP closures in `mcp/server.ts`

```typescript
try {
    const res = await fetch(`${baseUrl}/path`, {
        headers: apiKey ? {'X-Api-Key': apiKey} : {},
        signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as {<typed-shape>}
    return data.<extract>
} catch (err: any) {
    logger.error('CONTEXT: failure description', err.message)
    return <safe-fallback>
}
```

**Variations for MCP child (no `opts.logger` available):** route errors to `process.stderr.write` with distinct `[luse-mcp] resolver:` prefix (D-161-D, Landmine #3).

### DI option pattern (applies to 161-02)

**Source:** `liv/packages/core/src/agent-session.ts:177` (existing constructor)

**Apply to:** new `computerUseSystemPromptBuilder` field on `AgentSessionManagerOptions`

```typescript
// Interface additive — never break existing callers
{ existingField?: Type; ...; newField?: NewType }
// Constructor — null-default for legacy callers
this.newField = opts.newField ?? null;
// Use site — branch on presence + fall-through to legacy
if (condition && this.newField) { use(this.newField); } else { legacyPath(); }
```

### Env-block extension (applies to 161-03)

**Source:** `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts:313-328` (Phase 160-02 already extended this exact block)

**Apply to:** new env vars in `baseEnv`

**Pattern:** descriptor branch sets values unconditionally with sensible defaults; host-display branch uses spread-conditional (`...(env.X ? {X: env.X} : {})`) so absent values don't pollute the env-block-comparison in `configsMatch`.

### Sacred SHA + D-09 guardrails (applies to ALL 161 patches)

**Source:** RESEARCH Q11 verification (live `git ls-tree` against the file)

**Apply to:** every commit

```
git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts
→ MUST output: f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

D-09 file at `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` — bytes UNCHANGED across every 161 commit. Pre-commit hook enforces. No edits to either file from any 161 plan.

---

## No Analog Found

| File | Why no analog needed |
|------|----------------------|
| (none) | All 7 new/modified files have direct Phase 160 / Phase 102 / existing-file analogs. |

---

## Open Questions Surfaced (planner discretion)

1. **Env naming for MCP child's livinityd-tRPC URL** — CONTEXT.md D-161-D listed `LIV_API_URL=http://localhost:8080`, but `LIV_API_URL` already means `http://localhost:3200` (liv-core) per `ws-agent.ts:154`. **Recommendation: `LIVINITYD_API_URL`** for the new env var. RESEARCH Q4 + Landmine #5 covers this.

2. **`LIVOS_USER_SLUG` vs `LUSE_USER_SLUG` consolidation** — Phase 160-02 already emits `LIVOS_USER_SLUG` for overlay rendering (read by `buildLuseOverlay`). CONTEXT.md D-161-D introduces `LUSE_USER_SLUG` for the resolver (read by `defaultLivosAppResolver`). Both carry the same value; planner picks whether to share one key or keep two. **Recommendation: keep separate `LUSE_*` prefix** for resolver (cleaner separation, no risk of overlay rename breaking resolver).

3. **`tier` `const` vs `let`** — current line 320 is `const tier = ...`. Override requires either changing to `let` (simpler) or introducing `effectiveTier` variable (less invasive). Planner discretion per CONTEXT.

4. **Pure-helper extraction for `isComputerUseSession`** — RESEARCH Q6 recommends extracting detection into `function isComputerUseSession(convId: string | undefined): boolean` for unit-testability. Planner discretion; recommendation is YES (mirrors `resolveDisplay` extraction pattern in `mcp/server.ts:67`).

---

## Metadata

**Analog search scope:**
- `liv/packages/core/src/*.ts` (sacred + DI host)
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` (construction site + HTTP fetch idiom)
- `livos/packages/livinityd/source/modules/computer-use/{mcp,native,*.ts}` (resolver + env-block)
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.{ts,test.ts}` (Phase 160-01 freshest analog)
- `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.{ts,test.ts}` (Phase 160-02 builder + invariant style)
- `livos/packages/livinityd/source/modules/apps/native-routes.ts` + `webapps/{index.ts, trpc-router.ts}` (tRPC endpoints to fetch)
- `livos/packages/ui/src/hooks/use-{native-app,webapp}-agent.{ts,test.ts}` (UI prefix emit)

**Files scanned:** 14
**Pattern extraction date:** 2026-05-19
**Sacred SHA verified live:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (PASS)
