# v32 Restyle: /ai-chat Suna Look + Bottom-Left Profile Menu

## Goal
Visual-only restyle of `/ai-chat` to match the Suna design language using
the existing `--liv-*` OKLCH design tokens from `v32-tokens.css` (Phase 80).
Zero functional or positional changes. Add one new UI element: bottom-left
profile button with dropdown in `ConversationSidebar`.

## Files touched
- `livos/packages/ui/src/routes/ai-chat/index.tsx` — main restyle target
- `livos/packages/ui/src/routes/ai-chat/chat-input.tsx` — composer restyle

## Design tokens in scope
All from `livos/packages/ui/src/styles/v32-tokens.css`:
- `--liv-background` / `--liv-card` — surface hierarchy
- `--liv-border` — subtle borders
- `--liv-muted` / `--liv-muted-foreground` — secondary text + chip backgrounds
- `--liv-accent` / `--liv-accent-foreground` — hover / active states
- `--liv-primary` / `--liv-primary-foreground` — active tab underline, send button
- `--liv-ring` — focus rings
- `--liv-foreground` — primary text

## Auth hook
`useCurrentUser()` from `@/hooks/use-current-user` returns `{ username, user, role, ... }`.
`username` is used for avatar initial + display name. Fallback: "User".

## Shadcn primitives available
- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`,
  `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel`,
  `DropdownMenuGroup` — all from `@/shadcn-components/ui/dropdown-menu`

## Icons available (Tabler)
IconPlug, IconBrain, IconMessageCircle, IconPlus, IconTrash, IconRobot,
IconLoader2, IconMenu2, IconPuzzle, IconCode, IconScreenshot, IconDeviceDesktop,
IconArrowLeft, IconChevronDown, IconBook, IconChartBar, IconSettings, IconKey

## Sacred SHA
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — `liv/packages/core/src/sdk-agent-runner.ts`
Must be verified unchanged after this work.

## Constraints
- ZERO functional changes
- ZERO position changes
- ZERO new dependencies
- Profile menu items: MCP (switches activeView), Knowledge Base / Usage /
  Integrations / Settings (console.log placeholders), Local .Env Manager
  (console.log placeholder)
- NO Plan / Billing / Theme / Log out items
