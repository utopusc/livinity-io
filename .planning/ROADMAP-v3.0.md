# v3.0 Roadmap — LivOS UI Rewrite

## Milestone: v3.0 — Next.js 16 UI Rewrite
**Goal:** Complete UI rewrite with zero Umbrel resemblance. Modern minimal Apple-vari design.
**Phases:** 10

---

## Phase 01 — Project Scaffolding & Design System
**Goal:** Create `livos/packages/ui-next` with Next.js 16, Tailwind CSS 4, Motion Primitives. Establish the complete design token system and base components.
**Depends on:** Nothing
**Estimated plans:** 3

### What to build:
1. Next.js 16 project init (App Router, Turbopack, TypeScript)
2. Tailwind CSS 4 setup (CSS-first config, custom theme)
3. Motion Primitives + Framer Motion integration
4. Design token system:
   - Color palette (dark mode primary, light mode secondary)
   - Typography scale
   - Spacing / radius / shadow tokens
   - Animation tokens (duration, easing)
5. Base UI components:
   - Button (variants: primary, secondary, ghost, destructive)
   - Input, Textarea, Select
   - Card, Dialog, Sheet, Popover
   - Badge, Avatar, Separator
   - Tooltip, Toast (sonner)
   - Switch, Checkbox, Radio
   - ScrollArea, Tabs
6. Icon system (Lucide React)
7. Global CSS, font loading (Inter, JetBrains Mono)
8. `@/` path alias, project structure

### Success criteria:
- `pnpm dev` starts with Turbopack
- All base components render in a `/dev` page
- Design tokens applied consistently
- No Umbrel code or visual similarity

### Status: pending

---

## Phase 02 — Auth & tRPC Integration
**Goal:** Login, onboarding, auth guards, tRPC client. User can log in and reach the desktop.
**Depends on:** Phase 01
**Estimated plans:** 2

### What to build:
1. tRPC client setup (client-side, React Query)
2. Auth provider (JWT from localStorage)
3. `proxy.ts` for `/trpc` rewrites to backend
4. Login page (minimal centered card)
5. Onboarding flow (start → create account → done)
6. Auth guards (EnsureLoggedIn, EnsureLoggedOut, EnsureUserExists)
7. Restore from backup page

### Success criteria:
- User can log in with existing credentials
- JWT stored and refreshed
- Protected routes redirect to /login
- Onboarding flow works end-to-end
- tRPC queries work (system info, user data)

### Status: pending

---

## Phase 03 — Desktop Shell & Window Manager
**Goal:** New desktop experience — wallpaper, dock, floating windows, context menu. Completely original design.
**Depends on:** Phase 02
**Estimated plans:** 3

### What to build:
1. Desktop layout (full viewport, wallpaper background)
2. Wallpaper system (user-selected, brand color extraction)
3. **New Dock design** — NOT macOS magnification:
   - Clean pill-shaped bar with icon + label on hover
   - App groups with dividers
   - Active indicator (subtle glow or dot)
   - Smooth spring animations via Motion Primitives
4. Window Manager:
   - Open/close/minimize/restore/focus/resize
   - Drag to move, edge handles to resize
   - Z-index management
   - Spring open/close animations
   - Per-window routing (internal navigation)
5. Desktop context menu
6. Command Palette (Cmd+K) with global search
7. Mobile layout (no windows, sheet navigation)
8. Window content routing (lazy-loaded per app)

### Success criteria:
- Desktop renders with wallpaper
- Dock shows system + AI apps with new design
- Windows open, close, minimize, resize smoothly
- No visual similarity to Umbrel/macOS dock
- Mobile falls back to sheet layout
- Cmd+K opens command palette

### Status: pending

---

## Phase 04 — Settings
**Goal:** Complete settings UI — all 20+ settings pages with new design.
**Depends on:** Phase 03
**Estimated plans:** 3

### What to build:
1. Settings layout (sidebar navigation + content)
2. Account settings (name, password, 2FA)
3. AI Configuration (Claude subscription only)
4. Voice settings (Deepgram/Cartesia API keys)
5. App Store preferences
6. Device info (system stats, hardware)
7. Software update
8. Domain setup (Caddy)
9. Integrations (Telegram, Discord)
10. Gmail setup (OAuth flow)
11. Webhooks management
12. DM Pairing security
13. Usage dashboard (charts, per-model stats)
14. Nexus config (MCP servers, skills, memory)
15. Advanced / Troubleshoot
16. Restart / Shutdown
17. Terminal (xterm.js integration)
18. Network/WiFi (if applicable)

### Success criteria:
- All settings pages render correctly
- tRPC mutations work (save settings)
- Responsive on mobile
- Consistent design across all pages
- Terminal works with WebSocket

### Status: pending

---

## Phase 05 — App Store
**Goal:** Redesigned app store — discover, categories, app detail, install flow.
**Depends on:** Phase 03
**Estimated plans:** 2

### What to build:
1. Discover page:
   - Featured app banner
   - Category grid
   - App cards (new design)
   - Search
2. Category page (filtered grid)
3. App detail page:
   - Hero with icon + name + install button
   - Screenshot gallery
   - Description / release notes
   - Settings / env vars
   - Dependencies
   - Recommendations
4. Install/uninstall flow with progress
5. Update all dialog
6. Community app stores (add/remove)

### Success criteria:
- Browse and discover apps
- Install/uninstall works
- App detail shows all info
- Update mechanism works
- Community repos supported

### Status: pending

---

## Phase 06 — File Manager
**Goal:** Complete file manager rewrite with modern design.
**Depends on:** Phase 03
**Estimated plans:** 3

### What to build:
1. File browser layout (toolbar + breadcrumb + content)
2. Grid view + List view toggle
3. Navigation (breadcrumb, back/forward)
4. File operations:
   - Upload (drag & drop, multi-file, progress)
   - Download (single + zip)
   - New folder
   - Rename
   - Delete (with confirmation)
   - Cut/Copy/Paste
5. Multi-select (click + shift/ctrl)
6. File viewer:
   - Images (with zoom)
   - Video player
   - Audio player
   - Text/code editor
   - PDF viewer
7. Recents tab
8. Context menu (right-click)
9. Zustand store migration

### Success criteria:
- Browse files and folders
- All CRUD operations work
- Upload with drag & drop and progress
- File viewer handles common types
- Multi-select and clipboard operations
- Responsive on mobile

### Status: pending

---

## Phase 07 — AI Chat Adaptation
**Goal:** Adapt existing AI chat to new design system. Keep all functionality.
**Depends on:** Phase 03
**Estimated plans:** 2

### What to build:
1. Conversation sidebar (list, search, new/delete)
2. Chat message display:
   - User/assistant bubbles with new styling
   - Markdown rendering
   - Tool call display
   - Live steps (progress indicators)
3. Input area (textarea, send button, attachments)
4. Voice button (push-to-talk, interruption)
5. Canvas panel (split view for artifacts)
6. MCP panel (connected servers, tools)
7. Skills panel (LivHub)
8. Mobile layout (full screen chat)

### Success criteria:
- Chat works end-to-end (send message → stream response)
- Voice works (WebSocket proxy)
- Canvas renders artifacts
- All panels accessible
- Conversation persistence

### Status: pending

---

## Phase 08 — System Pages
**Goal:** All remaining system pages — notifications, server control, subagents, etc.
**Depends on:** Phase 03
**Estimated plans:** 2

### What to build:
1. Server control (restart/shutdown with confirmation)
2. Subagents management page
3. Schedules page
4. Notifications page/panel
5. Live usage dialog
6. What's New modal
7. Not Found (404) page

### Success criteria:
- All system pages render and function
- Server control triggers correct actions
- Notifications display correctly
- Usage stats shown accurately

### Status: pending

---

## Phase 09 — Polish & Testing
**Goal:** Visual polish, animation refinement, responsive testing, accessibility.
**Depends on:** Phase 01-08
**Estimated plans:** 2

### What to build:
1. Animation polish:
   - Page transitions (View Transitions API)
   - Component micro-animations
   - Loading states and skeletons
2. Responsive testing:
   - Mobile (375px, 414px)
   - Tablet (768px, 1024px)
   - Desktop (1280px, 1920px)
3. Accessibility audit:
   - Keyboard navigation
   - Screen reader labels
   - Focus management
   - Color contrast
4. Performance optimization:
   - Bundle analysis
   - Image optimization
   - Lazy loading
5. Error boundaries
6. Empty states
7. Dark/Light mode toggle (if scope allows)

### Success criteria:
- Lighthouse 90+ on all pages
- No accessibility violations (axe-core)
- All breakpoints look correct
- Animations smooth (60fps)
- Error states handled gracefully

### Status: pending

---

## Phase 10 — Integration & Deployment
**Goal:** Connect new UI to livinityd, switch Caddy, deploy to production.
**Depends on:** Phase 09
**Estimated plans:** 2

### What to build:
1. Build configuration:
   - `next.config.ts` for production
   - Static export or standalone mode
   - Environment variables
2. Livinityd integration:
   - Serve new UI from livinityd
   - WebSocket proxy for voice
   - tRPC proxy configuration
3. Caddy configuration (if needed)
4. PM2 / systemd setup
5. Smoke testing on server4
6. Switch traffic from old UI to new
7. Cleanup: remove old `ui` package (deferred)

### Success criteria:
- New UI accessible at livinity.cloud
- All features work in production
- Voice WebSocket works
- tRPC communication works
- No regressions from old UI
- Old UI preserved as backup

### Status: pending

---

## Summary

| Phase | Description | Plans | Status |
|-------|-------------|-------|--------|
| 01 | Scaffolding & Design System | 3 | pending |
| 02 | Auth & tRPC Integration | 2 | pending |
| 03 | Desktop Shell & Window Manager | 3 | pending |
| 04 | Settings | 3 | pending |
| 05 | App Store | 2 | pending |
| 06 | File Manager | 3 | pending |
| 07 | AI Chat Adaptation | 2 | pending |
| 08 | System Pages | 2 | pending |
| 09 | Polish & Testing | 2 | pending |
| 10 | Integration & Deployment | 2 | pending |
| **Total** | | **24** | |
