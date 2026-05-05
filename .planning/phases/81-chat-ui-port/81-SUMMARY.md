# Phase 81 Summary — v32 Chat UI Port

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `livos/packages/ui/src/routes/ai-chat/v32/types.ts` | 38 | ChatMessage + Attachment + ToolCallSnapshot shared types |
| `livos/packages/ui/src/routes/ai-chat/v32/index.tsx` | 168 | Top-level orchestrator; /ai-chat-v2 route; mock streaming sim |
| `livos/packages/ui/src/routes/ai-chat/v32/MessageThread.tsx` | 232 | Scrollable thread; Framer Motion entry; auto-scroll; empty state |
| `livos/packages/ui/src/routes/ai-chat/v32/ChatComposer.tsx` | 181 | Card wrapper + drag-drop + send/stop button |
| `livos/packages/ui/src/routes/ai-chat/v32/MessageInput.tsx` | 74 | Auto-grow textarea; Enter/Cmd+Enter send; Shift+Enter newline |
| `livos/packages/ui/src/routes/ai-chat/v32/FileAttachment.tsx` | 91 | FileAttachmentButton (picker) + DragOverlay + fileListToAttachments |
| `livos/packages/ui/src/routes/ai-chat/v32/AttachmentGroup.tsx` | 97 | Chip row with filename + size + remove X; AnimatePresence |
| `livos/packages/ui/src/routes/ai-chat/v32/preview-renderers.tsx` | 207 | ReactMarkdown + code blocks + Copy button + gradient pill parser |
| `livos/packages/ui/src/routes/ai-chat/v32/streaming-caret.tsx` | 42 | CSS blink animation; `<style>` tag injection; no JS interval |

## Files Modified

| File | Delta |
|------|-------|
| `livos/packages/ui/src/router.tsx` | +11 lines (lazy AiChatV32 import + `/ai-chat-v2` route entry) |

## Suna Source Files Ported From

| Suna file | Lines referenced | Key patterns taken |
|-----------|------------------|--------------------|
| `chat-input/chat-input.tsx` | 1-322 | Card wrapper, drag-drop handlers, upload state, AgentSelector slot |
| `chat-input/message-input.tsx` | 1-212 | Auto-grow via scrollHeight, handleKeyDown Enter logic, toolbar layout |
| `attachment-group.tsx` | 1-40, 276-342 | Inline layout chip row, AnimatePresence, "more" count concept |
| `file-attachment.tsx` | 1-115 | getFileType, getFileIcon, file chip layout pattern |

## Key Visual Decisions

- **Assistant messages**: no bubble background — plain prose with `MarkdownRenderer`. Matches Suna thread exactly.
- **User messages**: `bg-liv-muted rounded-2xl rounded-br-sm max-w-[80%] ml-auto` bubble. Rounded bottom-right trimmed for "speech tail" effect without an actual tail element.
- **Streaming caret**: CSS `@keyframes v32-caret-blink` injected via `<StreamingCaretStyles>` — no JS timer, no global CSS pollution.
- **Gradient pills**: `<pill variant="confirm">text</pill>` marker syntax parsed by `parsePills()` before ReactMarkdown processes the string. Avoids HTML injection while keeping pills composable with markdown.
- **Drag-drop**: entire ChatComposer Card is the drop target (not a nested zone). `DragOverlay` renders as an absolute overlay with `backdrop-blur-sm` on drag-over — same feel as Suna's "drop here" state.
- **Empty state**: 4 suggested prompt pills + agent emoji + centered card. Clicking a prompt calls `onSuggest` which sets the composer `value` (same pattern as P70's `LivWelcome.onSelectSuggestion`).
- **Color tokens**: 100% `liv-*` tokens from P80. Zero `bg-background`, zero hardcoded hex.

## Constraint Verification

- `routes/ai-chat/index.tsx` — untouched (confirmed with `git diff HEAD~1 -- livos/packages/ui/src/routes/ai-chat/index.tsx` → empty)
- `ToolCallPanel.tsx` — not created by P81; P82 lane owns it
- `views/` subdir — not created by P81; P83 lane owns it
- `live/packages/core/` — untouched
- `livos/packages/livinityd/` — untouched
- Mock data: confined to `v32/index.tsx` only

## Verification Commands Run

```
pnpm --filter ui build
# exit 0 (34.42s, 12177 modules, 428 precache entries)

pnpm --filter ui exec tsc --noEmit 2>&1 | grep "v32/"
# (no output — zero errors in v32/ files)
# All tsc errors are pre-existing in ../livinityd/ (not P81-introduced)
```

## Commit SHA

`4379ea89`
