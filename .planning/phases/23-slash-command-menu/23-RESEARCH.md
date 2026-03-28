# Phase 23: Slash Command Menu - Research

**Researched:** 2026-03-28
**Domain:** Frontend UI (React dropdown/combobox), tRPC query, Nexus REST API
**Confidence:** HIGH

## Summary

This phase adds a slash command dropdown menu to the AI Chat input. When the user types `/` as the first character, a filterable dropdown appears above the textarea showing built-in commands and dynamic commands fetched from the backend. The user navigates with arrow keys and selects to auto-send.

The codebase already has all the building blocks: (1) `cmdk` 0.2.1 is installed with a shadcn `Command` component wrapper at `livos/packages/ui/src/shadcn-components/ui/command.tsx`, (2) the Nexus `commands.ts` already exports a `listCommands()` function returning all backend slash commands, (3) `ToolRegistry.list()` returns tool names, and (4) `SkillLoader.listSkills()` returns skill metadata including trigger patterns. The frontend `ChatInput` component is a simple controlled textarea with an `onKeyDown` handler -- straightforward to extend.

**Primary recommendation:** Build a lightweight `SlashCommandMenu` component using raw div-based list (NOT the full cmdk CommandDialog, which is designed for modal overlays). Use a new `listSlashCommands` tRPC query that proxies to a new Nexus REST endpoint aggregating commands + tools + skills. The dropdown renders as an absolutely-positioned panel above the input.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Dropdown appears above the input field when user types `/` as the first character
- Menu shows built-in commands + dynamic commands from backend
- Typing after `/` filters the visible commands in real-time
- Arrow keys navigate, Enter selects, Escape dismisses
- Selecting a command inserts it into input and auto-sends
- Built-in commands: `/usage`, `/new`, `/help`, `/agents`, `/loops`, `/skills`
- Dynamic commands fetched from backend via a new `listSlashCommands` tRPC query
- Backend generates list from: existing handleSlashCommand cases in api.ts + tool names + skill trigger patterns
- Auto-updates when new tools/skills are added (query refetch)

### Claude's Discretion
- Visual design of the dropdown (width, max height, styling)
- Whether to show command descriptions or just names
- Animation for dropdown appear/disappear
- Whether to group commands by category

### Deferred Ideas (OUT OF SCOPE)
None -- all features within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SLSH-01 | User sees a dropdown menu above the input field when typing `/` | ChatInput textarea with onKeyDown handler; detect `/` at position 0; render absolutely-positioned dropdown above input |
| SLSH-02 | User can see built-in commands (/usage, /new, /help, /agents, /loops, /skills) in the dropdown | Frontend-defined static array of built-in commands with descriptions; merged with backend data |
| SLSH-03 | User can see dynamic commands fetched from backend (tools + skill triggers) via listSlashCommands tRPC query | New tRPC query `ai.listSlashCommands` proxying to new Nexus REST `GET /api/slash-commands` that aggregates `listCommands()` + `toolRegistry.list()` + `skillLoader.listSkills()` |
| SLSH-04 | User can filter commands by typing after `/` (e.g., `/us` filters to `/usage`) | Filter logic on the `value.slice(1)` substring against command names; simple `.includes()` or `.startsWith()` match |
| SLSH-05 | User can select a command to insert it into input and send | On selection: set input value to command string, call `onSend()` immediately |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | Component framework | Already in use |
| cmdk | 0.2.1 | Command palette primitives | Already installed, shadcn Command component wraps it |
| @radix-ui/react-popover | 1.0.7 | Popover positioning | Already installed, shadcn Popover component wraps it |
| @trpc/react-query | existing | Data fetching | Already in use for all AI queries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tabler/icons-react | existing | Command icons | Already in use throughout AI chat |
| tailwindcss | 3.4.x | Styling | Already the standard |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw div list | cmdk CommandDialog | CommandDialog is a modal overlay with its own input -- too heavy for an inline dropdown. The raw Command primitives could work but add complexity for no gain since we already have our own textarea. A simple div-based list with keyboard handlers is simpler and more fitting. |
| Popover from Radix | CSS absolute positioning | Radix Popover adds portal + focus management overhead. Since the dropdown is always anchored to the input container and the input must retain focus, plain CSS `absolute` positioning is cleaner. |

**Installation:**
No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
livos/packages/ui/src/routes/ai-chat/
  chat-input.tsx          # Modified: add slash detection + menu rendering
  slash-command-menu.tsx   # NEW: dropdown menu component

livos/packages/livinityd/source/modules/ai/
  routes.ts               # Modified: add listSlashCommands tRPC query

nexus/packages/core/src/
  api.ts                  # Modified: add GET /api/slash-commands endpoint
```

### Pattern 1: Slash Detection in Textarea
**What:** Detect when the user's input starts with `/` and show/hide the dropdown accordingly.
**When to use:** Whenever the input value changes.
**Example:**
```typescript
// In ChatInput, derive menu visibility from value
const showSlashMenu = value.startsWith('/') && !value.includes(' ')
const slashFilter = value.slice(1).toLowerCase()
```

### Pattern 2: Keyboard Navigation in Dropdown
**What:** Arrow keys cycle through filtered items, Enter selects, Escape dismisses.
**When to use:** While the slash menu is open.
**Example:**
```typescript
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (showSlashMenu) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(filteredCommands.length - 1, prev + 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      selectCommand(filteredCommands[selectedIndex])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onChange('')  // Clear input to dismiss
      return
    }
  }
  // ... existing Enter-to-send logic
}
```

### Pattern 3: tRPC Query Proxy to Nexus REST
**What:** livinityd routes.ts proxies to Nexus REST endpoint, same pattern as all other AI queries.
**When to use:** For the `listSlashCommands` query.
**Example:**
```typescript
// In routes.ts
listSlashCommands: privateProcedure.query(async ({ctx}) => {
  try {
    const nexusUrl = getNexusApiUrl()
    const response = await fetch(`${nexusUrl}/api/slash-commands`, {
      headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
    })
    if (!response.ok) return {commands: []}
    return response.json()
  } catch {
    return {commands: []}
  }
}),
```

### Pattern 4: Nexus REST Aggregation Endpoint
**What:** New endpoint in Nexus api.ts that combines commands, tools, and skills into a single list.
**When to use:** Backend data source for the slash command menu.
**Example:**
```typescript
// In nexus/packages/core/src/api.ts
app.get('/api/slash-commands', async (_req, res) => {
  const commands: Array<{name: string; description: string; category: string}> = []

  // 1. Built-in commands from commands.ts
  const builtinCmds = listCommands()
  // Map command names to descriptions
  const cmdDescriptions: Record<string, string> = {
    '/help': 'Show available commands',
    '/new': 'Start new conversation',
    '/usage': 'Show token usage',
    '/think': 'Set thinking level',
    '/verbose': 'Set verbose level',
    '/model': 'Change model tier',
    '/status': 'Show current settings',
    '/reset': 'Reset preferences',
    '/compact': 'Compact conversation',
    '/activation': 'Set group trigger mode',
    '/stats': 'Usage statistics',
  }
  for (const cmd of builtinCmds) {
    commands.push({name: cmd, description: cmdDescriptions[cmd] || '', category: 'command'})
  }

  // 2. Tools from ToolRegistry
  for (const name of toolRegistry.list()) {
    const tool = toolRegistry.get(name)
    commands.push({
      name: `/${name}`,
      description: tool?.description || '',
      category: 'tool',
    })
  }

  // 3. Skills from SkillLoader
  if (skillLoader) {
    for (const skill of skillLoader.listSkills()) {
      commands.push({
        name: `/${skill.name}`,
        description: skill.description,
        category: 'skill',
      })
    }
  }

  res.json({commands})
})
```

### Anti-Patterns to Avoid
- **Using cmdk CommandDialog for the dropdown:** CommandDialog creates a modal overlay with its own input field. The slash menu needs to be an inline dropdown that keeps focus on the existing textarea.
- **Duplicating command definitions on frontend and backend:** The frontend should define only the 6 UI-specific built-in commands (/usage, /new, /help, /agents, /loops, /skills). Backend commands are fetched dynamically.
- **Filtering after fetch:** Filter on the frontend from a cached list. Do NOT re-fetch on every keystroke.
- **Losing focus from textarea:** The dropdown must not steal focus from the textarea. Use `onMouseDown` with `e.preventDefault()` on menu items to prevent focus shift.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyboard navigation | Custom key event state machine | Simple selectedIndex + filteredCommands array | The use case is a flat list with up/down/enter -- 10 lines of code, no library needed |
| Popover positioning | Complex portal/positioning logic | CSS `position: absolute; bottom: 100%` on parent | Dropdown is always above input, no edge-case positioning needed |
| Text filtering | Fuzzy matching library | Simple `name.includes(filter)` | Command names are short, exact substring matching is sufficient |

**Key insight:** This feature is simple enough that the main risk is over-engineering it. A plain div with keyboard handlers is the right level of complexity.

## Common Pitfalls

### Pitfall 1: Focus Stealing
**What goes wrong:** Clicking a command in the dropdown moves focus from textarea to the clicked element, breaking the typing flow.
**Why it happens:** Default browser behavior on `click` events includes focusing the clicked element.
**How to avoid:** Use `onMouseDown` with `e.preventDefault()` on each menu item. This prevents the default focus behavior while still allowing the click handler to fire.
**Warning signs:** Textarea loses cursor position after clicking a command.

### Pitfall 2: Enter Key Double-Firing
**What goes wrong:** Pressing Enter to select a command also triggers the existing "send message" behavior, causing both the command selection AND an empty send.
**Why it happens:** The existing `handleKeyDown` in ChatInput sends on Enter. If slash menu handling doesn't `return` early, both handlers execute.
**How to avoid:** Check `showSlashMenu` first in the keydown handler and `return` after handling, before the existing Enter logic runs.
**Warning signs:** Command gets selected but an empty message also gets sent.

### Pitfall 3: Stale Dynamic Commands
**What goes wrong:** The dropdown shows outdated tool/skill lists after new tools are installed.
**Why it happens:** tRPC query data is cached and not refetched.
**How to avoid:** Use `staleTime: 30_000` or `refetchInterval: 60_000` on the query. The commands don't change frequently, so moderate freshness is fine.
**Warning signs:** Newly installed tools don't appear in the menu.

### Pitfall 4: Menu Flickers on Rapid Typing
**What goes wrong:** Menu appears/disappears rapidly as user types `/` then immediately continues typing.
**Why it happens:** Each keystroke re-evaluates `showSlashMenu`, and if the value transitions through states quickly, React re-renders cause flicker.
**How to avoid:** Derive `showSlashMenu` directly from the current value (no state, no debounce needed). As long as the value starts with `/` and has no spaces, the menu stays open. Filtering happens inline.
**Warning signs:** Visual flicker when typing `/he` quickly.

### Pitfall 5: Scroll Position in Long Command Lists
**What goes wrong:** When navigating with arrow keys in a list longer than the max height, the selected item scrolls out of view.
**Why it happens:** CSS `overflow-y: auto` doesn't auto-scroll to the selected item.
**How to avoid:** Use `scrollIntoView({ block: 'nearest' })` on the selected item ref when selectedIndex changes.
**Warning signs:** User presses down arrow and selected item disappears below the visible area.

### Pitfall 6: Nexus Build Step Forgotten
**What goes wrong:** Changes to Nexus api.ts don't take effect after deploy.
**Why it happens:** nexus-core runs compiled JS (`dist/index.js`). Source changes require `npm run build --workspace=packages/core`.
**How to avoid:** Plan always includes build step after Nexus source changes.
**Warning signs:** New endpoint returns 404 in production.

## Code Examples

### ChatInput with Slash Menu Integration
```typescript
// chat-input.tsx - key changes
import {useState, useRef, useEffect} from 'react'
import {SlashCommandMenu, type SlashCommand} from './slash-command-menu'

export function ChatInput({value, onChange, onSend, onStop, isStreaming, isConnected, disabled}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Slash menu visibility derived from value
  const showSlashMenu = value.startsWith('/') && !value.includes(' ')
  const slashFilter = showSlashMenu ? value.slice(1).toLowerCase() : ''

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [slashFilter])

  const handleSelectCommand = (command: SlashCommand) => {
    // For UI-action commands (/agents, /new), handle locally
    // For everything else, insert the command text and send
    onChange(command.name)
    // Auto-send after a microtask to let React update the value
    setTimeout(() => onSend(), 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash menu keyboard navigation takes priority
    if (showSlashMenu) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Escape') {
        // Handle in SlashCommandMenu via callback
        // ... or handle here with selectedIndex state
      }
    }
    // Existing Enter-to-send logic
    if (e.key === 'Enter' && !e.shiftKey && !showSlashMenu) {
      e.preventDefault()
      if (value.trim()) onSend()
    }
  }

  return (
    <div className='border-t border-border-default bg-surface-base p-3 md:p-4'>
      <div className='relative mx-auto flex max-w-3xl items-end gap-3'>
        {showSlashMenu && (
          <SlashCommandMenu
            filter={slashFilter}
            selectedIndex={selectedIndex}
            onSelect={handleSelectCommand}
          />
        )}
        <textarea ... />
        {/* buttons */}
      </div>
    </div>
  )
}
```

### SlashCommandMenu Component
```typescript
// slash-command-menu.tsx
import {useEffect, useRef} from 'react'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

export interface SlashCommand {
  name: string
  description: string
  category: 'builtin' | 'command' | 'tool' | 'skill'
}

// UI-only built-in commands (not from backend)
const UI_COMMANDS: SlashCommand[] = [
  {name: '/usage', description: 'Show token/cost usage', category: 'builtin'},
  {name: '/new', description: 'Start new conversation', category: 'builtin'},
  {name: '/help', description: 'Show help info', category: 'builtin'},
  {name: '/agents', description: 'Switch to agents tab', category: 'builtin'},
  {name: '/loops', description: 'List active loops', category: 'builtin'},
  {name: '/skills', description: 'List available skills', category: 'builtin'},
]

interface SlashCommandMenuProps {
  filter: string
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
}

export function SlashCommandMenu({filter, selectedIndex, onSelect}: SlashCommandMenuProps) {
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Fetch dynamic commands from backend (cached, refetch every 60s)
  const dynamicQuery = trpcReact.ai.listSlashCommands.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // Merge UI commands + backend commands, deduplicate by name
  const allCommands = [...UI_COMMANDS]
  if (dynamicQuery.data?.commands) {
    for (const cmd of dynamicQuery.data.commands) {
      if (!allCommands.some((c) => c.name === cmd.name)) {
        allCommands.push({...cmd, category: cmd.category as SlashCommand['category']})
      }
    }
  }

  // Filter
  const filtered = filter
    ? allCommands.filter((c) => c.name.slice(1).includes(filter))
    : allCommands

  // Auto-scroll selected item into view
  useEffect(() => {
    itemRefs.current.get(selectedIndex)?.scrollIntoView({block: 'nearest'})
  }, [selectedIndex])

  if (filtered.length === 0) return null

  return (
    <div className='absolute bottom-full left-0 right-12 mb-2 max-h-64 overflow-y-auto rounded-lg border border-border-default bg-surface-base shadow-elevation-2'>
      {filtered.map((cmd, i) => (
        <div
          key={cmd.name}
          ref={(el) => { if (el) itemRefs.current.set(i, el) }}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
          className={cn(
            'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
            i === selectedIndex ? 'bg-surface-2 text-text-primary' : 'text-text-secondary hover:bg-surface-1',
          )}
        >
          <span className='font-mono text-brand'>{cmd.name}</span>
          <span className='truncate text-text-tertiary'>{cmd.description}</span>
        </div>
      ))}
    </div>
  )
}
```

### Nexus REST Endpoint
```typescript
// In nexus/packages/core/src/api.ts
import { listCommands } from './commands.js';

app.get('/api/slash-commands', async (_req, res) => {
  const commands: Array<{name: string; description: string; category: string}> = [];

  // Backend slash commands
  for (const cmd of listCommands()) {
    commands.push({name: cmd, description: '', category: 'command'});
  }

  // Registered tools
  for (const name of toolRegistry.list()) {
    const tool = toolRegistry.get(name);
    commands.push({name: `/${name}`, description: tool?.description || '', category: 'tool'});
  }

  // Loaded skills
  if (skillLoader) {
    for (const skill of skillLoader.listSkills()) {
      commands.push({name: `/${skill.name}`, description: skill.description, category: 'skill'});
    }
  }

  res.json({commands});
});
```

### tRPC Route in livinityd
```typescript
// In livos/packages/livinityd/source/modules/ai/routes.ts
listSlashCommands: privateProcedure.query(async ({ctx}) => {
  try {
    const nexusUrl = getNexusApiUrl()
    const response = await fetch(`${nexusUrl}/api/slash-commands`, {
      headers: process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {},
    })
    if (!response.ok) return {commands: []}
    const data = await response.json() as {commands: Array<{name: string; description: string; category: string}>}
    return data
  } catch {
    return {commands: []}
  }
}),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| cmdk 0.2.x with separate dialog | cmdk 1.x with inline command primitives | 2024 | Project uses 0.2.1 -- no need to upgrade for this feature since we're building a simple dropdown, not using cmdk primitives directly |

**Deprecated/outdated:**
- None relevant. The existing cmdk 0.2.1 and Radix Popover are stable and sufficient.

## Open Questions

1. **UI-only commands (/agents, /loops, /skills) behavior**
   - What we know: These are listed as built-in commands in CONTEXT.md
   - What's unclear: `/agents` should switch to the agents tab (local UI action), `/loops` and `/skills` should... also switch tabs? Or send as messages to the backend?
   - Recommendation: `/agents` switches to agents tab locally. `/loops` and `/skills` are sent to the backend as regular messages (the AI will respond with the list). `/usage`, `/new`, `/help` are sent as slash commands to the backend. This keeps the implementation simple.

2. **Command descriptions from backend**
   - What we know: `listCommands()` in commands.ts returns only command names (e.g., `/help`), not descriptions
   - What's unclear: Whether to add a `listCommandsWithDescriptions()` function or map descriptions on the frontend
   - Recommendation: Add a static description map in the Nexus endpoint. The descriptions are stable and don't change at runtime.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | No test framework configured for UI or Nexus packages |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLSH-01 | Dropdown appears when typing `/` | manual-only | N/A -- requires browser interaction | N/A |
| SLSH-02 | Built-in commands visible in dropdown | manual-only | N/A -- UI rendering test | N/A |
| SLSH-03 | Dynamic commands fetched from backend | manual-only | Verify endpoint: `curl http://localhost:3200/api/slash-commands` | N/A |
| SLSH-04 | Filtering works when typing after `/` | manual-only | N/A -- requires browser interaction | N/A |
| SLSH-05 | Selecting a command inserts and sends | manual-only | N/A -- requires browser interaction | N/A |

### Sampling Rate
- **Per task commit:** Manual verification in browser
- **Per wave merge:** Full manual walkthrough of all 5 requirements
- **Phase gate:** All 5 SLSH requirements verified manually in browser

### Wave 0 Gaps
None -- no existing test infrastructure to extend. All requirements are UI interaction tests best verified manually.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** - Direct reading of all relevant source files:
  - `livos/packages/ui/src/routes/ai-chat/chat-input.tsx` - Current input component (102 lines)
  - `livos/packages/ui/src/routes/ai-chat/index.tsx` - Parent component with state management
  - `nexus/packages/core/src/commands.ts` - Existing slash command handler with `listCommands()` export
  - `nexus/packages/core/src/tool-registry.ts` - `ToolRegistry.list()` and `listAll()` methods
  - `nexus/packages/core/src/skill-loader.ts` - `SkillLoader.listSkills()` method
  - `livos/packages/livinityd/source/modules/ai/routes.ts` - Existing tRPC patterns (proxy to Nexus REST)
  - `nexus/packages/core/src/api.ts` - Existing REST endpoint patterns
  - `livos/packages/ui/src/shadcn-components/ui/command.tsx` - cmdk wrapper (available)
  - `livos/packages/ui/src/shadcn-components/ui/popover.tsx` - Popover wrapper (available)
  - `livos/packages/livinityd/source/modules/server/trpc/common.ts` - httpOnlyPaths list

### Secondary (MEDIUM confidence)
- **cmdk 0.2.1** - Verified installed via pnpm lockfile inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and verified in codebase
- Architecture: HIGH - Following exact same tRPC-proxy-to-Nexus-REST pattern used by 20+ existing endpoints
- Pitfalls: HIGH - Based on direct codebase reading and common React patterns

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable, no external dependency changes expected)
