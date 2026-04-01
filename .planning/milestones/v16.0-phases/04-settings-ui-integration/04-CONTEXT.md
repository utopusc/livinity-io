# Phase 4: Settings UI & Integration - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add provider selection toggle to Settings UI, show active provider status, and ensure new conversations use the selected provider. Extends the existing AI Configuration settings page with Claude provider card and a provider selector.

</domain>

<decisions>
## Implementation Decisions

### Provider Toggle Design
- Add provider selector at top of AI Configuration page (radio or toggle between Kimi and Claude)
- Uses PUT /api/provider/primary endpoint (added in Phase 3)
- Shows current primary provider with visual indicator
- Both provider cards visible below with individual auth status

### Claude Provider Card
- Follow exact same pattern as existing Kimi provider card in ai-config.tsx
- Two auth modes: API key input (text field + save button) and OAuth PKCE (button to start flow)
- Uses Phase 3 API routes: /api/claude/set-api-key, /api/claude/status, /api/claude/start-login, /api/claude/submit-code, /api/claude/logout
- Need tRPC routes in livinityd AI routes.ts to proxy to Nexus Claude auth endpoints

### Active Provider in Chat
- Small provider indicator in AI chat header (e.g., "Claude" or "Kimi" badge)
- Read from GET /api/providers endpoint (primaryProvider field)

### Claude's Discretion
- Exact layout proportions and spacing
- Animation/transition details
- Error message wording
- Icon choices (Tabler icons used throughout)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ai-config.tsx` — Current Kimi-only settings page, ~180 lines, uses SettingsPageLayout
- `trpcReact.ai.getKimiStatus` — tRPC query for Kimi auth status
- `trpcReact.ai.kimiLogin` / `kimiLogout` — tRPC mutations
- `SettingsPageLayout` component — standard settings page wrapper
- shadcn Button, Input components
- Tabler icons (TbLoader2, TbCircleCheck, TbAlertCircle, TbLogout, TbLogin, TbBrain)

### Established Patterns
- Settings pages use `SettingsPageLayout` with title + description
- Auth cards: bordered div with status icon, description, action button
- Connected state: green border + green icon + "Connected" text
- Not connected: amber icon + "Not connected" + connect button
- tRPC routes in `livos/packages/livinityd/source/modules/ai/routes.ts` proxy to Nexus API
- Nexus API at port 3200 with X-Api-Key header

### Integration Points
- `ai-config.tsx` — Add Claude section and provider toggle
- `routes.ts` (livinityd AI module) — Add tRPC routes for Claude auth (proxy to Nexus)
- AI chat component — Add provider indicator
- `common.ts` — Add new tRPC routes to httpOnlyPaths if using HTTP transport

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond following existing Kimi UI pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
