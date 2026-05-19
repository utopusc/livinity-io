# Phase 162: Vault Scaffolding + SDK Settings Integration

**Gathered:** 2026-05-19
**Status:** Ready for planning (autonomous, no discuss needed)
**Source:** v34-LIVOS-CC-INTEGRATION-MASTER.md decisions D-V34-A through D-V34-N

<domain>
## Phase Boundary

LivOS chat surface'lerinin "Claude Code'a benziyor ama daha az kaliteli" hissi yaratan KÖK SEBEP: AgentSessionManager.consumeAndRelay()'in query() çağrısına `cwd` + `settingSources` opsiyonları geçmiyor. Sonuç:
- vault/CLAUDE.md yüklenmiyor (memory yok)
- vault/.claude/skills/ + commands/ yüklenmiyor (slash command + skill yok)
- Default model Sonnet 4.6 (Opus 4.7 yerine)
- LivOS BASE_SYSTEM_PROMPT custom yazılmış, Anthropic'in elaborate CC system prompt'unun yerini tutmuyor

Phase 162 = bu eksikleri kapat. Vault'u dosya sisteminde oluştur, AgentSessionManager opsiyonlarını upgrade et, Redis feature flag ile gate'le.

**Phase 162 sonu:**
- `/home/bruce/livinity-vault/` Mini PC'de hazır
- AgentSessionManager `liv:config:chat_backend=vault` flag set olduğunda query()'ye `cwd` + `settingSources: ['project']` + opsiyonel model override geçiyor
- Default flag value `vault` (Phase 162 ship sonrası)
- Legacy flag value `legacy` korunur — Redis flip ile <5sn rollback

</domain>

<decisions>
## Implementation Decisions

Hepsi master'da locked. Burada her plan için somut:

### Plan 162-01: Vault Scaffolder (idempotent bootstrap)

**Module:** `livos/packages/livinityd/source/modules/claude-runner/vault-scaffolder.ts`

**Templates location:** `livos/packages/livinityd/source/data/vault-templates/` (NEW directory, repo'ya commit edilir)

**Bootstrap trigger:** livinityd start at boot, after AI module init, before WS handler registration. Idempotent — existing files are NOT overwritten.

**Vault structure to create (per D-V34-D):**
```
/home/bruce/livinity-vault/
├── CLAUDE.md                  # Templated with bruce profile + project state placeholders
├── .claude/
│   ├── settings.json          # model default, allowed_tools list
│   ├── mcp.json               # luse + filesystem MCP descriptors (rendered from livos config)
│   ├── skills/livos-status/SKILL.md   # sample skill
│   └── commands/livos-deploy.md       # sample command
├── memory/
│   ├── feedback/.gitkeep
│   ├── user/bruce-profile.md  # populated from livinityd user table + project memory
│   ├── projects/v34.md        # current milestone snapshot
│   └── references/mini-pc.md  # Mini PC topology (from memory)
├── sessions/                  # empty, CC will populate
├── inbox/                     # empty
└── livos-agents/              # empty (Phase 164 populates samples)
```

**Permissions:** `chown -R bruce:bruce /home/bruce/livinity-vault/`, mode 0755 dirs, 0644 files.

**Acceptance criteria:**
- After `systemctl restart livos`, vault root exists
- All template files present with non-empty content
- `vault/CLAUDE.md` contains `[[bruce-profile]]` wikilink
- `vault/.claude/settings.json` parses as valid JSON, contains `"model": "claude-opus-4-7"`
- Idempotency: re-run boot, vault dirs NOT recreated, existing user-edited files preserved (mtime check)
- Test: write a marker file `vault/memory/feedback/user-edit-test.md`, restart livinityd, file still exists with marker

### Plan 162-02: AgentSessionManager Options Upgrade + Redis Flag Gate

**File modify:** `liv/packages/core/src/agent-session.ts`

**Changes:**
1. Add to `AgentSessionManagerOptions` interface (line ~188-208 area):
   ```ts
   /**
    * Phase 162-02 — vault mode support. When set, sessions use CC's settingSources
    * + cwd-based context loading (vault/CLAUDE.md, vault/.claude/skills, vault/.claude/commands).
    * When undefined or false, AgentSessionManager preserves Phase 161 behavior verbatim
    * (BASE_SYSTEM_PROMPT + composeSystemPrompt, no cwd, no settingSources).
    *
    * Vault path resolver is async: livinityd calls Redis at session start
    * (liv:config:chat_backend === 'vault') and passes vault path here.
    */
   vaultModeConfig?: {
       vaultPath: string;            // e.g. '/home/bruce/livinity-vault'
       defaultModel?: string;        // e.g. 'claude-opus-4-7' (Redis liv:config:default_chat_model)
   };
   ```

2. In `consumeAndRelay`, after Phase 161-01 tier override block (line ~370 area):
   ```ts
   // Phase 162-02 — vault mode: when vaultModeConfig set, switch to settingSources
   // + cwd flow. Computer-use tier override (Phase 161) still applies first.
   const vaultMode = !!this.vaultModeConfig;
   const sessionCwd = vaultMode ? this.vaultModeConfig.vaultPath : undefined;
   const sessionModelOverride = computerUse
       ? 'claude-haiku-4-5-20251001'                     // Phase 161 dated literal
       : (vaultMode ? this.vaultModeConfig.defaultModel : undefined);
   ```

3. At SDK query() call site (line ~689 area):
   ```ts
   const messages = query({
       prompt: session.inputChannel.generator,
       options: {
           systemPrompt: vaultMode ? undefined : systemPrompt,  // vault mode: let CLAUDE.md drive
           cwd: sessionCwd,                                      // NEW
           settingSources: vaultMode ? ['project'] : undefined,  // NEW
           mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
           tools: [],
           allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
           maxTurns,
           maxBudgetUsd,
           model: sessionModelOverride ?? tierToModel(tier),
           permissionMode: 'dontAsk',
           persistSession: false,
           abortController: session.abortController,
           env: safeEnv,
           includePartialMessages: true,
       },
   });
   ```

4. Redis flag wiring in `livos/packages/livinityd/source/modules/server/ws-agent.ts`:
   - Before AgentSessionManager construction, read `liv:config:chat_backend` (default `vault`)
   - If `vault`: pass `vaultModeConfig: { vaultPath: '/home/bruce/livinity-vault', defaultModel: await redis.get('liv:config:default_chat_model') ?? 'claude-opus-4-7' }`
   - If `legacy`: pass `vaultModeConfig: undefined` → Phase 161 behavior

**Hard guardrails:**
- Sacred SHA UNCHANGED
- D-09 verbatim UNCHANGED
- D-NO-NEW-DEPS
- When `vaultModeConfig: undefined`, byte-identical to Phase 161 chat path (regression test)

**Test contract:**
- Unit: source-text invariants for new option, cwd injection at query() site
- Runtime: vaultMode=true → query() receives cwd + settingSources; vaultMode=false → no diff vs Phase 161
- Regression: testChatPathUntouchedRegression (Phase 161 invariant) passes when flag=legacy

### Plan 162-03: Auth Threading Verification

**Purpose:** Test ki SDK subprocess subscription path'i bulabilsin.

**Module:** `livos/packages/livinityd/source/modules/claude-runner/auth-verifier.ts`

**Logic:**
1. At livinityd boot (after vault scaffolder), perform a smoke check:
   ```ts
   import { query } from '@anthropic-ai/claude-agent-sdk';
   
   async function smokeAuthCheck(): Promise<{ok: boolean; model?: string; err?: string}> {
       try {
           const messages = query({
               prompt: 'Reply with the single word "ok"',
               options: {
                   cwd: '/home/bruce/livinity-vault',
                   settingSources: ['project'],
                   maxTurns: 1,
                   maxBudgetUsd: 0.05,
                   model: 'claude-haiku-4-5',  // cheapest
                   permissionMode: 'dontAsk',
                   persistSession: false,
                   env: { HOME: '/root', PATH: process.env.PATH },  // critical: HOME=/root for subscription
               },
           });
           for await (const msg of messages) {
               if (msg.type === 'system' && (msg as any).subtype === 'init') {
                   return { ok: true, model: (msg as any).model };
               }
           }
           return { ok: false, err: 'no init event received' };
       } catch (err: any) {
           return { ok: false, err: err.message };
       }
   }
   ```
2. Run at boot, log result to journal, write to Redis key `liv:config:cc_auth_status` (`ok` or error string)
3. Settings UI can later display this

**Acceptance:**
- After Mini PC boot, `redis-cli GET liv:config:cc_auth_status` → `ok`
- Journal contains line `[claude-runner/auth] smoke check passed model=claude-haiku-4-5`
- If fails: journal contains error, but livinityd boots normally (auth-check is non-blocking)

### Plan 162-04: Multi-Instance Refactor (sessionKey shape)

**Files modify:**
- `liv/packages/core/src/agent-session.ts` (sessionKey internal change)
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` (call site update)

**Change rationale:**
Currently `AgentSessionManager.sessions: Map<userId, ActiveSession>` → 1 session per user.
For multi-instance (Main Chat + Autonomous + WebApp Chat parallel), key shape changes:
```ts
type SessionKey = `${userId}:${surfaceKind}:${surfaceId ?? 'default'}:${connectionId}`;
// e.g. 'admin:54c6caa5:main:default' or 'admin:54c6caa5:webapp:suna-uuid' or 'admin:54c6caa5:autonomous:nightly-backup'
```

**Backward compat:** When `vaultModeConfig: undefined` (legacy), sessionKey falls back to `userId` (Phase 161 behavior).

**Test:** spawn 2 parallel sessions with different surfaceKinds for same userId, assert both run concurrently without canceling each other.

### Plan 162-05: Mini PC Deploy + Live Runtime Probe

**Steps:**
1. `git push origin master`
2. Mini PC: `sudo bash /opt/livos/update.sh` (detached + log poll per ZeroTier protocol)
3. Wait for completion, verify all 4 services active
4. Verify vault: `sudo ls -la /home/bruce/livinity-vault/` shows CLAUDE.md, .claude/, memory/
5. Live runtime probe (Phase 161 pattern, adapted): WS probe with `conversationId: 'conv_phase162smoke'` (no native:/webapp: prefix → expects Opus 4.7 + vault context)
6. Verify journal: `routing to Haiku` NOT present (since no prefix), `model: 'claude-opus-4-7'` IS present
7. Verify session transcript at `/home/bruce/livinity-vault/sessions/<uuid>.jsonl` exists after probe

**Acceptance:**
- Probe response contains evidence of CLAUDE.md context (e.g., agent recognizes user as bruce, references vault location)
- Sacred SHA on Mini PC = expected
- All 4 services active for 5min post-deploy without crash

</decisions>

<canonical_refs>
## Canonical References

**Master:**
- `.planning/v34-LIVOS-CC-INTEGRATION-MASTER.md` (all D-V34-* decisions)

**SDK docs (verified during research):**
- Agent SDK overview: https://code.claude.com/docs/en/agent-sdk (settingSources, sessions, hooks, subagents)
- Headless docs: https://code.claude.com/docs/en/headless (all CLI flags)
- Streaming input: redirects to agent-sdk overview

**Phase 161 (in production, REUSED not replaced):**
- `liv/packages/core/src/agent-session.ts` (consumeAndRelay + isComputerUseSession at line 181)
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` (AgentSessionManager construction line 177)
- `.planning/phases/161-computer-use-sdk-path-wiring/161-VERIFICATION.md` (live runtime probe pattern)

**Sacred files (DO NOT MODIFY):**
- `liv/packages/core/src/sdk-agent-runner.ts` (SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`)
- `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` (D-09 verbatim)

**Mini PC reference:**
- `/usr/bin/claude` (CC v2.1.84)
- `/root/.claude/.credentials.json` (subscription OAuth)
- `/opt/livos/node_modules/.pnpm/@anthropic-ai+claude-agent-sdk@0.2.85_zod@3.25.76/` (bundled CC binary)
- `/home/bruce/` (vault target home)

**Project memory (apply rules):**
- `feedback_subscription_only` (no BYOK)
- `feedback_autonomous` + `feedback_full_autonomous_no_questions` (no questions during /gsd-autonomous run)
- `reference_anthropic_subscription_state` (BROKER_FORCE_ROOT_HOME)
- `reference_zerotier_unstable` (detach Mini PC ops)
- `feedback_ssh_rate_limit` (batch SSH)

</canonical_refs>

<specifics>
## Specific File Touch Map

| Plan | Files |
|------|-------|
| 162-01 | NEW: `livos/packages/livinityd/source/modules/claude-runner/{index,vault-scaffolder,vault-scaffolder.test}.ts`; NEW: `livos/packages/livinityd/source/data/vault-templates/**`; MOD: `livos/packages/livinityd/source/index.ts` (boot wire-up) |
| 162-02 | MOD: `liv/packages/core/src/agent-session.ts` (AgentSessionManagerOptions interface, consumeAndRelay query() options); MOD: `livos/packages/livinityd/source/modules/server/ws-agent.ts` (Redis flag read, vaultModeConfig pass); NEW: `liv/packages/core/src/agent-session.vault-mode.test.ts` |
| 162-03 | NEW: `livos/packages/livinityd/source/modules/claude-runner/auth-verifier.ts` + test; MOD: `livos/packages/livinityd/source/index.ts` (boot wire-up) |
| 162-04 | MOD: `liv/packages/core/src/agent-session.ts` (sessions Map type + sessionKey); MOD: `livos/packages/livinityd/source/modules/server/ws-agent.ts` (sessionKey construction); MOD: `liv/packages/core/src/agent-session.computer-use.test.ts` (multi-instance test) |
| 162-05 | NO code changes; Mini PC deploy script + runtime probe; NEW: `.planning/phases/162-vault-and-sdk-integration/162-VERIFICATION.md` |

</specifics>

<deferred>
## Deferred to Phase 163

- WebApp/NativeApp surface vault contexts (Phase 163-01)
- Phase 161 isComputerUseSession bridge to surface CWD (Phase 163-02)
- LivOS overlay write-to-vault (Phase 163-03)

## Deferred to Phase 164

- Autonomous scheduler
- vault/livos-agents/ format

## Deferred to Phase 165

- Settings UI (model picker, autonomous panel)
- Idle reaper
- Memory linter

</deferred>

---

*Phase: 162-vault-and-sdk-integration*
*Approach: autonomous (CONTEXT.md prefilled, discuss-phase skipped)*
*Estimated: ~6-8 saat agent work*
