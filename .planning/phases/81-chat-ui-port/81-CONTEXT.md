# Phase 81 — Chat UI Port (Suna ThreadContent + chat-input adaptation)
**Milestone:** v32 / **Wave:** 2 / **Effort:** ~10h / **Sacred SHA gate:** none touched (UI-only)

## Goal

Port Suna's chat thread surface (`ThreadContent.tsx` + `chat-input/*`) into
`livos/packages/ui/src/routes/ai-chat/v32/` using LivOS OKLCH tokens, Geist
fonts, and Tabler icons (no Lucide). Create the full chat surface: message
thread (scrollable, auto-scroll, Framer Motion entry animations), streaming
caret, ChatComposer (Card wrapper + drag-drop + file chips), MessageInput
(auto-grow textarea, Cmd+Enter send), FileAttachment (drag-drop zone), and
preview-renderers (markdown + code blocks + gradient pills). Add `/ai-chat-v2`
dev-preview route in router.tsx. Legacy `/ai-chat` is untouched until P90 cutover.

## Files (created)

- `livos/packages/ui/src/routes/ai-chat/v32/types.ts`
- `livos/packages/ui/src/routes/ai-chat/v32/index.tsx`
- `livos/packages/ui/src/routes/ai-chat/v32/MessageThread.tsx`
- `livos/packages/ui/src/routes/ai-chat/v32/ChatComposer.tsx`
- `livos/packages/ui/src/routes/ai-chat/v32/MessageInput.tsx`
- `livos/packages/ui/src/routes/ai-chat/v32/FileAttachment.tsx`
- `livos/packages/ui/src/routes/ai-chat/v32/AttachmentGroup.tsx`
- `livos/packages/ui/src/routes/ai-chat/v32/preview-renderers.tsx`
- `livos/packages/ui/src/routes/ai-chat/v32/streaming-caret.tsx`

## Files (modified)

- `livos/packages/ui/src/router.tsx` — adds `/ai-chat-v2` lazy route

## Suna Source Files Referenced

- `suna-reference/frontend/src/components/thread/chat-input/chat-input.tsx` (lines 1-322)
- `suna-reference/frontend/src/components/thread/chat-input/message-input.tsx` (lines 1-212)
- `suna-reference/frontend/src/components/thread/attachment-group.tsx` (lines 1-487)
- `suna-reference/frontend/src/components/thread/file-attachment.tsx` (lines 1-556)

## Sacred / Constraint Notes

- D-NO-CORE-CHANGES: zero changes to `liv/packages/core/` or `livos/packages/livinityd/`
- D-COEXISTENCE: `routes/ai-chat/index.tsx` and siblings are UNTOUCHED
- D-LIV-STYLED: all colors use `bg-liv-*`, `text-liv-*`, `border-liv-*` tokens from P80
- D-NO-SUNA-REWRITE: Suna patterns ported but LivOS auth/API/types substituted
- D-NO-NEW-DEPS: zero new package.json entries; react-markdown, framer-motion, @tabler/icons-react all pre-existing
- D-NO-MOCK-EVERYWHERE: mock data only in index.tsx dev preview; all component props are real types

## Verification gates

```
pnpm --filter ui build                   # must exit 0
pnpm --filter ui exec tsc --noEmit       # zero new errors in v32/ files
# Visual: open /ai-chat-v2 in dev server, verify thread + composer render
```
