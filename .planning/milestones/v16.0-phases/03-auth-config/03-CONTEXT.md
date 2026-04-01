# Phase 3: Auth & Config - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Claude authentication endpoints (API key + OAuth PKCE), provider selection to config schema, and fallback between providers. ClaudeProvider already has full auth infrastructure (getApiKey, startLogin, submitLoginCode, logout, getCliStatus). This phase wires those methods into API routes and adds provider selection config.

</domain>

<decisions>
## Implementation Decisions

### Auth Routes
- Follow existing Kimi auth route pattern in api.ts (lines 219-380)
- Claude routes: /api/claude/set-api-key, /api/claude/status, /api/claude/start-login (OAuth PKCE), /api/claude/submit-code, /api/claude/logout
- Redis keys already defined: `nexus:config:anthropic_api_key`, `nexus:config:claude_auth_method`

### Config Schema
- Add `primary_provider: 'claude' | 'kimi'` to config schema
- Redis key: `nexus:config:primary_provider`
- Default: 'kimi' (backward compatible)

### Fallback
- ProviderManager reads primary_provider from config on init
- Fallback order: [primary, secondary] — if primary fails, try secondary
- Existing isFallbackableError() handles 429, 503, timeout etc.

### Claude's Discretion
- Exact API response shapes for auth endpoints
- Error handling details
- OAuth PKCE URL/scope constants (already in restored claude.ts)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `claude.ts` — Full auth: getApiKey(), startLogin(), submitLoginCode(), logout(), getCliStatus(), getAuthMethod()
- `kimi.ts` — Reference auth routes pattern (lines 219-380 in api.ts)
- `manager.ts` — setFallbackOrder() already exists, just needs config-driven call
- `config/manager.ts` — Redis config system with `nexus:config` prefix

### Established Patterns
- Kimi auth: `/api/kimi/set-api-key` POST, `/api/kimi/status` GET, `/api/kimi/start-login` POST
- API key stored in Redis: `nexus:config:kimi_api_key`
- Auth flag in Redis: `nexus:kimi:authenticated`
- Config manager reads/writes from `nexus:config` Redis hash

### Integration Points
- `api.ts` — Add Claude auth routes alongside Kimi routes
- `config/schema.ts` or config manager — Add primary_provider setting
- `manager.ts` constructor or init — Read primary_provider, set fallback order
- `brain.ts` or agent startup — Pass provider preference to ProviderManager

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond matching existing Kimi auth pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
