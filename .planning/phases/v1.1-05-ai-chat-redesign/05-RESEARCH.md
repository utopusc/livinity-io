# Phase 5: AI Chat Redesign - Research

**Researched:** 2026-02-06
**Domain:** AI chat UI redesign / Conversation sidebar / Message bubbles / Chat input / Empty state / Tool call display / MCP panel
**Confidence:** HIGH (all findings from direct source code analysis of existing codebase)

## Summary

Phase 5 covers the complete visual overhaul of the AI chat interface in LivOS. The AI chat is contained in 3 source files: the main chat view (`src/routes/ai-chat/index.tsx`, 458 lines), the MCP panel (`src/routes/ai-chat/mcp-panel.tsx`, 1,270 lines), and the quick-chat dialog (`src/components/ai-quick.tsx`, 253 lines). The main chat view contains 6 distinct UI regions that map to the 6 requirements (AC-01 through AC-06): a conversation sidebar, message bubbles, a chat input area, an empty state, tool call displays, and a Chat/MCP tab switcher. The MCP panel is the largest file and contains its own marketplace tab, installed tab, config tab, install dialog, and featured cards.

All 3 files are dense with raw Tailwind values: `index.tsx` has ~30 raw opacity values (`white/10`, `white/30`, `white/50`, etc.), `mcp-panel.tsx` has ~81, and `ai-quick.tsx` has ~16. None of these files import `cn()` from the design system utilities, and none use the semantic tokens established in Phase 1. The migration is purely visual -- no logic, state management, or API changes are needed.

**Primary recommendation:** Structure into 3 plans: (1) Conversation sidebar (AC-01) + message bubbles (AC-02) + status indicator; (2) Chat input (AC-03) + empty state (AC-04) + tool call display (AC-05) + ai-quick.tsx alignment; (3) MCP panel full redesign (AC-06). This order ensures the most visible chat experience is refined first, then supporting elements, then the self-contained MCP panel.

## Component Inventory

### 1. index.tsx - Main AI Chat (458 lines)

**File:** `livos/packages/ui/src/routes/ai-chat/index.tsx`
**Rendered inside:** Window frame (1300x850 default), accessed via `LIVINITY_ai-chat` app ID
**Dependencies:** react-router-dom, @tabler/icons-react, react-markdown, remark-gfm, trpc

**Sub-components (all inline, not extracted):**

| Component | Lines | Role | Requirements |
|-----------|-------|------|-------------|
| `ToolCallDisplay` | 38-68 | Expandable tool call with params/output | AC-05 |
| `ChatMessage` | 70-108 | Single message bubble (user/assistant) | AC-02 |
| `StatusIndicator` | 112-141 | Loading state with dynamic tool status | AC-02 |
| `ConversationSidebar` | 145-237 | Left sidebar with conversation list + Chat/MCP tabs | AC-01 |
| `AiChat` (default export) | 240-458 | Main layout: sidebar + chat area or MCP panel | AC-03, AC-04 |

**Raw values inventory (index.tsx):**

Sidebar (`ConversationSidebar`, lines 163-237):
| Line | Current | Semantic Token | Notes |
|------|---------|----------------|-------|
| 163 | `border-r border-white/10 bg-black/20` | `border-r border-border-default bg-surface-base` | Sidebar container |
| 164 | `border-b border-white/10` | `border-b border-border-default` | Header border |
| 166 | `rounded-lg bg-gradient-to-br from-violet-500/30 to-blue-500/30` | `rounded-radius-sm bg-gradient-to-br from-violet-500/30 to-blue-500/30` | Keep gradient as brand identity |
| 167 | `text-violet-400` | Keep (brand accent) | Liv brand color |
| 169 | `text-sm font-semibold text-white/80` | `text-body font-semibold text-text-primary` | Header title |
| 173 | `rounded-lg p-1.5 text-white/60 ... hover:bg-white/10 hover:text-white` | `rounded-radius-sm p-1.5 text-text-secondary ... hover:bg-surface-2 hover:text-text-primary` | New button |
| 181 | `border-b border-white/10` | `border-b border-border-default` | Tab border |
| 184-185 | `text-xs ... text-white/40 hover:text-white/60` | `text-caption ... text-text-tertiary hover:text-text-secondary` | Tab text |
| 185 | `border-violet-500 text-white` | `border-brand text-text-primary` | Active tab |
| 206 | `text-xs text-white/30` | `text-caption text-text-tertiary` | Empty state |
| 212-213 | `rounded-lg ... bg-white/15 text-white` / `text-white/60 hover:bg-white/5 hover:text-white/80` | `rounded-radius-sm ... bg-surface-3 text-text-primary` / `text-text-secondary hover:bg-surface-1 hover:text-text-primary` | Conversation items |
| 217 | `text-xs` | `text-caption` | Conversation title |
| 223 | `text-white/40 hover:text-red-400` | `text-text-tertiary hover:text-red-400` | Delete button |

Message bubbles (`ChatMessage`, lines 70-108):
| Line | Current | Semantic Token | Notes |
|------|---------|----------------|-------|
| 76 | `rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30` | `rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30` | Keep - brand avatar |
| 77 | `text-violet-400` | Keep (brand accent) | |
| 82-83 | `rounded-2xl` + `bg-blue-600 text-white` / `bg-white/10 text-white/90` | `rounded-radius-xl` + `bg-brand text-white` / `bg-surface-2 text-text-primary` | Key change: user bubble uses brand |
| 87 | `text-sm` | `text-body` | User message text |
| 103 | `rounded-full bg-white/20` | `rounded-full bg-surface-3` | User avatar |
| 104 | `text-white/80` | `text-text-primary` | User icon |

Tool call display (`ToolCallDisplay`, lines 38-68):
| Line | Current | Semantic Token | Notes |
|------|---------|----------------|-------|
| 42 | `rounded-lg border border-white/10 bg-white/5 text-xs` | `rounded-radius-sm border border-border-default bg-surface-base text-caption` | Tool card |
| 45 | `hover:bg-white/5` | `hover:bg-surface-1` | Hover state |
| 48-49 | `text-blue-400` | Keep (tool accent color) | Tool name accent |
| 50 | `text-[10px] ... text-green-400 / text-red-400` | `text-caption-sm ... text-green-400 / text-red-400` | Status badge - keep semantic colors |
| 55 | `border-t border-white/10` | `border-t border-border-default` | Divider |
| 56, 60 | `text-[10px] uppercase text-white/40` | `text-caption-sm uppercase text-text-tertiary` | Section labels |
| 57, 61 | `text-white/60` | `text-text-secondary` | Pre content |

Status indicator (lines 136-140):
| Line | Current | Semantic Token | Notes |
|------|---------|----------------|-------|
| 136 | `rounded-xl bg-white/5 ... text-sm` | `rounded-radius-md bg-surface-base ... text-body` | Status container |
| 138 | `text-white/50` | `text-text-secondary` | Status text |

Empty state (lines 372-399):
| Line | Current | Semantic Token | Notes |
|------|---------|----------------|-------|
| 372 | `text-white/30` | `text-text-tertiary` | Container text |
| 373 | `rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20` | `rounded-radius-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20` | Keep gradient |
| 376 | `text-lg font-medium text-white/50` | `text-heading-sm font-medium text-text-secondary` | Heading |
| 377 | `text-sm text-white/30` | `text-body text-text-tertiary` | Description |
| 394 | `rounded-xl border border-white/10 bg-white/5 ... text-xs text-white/40 ... hover:border-white/20 hover:bg-white/10 hover:text-white/60` | `rounded-radius-md border border-border-default bg-surface-base ... text-caption text-text-tertiary ... hover:border-border-emphasis hover:bg-surface-1 hover:text-text-secondary` | Suggestion chips |

Input area (lines 415-440):
| Line | Current | Semantic Token | Notes |
|------|---------|----------------|-------|
| 415 | `border-t border-white/10 bg-black/20` | `border-t border-border-default bg-surface-base` | Input container |
| 424 | `rounded-xl border border-white/10 bg-white/5 ... text-sm text-white placeholder-white/30 ... focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25` | `rounded-radius-md border border-border-default bg-surface-1 ... text-body text-text-primary placeholder-text-tertiary ... focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20` | **Key: match input component focus pattern** |
| 435 | `rounded-xl bg-violet-600 ... hover:bg-violet-500 disabled:opacity-40` | `rounded-radius-md bg-brand ... hover:bg-brand-lighter disabled:opacity-40` | Send button |

### 2. mcp-panel.tsx - MCP Server Panel (1,270 lines)

**File:** `livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx`
**Structure:** 5 inline sub-components + 2 data arrays

| Component | Lines | Role |
|-----------|-------|------|
| `FeaturedCard` | 364-415 | Card for marketplace featured MCP |
| `MarketplaceTab` | 419-552 | Search + featured grid |
| `InstallDialog` | 556-820 | Modal for installing MCP server |
| `InstalledTab` | 824-1079 | List of installed servers with expand |
| `ConfigTab` | 1083-1176 | Raw JSON config editor |
| `McpPanel` (default) | 1182-1269 | Tab switcher + layout |

**Raw values needing migration:** ~81 occurrences of raw white/opacity values.

Key patterns in mcp-panel.tsx:
- `white/[0.06]` and `white/[0.03]` (fractional opacity) -> `border-subtle` and `surface-base`
- `white/[0.08]` -> `border-default` (close match to 0.10)
- `white/[0.12]` and `white/[0.14]` -> `border-emphasis` and `surface-3`
- `bg-[#111118]` (install dialog) -> `bg-dialog-content` (existing token)
- `text-[13px]` -> `text-body-sm`
- `text-[11px]` -> `text-caption-sm`
- `text-[12px]` -> `text-caption`
- `text-[10px]` -> `text-caption-sm` (closest match)
- `text-[14px]` -> `text-body`
- `rounded-2xl` -> `rounded-radius-xl`
- `rounded-xl` -> `rounded-radius-lg`
- `rounded-lg` -> `rounded-radius-sm` (the design system uses 8px for sm)
- `rounded-md` -> `rounded-radius-sm`

**MCP panel-specific considerations:**
- The `FEATURED_MCPS` array and `CATEGORY_COLORS` map contain brand-specific color values (gradients, category badges). These should be KEPT as they serve distinct semantic purposes.
- Status indicator colors (`text-green-400`, `text-red-400`, `text-amber-400`) should be KEPT as semantic status colors.
- The install dialog uses `bg-[#111118]` which should migrate to `bg-dialog-content` for consistency with Phase 3's dialog redesign.

### 3. ai-quick.tsx - Quick Chat Dialog (253 lines)

**File:** `livos/packages/ui/src/components/ai-quick.tsx`
**Structure:** Spotlight-style dialog overlay with single-turn AI interaction

**Raw values needing migration:** ~16 occurrences.
- Same tool call display pattern as index.tsx (should share code or at least match styling)
- Uses `bg-neutral-900/95` which should migrate to `bg-dialog-content` or `bg-[#111118]`
- Uses custom Radix dialog overlay instead of shared dialog.ts pattern

## Architecture Patterns

### Recommended File Organization

No new files need to be created. The redesign is purely visual -- modifying class strings in existing files. However, one optimization opportunity:

```
src/routes/ai-chat/
  index.tsx          # Main chat view (sidebar + messages + input + empty state)
  mcp-panel.tsx      # MCP server management panel
```

The current structure is acceptable. The ToolCallDisplay component is duplicated between `index.tsx` and `ai-quick.tsx` with slight differences (different sizes, different expand behavior). This duplication can be noted but is NOT in scope for this phase (the directive is "iterative improvement, not a rewrite").

### Pattern 1: Semantic Token Migration (THE PRIMARY PATTERN)

**What:** Replace all raw `white/XX`, `bg-black/XX`, size-specific text classes with semantic tokens from Phase 1.
**When to use:** Every raw value in all 3 files.
**Example:**

```tsx
// Before: Raw opacity values
<div className='border-r border-white/10 bg-black/20'>
  <h2 className='text-sm font-semibold text-white/80'>Liv AI</h2>
  <button className='rounded-lg text-white/60 hover:bg-white/10'>
</div>

// After: Semantic tokens
<div className='border-r border-border-default bg-surface-base'>
  <h2 className='text-body font-semibold text-text-primary'>Liv AI</h2>
  <button className='rounded-radius-sm text-text-secondary hover:bg-surface-2'>
</div>
```

### Pattern 2: Brand Color Usage for User Messages

**What:** User message bubbles should use `bg-brand` instead of `bg-blue-600` to match the wallpaper-based theming system.
**When to use:** User-sent message bubble background.
**Example:**

```tsx
// Before: Hard-coded blue
isUser ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/90'

// After: Brand color (adapts to wallpaper theme)
isUser ? 'bg-brand text-white' : 'bg-surface-2 text-text-primary'
```

### Pattern 3: Focus State Consistency

**What:** Chat input focus should match Phase 1's brand-colored focus pattern.
**When to use:** Textarea in chat input and any other focusable inputs.
**Example:**

```tsx
// Before: Violet-specific focus
'focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25'

// After: Brand focus (matches Input component from Phase 1-03)
'focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
```

### Pattern 4: MCP Panel Fractional Opacity Mapping

**What:** The MCP panel uses non-standard fractional opacities (`white/[0.03]`, `white/[0.06]`, `white/[0.08]`) that map to semantic tokens.
**When to use:** All MCP panel classes.
**Mapping:**

| MCP Raw | Semantic Token | Notes |
|---------|----------------|-------|
| `bg-white/[0.02]` | `bg-surface-base` (0.04) | Slight increase, acceptable |
| `bg-white/[0.03]` | `bg-surface-base` (0.04) | Close match |
| `bg-white/[0.04]` | `bg-surface-base` (0.04) | Exact match |
| `bg-white/[0.05]` | `bg-surface-1` (0.06) | Close match |
| `bg-white/[0.06]` | `bg-surface-1` (0.06) | Exact match |
| `bg-white/[0.08]` | `bg-surface-2` (0.10) | Slight increase |
| `bg-white/[0.10]` | `bg-surface-2` (0.10) | Exact match |
| `bg-white/[0.12]` | `bg-surface-3` (0.14) | Close match |
| `bg-white/[0.14]` | `bg-surface-3` (0.14) | Exact match |
| `border-white/[0.06]` | `border-border-subtle` (0.06) | Exact match |
| `border-white/[0.08]` | `border-border-default` (0.10) | Close match |
| `border-white/[0.10]` | `border-border-default` (0.10) | Exact match |
| `border-white/[0.12]` | `border-border-emphasis` (0.20) | Consider keeping as `border-border-default` |
| `border-white/[0.15]` | `border-border-emphasis` (0.20) | Close match |
| `hover:bg-white/[0.06]` | `hover:bg-surface-1` | Consistent hover |
| `hover:bg-white/[0.08]` | `hover:bg-surface-2` | Consistent hover |
| `hover:bg-white/[0.10]` | `hover:bg-surface-2` | Consistent hover |
| `hover:bg-white/[0.14]` | `hover:bg-surface-3` | Consistent hover |
| `hover:border-white/[0.10]` | `hover:border-border-default` | |
| `hover:border-white/[0.12]` | `hover:border-border-emphasis` | |
| `focus:border-white/[0.15]` | `focus-visible:border-brand` | Adopt brand focus pattern |
| `focus:bg-white/[0.05]` | `focus-visible:bg-surface-1` | |

### Pattern 5: Sidebar Timestamp Addition (AC-01)

**What:** The current conversation list shows only title + delete button. AC-01 requires timestamps.
**When to use:** ConversationSidebar conversation items.
**Implementation approach:** The `conversations` data already includes `updatedAt: number`. Use `date-fns` (already installed, v3) `formatDistanceToNow` or `formatDistanceStrict` to render relative timestamps.

```tsx
// Example: Add timestamp below conversation title
import {formatDistanceToNow} from 'date-fns'

<span className='text-caption-sm text-text-tertiary'>
  {formatDistanceToNow(conv.updatedAt, {addSuffix: true})}
</span>
```

### Anti-Patterns to Avoid

- **Extracting components too aggressively:** The current inline structure works. Don't create new files or split into sub-components. The redesign is class-string changes only.
- **Changing state management or logic:** No hooks, state, effects, or API calls should change. Only className strings.
- **Adding new dependencies:** Everything needed is already installed (Tailwind tokens, date-fns, react-markdown, framer-motion).
- **Removing the Chat/MCP tab switcher from sidebar:** This is architectural, not visual. Keep the sidebar tab pattern intact.
- **Breaking the gradient brand elements:** The violet/blue gradients on avatars and icons are Liv's brand identity. Keep them.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relative timestamps | Custom time-ago function | `date-fns` `formatDistanceToNow` | Already installed (v3), handles localization, edge cases |
| Focus ring styling | Custom focus CSS | Phase 1 pattern: `focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20` | Consistency with Input/Select/Switch components |
| Tool call expand/collapse | New Radix Accordion component | Keep current `useState` + conditional render | Simple enough, don't add Radix Accordion dependency |
| Markdown rendering | Custom renderer | Keep existing `react-markdown` + `remark-gfm` + `prose prose-invert` | Already working, just adjust prose token sizing |
| Class string merging | Manual string concatenation | Import and use `cn()` from `@/shadcn-lib/utils` | Handles Tailwind class precedence correctly |

**Key insight:** This phase is 95% class string replacement and 5% adding timestamps. There are no complex UI interactions to implement.

## Common Pitfalls

### Pitfall 1: MCP Panel Fractional Opacity Mismatch

**What goes wrong:** The MCP panel uses very specific fractional opacities (`0.03`, `0.06`, `0.08`) that don't have exact semantic token matches. A naive 1:1 replacement could make the MCP panel look too contrasty.
**Why it happens:** Semantic tokens use discrete stops (0.04, 0.06, 0.10, 0.14) while the MCP panel used a finer gradient.
**How to avoid:** Follow the mapping table in Pattern 4. Accept that `0.03` -> `0.04` and `0.08` -> `0.10` are close enough. The point is consistency, not pixel-perfect preservation of the old design.
**Warning signs:** MCP panel cards looking "heavier" than before after migration.

### Pitfall 2: Chat Input Focus Not Matching Phase 1 Pattern

**What goes wrong:** Chat textarea focus uses `focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25` instead of the Phase 1 standard `focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20`.
**Why it happens:** The AI chat was built before the design system was established.
**How to avoid:** Explicitly migrate to the Phase 1 focus pattern. Use `focus-visible:` prefix (not `focus:`).
**Warning signs:** Chat input having a different focus ring than all other inputs in the app.

### Pitfall 3: User Bubble bg-blue-600 Doesn't Adapt to Wallpaper Theme

**What goes wrong:** User message bubbles are hard-coded `bg-blue-600` while the rest of the app uses the dynamic `brand` color that adapts to the wallpaper.
**Why it happens:** AI chat was built with a fixed violet/blue theme.
**How to avoid:** Replace `bg-blue-600` with `bg-brand` for user message bubbles.
**Warning signs:** User messages being a different blue than the rest of the app's accent color.

### Pitfall 4: Not Adding cn() Import

**What goes wrong:** Trying to use `cn()` for conditional classes without importing it, or continuing to use template literal concatenation.
**Why it happens:** The file currently doesn't import `cn()`.
**How to avoid:** Add `import {cn} from '@/shadcn-lib/utils'` at the top of each file. Convert conditional class concatenations from template literals to `cn()` calls.
**Warning signs:** Build errors or incorrect class merging.

### Pitfall 5: Accidentally Changing MCP Panel API Logic

**What goes wrong:** The MCP panel has significant business logic (fetch, install, restart, delete). Accidentally modifying API calls or state management while editing class strings.
**Why it happens:** The MCP panel is 1,270 lines and logic is interleaved with rendering.
**How to avoid:** Only modify lines containing `className`. Do not touch lines with `fetch`, `useState`, `useEffect`, `useCallback`, `async`, or event handlers.
**Warning signs:** MCP install/restart/delete functionality breaking after migration.

## Code Examples

### Example 1: Conversation Sidebar Item (AC-01)

```tsx
// Source: Direct codebase analysis of established Phase 4 settings sidebar pattern

// Current (index.tsx line 210-228):
<button
  className={`group mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
    activeId === conv.id ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
  }`}
>
  <IconMessageCircle size={16} className='flex-shrink-0' />
  <span className='flex-1 truncate text-xs'>{conv.title}</span>
  ...
</button>

// After (with semantic tokens + timestamp):
<button
  className={cn(
    'group mb-1 flex w-full items-center gap-2 rounded-radius-sm px-3 py-2.5 text-left transition-colors',
    activeId === conv.id
      ? 'bg-surface-3 text-text-primary'
      : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
  )}
>
  <IconMessageCircle size={16} className='flex-shrink-0' />
  <div className='min-w-0 flex-1'>
    <span className='block truncate text-body-sm'>{conv.title}</span>
    <span className='text-caption-sm text-text-tertiary'>
      {formatDistanceToNow(conv.updatedAt, {addSuffix: true})}
    </span>
  </div>
  ...
</button>
```

### Example 2: Message Bubble (AC-02)

```tsx
// Source: Direct codebase analysis + Phase 1 token system

// Current (index.tsx line 80-88):
<div className={`rounded-2xl px-4 py-3 ${
  isUser ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/90'
}`}>
  {isUser ? (
    <p className='whitespace-pre-wrap text-sm'>{message.content}</p>
  ) : (
    <div className='prose prose-sm prose-invert max-w-none'>

// After:
<div className={cn(
  'rounded-radius-xl px-4 py-3',
  isUser ? 'bg-brand text-white' : 'bg-surface-2 text-text-primary'
)}>
  {isUser ? (
    <p className='whitespace-pre-wrap text-body'>{message.content}</p>
  ) : (
    <div className='prose prose-sm prose-invert max-w-none'>
```

### Example 3: Chat Input Area (AC-03)

```tsx
// Source: Direct codebase analysis + Phase 1-03 Input focus pattern

// Current (index.tsx line 415-440):
<div className='border-t border-white/10 bg-black/20 p-4'>
  <textarea
    className='flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25'
  />
  <button className='... rounded-xl bg-violet-600 ... hover:bg-violet-500'>

// After:
<div className='border-t border-border-default bg-surface-base p-4'>
  <textarea
    className='flex-1 resize-none rounded-radius-md border border-border-default bg-surface-1 px-4 py-3 text-body text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20'
  />
  <button className='... rounded-radius-md bg-brand ... hover:bg-brand-lighter'>
```

### Example 4: Empty State (AC-04)

```tsx
// Source: Direct codebase analysis

// Current (index.tsx line 372-399):
<div className='flex h-full flex-col items-center justify-center text-white/30'>
  <div className='mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20'>
    <IconBrain size={32} className='text-violet-400' />
  </div>
  <h3 className='mb-2 text-lg font-medium text-white/50'>Liv</h3>
  <p className='max-w-md text-center text-sm text-white/30'>

// After:
<div className='flex h-full flex-col items-center justify-center text-text-tertiary'>
  <div className='mb-6 flex h-16 w-16 items-center justify-center rounded-radius-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20'>
    <IconBrain size={32} className='text-violet-400' />
  </div>
  <h3 className='mb-2 text-heading-sm text-text-secondary'>Liv</h3>
  <p className='max-w-md text-center text-body text-text-tertiary'>
```

### Example 5: Tool Call Display (AC-05)

```tsx
// Source: Direct codebase analysis

// Current (index.tsx line 42-67):
<div className='my-1 rounded-lg border border-white/10 bg-white/5 text-xs'>
  <button className='flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5'>
    <IconTool size={14} className='text-blue-400' />
    <span className='font-mono font-medium text-blue-400'>{toolCall.tool}</span>
    <span className={`ml-auto text-[10px] ${toolCall.result.success ? 'text-green-400' : 'text-red-400'}`}>
  ...
  <div className='border-t border-white/10 px-3 py-2'>
    <div className='mb-1 text-[10px] uppercase text-white/40'>Params</div>
    <pre className='... text-white/60'>

// After:
<div className='my-1 rounded-radius-sm border border-border-default bg-surface-base text-caption'>
  <button className='flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-1'>
    <IconTool size={14} className='text-blue-400' />
    <span className='font-mono font-medium text-blue-400'>{toolCall.tool}</span>
    <span className={cn('ml-auto text-caption-sm', toolCall.result.success ? 'text-green-400' : 'text-red-400')}>
  ...
  <div className='border-t border-border-default px-3 py-2'>
    <div className='mb-1 text-caption-sm uppercase text-text-tertiary'>Params</div>
    <pre className='... text-text-secondary'>
```

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 3.4.1 | Utility-first CSS | Project standard |
| @tailwindcss/typography | ^0.5.10 | Prose styles for markdown | Already used for AI responses |
| react-markdown | ^9.0.1 | Markdown rendering | Already used in chat messages |
| remark-gfm | ^4.0.0 | GitHub-flavored markdown | Already used for tables, code blocks |
| date-fns | ^3.0.6 | Date formatting | Already installed, for conversation timestamps |
| framer-motion | 10.16.4 | Animations | Available but NOT needed for this phase |
| @tabler/icons-react | ^3.36.1 | Icons | Already used throughout |
| class-variance-authority | 0.7.0 | Variant styling | Available but NOT needed for this phase |

### Supporting (already available)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cn()` from `@/shadcn-lib/utils` | N/A | Class merging | Import into all 3 files for conditional classes |
| `tw` from `@/utils/tw` | N/A | Tagged template for Tailwind IntelliSense | Use for extracted class constants if needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Current inline `useState` expand | @radix-ui/react-collapsible | Adds dependency for minimal benefit. Current pattern works. |
| Current `prose prose-invert` | Custom markdown component styles | More control but unnecessary maintenance burden. Prose classes work well. |
| date-fns | Native `Intl.RelativeTimeFormat` | Native = smaller but lacks `formatDistanceToNow` convenience. date-fns already installed. |

**Installation:** None required. All dependencies already present.

## State of the Art

| Old Approach (current) | Current Approach (target) | When Changed | Impact |
|------------------------|--------------------------|--------------|--------|
| Raw `white/XX` opacity | Semantic tokens (`surface-X`, `border-X`, `text-X`) | Phase 1 (v1.1-01) | Consistent design language |
| Hard-coded `bg-blue-600` | Dynamic `bg-brand` | Phase 1 (v1.1-01) | Wallpaper-adaptive theming |
| `focus:border-violet-500` | `focus-visible:border-brand` | Phase 1 (v1.1-01-03) | Accessible focus, brand consistency |
| No timestamps in sidebar | Relative timestamps via date-fns | This phase | Better conversation context |
| String concatenation for classes | `cn()` utility | Phase 1 (v1.1-01) | Proper Tailwind class merging |

## Plan Structure Recommendation

### Plan 1: Chat Sidebar + Message Bubbles + Status (AC-01, AC-02)

**Scope:** `index.tsx` lines 38-237 (ToolCallDisplay, ChatMessage, StatusIndicator, ConversationSidebar)
**Estimated tasks:** 3-4
**Rationale:** These are the most visible parts of the chat UI. Sidebar + messages = the core chat experience.

Tasks:
1. Add `cn` and `date-fns` imports + migrate ConversationSidebar (AC-01): semantic tokens, timestamps, active states
2. Migrate ChatMessage + message avatar styling (AC-02): brand color for user, semantic tokens for assistant
3. Migrate ToolCallDisplay + StatusIndicator: semantic tokens, consistent expand pattern (AC-05 partial)

### Plan 2: Input + Empty State + Quick Chat Alignment (AC-03, AC-04, AC-05)

**Scope:** `index.tsx` lines 240-458 (AiChat component) + `ai-quick.tsx` (full file)
**Estimated tasks:** 3-4
**Rationale:** Input and empty state complete the main chat view. ai-quick.tsx shares patterns and should match.

Tasks:
1. Migrate chat input area (AC-03): brand focus pattern, semantic tokens
2. Migrate empty state (AC-04): branded styling with semantic tokens
3. Migrate ai-quick.tsx: align with main chat styling, semantic tokens

### Plan 3: MCP Panel Full Redesign (AC-06)

**Scope:** `mcp-panel.tsx` (full file, 1,270 lines)
**Estimated tasks:** 4-5
**Rationale:** Self-contained panel, largest file, can be done independently.

Tasks:
1. Migrate McpPanel header + tab bar: semantic tokens
2. Migrate MarketplaceTab + FeaturedCard: semantic tokens, preserve gradients
3. Migrate InstalledTab: semantic tokens, status colors
4. Migrate InstallDialog + ConfigTab: dialog tokens, form inputs

## Open Questions

1. **Conversation sidebar width**
   - What we know: Currently fixed at `w-64` (256px). The AI chat window is 1300px wide.
   - What's unclear: Whether 256px is optimal for the redesigned sidebar with timestamps.
   - Recommendation: Keep `w-64` for now. Timestamps fit on a second line below the title.

2. **Empty state branded illustration (AC-04)**
   - What we know: AC-04 says "branded illustration." Current empty state has an IconBrain + text.
   - What's unclear: Whether "branded illustration" means a new SVG/image asset or the current icon-based design.
   - Recommendation: Enhance the current icon-based design with semantic tokens. A custom illustration would be out of scope for a token migration phase. The icon + gradient approach already looks branded.

3. **Prose typography alignment**
   - What we know: AI responses use `prose prose-sm prose-invert` which has its own font sizes.
   - What's unclear: Whether prose typography should be adjusted to match semantic tokens.
   - Recommendation: Keep `prose prose-sm prose-invert` as-is. The typography plugin handles markdown well and changing it risks breaking code blocks, tables, lists. The Tailwind typography plugin's sizing is designed for long-form content.

## Sources

### Primary (HIGH confidence)
- Direct source code analysis of `livos/packages/ui/src/routes/ai-chat/index.tsx` (458 lines)
- Direct source code analysis of `livos/packages/ui/src/routes/ai-chat/mcp-panel.tsx` (1,270 lines)
- Direct source code analysis of `livos/packages/ui/src/components/ai-quick.tsx` (253 lines)
- Direct source code analysis of `livos/packages/ui/tailwind.config.ts` (semantic tokens)
- Direct source code analysis of `livos/packages/ui/package.json` (dependencies)
- Phase 1 summaries (01-01, 01-03) for token definitions and focus patterns
- Phase 3 summaries (03-01 through 03-04) for migration patterns
- Phase 4 summaries (04-01) for sidebar/tabs migration patterns

### Secondary (MEDIUM confidence)
- None needed -- all findings are from direct codebase analysis

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and used in the project
- Architecture: HIGH - Direct analysis of all 3 source files, complete line-by-line inventory
- Pitfalls: HIGH - Identified from patterns observed in Phase 1-4 migrations
- Plan structure: HIGH - Based on established phase planning patterns from Phase 3-4

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable -- no external dependencies or evolving APIs)
