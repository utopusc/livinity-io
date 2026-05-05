# v32-redo-stage1a CONTEXT

## Goal
Visual-only literal port of Suna's `(dashboard)/` layout as the AI Chat window content.

## File Inventory Plan

### CREATE
- `livos/packages/ui/src/routes/ai-chat-suna/index.tsx` — entry wrapping layout + dashboard
- `livos/packages/ui/src/routes/ai-chat-suna/layout.tsx` — port of Suna (dashboard)/layout.tsx
- `livos/packages/ui/src/routes/ai-chat-suna/dashboard.tsx` — port of Suna (dashboard)/dashboard/page.tsx (empty state, no-op send)
- `livos/packages/ui/src/routes/ai-chat-suna/sidebar/sidebar-left.tsx` — port of Suna components/sidebar/sidebar-left.tsx
- `livos/packages/ui/src/routes/ai-chat-suna/sidebar/nav-main.tsx` — port of Suna components/sidebar/nav-main.tsx
- `livos/packages/ui/src/routes/ai-chat-suna/sidebar/nav-agents.tsx` — port of Suna components/sidebar/nav-agents.tsx (mocked)
- `livos/packages/ui/src/routes/ai-chat-suna/sidebar/nav-user-with-teams.tsx` — port with trimmed menu
- `livos/packages/ui/src/routes/ai-chat-suna/sidebar/kortix-logo.tsx` — port, brand "Kortix" -> "Livinity"
- `livos/packages/ui/src/routes/ai-chat-suna/sidebar/cta.tsx` — port of Suna cta.tsx
- `livos/packages/ui/src/routes/ai-chat-suna/sidebar/search-search.tsx` — port (mocked data)
- `livos/packages/ui/src/routes/ai-chat-suna/lib/mock-data.ts` — 6 threads + jacob user
- `livos/packages/ui/src/routes/ai-chat-suna/ui/sidebar.tsx` — full Suna shadcn Sidebar primitives
- `livos/packages/ui/src/routes/ai-chat-suna/ui/avatar.tsx` — Avatar primitive (needed by nav-user)
- `livos/packages/ui/src/routes/ai-chat-suna/ui/badge.tsx` — Badge primitive (needed by sidebar-left)
- `livos/packages/ui/src/routes/ai-chat-suna/ui/skeleton.tsx` — Skeleton primitive

### MODIFY
- `livos/packages/ui/src/modules/window/app-contents/ai-chat-content.tsx` — lazy import -> ai-chat-suna/index.tsx
- `livos/packages/ui/src/router.tsx` — remove /agents, /marketplace, /agent-marketplace, /playground/v32-* routes

### DELETE
- `livos/packages/ui/src/routes/ai-chat/v32/`
- `livos/packages/ui/src/routes/agents/`
- `livos/packages/ui/src/routes/marketplace/`
- `livos/packages/ui/src/components/mcp/`
- `livos/packages/ui/src/routes/playground/v32-theme.tsx`
- `livos/packages/ui/src/routes/playground/v32-tool-views.tsx`
- `livos/packages/ui/src/routes/playground/v32-tool-views-fixtures.ts`

## Key Substitutions Applied
- `'use client'` removed (Vite all-client)
- `next/link` -> `react-router-dom` Link
- `next/navigation` -> `react-router-dom` useNavigate/useLocation
- Supabase auth -> mock user (jacob, Ultra, 999999 credits)
- `next/image` -> `<img>`
- `useAccounts`, `useProjects`, `useThreads` -> mock data
- `useTheme` from next-themes -> removed (theme toggle stripped per spec)
- Suna API calls -> hardcoded mock data
- `useIsMobile` -> local implementation using window.innerWidth
- Nav-user dropdown: ONLY General (Knowledge Base, Usage, Integrations, Settings) + Advanced (Local .Env Manager)

## Sacred SHA
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — verified before changes, must be identical after.
