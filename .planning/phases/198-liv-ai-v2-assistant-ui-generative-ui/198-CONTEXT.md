# Phase 198: Liv AI v2 — assistant-ui + Generative UI + tool-ui + Mastra Production Polish

**Gathered:** 2026-05-23 (post Phase 197 UAT — operator rejected bespoke UI as "inanılmaz kötü ve çalışmıyor")
**Status:** Ready for plan-phase
**Source:** Operator directive 2026-05-23 — "Mastra da Langgraph da olduğu gibi github da hali hazır agent UI ları yok mu? https://github.com/langchain-ai/agent-chat-ui bunun gibi bir araştırır mısın? ... bizim UI imiz Generative UI destekli olsun openUI mcp ile birleşik olsun. Kullanıcı bir soru sorduğunda mesela gezilecek yerlerin listesi diye bunu basit bir text ile anlatmasın AI UI li anlatsın görseller kullansın. Şimdi iyi bir GSD planı oluştur çok detaylı bir chat yapalım buradan her şeyi manage edebilelim ve bütün özellikler kullanılabilsin!"

**Milestone:** v38.3 — Drop Vault + bruce-user Refactor (carry-forward; v39.0 may open if scope grows)
**Wave priority:** 1 (foundational — Liv AI surface is the marquee UX of v38.3, currently broken-perceived)

<scope_pivot>
## Why Phase 198 exists

Phase 197 shipped a working backend (Mastra agent + tRPC mastra.* namespace + 4-layer memory + ProviderRouter + McpBridge + ApprovalManager) but a **hand-rolled vanilla-Tailwind chat UI** that the operator rejected immediately on first UAT (2026-05-23 morning). Two reasons:

1. **Visual quality** — div'lerle yazılmış basit chat; production AI chat'lerin (ChatGPT, Claude.ai, Perplexity) görsel kalitesinin çok altında. Composer, message bubble, thread sidebar hepsi bespoke ve cilasız.
2. **Capability** — Sadece text streaming + bir tane modal'lı approval. **Tool call sonuçları görsel olarak render edilmiyor** ("places to visit in Istanbul" → markdown bullet list, NOT image cards + map). Operator açıkça "Generative UI destekli olsun, görseller kullansın" istiyor.

Phase 198 is therefore a **full UI replacement** with an industry-standard production-grade framework, NOT a backend phase. Backend stays mostly intact; transport pivots from tRPC subscription to HTTP SSE via `@mastra/ai-sdk` `chatRoute` (the Mastra-official integration path).
</scope_pivot>

<research_findings>
## Research outcome (assistant-ui vs alternatives — completed 2026-05-23)

| Aday | Tech | Vite uyumu | Generative UI | tool-ui primitives | Mastra-resmi | Verdict |
|---|---|---|---|---|---|---|
| **assistant-ui** ⭐ | Pure React lib | ✅ | `makeAssistantToolUI` + streaming partial-arg + `useToolArgsStatus` | **assistant-ui/tool-ui** — 25+ components (Image Gallery, Geo Map, Carousel, Chart, Weather, Code Diff, Approval Card, ...) | ✅ Resmi guide [mastra.ai/guides/build-your-ui/assistant-ui] + reference repo `assistant-ui/mastra-hitl` | **WINNER** |
| langchain-ai/agent-chat-ui | Next.js + LangGraph SDK locked | ❌ | ❌ generic | ❌ | ❌ LangGraph-only | NO |
| vercel/ai-chatbot | Next.js RSC + Server Actions | ❌ | `streamUI`/`createStreamableUI` (RSC-only) | ❌ | ❌ | NO |
| Morphic | Next.js + AI SDK RSC | ❌ | ✅ via RSC streamUI | ❌ tek seferlik komponentler | ❌ | NO (RSC port edemeyiz) |
| mcp-ui / MCP Apps (SEP-1865) | Cross-framework iframe sandbox | N/A | ✅ via iframe + postMessage | ❌ ham HTML | ❌ — Mastra MCP tools don't emit `_meta.ui.resourceUri` by default | **Defer to P199+** |
| open-webui / librechat | Monolitik full-stack | ❌ embeddable yok | ❌ | ❌ | ❌ | NO |

**Sources (full citation list):**
- [assistant-ui repo](https://github.com/assistant-ui/assistant-ui) — 10.2k⭐ MIT, v0.14.7 (2026-05-21), framework-agnostic React
- [tool-ui repo](https://github.com/assistant-ui/tool-ui) — 692⭐ MIT, shadcn copy-paste model, 25+ generative UI components
- [Mastra + assistant-ui guide](https://mastra.ai/guides/build-your-ui/assistant-ui) — official Mastra integration
- [assistant-ui + Mastra separate-server](https://www.assistant-ui.com/docs/integrations/frameworks/mastra/separate-server) — exact pattern for our split topology (livinityd ≠ React app)
- [assistant-ui/mastra-hitl](https://github.com/assistant-ui/mastra-hitl) — HITL reference (plan/approve/execute workflow)
- [mastra-ai/ui-dojo](https://github.com/mastra-ai/ui-dojo) — Mastra UI Dojo with Generative UI examples
- [makeAssistantToolUI reference](https://www.assistant-ui.com/docs/copilots/make-assistant-tool-ui) — tool render API
- [Generative UI guide](https://www.assistant-ui.com/docs/guides/tool-ui) — `useToolArgsStatus` for streaming partial-arg render
- [Generative UI examples gallery](https://www.assistant-ui.com/examples/generative-ui) — Chart/Map/DatePicker/Form demos
- [MCP Apps blog Jan 2026](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) — SEP-1865 spec stable
- [assistant-ui docs root](https://www.assistant-ui.com/docs) — full docs nav
- [assistant-ui homepage feature checklist](https://www.assistant-ui.com/) — pulled full feature inventory
</research_findings>

<domain>
## Phase Boundary

After Phase 198 ships, the operator clicks the **Liv AI** Dock icon and gets a production-grade chat surface with:

1. **Polished chat UX** — assistant-ui Thread/Composer/MessageList/ActionBar primitives; shadcn theme consistent with rest of LivOS; markdown + code highlight + LaTeX + Mermaid; auto-scroll; loading skeletons; copy/edit/regenerate per message; branching navigation; quote-selected-text; suggested prompts; ChainOfThought reasoning accordion.

2. **Generative UI rendering** — When agent calls a tool, the result renders as a **rich React component**, not text. Example: `search_places({city: "Istanbul"})` returns image grid with names + photos + descriptions instead of a markdown bullet list. Implementation:
   - **`makeAssistantToolUI`** registers a renderer per tool-name. While args stream, show skeleton (`useToolArgsStatus`). When result arrives, render the matched **tool-ui primitive** (Image Gallery, Geo Map, Item Carousel, Weather Widget, Chart, etc.).
   - **Pre-wired tool renderers** (Phase 198 ships these):
     - `web_search` → Sources component (favicon + title + URL list)
     - `image_search` / `places_search` → Image Gallery from tool-ui
     - `weather` → Weather Widget from tool-ui
     - `map` / `places_with_location` → Geo Map from tool-ui (Leaflet wrap)
     - `compare_items` → Item Carousel from tool-ui
     - `data_query` → Data Table from tool-ui
     - `chart` → Chart from tool-ui (Recharts wrap)
     - `code_diff` → Code Diff from tool-ui
     - `link_preview` → Link Preview from tool-ui (OG-card)
     - `luse_computer_screenshot` (existing MCP tool) → Image component (full-width preview + fullscreen dialog)
     - `luse_list_windows` (existing MCP tool) → Data Table
     - Fallback for unknown tools → ToolFallback default UI (collapsed JSON view)

3. **HITL approval (production-grade)** — Destructive MCP tools (`luse_computer_click_mouse` etc.) surface a **Approval Card** component from tool-ui inline in the message stream (not a modal). User clicks Approve/Reject → assistant-ui calls back into the agent's `human()` interrupt → tool either executes or returns the rejection sentinel. Backend pattern follows `assistant-ui/mastra-hitl` reference.

4. **Thread management** — Multi-thread (multiple parallel conversations); ThreadList sidebar with new/rename/archive/delete; thread-switching; persistent across sessions via Mastra PostgresStore + `mastra.agent.threads.list/delete` already shipped in 197-05.

5. **Composer power features** — Slash commands (`/search`, `/code`, `/help`, `/screenshot`, `/clear`); @-mentions for tools; attachment upload (images + PDFs) sent to the agent as multimodal context; suggested-prompt chips on empty thread; voice input via Web Speech API (deferred to P199 polish).

6. **Reasoning visibility** — When Grok or Claude returns `reasoning_content`, render in collapsible accordion (assistant-ui's Reasoning primitive). Token-stats badge on each assistant message (TTFT + tokens/sec + total).

7. **Devtools** — Drop in assistant-ui's DevTools browser extension panel for debugging in development; never ships to prod.

8. **Transport pivot** — Old tRPC `mastra.agent.stream` subscription **deprecated** (kept for one release as fallback, removed in P199). New transport: Mastra `chatRoute({path: '/chat/livAi'})` mounted on livinityd's existing Express + Caddy reverse-proxy stack. assistant-ui consumes via `AssistantChatTransport({api: '/chat/livAi'})`. AI SDK message stream format handles all chunk-to-component mapping automatically.

**Differentiation we get for free vs Phase 197 bespoke UI:**
- ~600 LOC removed (entire `livos/packages/ui/src/features/liv-ai/` directory deleted)
- ~250 LOC added (Mastra chatRoute wire-up + tool renderers + AssistantRuntimeProvider wrap)
- Zero browser-cache headaches (assistant-ui DevTools shows runtime state live)
- 100% standard React patterns — future contributors don't have to learn LivOS-specific chat conventions
- Branching, attachments, voice, reasoning accordion, markdown, mermaid, latex — all FREE from the framework
- Tool rendering is **declarative** (`<PlacesGalleryToolUI />` registered once, fires for every matching tool call)

**Hidden mechanics:**
- `@mastra/ai-sdk` `chatRoute` helper produces an Express-shaped route handler. livinityd's existing Express server (`/opt/livos/packages/livinityd/source/...`) mounts it alongside the tRPC router. Caddy reverse-proxy passes `/chat/*` to livinityd unchanged.
- `useChatRuntime({transport: new AssistantChatTransport({api: '/chat/livAi'})})` issues a POST to the URL with `{messages}` body; livinityd streams AI-SDK-format SSE back.
- HITL pattern: agent calls `human()` which suspends. `chatRoute` emits an AI SDK tool-call message; `makeAssistantToolUI` renders the Approval Card; user click POSTs to `/chat/livAi` with `{messages: [...history, approvalResult]}` to resume.
- Generative UI is **client-side declarative** — tool result JSON is interpreted by the registered renderer; nothing changes server-side. Adding a new tool renderer = create the tool on the agent + register a `makeAssistantToolUI` for it.
</domain>

<must_haves>
## Locked truths for Phase 198

1. **assistant-ui is the chat framework** — `@assistant-ui/react@latest` + `@assistant-ui/react-ai-sdk@latest` installed in `livos/packages/ui`. NO `@assistant-ui/react-langgraph`, NO Vercel `streamUI`, NO bespoke chat React.

2. **tool-ui primitives are the Generative UI source-of-truth** — shadcn copy-paste model (components land in `livos/packages/ui/src/components/tool-ui/`); zero new runtime dep risk.

3. **`@mastra/ai-sdk` `chatRoute` is the backend transport** — mounted at `/chat/livAi` on livinityd's Express. The tRPC `mastra.agent.*` namespace from P197-05 stays mounted but is marked deprecated (one-release grace; deleted in P199).

4. **D-NO-NEW-DEPS-EXCEPT-RUNTIME** — Only npm packages this phase adds: `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, `@assistant-ui/react-markdown`, `@mastra/ai-sdk`. shadcn registry components (button/dialog/etc.) are already installed; tool-ui components are copy-pasted source, not npm deps.

5. **Backend Mastra agent + ProviderRouter + McpBridge + Memory unchanged** — all sacred Phase 197 backend work preserved. Only the HTTP route layer + livinityd boot wire-up extends.

6. **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** — sdk-agent-runner.ts byte-identical pre/post every commit (20/20 pre-commit hook PASS).

7. **Operator UAT gate** — After deploy: operator clicks Liv AI Dock icon → assistant-ui Thread renders → types "merhaba" → Grok streams response → types "Istanbul'da gezilecek yerler" → if a `search_places` tool exists, Image Gallery renders; if not, well-formatted markdown bullets via assistant-ui Markdown primitive. **Both cases LOOK PRODUCTION-GRADE.**

8. **Phase 197 bespoke UI deleted** — `livos/packages/ui/src/features/liv-ai/` entire directory removed (~600 LOC). `liv-ai-content.tsx` rewired to assistant-ui Assistant component.

9. **HITL via `mastra-hitl` reference pattern, NOT bespoke ApprovalManager modal** — ApprovalManager class from P197-05 can stay (used internally by tool execute() suspension), but the **UI surface** flips to assistant-ui Approval Card inline in the message stream.

10. **MCP-UI / SEP-1865 deferred to Phase 199+** — current `@mcp-ui/server` and `@mcp-ui/client` SDKs are spec-stable (Jan 2026) but adoption is young (low npm downloads as of May 2026). Adding iframe sandboxing is operational complexity we don't need until we ship a public MCP server. P198 covers ALL generative-UI use cases via `makeAssistantToolUI` + tool-ui — that's the recommended pattern from the assistant-ui maintainer's own reference repo.
</must_haves>

<decisions>
## Implementation Decisions (locked in plan-phase)

### Plan 198-01 — Backend: Mastra chatRoute + livinityd Express mount (Wave 1)
- Install `@mastra/ai-sdk@latest` in livinityd package
- Inside livinityd's existing chromeMaster try/catch boot block (line ~960 source/index.ts), after `livOSMastra` constructed and agent attached: create a Mastra `Mastra` config instance OR use the existing `livOSMastra.agents.livAi` directly via a custom HTTP handler that wraps `agent.stream() → toAISdkStream() → createUIMessageStream() → createUIMessageStreamResponse()`
- Mount as Express route: `app.post('/chat/livAi', handler)` — JSON body parsing already present
- Wire same response into a `/chat/:agentId` parameterized route for forward-compat with multi-agent (P199)
- Honor existing JWT auth: route gated by `isAuthenticated` middleware so /chat/* requires admin session cookie (T-198-01-EoP)
- Tests: vitest unit test for handler (mock `agent.stream`, assert toAISdkStream pipe-through + SSE response shape)

### Plan 198-02 — Frontend: Install assistant-ui + delete bespoke UI (Wave 1, file-disjoint with 198-01)
- `pnpm add @assistant-ui/react @assistant-ui/react-ai-sdk @assistant-ui/react-markdown` in `livos/packages/ui/package.json`
- shadcn-registry components needed but already installed: `button`, `dialog`, `avatar`, `collapsible`, `tooltip`, `skeleton`. Verify via grep; if missing, `npx shadcn@latest add <name>`
- **Delete** `livos/packages/ui/src/features/liv-ai/` directory (entire P197-06 work — approval-modal, message-bubble, thread-sidebar, use-liv-ai, redact-args, liv-ai-chat-window, redact-args.test). Keep only `redact-args.ts` if useful for ApprovalCard scrubbing (test stays).
- `liv-ai-content.tsx` content rewritten to `<Assistant />` component (new file at `features/liv-ai/assistant.tsx`)
- Scaffold the Thread component via `npx assistant-ui@latest add thread` (drops into `components/assistant-ui/thread.tsx`)
- Build `pnpm --filter ui build` MUST exit 0
- Acceptance grep: `grep -rE "@assistant-ui" livos/packages/ui/src/features/liv-ai/` ≥ 1 (proves assistant-ui imports landed)

### Plan 198-03 — tool-ui primitives copy-paste + tool registry (Wave 2, depends 198-02)
- Copy the following tool-ui components into `livos/packages/ui/src/components/tool-ui/` (per shadcn pattern):
  - **Required (P198 ships):** `image-gallery.tsx`, `geo-map.tsx`, `item-carousel.tsx`, `weather-widget.tsx`, `data-table.tsx`, `chart.tsx`, `link-preview.tsx`, `approval-card.tsx`, `code-block.tsx`, `code-diff.tsx`, `sources.tsx`, `tool-fallback.tsx`
  - **Deferred (Phase 199 polish):** `instagram-post`, `linkedin-post`, `x-post`, `message-draft`, `option-list`, `parameter-slider`, `preferences-panel`, `question-flow`, `order-summary`, `plan`, `progress-tracker`, `citation`, `audio`, `video`, `terminal`
- Add npm deps for the required components only: `react-leaflet leaflet` (geo-map), `recharts` (chart), maybe `@radix-ui/react-tooltip` (already there)
- Build tool renderers file `features/liv-ai/tool-renderers.tsx` exporting:
  - `ImageGalleryToolUI` (registers for tool-names matching `search_places|image_search|gallery`)
  - `GeoMapToolUI` (registers for tool-names matching `map|places_with_location|geocode`)
  - `WeatherToolUI` (tool-name `weather|forecast`)
  - `ChartToolUI` (tool-name `chart|graph|stats`)
  - `DataTableToolUI` (tool-name `data_query|list_*`)
  - `SourcesToolUI` (tool-name `web_search|search`)
  - `LinkPreviewToolUI` (tool-name `fetch_url|link_preview`)
  - `LuseScreenshotToolUI` (tool-name `luse_computer_screenshot` — full-width image + fullscreen dialog)
  - `LuseListWindowsToolUI` (tool-name `luse_list_windows` — DataTable)
  - `ApprovalCardToolUI` (renders for the 6 `destructiveToolNames` from P197-02 — wires to mastra-hitl pattern)
- Each renderer uses `makeAssistantToolUI({ toolName, render })` per assistant-ui docs
- All renderers mounted inside `AssistantRuntimeProvider` via barrel export `<ToolRenderers />` in `assistant.tsx`
- Tests: vitest unit tests for each renderer's render function (mock args + result, assert returned JSX shape contains expected component name)

### Plan 198-04 — HITL pattern via assistant-ui Approval Card + mastra-hitl integration (Wave 2, depends 198-02 + 198-03)
- Study `assistant-ui/mastra-hitl` repo's `plan-approval.tsx` + `human-in-the-loop.tsx` (already cloned for reference)
- Implement Approval Card flow:
  - Mastra agent calls a destructive tool (e.g. `luse_computer_click_mouse`)
  - The wrapped tool (P197-04 `wrapToolWithApproval`) emits a tool-call chunk with `requireApproval: true` AND suspends via Promise (existing ApprovalManager)
  - In the AI SDK message stream, this surfaces as a tool-call message-part with toolName in `destructiveToolNames`
  - `ApprovalCardToolUI` (registered for all 6 destructive tool names) renders inline in the message stream — NOT a floating modal
  - User clicks Approve / Reject → handler calls a new tRPC mutation `mastra.agent.approve` (existing from P197-05, KEEP) which resolves the ApprovalManager Promise → wrapped tool proceeds OR returns REJECTED_TOOL_RESULT sentinel
  - Agent continuation produces follow-up message naturally
- Tests: integration test using mock chatRoute that yields a tool-call chunk for `luse_computer_click_mouse`, mounts the Thread, asserts the Approval Card renders inline; click Approve, asserts mutation fires; click Reject, asserts no execution

### Plan 198-05 — ThreadList sidebar + thread CRUD wiring (Wave 3, depends 198-02)
- Mount assistant-ui's `ThreadList` primitive in the LivAi window's left column (256px width, mirrors P197-06 layout intent)
- Wire `ExternalStoreThreadListAdapter` to `mastra.agent.threads.list` (query) + `mastra.agent.threads.delete` (mutation) — both kept from P197-05 backend
- Add `New conversation` button on top of sidebar (assistant-ui primitive)
- Persistence: backend already wired (PostgresStore from P197-03 stores threads in mastra_threads table)
- Title-generation adapter (assistant-ui supports a `TitleGenerationAdapter` interface) — auto-generate thread title from first user message via a cheap LLM call; deferred to P199 (just use "Untitled" + timestamp in P198)
- Tests: vitest test for the adapter (mock tRPC client, assert list query + delete mutation fire correctly)

### Plan 198-06 — Composer power features: slash commands + suggested prompts + attachments (Wave 3, depends 198-02)
- Slash commands via assistant-ui's slash-command primitive:
  - `/help` — opens a help dialog explaining available tools
  - `/clear` — starts a new thread
  - `/screenshot` — inserts a placeholder asking the agent to take a screenshot (sends `take a screenshot of the current screen` as user message)
  - `/search <query>` — inserts a placeholder for web search (when web_search tool exists)
- Suggested prompts on empty thread:
  - "What's the weather in Istanbul?"
  - "Take a screenshot of my screen"
  - "List my open windows"
  - "What can you do?"
- Attachments (assistant-ui's attachment adapter):
  - Image upload (drag-drop or click) — sent to the agent as multimodal content; xAI/Grok supports vision via Mastra's `@ai-sdk/xai`
  - PDF upload — extracted to text via a server-side pdf-parse call (deferred to P199 polish if complex); for P198 just allow image
- Tests: unit tests for slash command parser + suggested-prompt chip click handler

### Plan 198-07 — Empty-state + onboarding + theming + DevTools (Wave 3, depends 198-02)
- Empty-thread state: large Liv AI logo + tagline ("LivOS'un yapay zekası — ekranını yönetir, sorularına cevap verir, hatırlar") + 4 suggested-prompt chips
- Theming: assistant-ui primitives respect Tailwind dark mode (already wired in LivOS); colors pulled from existing `livos-design-tokens`
- DevTools: dev-only import of `@assistant-ui/react-devtools` (already installed transitively); shows runtime inspector at bottom of window only when `import.meta.env.DEV`
- Accessibility: ARIA labels, focus management, keyboard shortcuts (Cmd+Enter to send, Esc to cancel current message). assistant-ui handles most of this natively.
- Tests: visual smoke test (mount Assistant, assert empty state renders + suggested-prompt chips present)

### Plan 198-08 — Deploy + UAT + Phase 197 tRPC namespace deprecation marker (Wave 4, depends 198-01..07)
- Update `livos/install.sh` + `update.sh` if any new system-level packages needed (leaflet doesn't need anything beyond what's already installed)
- Mini PC deploy: `bash /opt/livos/update.sh` + sudoers/ownership patch + restart livos liv-core liv-worker liv-memory
- Live UAT walk on operator's browser:
  1. Open https://bruce.livinity.io → log in → click Liv AI Dock icon
  2. Window opens → assistant-ui Thread renders, empty-state suggestion chips visible
  3. Click "What's the weather in Istanbul?" suggested prompt → agent invokes (hypothetical) weather tool → Weather Widget renders inline
  4. Type "merhaba, sen kimsin?" → Grok streams response with markdown + reasoning accordion
  5. Type "take a screenshot" → Approval Card renders inline for `luse_computer_click_mouse` (assuming Luse MCP server is running; if not, agent reports "no screenshot tool available")
  6. Click Reject → agent continuation explains rejection naturally
  7. Open ThreadList → click "New conversation" → empty state again
  8. Switch back to original thread → message history persists
  9. Hard refresh browser → all threads persist (PostgresStore working)
- Mark Phase 197 tRPC `mastra.agent.*` namespace as deprecated:
  - Add deprecation comment in `livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts` header
  - Add to v39.0 backlog: "remove deprecated mastra.* tRPC namespace (P198 ships HTTP /chat/livAi as primary transport)"
- Update STATE.md current position to Phase 198
- Update ROADMAP.md Phase 198 from PLANNED → CODE-COMPLETE + LIVE with operator UAT timestamp
- Sacred SHA verification 1 final time
</decisions>

<threat_model>
## Threat register (Phase 198)

| ID | Category | Component | Disposition | Mitigation |
|---|---|---|---|---|
| T-198-01 | E (EoP) | `/chat/livAi` Express route | mitigate | adminProcedure equivalent: route handler reads JWT from cookie (existing isAuthenticated middleware) and rejects on absent/expired token. Same gate as tRPC adminProcedure. |
| T-198-02 | T (Tampering) | AssistantChatTransport request body | mitigate | server validates messages array via zod schema before passing to `agent.stream()`. Reject malformed shapes with 400. |
| T-198-03 | I (Info disclosure) | Tool result rendering of secrets | mitigate | preserve P197-06 redactArgsForDisplay helper for ApprovalCard. Extend coverage to tool result rendering — if a tool's result contains a field matching `/token\|key\|secret\|password\|authorization/i`, mask before passing to renderer. Test asserts `{api_token: 'xyz'}` becomes `'***'`. |
| T-198-04 | I | Generative UI XSS via tool result | mitigate | EVERY tool renderer must use React text interpolation only; NEVER `dangerouslySetInnerHTML`. tool-ui copy-paste primitives already follow this. Acceptance grep `grep -r "dangerouslySetInnerHTML" livos/packages/ui/src/components/tool-ui/ livos/packages/ui/src/features/liv-ai/` returns 0. |
| T-198-05 | I | Generative UI XSS via markdown | accept | assistant-ui's Markdown primitive uses react-markdown + rehype-sanitize by default; trusted. |
| T-198-06 | D (DoS) | Large tool result rendering | mitigate | Data Table + Image Gallery primitives implement virtualization for >50 rows / >20 images respectively. tool-ui already has this; verify on copy. |
| T-198-07 | S (Spoofing) | Approval Card spoofing | accept | Card renders inside operator's authenticated Liv AI window; same-origin policy + JWT cookie. Same disposition as P197-06 T-197-06-05. |
| T-198-08 | T | New Express route bypass of tRPC auth | mitigate | mount /chat/* AFTER express-jwt middleware in livinityd Express setup. Verified via integration test: unauthenticated POST returns 401. |
| T-198-09 | R (Repudiation) | tool-call audit trail | accept | Mastra's PostgresStore already persists every message including tool calls; mastra_messages table. Auditable. |
| T-198-10 | I | DevTools panel in production | mitigate | DevTools import gated behind `import.meta.env.DEV`; build-time tree-shake removes from prod bundle. Acceptance grep on built dist asserts no `react-devtools` strings in production bundle. |

**Sacred constraints preserved:**
- sdk-agent-runner.ts SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED
- sudoers fragment SHA UNCHANGED (no sudoers changes in P198)
- bruce-user ownership on Mini PC UNCHANGED
- Mini PC is the ONLY deployment target (Server4/5 explicitly off-limits per project memory)
</threat_model>

<wave_plan>
## Wave-based execution plan

```
Wave 1 (parallel, file-disjoint):
  ├─ Plan 198-01 — Backend: @mastra/ai-sdk chatRoute + livinityd Express mount + JWT gate (~150 LOC)
  └─ Plan 198-02 — Frontend: install assistant-ui + delete bespoke UI + scaffold Thread component (~80 LOC + 600 LOC deleted)

Wave 2 (depends Wave 1):
  ├─ Plan 198-03 — tool-ui primitives copy-paste + 10 tool renderers (~700 LOC across 12 files)
  └─ Plan 198-04 — HITL Approval Card pattern + mastra-hitl integration (~150 LOC)

Wave 3 (depends Wave 2):
  ├─ Plan 198-05 — ThreadList sidebar + thread CRUD wiring (~100 LOC)
  ├─ Plan 198-06 — Slash commands + suggested prompts + attachments (~200 LOC)
  └─ Plan 198-07 — Empty state + onboarding + theming + DevTools (~150 LOC)

Wave 4 (depends Wave 3):
  └─ Plan 198-08 — Mini PC deploy + UAT walk + P197 tRPC deprecation marker + STATE/ROADMAP flip + sacred SHA verify (operator-walked)
```

**Total estimate:** 8 plans, ~1530 LOC added, ~600 LOC deleted, ~17 source commits + 1 SUMMARY commit per plan = 25 commits ranged. Sacred SHA preserved across all.

**Critical path:** 198-01 + 198-02 (Wave 1, parallel) → 198-03 (heavy lifting, ~30% of phase effort) → 198-04 → operator-walked deploy. Total wall-clock with autonomous mode + reasonable test runs: **3-5 hours**.
</wave_plan>

<deferred>
## Deferred to Phase 199+ (explicitly out of scope for P198)

- **MCP-UI / SEP-1865 iframe sandbox integration** — wait until we ship a public-facing MCP server OR third-party MCP servers we consume start emitting `_meta.ui.resourceUri`. Current `@mcp-ui/client` adoption too young.
- **Voice input + TTS** — assistant-ui supports it natively but operator hasn't asked; ship in P199 polish wave.
- **PDF upload + RAG** — image attachments only in P198. PDF text extraction adds pdf-parse + embedding work.
- **Multi-agent (sub-agent handoffs)** — assistant-ui supports it; we have only one agent (Liv AI). Re-enable when P199 ships Liv Coder / Liv Researcher / etc.
- **Semantic recall (embedder)** — workingMemory.scope='thread' shipped in P197-03; semanticRecall=false until we pick an embedder (xAI .embedding() not available, OpenAI-compat or local sentence-transformers candidate).
- **Title-generation adapter** — auto-generate thread titles from first user message; cosmetic.
- **Resumable streams** — assistant-ui supports it for "reload mid-response"; nice-to-have, defer.
- **Cloud persistence (assistant-ui Cloud)** — vendor-hosted thread sync; we use our own PostgresStore, don't need this.
- **Remove tRPC `mastra.agent.*` namespace entirely** — kept as deprecated fallback in P198; deletion in P199.
- **Luse MCP server install / selfclaude MCP server start** — agent has no tools right now on Mini PC; separate ops phase to wire them up. Phase 198 ships the UI surface; with no tools, generative UI demos work via the agent's textual ability + a few hard-coded suggested prompts.
- **Onboarding wizard for Liv AI permissions** — first-launch tour explaining what the agent can do; cosmetic.
</deferred>

<key_links>
**Backend ↔ Frontend integration:**
- `livos/packages/livinityd/source/index.ts` → `app.post('/chat/livAi', mastraChatHandler)` (NEW in 198-01)
- `livos/packages/ui/src/features/liv-ai/assistant.tsx` → `useChatRuntime({transport: new AssistantChatTransport({api: '/chat/livAi'})})` (NEW in 198-02)
- Caddy reverse-proxy in `/etc/caddy/Caddyfile` on Mini PC → `/chat/*` already routes to livinityd via existing reverse_proxy 127.0.0.1:8080 catchall (no Caddy changes needed)

**Tool rendering integration:**
- `livos/packages/ui/src/features/liv-ai/tool-renderers.tsx` → registers `makeAssistantToolUI` for each tool name → primitives from `livos/packages/ui/src/components/tool-ui/*` consume tool result JSON

**HITL integration:**
- `livos/packages/livinityd/source/modules/mastra/approval-manager.ts` (P197-05 KEEP) — backend Promise registry
- `livos/packages/ui/src/components/tool-ui/approval-card.tsx` (NEW in 198-03) — inline message-stream component
- tRPC `mastra.agent.approve` mutation (P197-05 KEEP) — UI calls this on Approve/Reject click
</key_links>

<acceptance_envelope>
## Phase 198 acceptance envelope

After Phase 198 ships and Mini PC UAT passes:

1. ✅ Operator clicks Liv AI Dock icon → window opens → assistant-ui Thread component renders (NOT bespoke vanilla Tailwind)
2. ✅ Empty thread state shows Liv AI logo + tagline + 4 suggested-prompt chips
3. ✅ Click suggested prompt → user message inserts + agent stream begins
4. ✅ Agent response renders with markdown + code highlight + reasoning accordion + token-stats badge
5. ✅ Tool calls render as appropriate component (Image Gallery for places, Weather Widget for weather, Approval Card for destructive tools, DataTable for list_windows, etc.)
6. ✅ Destructive tool surfaces Approval Card inline (NOT floating modal) → Approve/Reject both produce correct agent continuation
7. ✅ ThreadList sidebar lists past threads → click switches → New button creates fresh thread → delete affordance works
8. ✅ Cmd+Enter sends, Esc cancels, slash menu opens on `/`, mention menu on `@`
9. ✅ Image attachment drag-drop works → multimodal context passed to Grok
10. ✅ Hard refresh persists threads + messages (PostgresStore)
11. ✅ Browser console: zero errors on full flow
12. ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved (20/20 pre-commit hook PASS across all P198 commits)
13. ✅ P197 bespoke UI deleted (`livos/packages/ui/src/features/liv-ai/{approval-modal,message-bubble,thread-sidebar,use-liv-ai,liv-ai-chat-window}.tsx` removed)
14. ✅ Mastra `chatRoute` POST `/chat/livAi` returns SSE stream (verified via curl + Bearer JWT)
15. ✅ tRPC `mastra.agent.*` namespace returns deprecation header in dev mode but still functions (one-release grace)
16. ✅ DevTools panel ONLY in dev build; production bundle grep `react-devtools` returns 0
17. ✅ XSS regression: no `dangerouslySetInnerHTML` anywhere in `features/liv-ai/` or `components/tool-ui/`
18. ✅ `pnpm --filter ui build` exits 0 in < 60s
19. ✅ `npx tsc --noEmit` shows ZERO new errors in modified files (pre-existing 100+ errors elsewhere acceptable per Phase 196-01 precedent)

**Operator UAT pass criterion (the only one that matters):** "Şimdi süper görünüyor / iyi çalışıyor" or equivalent confirmation. If operator rejects again, Phase 199 is a polish pass not a redo — the framework choice is locked at P198.
</acceptance_envelope>

<context_files>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/197-mastra-agent-platform-xai/197-CONTEXT.md
@.planning/phases/197-mastra-agent-platform-xai/197-06-PLAN.md

External references to fetch during plan-phase:
- https://www.assistant-ui.com/docs (full nav)
- https://www.assistant-ui.com/docs/installation
- https://www.assistant-ui.com/docs/copilots/make-assistant-tool-ui
- https://www.assistant-ui.com/docs/guides/tool-ui
- https://www.assistant-ui.com/examples/generative-ui
- https://www.assistant-ui.com/docs/integrations/frameworks/mastra/separate-server
- https://mastra.ai/guides/build-your-ui/assistant-ui
- https://github.com/assistant-ui/tool-ui
- https://github.com/assistant-ui/mastra-hitl
- https://github.com/mastra-ai/ui-dojo
</context_files>
