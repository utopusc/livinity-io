# Phase 163: Surface-Specific Vault Contexts + Phase 161 Helper Bridge

**Gathered:** 2026-05-19
**Status:** Ready for planning (autonomous, depends on Phase 162 SHIPPED)
**Source:** v34-LIVOS-CC-INTEGRATION-MASTER.md decisions D-V34-C, D-V34-D

<domain>
## Phase Boundary

Phase 162 vault'u kurdu + Main Chat'i SDK settings'e bağladı. Phase 163 WebApp Chat + NativeApp Chat'leri vault'un surfaces/ alt dizinlerine bağlar:
- `native:` prefix → cwd = `/home/bruce/livinity-vault/surfaces/native/<nativeAppId>/`
- `webapp:` prefix → cwd = `/home/bruce/livinity-vault/surfaces/webapp/<webappId>/`
- Her surface'in kendi CLAUDE.md'si (app-specific context, conventions, hooks)

Phase 161 helpers (`isComputerUseSession`, Haiku routing, LivOS overlay) **olduğu gibi reuse**. Sadece runtime'da hangi vault path'in seçildiği değişir; tier override + overlay composer aynı kalır.

Phase 161 dosyalarına dokunulmaz — sacred SHA + D-09 + chat-path-untouched contract preserved.

**Phase 163 sonu:**
- WebApp Chat session başlattığında: SDK query() cwd = `vault/surfaces/webapp/<id>/`; CLAUDE.md o webapp'e özel; model Haiku (Phase 161 unchanged)
- NativeApp Chat aynı pattern
- vault/surfaces/<kind>/<id>/CLAUDE.md app install hook'larıyla otomatik üretilir (Suna install → vault/surfaces/webapp/suna/CLAUDE.md yazılır)
- LivOS overlay (Phase 160-04 xdpyinfo) artık dosyaya yazılıp `settingSources` üzerinden okutulur (alternatif: `systemPrompt` option direct inject)

</domain>

<decisions>
## Implementation Decisions

### Plan 163-01: Surface Vault Scaffolder + App Install Hooks

**Module:** `livos/packages/livinityd/source/modules/claude-runner/surface-context.ts`

**Triggers:**
- WebApp install (existing `installForUser` in apps.ts) → after install, write `vault/surfaces/webapp/<webappId>/CLAUDE.md`
- NativeApp install → same pattern for native
- WebApp uninstall → remove surface dir (with confirmation log)

**Template per surface (rendered):**
```markdown
# WebApp Context: ${app.name}

You are operating inside the **${app.name}** WebApp on the user's LivOS desktop.

## App Metadata
- **App ID:** ${app.id}
- **Subdomain:** ${app.subdomain}
- **Category:** ${app.category}
- **Description:** ${app.description}

## Tools Available
This is a computer-use surface. You have access to:
- `mcp__luse__*` (screenshot, click, type, key, application launcher)
- Standard Read/Edit/Bash for file work
- ${app-specific-hint, e.g. "This is n8n — workflows live at /home/bruce/n8n/workflows/"}

## Cross-Surface Memory
User-level preferences and project context are available via:
- [[user/bruce-profile]]
- [[projects/v34]]
- [[references/mini-pc]]

## Constraints
- Stay in this app's window unless explicitly asked to switch
- Do NOT touch other apps' state
- Respect Phase 160 sandbox path restrictions
```

**Acceptance:**
- After installing a sample WebApp, `vault/surfaces/webapp/<id>/CLAUDE.md` exists with rendered content
- bruce-owned, 0644
- Uninstall removes the dir (after move-to-trash safety: rename to `.deleted-<timestamp>`, not rm -rf)

**Test:** mock install hook, verify dir creation; verify uninstall safety rename

### Plan 163-02: Phase 161 isComputerUseSession → CWD Resolution

**File modify:** `livos/packages/livinityd/source/modules/server/ws-agent.ts`

**Logic at session start (vaultModeConfig path from Phase 162):**
```ts
import { isComputerUseSession } from '@liv/core/lib';

function resolveSessionVaultPath(conversationId: string | undefined): string {
    const VAULT_ROOT = '/home/bruce/livinity-vault';
    if (!conversationId) return VAULT_ROOT;
    if (conversationId.startsWith('native:')) {
        const parts = conversationId.split(':');
        const nativeAppId = parts[1];
        return `${VAULT_ROOT}/surfaces/native/${nativeAppId}`;
    }
    if (conversationId.startsWith('webapp:')) {
        const parts = conversationId.split(':');
        const webappId = parts[1];
        return `${VAULT_ROOT}/surfaces/webapp/${webappId}`;
    }
    return VAULT_ROOT;  // Main Chat default
}

// At session start:
const vaultPath = resolveSessionVaultPath(msg.conversationId);
const exists = await stat(vaultPath).then(s => s.isDirectory()).catch(() => false);
const finalVaultPath = exists ? vaultPath : VAULT_ROOT;  // fall back if surface dir not yet scaffolded

sessionManager.startSession(sessionKey, prompt, model, sendMessage, {
    conversationId: msg.conversationId,
    vaultModeConfig: { vaultPath: finalVaultPath, defaultModel: ... },
    ...
});
```

**Phase 161 contract preserved:** isComputerUseSession(convId) still returns true for native:/webapp: → tier override still fires → model = 'claude-haiku-4-5-20251001'. The ONLY change is CWD differs based on convId prefix.

**Test:** spawn 3 sessions with different convIds (no prefix, native:abc, webapp:xyz), verify each gets correct cwd.

### Plan 163-03: LivOS Overlay → Vault File

**Current Phase 161-02 / 161-04:** `buildLuseSystemPromptWithOverlayResolved()` returns a string. AgentSessionManager passes it as `systemPrompt` option.

**Phase 163-03 option A (preferred):** Continue passing as `systemPrompt` for computer-use sessions. Vault mode + computer-use can coexist:
- `vaultMode=true` + `isComputerUseSession=true` → use `systemPrompt: await computerUseSystemPromptBuilder()` (overrides vault auto-load); cwd still = surface vault for Edit tool target
- `vaultMode=true` + `isComputerUseSession=false` → no systemPrompt (vault CLAUDE.md drives), cwd = vault root
- `vaultMode=false` → Phase 161 verbatim

**Phase 163-03 option B (later optimization):** Write overlay to `vault/surfaces/<kind>/<id>/.claude/rules/livos-overlay.md` on each session start. CC SDK picks up via settingSources. Eliminates systemPrompt override.

**Decision:** Ship Option A in Phase 163 (no new code), evaluate Option B in Phase 165 polish. Phase 161 builder UNCHANGED.

**Test:** WebApp Chat session journal shows `[LIVOS CONTEXT — PREPENDED` text via streamed system prompt event.

### Plan 163-04: Mini PC Deploy + Synthetic Surface Probes

**Steps:**
1. `git push`, Mini PC `update.sh` (detached)
2. Verify surface dirs auto-created when sample WebApp installed
3. Synthetic probe: WS `start` with `conversationId: 'webapp:test163:abc12345'`
4. Verify journal:
   - `routing to Haiku` (Phase 161 contract — still fires)
   - SDK_INIT model = `claude-haiku-4-5-20251001`
   - cwd in session metadata = `/home/bruce/livinity-vault/surfaces/webapp/test163` (or fallback to root if not pre-scaffolded)
5. Synthetic probe 2: `conversationId: 'native:test163native:def67890'`, same checks but native cwd

**Acceptance:**
- Both probes complete without error
- Phase 161 chat-path-untouched regression: probe with `conv_xxx` prefix still works (Main Chat path)
- All Phase 162 + 163 commits preserve sacred SHA + D-09

</decisions>

<canonical_refs>
- `.planning/v34-LIVOS-CC-INTEGRATION-MASTER.md`
- `.planning/phases/162-vault-and-sdk-integration/162-CONTEXT.md` (depends on shipped)
- Phase 161 helpers at `liv/packages/core/src/agent-session.ts:181` (isComputerUseSession)
- `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts:418` (buildLuseSystemPromptWithOverlayResolved)

</canonical_refs>

<deferred>
- Autonomous scheduler → Phase 164
- Settings UI + polish → Phase 165
</deferred>

---

*Phase: 163-surface-vault-contexts*
*Depends on: Phase 162 SHIPPED*
*Approach: autonomous*
