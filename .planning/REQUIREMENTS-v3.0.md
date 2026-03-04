# v3.0 Requirements — LivOS UI Rewrite (Next.js 16)

## Goal

Completely rewrite the LivOS web UI from scratch using Next.js 16 (App Router) + Tailwind CSS 4 + Motion Primitives. The new UI must have **zero visual resemblance to Umbrel**. Design language: **Modern Minimal (Apple-vari)** — clean, spacious, elegant animations, subtle glassmorphism.

## Constraints

- **New package**: `livos/packages/ui-next` (existing `ui` untouched until switchover)
- **AI Chat**: Adapt existing functionality to new design system (not full rewrite)
- **Backend unchanged**: Same livinityd tRPC API, same nexus-core API
- **Auth unchanged**: Same JWT flow, same `/data/secrets/jwt`
- **No Umbrel DNA**: Every screen, component, and interaction must be original

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 16 (App Router, Turbopack) |
| React | React | 19.2 |
| Styling | Tailwind CSS | 4.2+ (CSS-first config) |
| Animations | Motion Primitives + Framer Motion | Latest |
| UI Kit | Custom (inspired by Motion Primitives) | — |
| State | Zustand (files) + React Context (desktop) + TanStack Query | — |
| API | tRPC client (client-side only) | — |
| i18n | next-intl or i18next (TBD) | — |
| Icons | Lucide React | Latest |

## Design Language

### Philosophy
- **Space**: Generous whitespace, content breathes
- **Motion**: Purposeful micro-animations (not gratuitous)
- **Typography**: Clean hierarchy, system font stack + Inter
- **Color**: Muted palette with vibrant accents, dark mode primary
- **Depth**: Subtle shadows and blur, not heavy glassmorphism
- **Touch**: Large hit targets, gesture-friendly

### Color System (Dark Mode Primary)
- Background: Deep neutral (zinc-950 / neutral-950)
- Surface: Layered cards with subtle transparency
- Text: High contrast white/gray hierarchy
- Accent: Single brand color (configurable)
- Semantic: Success/warning/error/info tokens

### Typography Scale
- Display: 36-48px, bold
- Heading: 20-28px, semibold
- Body: 14-16px, regular
- Caption: 12px, medium
- Mono: JetBrains Mono for code/terminal

## Screens to Build

### 1. Auth Flows
- [ ] Login page (minimal, centered card)
- [ ] Onboarding start
- [ ] Create account
- [ ] Account created
- [ ] Restore from backup
- [ ] Factory reset

### 2. Desktop Shell
- [ ] Desktop viewport (wallpaper, floating windows)
- [ ] Dock (bottom bar, **NOT macOS magnification clone**)
- [ ] Window Manager (open/close/minimize/resize/focus)
- [ ] Desktop context menu
- [ ] Command Palette (Cmd+K)
- [ ] Notification center

### 3. Settings
- [ ] Settings layout (sidebar + content area)
- [ ] Account (name, password, 2FA)
- [ ] AI Configuration (Claude subscription)
- [ ] Voice settings
- [ ] App Store preferences
- [ ] Device info
- [ ] Software update
- [ ] Domain setup
- [ ] Integrations (Telegram, Discord)
- [ ] Gmail setup
- [ ] Webhooks
- [ ] DM Pairing
- [ ] Usage dashboard
- [ ] Nexus config (MCP, skills, memory)
- [ ] Advanced / Troubleshoot
- [ ] Restart / Shutdown
- [ ] Terminal

### 4. App Store
- [ ] Discover page (featured, categories, grid)
- [ ] Category page
- [ ] App detail page (info, screenshots, install)
- [ ] Community app stores
- [ ] Update all dialog

### 5. File Manager
- [ ] File browser (grid/list view)
- [ ] Breadcrumb navigation
- [ ] Upload (drag & drop, progress)
- [ ] Download
- [ ] Multi-select, cut/copy/paste
- [ ] File viewer (images, video, text, PDF)
- [ ] New folder, rename, delete
- [ ] Recents, favorites

### 6. AI Chat (Adapt)
- [ ] Conversation list sidebar
- [ ] Chat message display (markdown, tool calls)
- [ ] Input area
- [ ] Voice button (push-to-talk)
- [ ] Canvas panel (split view)
- [ ] MCP panel
- [ ] Skills panel
- [ ] Live steps display

### 7. System Pages
- [ ] Server control (restart, shutdown)
- [ ] Subagents management
- [ ] Schedules
- [ ] Notifications
- [ ] Live usage dialog
- [ ] What's New modal
- [ ] Terminal (xterm.js)

## Non-Functional Requirements

- **Performance**: Lighthouse score 90+ on all pages
- **Accessibility**: WCAG 2.1 AA compliant
- **Responsive**: Desktop-first, mobile-adaptive
- **Bundle size**: < 500KB initial JS (gzipped)
- **Load time**: < 2s on 4G (excluding backend)

## Out of Scope

- Backend changes (livinityd, nexus-core)
- New features not in current UI
- Native mobile app
- SSR for authenticated pages (client-side auth stays)
- i18n migration (keep existing approach initially)
