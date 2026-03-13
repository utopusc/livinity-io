# Milestones

## Completed

### v1.0 — Open Source Foundation
**Completed:** 2026-02-05
**Phases:** 1-10 (21 plans)
**Summary:** Config system, security foundation, AI exports/migration, configurability, TypeScript quality, security hardening, documentation, installer script.

### v1.1 — UI Redesign
**Completed:** 2026-02-06
**Phases:** 1-3 (6 plans)
**Summary:** Complete UI redesign with semantic design tokens, responsive mobile, AI chat with conversation sidebar.

### v1.2 — Visual Impact
**Completed:** 2026-02-07
**Phases:** 1-3 (6 plans)
**Summary:** Token value updates, component visual fixes, design enhancements.

### v1.3 — Browser App
**Completed:** 2026-02-10
**Phases:** 1-3 (5 plans)
**Summary:** Docker-based Chromium, App Store integration, Playwright MCP, proxy/anti-detection.

### v1.5 — Claude Migration & AI Platform
**Completed:** 2026-02-15
**Phases:** 1-5 (18 plans)
**Summary:** Multi-provider AI (Claude primary, Gemini fallback), native tool calling, hybrid memory, Slack/Matrix channels, WebSocket gateway, HITL approval, skill marketplace, parallel execution.

**Last phase number:** 5 (v1.5)

### v2.0 — OpenClaw-Class AI Platform
**Completed:** 2026-02-21
**Phases:** 1-6 (23 plans)
**Summary:** Voice interaction (Cartesia/Deepgram), Live Canvas, multi-agent sessions, LivHub, webhooks, Gmail, chat commands, DM security, onboarding CLI, session compaction, usage tracking, stability fixes.

**Last phase number:** 6 (v2.0)

### v3.0 — Next.js 16 UI Rewrite
**Completed:** 2026-03-04
**Phases:** 1-10
**Summary:** Complete UI rewrite using Next.js 16 + Tailwind 4 + Motion Primitives. Reverted back to Vite/React in v4.0.

**Last phase number:** 10 (v3.0)

### v4.0 — UI Polish, Fixes & Motion Primitives
**Completed:** 2026-03-04
**Phases:** 01-10 (10 phases)
**Summary:** Design system + motion-primitives install, App Store fix + redesign, auth pages polish, desktop + dock + windows, AI chat light theme, file manager, settings, system pages, skeletons, final deploy. 99 files changed. Deployed to livinity.cloud. Reverted from Next.js back to Vite/React.

**Last phase number:** 10 (v4.0)

### v5.0/v5.2 — Light Theme & UI Overhaul
**Completed:** 2026-03-07
**Phases:** v5.0 (10 phases) + v5.2 (1 phase, 6 plans)
**Summary:** Complete light theme redesign with semantic tokens, motion-primitives integration (Tilt, Spotlight, Magnetic, AnimatedBackground, BorderTrail). Files A-to-Z redesign (sidebar, toolbar, grid/list items). App Store redesign. Settings routing fix. Window chrome fix. Tabler Icons throughout.

**Last phase number:** 10 (v5.0) + v5.2

### v5.3 — UI Polish & Consistency + Apple Spotlight + Strategic Research
**Completed:** 2026-03-07
**Phases:** 4 phases (files polish, dashboard, visual consistency, performance)
**Summary:** Files path bar, empty states, loading skeletons. Dashboard Tilt/Spotlight effects. Visual consistency audit (borders, menus, shadows). Terminal dark theme fix. Apple Spotlight search integration (replaced cmdk). Desktop search button redesign. Comprehensive strategic research (8 reports, ~270KB) covering competitive analysis, product strategy, UX trends, feature roadmap, go-to-market, priority matrix.

**Last phase number:** 4 (v5.3)

**Strategic research output:** `.planning/research/strategic/` (SYNTHESIS.md for overview)

## Completed (cont.)

### v6.0 — Claude Code → Kimi Code Migration
**Completed:** 2026-03-09
**Phases:** 1-4 (8 plans, 29 requirements)
**Summary:** Complete migration from Claude Code to Kimi Code. KimiProvider (603 lines, OpenAI-compatible API), KimiAgentRunner (497 lines, CLI print mode + MCP bridging), Express/tRPC routes, Settings UI, onboarding wizard. Deleted ClaudeProvider, GeminiProvider, SdkAgentRunner. Removed @anthropic-ai/sdk, @anthropic-ai/claude-agent-sdk, @google/generative-ai. Zero Claude/Anthropic references in active source.

**Last phase number:** 4 (v6.0)

### v7.0 — Multi-User Foundation
**Completed:** 2026-03-13
**Phases:** 1-5 (planned), implemented across sessions
**Summary:** PostgreSQL migration, users/sessions/preferences tables, JWT with userId/role, login screen with avatars, invite system, user management, per-user file isolation, AI conversation isolation, app visibility/sharing, accent color picker, wallpaper selection per-user. Foundation for multi-user platform.

**Last phase number:** 5 (v7.0)

## Active

### v7.1 — Per-User Isolation Completion
**Started:** 2026-03-13
**Phases:** 6-8 (3 phases, 15 requirements)
**Goal:** Complete per-user isolation: wallpaper animation settings, integration configs (Telegram/Discord/Gmail/MCP/Voice), onboarding personalization, App Store per-user visibility.
