# OLD LivOS UI - Quick Reference & Checklist

A condensed reference for the old UI features and implementation details.

---

## MAIN SECTIONS (8 Major Features)

### 1. FILE MANAGER
**Path:** `/files/*`
**Components:** 50+ files
**Key Features:**
- Directory browsing, recents, search, apps, trash
- Upload/download, copy/paste, delete, rename
- File sharing with platform-specific instructions
- Rewind (version history with snapshots)
- Sidebar navigation (home, favorites, shares, external storage, network)
- Floating islands (upload, audio player, operations, formatting)
- File viewer (images, video, audio, PDF, text)
- Drag & drop support
- Mobile sidebar drawer

**Key Hooks:** useListDirectory, useSearchFiles, useFilesOperations, useNew Folder, useFavorites, useShares, useExternalStorage, useNetworkStorage, useRewind

**Store:** Zustand store (selection, rename, new folder, file viewer, drag-drop, clipboard, interaction)

---

### 2. APP STORE
**Path:** `/app-store/*`
**Components:** 30+ files
**Key Features:**
- Discover page with curated sections (hero, grid, carousel, 3-col)
- App page with details (about, info, release notes, settings, dependencies, recommendations)
- Public access sharing
- Install/uninstall with dependency selection
- Update management
- Environment variable configuration
- Default credentials display
- Community app store support

**Key Sections:** About, Info, Release Notes, Public Access, Settings, Dependencies, Recommendations

**Dialogs:** Install, Update, Settings, Default Credentials, Environment Overrides, Select Dependencies

---

### 3. BACKUPS
**Path:** `/settings/backups/*`
**Components:** 15+ files
**Key Features:**
- Setup wizard (configure storage location, scheduling, exclusions)
- Configure wizard (modify existing backup)
- Restore wizard (select snapshot, restore destination)
- Floating island with progress
- Auto-excluded app paths
- Custom exclusion patterns

**Wizards:** Setup, Configure, Restore (split dialog layout)

---

### 4. SETTINGS
**Path:** `/settings/*`
**Components:** 40+ files
**Key Features:**

**Account:**
- Change name
- Change password
- 2FA (enable/disable with QR code)

**System:**
- Device info (CPU, RAM, disk, model, OS version)
- Usage dashboard (CPU, memory, disk, temperature charts)
- Software update (check, update, progress)
- Restart/Shutdown server
- Factory reset (multi-step with password confirmation)

**Network:**
- WiFi (scan, connect, forget)
- Domain setup
- Device Manager pairing

**AI & Integration:**
- AI config (Anthropic, Gemini keys, Claude CLI)
- Nexus config (retry, timeout, health checks, logging)
- Integrations (Discord, Slack, Matrix, Telegram webhooks)

**Other:**
- Language selection (20+ languages)
- Wallpaper picker
- Troubleshoot (system + app logs)
- Terminal (LivOS + app-specific)
- Advanced options
- Voice settings
- Gmail integration
- Webhooks
- App store preferences

---

### 5. AI CHAT
**Path:** `/ai-chat/` (window-only)
**Components:** 10+ files
**Key Features:**
- Conversation history with timestamps
- User messages (right, blue)
- AI responses (left, dark, markdown)
- Tool call display with expandable params/output
- MCP tools panel
- Skills panel
- Voice input button
- Live Canvas iframe
- Delete conversation
- New conversation
- Elapsed time counter

**Panels:** MCP, Skills, Canvas, Voice (all lazy-loaded)

---

### 6. SUBAGENTS
**Path:** `/subagents/` (window-only)
**Components:** 2-3 files
**Key Features:**
- List subagents
- Create with form (name, id, description, system prompt, model tier, max turns, cron schedule, task)
- Edit subagent
- Delete with confirmation
- Execute/run
- Cron scheduling with timezone
- Status display

---

### 7. SCHEDULES
**Path:** `/schedules/` (window-only)
**Components:** 1 file
**Key Features:**
- List scheduled jobs
- Show next run time
- Cron expression display
- Timezone display
- Remove schedule with confirmation
- Auto-refresh (10s polling)
- Empty state message

---

### 8. SERVER CONTROL
**Path:** `/server-control/` (window-only)
**Components:** 1-2 files
**Key Features:**
- Resource cards (CPU, Memory, Disk, Temperature)
- Real-time charts with area graphs
- Animated cards with hover state
- Progress bars
- System metrics monitoring

---

## DESKTOP & WINDOW SYSTEM

### Desktop
**Components:** 15+ files
**Features:**
- Full-screen wallpaper (parallax)
- App grid with pagination
- Dock at bottom (50px icons, 80px zoom, spring animation)
- Right-click context menu
- Greeting message
- Header with system info

**Dock Items (order left to right):**
1. Home
2. Files
3. App Store
4. Settings
5. Terminal
6. Server Control
7. AI Chat
8. Subagents
9. Schedules
10. Logout (right)

### Window System
**Features:**
- Draggable windows (move with header)
- Resizable (8 directions: n, s, e, w, ne, nw, se, sw)
- Minimum size 400x400
- Z-index management (focus)
- Keep-on-screen bounds
- Window chrome (title pill + close button)
- Smooth animations

---

## AUTH & ONBOARDING

### Login
**Path:** `/login`
**Steps:** Password → 2FA (6-digit code)

### Onboarding
**Path:** `/onboarding/*`
**Steps:** Welcome (language select) → Create Account → Account Created
**Alternative:** Restore from existing backup

### Factory Reset
**Path:** `/factory-reset/*`
**Steps:** Review Data → Confirm with Password → Success

---

## ROUTES SUMMARY

**Protected Routes (EnsureLoggedIn):**
- `/` (Desktop)
- `/files/*` (File Manager)
- `/settings/*` (Settings)
- `/app-store/*` (App Store)
- `/community-app-store/*` (Community Store)

**Window Routes (opened as floating windows):**
- `/ai-chat`
- `/server-control`
- `/subagents`
- `/schedules`
- Terminal

**Bare Routes (EnsureUserExists, no login):**
- `/login`
- `/onboarding/*`

**Bare Routes (EnsureUserDoesntExist):**
- `/onboarding`
- `/onboarding/restore`
- `/onboarding/create-account`

**Public Routes:**
- `/factory-reset/*`
- `/404`
- `/notifications`
- `/live-usage`
- `/whats-new-modal`

---

## UI COMPONENTS (40+ Core)

**Custom Components:**
Alert, AnimatedNumber, Arc, ButtonLink, Card, CopyButton, CopyableField, CoverMessage, DebugOnly, DialogCloseButton, ErrorBoundary (3x), FadeInImg, GenericErrorText, Icon, IconButton, IconButtonLink, ImmersiveDialog, List, Loading, NotificationBadge, NumberedList, PinInput, SegmentedControl, StepIndicator, Toast, WindowAwareLink

**shadcn/ui Components (25+):**
AlertDialog, Alert, Badge, Button, Carousel, Checkbox, Command, ContextMenu, Dialog, Drawer, DropdownMenu, Form, Input, Label, Pagination, Popover, Progress, RadioGroup, ScrollArea, Select, Separator, Sheet, Switch, Table, Tabs, Tooltip

---

## STATE MANAGEMENT

**Zustand Stores:**
- Files store (6 slices):
  - clipboardSlice (copy/paste)
  - dragAndDropSlice (D&D state)
  - fileViewerSlice (preview)
  - interactionSlice (hover, etc.)
  - newFolderSlice (create folder)
  - renameSlice (rename editing)
  - selectionSlice (selected items)

**Context Providers:**
- AuthBootstrap
- AvailableApps
- Apps
- WindowManager
- Language
- Wallpaper
- GlobalSystemState
- Confirmation
- FilesCapabilities
- WindowRouter

---

## KEY HOOKS (60+)

**Files Hooks:**
useListDirectory, useListRecents, useSearchFiles, useFilesOperations, useNewFolder, useNavigate, useItemClick, useRewind, useRewindAction, useDragAndDrop, useExternalStorage, useNetworkStorage, useShares, useFavorites, usePreferences, useIsFilesReadOnly

**System Hooks:**
useCpuForUi, useMemoryForUi, useDiskForUi, useCpuTemperature, useDeviceInfo, useVersion, useSoftwareUpdate, useTorEnabled, useTemperatureUnit, useLanguage, useUserName, use2fa, usePassword

**App/Window Hooks:**
useApps, useAvailableApps, useAppInstall, useAppsWithUpdates, useLaunchApp, useUpdateAllApps, useWindowManager, useWindowRouter

**UI/Input Hooks:**
useIsMobile, useLocalStorage2, useQueryParams, useScrollRestoration, useDebugInstallRandomApps, useIsLivinityHome, useIsExternalDns, useDemoProgress, useAutoHeightAnimation, useColorThief

**Notifications:**
useNotifications

---

## KEY UTILITIES

**Files:**
- formatFilesystemSize (e.g., "1.5 MB")
- formatFilesystemDate (locale date)
- formatFilesystemName (sanitize)
- sortFilesystemItems (by name/size/date)
- pathAlias (convert to ~, /Apps, etc.)
- getItemKey (unique id)
- isDirectoryANetworkDeviceOrShare
- isDirectoryAnExternalDrivePartition
- isDirectoryALivinityBackup

**General:**
- cn (conditional className)
- tw (Tailwind helper)
- prettyBytes (file size)
- secondsToEta (time formatting)
- dateTime (date utilities)
- search (text search)
- i18n/t (translations)
- transitionViewIfSupported (view transitions API)

---

## tRPC ENDPOINTS USED

**User:** login, logout, getConfig, setName, setPassword, enable2fa, disable2fa

**Files:** list, listRecents, search, createFolder, rename, copy, move, delete, deletePermanently, share, unshare, upload

**Apps:** list, getConfig, install, uninstall, start, stop, restart, getLogs, setEnvironment, getPublicUrl

**AI:** getChatStatus, listConversations, getConversation, send (streaming), deleteConversation, listSubagents, createSubagent, deleteSubagent, executeSubagent, listSchedules, removeSchedule, getConfig, setConfig, getClaudeCliStatus

**System:** getInfo, getCpu, getMemory, getDisk, getTemperature, getVersion, checkUpdates, update, restart, shutdown, factoryReset

**Backups:** list, getConfig, setConfig, getSnapshots, restore, getStatus

**Registry:** listApps, getDiscover

**Notifications:** list

**WiFi:** list, connect

---

## STYLING APPROACH

- **Tailwind CSS 3.4** - Primary styling
- **Custom CSS** - Specific animations
- **Framer Motion** - Complex animations
- **CSS Gradients** - Visual effects
- **Backdrop Blur** - Modern glassmorphism

**Colors:**
- Brand/Primary (main accent)
- Destructive (red for delete)
- Surface colors (0, 1, 2, 3 - backgrounds)
- Text colors (primary, secondary, tertiary)
- Border colors (default, emphasis)

---

## PERFORMANCE FEATURES

1. Code splitting (React.lazy)
2. Suspense boundaries for progressive loading
3. Virtual scrolling for large lists
4. Memoization of components
5. Lazy image loading
6. tRPC caching
7. Debounced search/resize
8. Pagination (apps)
9. Streaming AI responses
10. Web workers (potential)

---

## ACCESSIBILITY

- Semantic HTML
- ARIA labels and roles
- Keyboard navigation (Tab, Enter, Escape)
- Focus management
- Screen reader support
- High contrast support
- Color-blind friendly

---

## INTERNATIONALIZATION

**20+ Supported Languages:**
English, Spanish, French, German, Italian, Portuguese, Dutch, Russian, Japanese, Chinese (S&T), Korean, Arabic, Hebrew, Hindi, Thai, Vietnamese, Indonesian, Polish, Turkish, Greek, Swedish, Norwegian, Danish, Finnish, etc.

**Translation Key Structure:**
- onboarding.*
- login.*
- login-2fa.*
- settings.*
- files.*
- app-store.*
- backups.*
- And 100+ more keys

---

## EXTERNAL DEPENDENCIES

**Core:**
React 18, React Router v6, tRPC, React Query, TypeScript

**Styling:**
Tailwind CSS 3.4, Framer Motion, PostCSS

**Components:**
shadcn/ui, Tabler Icons React, Recharts

**State:**
Zustand, Context API

**Utilities:**
date-fns, react-markdown, react-json-tree, xterm.js

**Build:**
Vite, ESLint, Prettier

**Testing:**
Playwright

---

## FILE STRUCTURE SUMMARY

```
livos/packages/ui/src/
├── routes/          (Main route pages)
├── modules/         (Feature modules: desktop, app-store, etc.)
├── features/        (Complex features: files, backups)
├── layouts/         (Layout wrappers)
├── components/      (Reusable components)
├── shadcn-components/ (shadcn/ui library)
├── providers/       (Context providers)
├── hooks/           (Custom hooks)
├── utils/           (Utility functions)
├── trpc/            (tRPC client)
├── store/           (Zustand stores)
├── constants/       (App constants)
├── types.d.ts       (Type definitions)
└── main.tsx         (Entry point)
```

---

## IMPLEMENTATION NOTES

1. **Routes as Windows** - AI Chat, Server Control, Subagents, Schedules open as floating windows, NOT as sheet routes
2. **Settings Routes** - Mostly dialogs/drawers, not full-page routes (except new pages: nexus-config, ai-config, integrations, domain-setup, dm-pairing)
3. **Two Layouts** - Desktop (full-screen) and Sheet (side panel) layouts
4. **Files Store** - Heavy use of Zustand for file operations state
5. **Streaming Chat** - AI responses stream in real-time
6. **Tool Display** - Tool calls are expandable with params and output
7. **Drag & Drop** - Full support in files, windows
8. **Mobile Responsive** - Separate layouts for mobile/tablet/desktop
9. **Error Boundaries** - Multiple levels (page, card, component)
10. **Suspense Loading** - Progressive loading with fallbacks

---

## QUICK CHECKLIST FOR NEW UI

- [ ] All 50+ routes replicated
- [ ] All 40+ core components created or adapted
- [ ] File manager with all views and operations
- [ ] App store with discover, categories, and detail pages
- [ ] Backups setup/configure/restore wizards
- [ ] Settings pages (all 20+ options)
- [ ] AI chat with streaming, tool calls, panels
- [ ] Subagents management
- [ ] Schedules display
- [ ] Server control monitoring
- [ ] Desktop layout with dock
- [ ] Window system (draggable, resizable)
- [ ] Authentication and onboarding
- [ ] Zustand store for files
- [ ] All context providers
- [ ] All custom hooks
- [ ] i18n with 20+ languages
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Error boundaries and error handling
- [ ] Accessibility features
- [ ] Performance optimizations

---

This quick reference covers the entire old UI in condensed format. Use the detailed documents for implementation specifics.
