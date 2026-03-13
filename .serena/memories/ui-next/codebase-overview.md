# LivOS UI-Next Codebase Overview

## Project Structure

### Pages & Routes (`src/app/`)
- **Root Layout** (`layout.tsx`): Sets up metadata, fonts (Inter, JetBrains Mono), Toaster
- **Providers** (`providers.tsx`): TrpcProvider + AuthProvider
- **Login** (`login/page.tsx`): Password + 2FA login form (conditional 2FA step)
- **Onboarding**:
  - `page.tsx`: Welcome screen → Get Started button
  - `create-account/page.tsx`: Name + password (6+ chars) form
  - `account-created/page.tsx`: Success screen with 5s countdown to `/`
- **Desktop Layout** (`(desktop)/layout.tsx`): Authenticated wrapper with WallpaperProvider, WindowManagerProvider, AppsProvider
- **Desktop Page** (`(desktop)/page.tsx`): Main UI - greeting, command palette hint, Windows container, Dock, WallpaperPicker
- **Dev Page** (`dev/page.tsx`): Design system showcase (all UI components)
- **Error/Loading**: Custom error + loading screens

## Authentication System

**File**: `src/providers/auth.tsx`

**Auth Context Methods**:
- `login(password, totpToken?)` - calls `user.login` mutation
- `register(name, password)` - calls `user.register`, then auto-login
- `logout()` - calls `user.logout` mutation
- JWT stored in localStorage under key 'jwt'

**Auth States**:
- `isLoggedIn` - queried from `user.isLoggedIn`
- `userExists` - queried from `user.exists`
- Auto-cleanup: if JWT exists but `isLoggedIn === false`, JWT is removed and redirected to /login

**Auth Guards** (`src/providers/auth-guard.tsx`):
- `EnsureLoggedIn` - redirects to /onboarding or /login if not authenticated
- `EnsureLoggedOut` - redirects to / if already logged in
- `EnsureNoUser` - redirects to /login if user already exists

## Desktop Window System

**File**: `src/providers/window-manager.tsx`

**Window Types**:
```typescript
WindowState {
  id: WindowId (UUID)
  appId: string (e.g., 'LIVINITY_files')
  route: string (e.g., '/files/Home')
  position: { x, y }
  size: { width, height }
  zIndex: number
  isMinimized: boolean
  title: string
  icon: string
}
```

**Window Operations**:
- `openWindow(appId, route, title, icon)` - Creates window, centers it (with staggered offset)
- `closeWindow(id)` - Removes window
- `focusWindow(id)` - Brings to front (increments zIndex)
- `minimizeWindow(id) / restoreWindow(id)` - Minimization
- `updateWindowPosition(id, position)` - Drag support
- `updateWindowSize(id, size)` - Resize support

**Default Sizes**:
- App Store: 1500x750
- Files: 1000x1230
- Settings: 800x900
- AI Chat: 1300x850
- Server Control: 1000x700
- Others: 900x600 (min 400x400)

**Render Logic** (`src/components/desktop/window.tsx`):
- Spring physics animation (500 stiffness, 35 damping)
- 8 resize handles (n, s, e, w, ne, nw, se, sw)
- Title bar with minimize/close buttons
- Pointer capture for smooth drag & resize

## tRPC Setup

**Client** (`src/trpc/client.ts`):
- Single HTTP batch link to `/trpc`
- Authorization header: `Bearer {jwt}`
- JWT from localStorage

**Provider** (`src/trpc/provider.tsx`):
- QueryClient with 60s staleTime
- React tRPC hooks

## Component Architecture

### Core Desktop Components

**Dock** (`src/components/desktop/dock.tsx`):
- Two app groups (8 total apps)
- Group 1: Home, Files, Settings, Usage, App Store
- Group 2: AI Chat, Server, Agents, Schedules, Terminal
- Home button minimizes all windows
- Active indicator (dot under icon)
- Tooltip on hover

**Command Palette** (`src/components/desktop/command-palette.tsx`):
- Ctrl+K / Cmd+K to toggle
- Search by app name
- Arrow keys + Enter to navigate & open
- Backdrop click to close

**Window** (`src/components/desktop/window.tsx`):
- Draggable title bar
- 8-direction resizing
- Smooth spring animations
- Pointer capture for smooth interactions

**WindowContent Router** (`src/components/desktop/window-content.tsx`):
- Maps appId → lazy-loaded component
- Suspense + ErrorBoundary wrapper
- Full-height apps: ai-chat, terminal, settings, app-store, files, subagents, schedules, live-usage, server-control

### App Layouts

#### 1. **App Store** (`src/components/app-store/layout.tsx`)

**Views**: discover → category → detail

**Features**:
- Fetch registry via `appStore.registry` query
- Search + filter by category
- App cards with icon, name, tagline
- Detail view: hero, gallery, description, release notes, dependencies, info
- Install/Start/Stop/Uninstall buttons

**Mutations**:
- `apps.install({ appId })`
- `apps.uninstall({ appId })`
- `apps.start({ appId })`
- `apps.stop({ appId })`
- `apps.state({ appId })` polled every 2s during action

**States**: unknown, installing, updating, stopped, running, ready

#### 2. **AI Chat** (`src/components/ai-chat/layout.tsx`)

**Features**:
- Sidebar: conversation list with new + delete buttons
- Main chat: message bubbles (user blue, assistant gray)
- Markdown rendering for assistant messages
- Tool call expandable items
- Live status indicator (polling every 500ms during response)
- Auto-scroll to latest message

**Data Types**:
```typescript
Message {
  id, role ('user'|'assistant'), content, toolCalls[], timestamp
}
ToolCall {
  tool: string
  params: Record<string, unknown>
  result: { success: boolean, output: string }
}
```

**Mutations**:
- `ai.send({ conversationId, message })` - Returns message with id
- `ai.deleteConversation({ id })`
- `ai.listConversations()` - 10s refetch
- `ai.getConversation({ id })`
- `ai.getChatStatus({ conversationId })` - Polls during loading

#### 3. **File Manager** (`src/components/file-manager/layout.tsx`)

**Features**:
- Current path navigation with breadcrumb
- History (back/forward buttons)
- Grid + List view modes
- Multi-select with Ctrl/Cmd
- Copy/Cut/Paste clipboard
- Drag & drop upload
- Create folder
- Rename, delete
- File type icons (image, video, music, text, archive)
- Size formatting

**FileEntry**:
```typescript
{ name, type ('file'|'directory'), size?, modified? }
```

**Mutations**:
- `files.list({ path })` - Returns FileEntry[]
- `files.createDirectory({ path })`
- `files.delete({ path })`
- `files.copy({ path, toDirectory })`
- `files.move({ path, toDirectory })`
- `files.rename({ path, newName })`
- Upload via `/api/files/upload` (FormData + JWT)

#### 4. **Settings** (`src/components/settings/layout.tsx`)

**Layout**: Sidebar menu + content area

**Sections** (18 total):
1. Account - name, password
2. Theme - wallpaper picker, accent color
3. 2FA - enable/disable, QR, verify
4. AI Configuration - Claude CLI login/logout status
5. Nexus AI - agent behavior config
6. Integrations - Telegram, Discord tokens/webhooks
7. Gmail - OAuth connect/disconnect
8. DM Security - pairing allowlist, policies (telegram/discord)
9. Usage - token costs, daily breakdown chart
10. Webhooks - create/delete custom webhooks
11. Voice - push-to-talk settings
12. Domain & HTTPS - custom domain, SSL, DNS verification
13. Backups - backup/restore
14. Migration - transfer from Pi
15. Language - interface language
16. Troubleshoot - app logs, system logs
17. Advanced - DNS, release channel (stable/beta)
18. Software Update - check for updates

**User Mutations**:
- `user.changePassword({ oldPassword, newPassword })`
- `user.set({ name?, wallpaper? })` - Generic setter
- `user.enable2fa() / disable2fa() / verify2fa(code)` - 2FA
- `user.is2faEnabled()` - Query

**All Settings Queries**:
- `user.get()` - Current user info
- `user.wallpaper()` - Wallpaper ID
- `ai.*` - Claude, DM pairing, integrations, webhooks, voice, usage, etc.
- `system.*` - Version, DNS, release channel
- `domain.*` - Domain status, SSL, DNS verification, IP

#### 5. **System Components**

**Live Usage** (`src/components/system/live-usage.tsx`):
- Queries: `ai.getUsageOverview()`, `ai.getUsageDaily({ days })`
- Display: token usage, cost breakdown, daily chart

**Server Control** (`src/components/system/server-control.tsx`):
- Queries: `system.version()`, `system.uptime()`, `system.getIpAddresses()`
- Actions: Restart, Shutdown (with confirmation)
- TODO: `system.restart`, `system.shutdown` mutations

**Subagents** (`src/components/system/subagents.tsx`):
- Mutations: `ai.createSubagent()`, `updateSubagent()`, `deleteSubagent()`, `executeSubagent()`
- Query: `ai.listSubagents()`

**Schedules** (`src/components/system/schedules.tsx`):
- Mutations: `ai.addSchedule()`, `removeSchedule()`
- Queries: `ai.listSchedules()`, `ai.listSubagents()`

**Terminal** (`src/components/system/terminal.tsx`):
- Uses xterm.js + FitAddon
- Loads CSS dynamically
- WebSocket connection to terminal backend
- Dark theme with custom colors

## Wallpaper System

**File**: `src/providers/wallpaper.tsx`

**Features**:
- 21 preset wallpapers (JPG + thumb + HSL brand color)
- Dynamic brand color CSS vars set on `<html>`
- Lazy loading: thumb initially blurred, full-res fades in
- Vignette overlay

**Queries**: `user.wallpaper()` - returns wallpaper ID

**Wallpaper Picker Component** (`src/components/desktop/wallpaper-picker.tsx`):
- Grid of thumbnails
- Click to set wallpaper

## Apps Provider

**File**: `src/providers/apps.tsx`

**System Apps** (10 total):
```
LIVINITY_home, LIVINITY_files, LIVINITY_settings, LIVINITY_live-usage,
LIVINITY_app-store, LIVINITY_ai-chat, LIVINITY_server-control,
LIVINITY_subagents, LIVINITY_schedules, LIVINITY_terminal
```

**User Apps**: Dynamic list from `apps.list()` query
```typescript
{ id, name, icon (URL), port?, path?, state? }
```

**Dock Groups**:
- Group 1: home → app-store (5 apps)
- Group 2: ai-chat → terminal (5 apps)

## Complete tRPC Procedure List

### User Procedures
- `user.exists()` - Check if user account exists
- `user.isLoggedIn()` - Verify current session
- `user.login({ password, totpToken? })` - Returns JWT
- `user.register({ name, password })` - Create account
- `user.logout()` - Sign out
- `user.get()` - Current user info
- `user.set({ name?, wallpaper? })` - Update user
- `user.wallpaper()` - Get wallpaper ID
- `user.changePassword({ oldPassword, newPassword })`
- `user.enable2fa()`, `user.disable2fa()`
- `user.is2faEnabled()`
- `user.verify2fa({ code })`

### System Procedures
- `system.version()` - Returns { name, version }
- `system.uptime()` - Uptime in seconds/string
- `system.getIpAddresses()` - Returns IP array
- `system.getReleaseChannel()`
- `system.setReleaseChannel({ channel })`
- `system.isExternalDns()`
- `system.setExternalDns({ enabled })`
- `system.logs({ type: 'system'|'app' })`

### Files Procedures
- `files.list({ path })` - List directory
- `files.createDirectory({ path })`
- `files.delete({ path })`
- `files.copy({ path, toDirectory })`
- `files.move({ path, toDirectory })`
- `files.rename({ path, newName })`

### Apps Procedures
- `apps.list()` - User app list
- `apps.install({ appId })`
- `apps.uninstall({ appId })`
- `apps.start({ appId })`
- `apps.stop({ appId })`
- `apps.state({ appId })` - Returns state enum
- `apps.logs({ appId })` - App logs

### App Store Procedures
- `appStore.registry()` - All available apps

### AI Procedures
- `ai.send({ conversationId, message })` - Chat message
- `ai.listConversations()`
- `ai.getConversation({ id })`
- `ai.deleteConversation({ id })`
- `ai.getChatStatus({ conversationId })` - Live steps + tool info
- `ai.getClaudeCliStatus()` - Claude login status
- `ai.startClaudeLogin()` - Initiate login flow
- `ai.submitClaudeLoginCode({ code })`
- `ai.claudeLogout()`
- `ai.getIntegrationStatus({ channel })` - Telegram/Discord status
- `ai.getIntegrationConfig({ channel })`
- `ai.saveIntegrationConfig({ channel, config })`
- `ai.testIntegration({ channel })`
- `ai.getGmailStatus()`
- `ai.startGmailOauth()` - OAuth flow
- `ai.disconnectGmail()`
- `ai.getDmPairingPending()` - Pending requests
- `ai.getDmPairingAllowlist({ channel })`
- `ai.getDmPairingPolicy({ channel })`
- `ai.setDmPairingPolicy({ channel, policy })`
- `ai.approveDmPairing({ id })`
- `ai.denyDmPairing({ id })`
- `ai.removeDmPairingAllowlist({ channel, userId })`
- `ai.getUsageOverview()` - Total token usage
- `ai.getUsageDaily({ days })` - Daily breakdown
- `ai.getVoiceConfig()`
- `ai.updateVoiceConfig({ config })`
- `ai.getWebhooks()`
- `ai.createWebhook({ name, url })`
- `ai.deleteWebhook({ id })`
- `ai.getNexusConfig()`
- `ai.updateNexusConfig({ config })`
- `ai.resetNexusConfig()`
- `ai.listSubagents()`
- `ai.createSubagent({ name, prompt })`
- `ai.updateSubagent({ id, name, prompt })`
- `ai.deleteSubagent({ id })`
- `ai.executeSubagent({ id, task })`
- `ai.listSchedules()`
- `ai.addSchedule({ subagentId, schedule, task })`
- `ai.removeSchedule({ id })`

### Domain Procedures
- `domain.getStatus()` - Current domain setup
- `domain.getPublicIp()`
- `domain.setDomain({ domain })`
- `domain.verifyDns()`
- `domain.activate()`
- `domain.remove()`

## Known Issues & Incomplete Features

1. **Server Control**: Restart/Shutdown buttons are TODO - mutations not yet implemented
2. **Terminal**: WebSocket connection logic incomplete (only dynamic import + setup shown)
3. **Many Settings Sections**: Placeholders for future phases
4. **File Upload**: Using REST endpoint `/api/files/upload` instead of tRPC
5. **DragEvent Handling**: File manager drag & drop functional but basic

## Design System

**Colors**: CSS vars defined in globals.css
- `--color-brand` (primary)
- `--color-brand-dynamic` (wallpaper-based)
- `--color-text`, `--color-text-secondary`, `--color-text-tertiary`
- `--color-bg`, `--color-surface-1`, `--color-surface-2`
- `--color-success`, `--color-warning`, `--color-error`

**Z-Index Scale**:
- `--z-base` - Windows/content
- `--z-sticky` - Dock
- `--z-overlay` - Command palette backdrop
- `--z-modal` - Command palette

**Animations**: Framer Motion with spring physics

**Typography**: Inter (body) + JetBrains Mono (code/terminal)

## Component Exports

All UI components (Button, Input, Card, Badge, Dialog, Tabs, Switch, Tooltip, Avatar, Skeleton, etc.) exported from `src/components/ui/index.ts` - from shadcn/ui library.

