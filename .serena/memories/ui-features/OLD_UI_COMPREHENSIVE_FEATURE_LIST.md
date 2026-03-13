# OLD LivOS UI - Comprehensive Feature List

This document catalogs every route, page, component, and feature in the OLD UI codebase (livos/packages/ui/) to understand what needs to be replicated in the new UI.

---

## ROUTES & PAGES (from router.tsx)

### Main Routes (Protected - require login)
- **`/`** - Desktop/Home (EnsureLoggedIn wrapper)
- **`/files/*`** - File Manager (sub-routes below)
- **`/settings/*`** - Settings (sub-routes below)
- **`/app-store`** - App Store Discover page
- **`/app-store/category/:category`** - App Store Category page
- **`/app-store/:appId`** - App Store Individual App page
- **`/community-app-store`** - Community App Store
- **`/community-app-store/:appStoreId/:appId`** - Community App Store App page

### Files Sub-routes
- **`/files/:path`** - Directory Listing (wildcard route)
- **`/files/Recents`** - Recent Files
- **`/files/Search`** - File Search
- **`/files/Apps`** - Apps Data Directory
- **`/files/Trash/*`** - Trash/Deleted Files

### Settings Sub-routes (Dialog/Popup based)
- **`/settings/2fa`** - Two-Factor Authentication
- **`/settings/device-info`** - Device Information
- **`/settings/account/:accountTab`** - Account Settings Drawer
  - `/account/change-name`
  - `/account/change-password`
- **`/settings/wifi`** - WiFi Configuration
- **`/settings/wifi-unsupported`** - WiFi Not Available
- **`/settings/backups`** - Backups (mobile drawer)
- **`/settings/backups/*`** - Backups/Restore Wizards (desktop dialog)
  - `/backups/setup` - Setup Wizard
  - `/backups/configure` - Configure Wizard
  - `/backups/restore` - Restore Wizard
- **`/settings/migration-assistant`** - Migration Wizard
- **`/settings/language`** - Language Selection
- **`/settings/troubleshoot/*`** - Troubleshoot
- **`/settings/terminal/*`** - Terminal Access
- **`/settings/software-update`** - Software Update
- **`/settings/software-update/confirm`** - Update Confirmation
- **`/settings/advanced/:advancedSelection`** - Advanced Settings
- **`/settings/nexus-config`** - Nexus Configuration (NEW PAGE)
- **`/settings/ai-config`** - AI Model Configuration (NEW PAGE)
- **`/settings/integrations`** - Integration Settings (NEW PAGE)
- **`/settings/domain-setup`** - Domain Setup (NEW PAGE)
- **`/settings/dm-pairing`** - Device Manager Pairing (NEW PAGE)

### Auth Routes (Bare layout - no login required)
- **`/login`** - Login Page
  - Two-step: Password → 2FA Code
- **`/onboarding`** - Onboarding Start
- **`/onboarding/create-account`** - Create Account
- **`/onboarding/account-created`** - Account Created Confirmation
- **`/onboarding/restore`** - Restore from Backup
- **`/factory-reset/*`** - Factory Reset
  - `/factory-reset/confirm` - Confirm with Password
  - `/factory-reset/success` - Success Page

### Window-Only Routes (NOT in router - opened as draggable windows)
- **AI Chat** - `/ai-chat` (opens as window)
- **Server Control** - `/server-control` (opens as window)
- **Subagents** - `/subagents` (opens as window)
- **Schedules** - `/schedules` (opens as window)
- **Terminal** - Opens as window with LivOS or App tabs

### Other Routes
- **`/notifications`** - Toast/Alert notifications
- **`/live-usage`** - Live system usage stats
- **`/whats-new-modal`** - Changelog/What's New
- **`/404`** - Not Found page

---

## CORE FEATURES BY SECTION

### 1. FILE MANAGER (`/features/files/`)

#### Main Views
- **Directory Listing** - Browse folders and files
- **Recents** - Recently accessed files
- **Search** - Full-text file search
- **Apps** - App data directory
- **Trash** - Deleted/Trashed files

#### File Operations
- **Create/Upload**
  - New folder creation
  - File upload (drag & drop + input)
  - Bulk upload
  
- **File Editing**
  - Rename files/folders
  - Editable name input with validation
  
- **File Selection**
  - Single/multiple selection
  - Marquee selection (drag to select multiple)
  - Select all functionality
  
- **File Actions (Context Menu)**
  - Copy/Paste
  - Cut
  - Delete/Permanently Delete
  - Rename
  - Share (with platform-specific instructions)
  - Download
  - Open in new window
  
- **File Viewer**
  - Images (with zoom, pan, rotation)
  - Videos (HLS streaming support)
  - Audio (with equalizer, visualizer)
  - PDFs (with page navigation)
  - Text files
  - Download fallback

#### Sidebar Navigation
- Home
- Recents
- Favorites (bookmarked folders)
- Shares (shared with me)
- Apps (installed apps data)
- Trash
- External Storage (USB drives, external HDDs)
- Network Shares (SMB, NFS, AFP)

#### Advanced Features
- **File Sharing**
  - Share with public link
  - Platform-specific instructions (Windows, macOS, iOS, LivOS)
  - Share toggle enable/disable
  
- **Rewind/Version History**
  - Snapshot carousel (browse past versions)
  - Timeline bar (navigate to specific date)
  - Pre-restore dialog
  - Restore progress tracking
  - Date-labeled snapshots
  
- **Preferences**
  - View toggle (grid vs list)
  - Sort options (name, size, date modified)
  - Layout preferences stored
  
- **External Storage**
  - Detection of external drives
  - Format drive dialog
  - Unsupported storage warning
  
- **Network Shares**
  - Add SMB/NFS/AFP shares
  - Network share browser
  - Device type detection
  
- **Floating Islands**
  - Upload progress island (minimized/expanded)
  - Audio player island (with equalizer)
  - File operations island (copy, paste, move)
  - Formatting operations island

---

### 2. APP STORE (`/routes/app-store/` & `/modules/app-store/`)

#### Main Pages
- **Discover** - Curated app showcase with sections:
  - Featured hero apps
  - Grid sections (multiple apps)
  - Horizontal carousel sections
  - Three-column sections
  - Gallery/banner carousel
  
- **Category Page** - Browse apps by category
  
- **Individual App Page** - Full app details with:
  - About section (description, screenshots, features)
  - Info section (version, author, category, size, port)
  - Release notes/changelog
  - Public access settings (enable public link)
  - App settings (environment variables, custom config)
  - Dependencies (shows required apps)
  - Recommendations (suggested companion apps)
  - Default credentials dialog
  - Settings dialog (for installed apps)

#### Community App Store
- Browse community-created apps
- Same structure as official app store
- Community badge to distinguish apps

#### App Installation
- Install button (with loading state)
- Select dependencies dialog (if app has dependencies)
- Install progress tracking
- Environment overrides dialog
- OS version requirement checks

#### App Management (within app store)
- Update button + update dialog
- Uninstall confirmation
- Public access toggle + URL sharing
- Custom environment variables
- Default credentials display

---

### 3. BACKUPS (`/features/backups/`)

#### Backup Wizards
- **Setup Wizard** - Initial backup configuration
  - Storage location selection (Livinity Private Cloud, NAS, S3, etc.)
  - Backup scheduling
  - Exclusions management
  
- **Configure Wizard** - Modify existing backup
  - Change backup locations
  - Manage exclusions
  - App-specific ignore paths
  
- **Restore Wizard** - Restore from backup
  - Snapshot selection
  - Restore location selection
  - Restore progress tracking

#### Features
- Backup device detection
- Auto-excluded app paths
- Custom backup ignore patterns
- Location dropdowns with icons
- Backup status cards
- Tab switcher (Setup/Configure/Restore)

---

### 4. SETTINGS (`/routes/settings/`)

#### Account Settings
- **Change Name** - Update device/user name
- **Change Password** - Update login password
- **Two-Factor Authentication (2FA)**
  - Enable 2FA
  - Disable 2FA
  - Display secret key
  - QR code

#### System Information
- **Device Info**
  - System specs (CPU, RAM, storage)
  - OS version
  - Build info
  - Device model (if Livinity Home)
  
- **Usage Dashboard**
  - CPU usage chart
  - Memory usage chart
  - Disk usage chart
  - Temperature monitoring
  - Real-time stats
  
- **CPU Card** - CPU frequency, cores, usage
- **Memory Card** - RAM usage and breakdown
- **Storage Card** - Disk usage by partition
- **CPU Temperature Card** - Core temperatures with unit toggle

#### Network & Connectivity
- **WiFi Settings**
  - Scan available networks
  - Connect to WiFi
  - Forget networks
  - WiFi unsupported warning (for servers)
  
- **Domain Setup**
  - Custom domain configuration
  - DNS setup guidance
  - SSL certificate management
  
- **DM Pairing** - Device Manager pairing

#### Software & Updates
- **Software Update**
  - Check for updates
  - Update confirmation
  - Update progress
  - Auto-update toggle
  
- **Wallpaper Selection**
  - Multiple wallpaper options
  - Preview before applying

#### AI & Integrations
- **AI Configuration** (`ai-config`)
  - Anthropic API key setup
  - Gemini API key setup
  - Claude CLI status/login
  - Model selection
  
- **Nexus Configuration** (`nexus-config`)
  - Retry policy settings
  - Timeout configuration
  - Worker settings
  - Health check endpoints
  - Message/task logging
  - Heartbeat configuration
  
- **Integrations** (`integrations`)
  - Discord integration
  - Slack integration
  - Matrix integration
  - Telegram integration
  - Channel status per platform
  - Connection indicators

#### System Control
- **Restart Server** - Confirm + restart dialog
- **Shutdown Server** - Confirm + shutdown dialog
- **Factory Reset** - Multi-step reset wizard

#### Other Settings
- **Language** - Language selection (20+ languages)
- **Troubleshoot**
  - App terminal logs
  - LivOS system logs
  - Log viewer with search
  
- **Terminal**
  - LivOS shell access
  - App-specific shell access
  - Command execution
  
- **Advanced Settings**
  - Various debug options
  - Hidden configuration options
  
- **Backups** - Full backup/restore management
- **Migration Assistant** - Migrate from existing system
- **Voice Settings** - Voice/audio configuration
- **Gmail Integration** - Gmail account setup
- **Webhooks** - Webhook configuration for external integrations
- **App Store Preferences** - How apps are displayed/discovered

---

### 5. AI CHAT (`/routes/ai-chat/`)

#### Main Interface
- Chat message history
- User messages (right-aligned, blue/brand colored)
- AI responses (left-aligned, dark background with border)
- Markdown rendering in responses
- Time-based message grouping

#### Tool Calls Display
- Tool call cards showing:
  - Tool name (stripped of mcp__ prefix)
  - Success/failure status
  - Expandable params section
  - Expandable output section
  - Result JSON display
  - Output truncation (2000 chars)

#### Panels
- **MCP Panel** (lazy loaded) - Show available MCPs/tools
- **Skills Panel** (lazy loaded) - Show available skills
- **Canvas Panel** (lazy loaded) - Live Canvas iframe
- **Voice Button** (lazy loaded) - Voice input

#### Features
- Conversation history
- Delete conversation
- New conversation
- Elapsed time counter (while AI is running)
- Tool call status indicators
- Response streaming
- Error handling
- Mobile drawer layout

---

### 6. SUBAGENTS (`/routes/subagents/`)

#### Subagent Management
- **List Subagents** - Table/card view of all subagents
- **Create Subagent Form**
  - Name
  - ID (auto-generated or custom)
  - Description
  - System prompt
  - Model tier selection (Flash, Sonnet, Opus)
  - Max turns
  - Cron schedule (optional)
  - Scheduled task (optional)
  
- **Edit Subagent** - Modify subagent config
- **Delete Subagent** - With confirmation
- **Run/Execute Subagent** - Manual execution
- **Subagent Status** - Running, idle, etc.

#### Scheduling
- Cron expression support
- Timezone configuration
- Next run time display

---

### 7. SCHEDULES (`/routes/schedules/`)

#### Schedule Display
- List of all scheduled jobs
- Job name/subagent ID
- Task description
- Cron expression (displayed in mono font)
- Timezone
- Next run time
- Remove/delete schedule button

#### Features
- Auto-refresh (10s interval)
- Empty state when no schedules
- Related to Subagents feature

---

### 8. SERVER CONTROL (`/routes/server-control/`)

#### System Monitoring
- **Resource Cards** (animated Framer Motion)
  - CPU usage with chart
  - Memory usage with chart
  - Disk usage with chart
  - Temperature monitoring
  
- **Charts** (using Recharts)
  - Area charts with gradient
  - Real-time data updates
  - Responsive sizing
  - Interactive state (hover effect)

#### Server Actions
- Restart server
- Shutdown server
- Factory reset
- Clear cache

#### Status Indicators
- Service health
- Connectivity status
- Version info

---

### 9. DESKTOP/WINDOW SYSTEM

#### Desktop Layout
- Full-screen wallpaper (parallax capable)
- Header with greeting + system info
- App grid with pagination
- Dock at bottom with:
  - Home app
  - Files icon
  - App Store icon
  - Settings icon
  - Terminal icon
  - Server Control icon
  - AI Chat icon
  - Subagents icon
  - Schedules icon
  - Logout button
  - Notification badges (settings)
  
#### Dock Features
- Icon size animation on hover
- Smooth spring animation on load
- Active state indication
- Notification badges
- Settings notification count
- Mobile responsive (smaller icons)
- Pointer tracking for zoom effect

#### Window System
- **Window Manager State**
  - Open windows list
  - Z-index management
  - Window focus tracking
  - Window positions (x, y)
  - Window sizes (width, height)
  
- **Window Chrome**
  - Title bar with app icon
  - Draggable header (pill-shaped)
  - Close button
  - Styled with backdrop blur
  
- **Window Interactions**
  - Drag windows (move on screen)
  - Resize from edges (8 directions: n, s, e, w, ne, nw, se, sw)
  - Minimum size enforcement (400x400)
  - Keep-on-screen boundary enforcement
  - Focus on click/drag/resize
  - Smooth animations
  
- **Floating Islands**
  - Status indicators overlaid on windows
  - Minimizable
  - Expandable
  - Sticky positioning

#### Desktop Context Menu
- Right-click menu
- App grid options
- Logout option

#### Desktop Preview
- Preview mode for demo/showcase
- Same layout as full desktop

---

### 10. AUTHENTICATION & ONBOARDING

#### Login Flow
- **Step 1: Password** - Email/password input
- **Step 2: 2FA** - 6-digit TOTP code input
- Error messages
- Navigation back option

#### Onboarding Flow
- **Step 1: Welcome** - Language selection + intro
- **Step 2: Create Account** - Password setup
- **Step 3: Account Created** - Confirmation
- **Restore Option** - Restore from backup instead of create new
- Step indicator (shows current step/total)
- Back navigation

#### Factory Reset
- **Step 1: Review Data** - Show what will be deleted
- **Step 2: Confirm with Password** - Security confirmation
- **Step 3: Success** - Completion screen
- Split dialog layout
- Progress indication

---

### 11. UI COMPONENTS & SHARED

#### Custom Components (in `/components/ui/`)
- **Alert** - Alert boxes
- **Animated Number** - Number counter animations
- **Arc** - SVG arc component
- **Button Link** - Styled link as button
- **Card** - Card container
- **Copy Button** - Copy to clipboard button
- **Copyable Field** - Field with copy button
- **Cover Message** - Full-page message overlay
- **Debug Only** - Debug content (visibility toggle)
- **Dialog Close Button** - Close button for dialogs
- **Error Boundary Fallbacks** - Error UI for boundaries
- **Fade In Image** - Image fade-in animation
- **Generic Error Text** - Error message formatting
- **Icon** - Icon wrapper
- **Icon Button** - Button with icon
- **Icon Button Link** - Link styled as icon button
- **Immersive Dialog** - Full-screen dialog with split content
- **List** - Ordered/unordered lists
- **Loading** - Loading spinner
- **Notification Badge** - Badge with count
- **Numbered List** - Numbered step list
- **Pin Input** - Multi-digit PIN entry (2FA)
- **Segmented Control** - Toggle group
- **Step Indicator** - Progress steps
- **Toast** - Toast notifications
- **Window Aware Link** - Link that opens in window or navigates

#### shadcn/ui Components (in `/shadcn-components/ui/`)
- Alert Dialog
- Alert
- Badge
- Button
- Carousel
- Checkbox
- Command (Cmdk integration)
- Context Menu
- Dialog
- Drawer
- Dropdown Menu
- Form
- Input (with password variant)
- Label
- Pagination
- Popover
- Progress
- Radio Group
- Scroll Area
- Select
- Separator
- Sheet
- Sheet Scroll Area
- Switch
- Table
- Tabs
- Tooltip

#### Command/Search (`cmdk`)
- **Command Palette** - Keyboard shortcut to search/navigate
- **Search Providers** - Multiple search sources:
  - Files search
  - Backups search
  - App search
  - System settings search
- **Command Actions** - Navigable commands

#### Providers
- **Apps Provider** - Installed apps state
- **Available Apps Provider** - Registry apps
- **Window Manager Provider** - Window state management
- **Window Router Provider** - Window-specific routing
- **Auth Bootstrap** - Auth initialization
- **Language Provider** - i18n/translations
- **Wallpaper Provider** - Background image
- **Global System State** - System events (restart, shutdown, reset, migrate)
- **Confirmation Provider** - Generic confirmation dialogs
- **Prefetch Provider** - Data preloading
- **Sheet Sticky Header** - Sticky headers in sheets
- **Files Capabilities Context** - Files read-only mode + current path

---

## DATA MODELS & tRPC ENDPOINTS USED

### User/Auth
- `user.login` - Password + optional 2FA
- `user.logout`
- `user.getConfig` - User settings
- `user.setName`
- `user.setPassword`
- `user.enable2fa`
- `user.disable2fa`

### Files
- `files.list` - Directory listing
- `files.listRecents` - Recent files
- `files.search` - Full-text search
- `files.createFolder` - New directory
- `files.rename` - Rename file/folder
- `files.copy` - Copy file/folder
- `files.move` - Move file/folder
- `files.delete` - Delete to trash
- `files.deletePermanently` - Permanent deletion
- `files.share` - Create share link
- `files.unshare` - Disable share link
- `files.upload` - Upload file

### Apps
- `apps.list` - Installed apps
- `apps.getConfig` - App configuration
- `apps.install` - Install app
- `apps.uninstall` - Uninstall app
- `apps.start` - Start service
- `apps.stop` - Stop service
- `apps.restart` - Restart service
- `apps.getLogs` - Get app logs
- `apps.setEnvironment` - Set env vars
- `apps.getPublicUrl` - Public access URL

### AI
- `ai.getChatStatus` - Chat connection status
- `ai.listConversations` - Get conversations
- `ai.getConversation` - Get single conversation
- `ai.send` - Send message (streaming)
- `ai.deleteConversation` - Delete conversation
- `ai.listSubagents` - List subagents
- `ai.createSubagent` - Create subagent
- `ai.deleteSubagent` - Delete subagent
- `ai.executeSubagent` - Run subagent
- `ai.listSchedules` - List scheduled jobs
- `ai.removeSchedule` - Delete schedule
- `ai.getConfig` - AI model config
- `ai.setConfig` - Save AI config
- `ai.getClaudeCliStatus` - CLI authentication status

### System
- `system.getInfo` - Device info (CPU, RAM, disk)
- `system.getCpu` - CPU metrics
- `system.getMemory` - Memory metrics
- `system.getDisk` - Disk metrics
- `system.getTemperature` - Temperature sensors
- `system.getVersion` - System version
- `system.checkUpdates` - Check for updates
- `system.update` - Install updates
- `system.restart` - Restart server
- `system.shutdown` - Shutdown server
- `system.factoryReset` - Factory reset

### Backups
- `backups.list` - List backups/repositories
- `backups.getConfig` - Backup configuration
- `backups.setConfig` - Update backup config
- `backups.getSnapshots` - List snapshots
- `backups.restore` - Restore from snapshot
- `backups.getStatus` - Backup status

### Other
- `registry.listApps` - Available apps in store
- `registry.getDiscover` - Discover page config
- `notifications.list` - System notifications
- `wifi.list` - Available WiFi networks
- `wifi.connect` - Connect to WiFi

---

## KEY ARCHITECTURAL PATTERNS

### State Management
- **Zustand** - Files store (selection, rename, new folder, drag-drop, file viewer, clipboard, interaction, etc.)
- **Context API** - Various providers (Auth, Language, Wallpaper, etc.)
- **tRPC React Query** - Server state with React Query

### Routing
- **React Router v6** - Main app routing
- **Window Router Provider** - Local routing within window context
- **Search Params** - Dialog/drawer route control

### Styling
- **Tailwind CSS 3.4** - Utility classes
- **Framer Motion** - Animations and gestures
- **CSS-in-JS** - Some custom animations
- **SVG icons** - Via Tabler Icons React

### Loading & Suspense
- **React.lazy()** - Code splitting
- **Suspense boundaries** - Lazy component loading
- **Error boundaries** - Error UI fallbacks

### Accessibility
- **Semantic HTML** - Proper structure
- **ARIA labels** - Screen reader support
- **Keyboard navigation** - Tab, Enter, Escape support
- **Focus management** - Auto-focus on dialogs

---

## NOTABLE FEATURES & PATTERNS

1. **Immersive Dialogs** - Full-screen dialogs with split content (wizard-style)
2. **Floating Islands** - Mini windows for operations (uploads, audio, formatting)
3. **Rewind/Snapshots** - File version history with timeline
4. **Responsive Design** - Mobile, tablet, desktop layouts
5. **Drag & Drop** - Files upload, window management
6. **Streaming Responses** - AI chat with real-time output
7. **Tool Call Display** - MCP tool results with expandable details
8. **Voice Input** - Voice button for audio chat input
9. **Canvas Integration** - Iframe for Live Canvas in AI chat
10. **Window System** - Draggable/resizable windows management
11. **Desktop Metaphor** - Dock, desktop grid, context menu
12. **Settings as Nested Routes** - Dialog/drawer routes for modals
13. **Error Boundaries** - Graceful error handling at component level
14. **Preference Storage** - localStorage for view preferences
15. **Real-time Updates** - Polling and subscription patterns
16. **Internationalization** - 20+ languages with i18n

---

## SUMMARY

The OLD UI is a **comprehensive desktop-class application** with:
- **100+ routes/pages** spread across settings, files, app store, AI, scheduling, etc.
- **40+ UI components** (shadcn/ui + custom)
- **Complex state management** (Zustand, Context, React Query)
- **Advanced features**: File sharing, versioning, network storage, AI chat, subagents, backups
- **Desktop metaphor**: Windows, dock, context menus, wallpapers
- **Full onboarding flow**: User creation, restoration, 2FA, migration
- **System control**: Monitoring, updates, factory reset, restart/shutdown
- **Integrations**: Discord, Slack, Matrix, Telegram webhooks
- **Multi-language support**: 20+ languages

This is the baseline that the new UI must replicate or exceed.
