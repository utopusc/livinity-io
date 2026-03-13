# OLD LivOS UI - Detailed Component Reference

Comprehensive breakdown of all components, utilities, and implementation details from the OLD UI codebase.

---

## FILES FEATURE DETAILED BREAKDOWN

### File Listing Components
1. **DirectoryListing** - Browse folders/files in directory
2. **RecentsListing** - Recently accessed files
3. **SearchListing** - Full-text file search results
4. **AppsListing** - App data directories
5. **TrashListing** - Deleted files with permanent delete option

### File Item Components
1. **FileItem** (wrapper)
   - **IconsViewFileItem** - Grid view with thumbnails
   - **ListViewFileItem** - List view with details
   
2. **File Operations**
   - EditableName - Inline rename with validation
   - CircularProgress - Upload/download progress ring
   - TruncatedFilename - Ellipsis for long names

### Sidebar Components
1. **Sidebar** - Main navigation sidebar
2. **SidebarHome** - Home folder link
3. **SidebarRecents** - Recent files link
4. **SidebarFavorites** - Bookmarked folders
5. **SidebarShares** - Shared with me
6. **SidebarApps** - Installed apps
7. **SidebarTrash** - Deleted files
8. **SidebarExternalStorage** - USB/external drives
   - **SidebarExternalStorageItem** - Individual drive
9. **SidebarNetworkStorage** - Network shares
   - **SidebarNetworkShareItem** - Individual share
10. **SidebarItem** - Reusable sidebar link component
11. **MobileSidebarWrapper** - Mobile sidebar drawer

### Action Bar Components
1. **ActionsBar** - Toolbar with operations
   - **ActionsBarContext** - Context for state
   - **MobileActions** - Mobile-specific layout
   - **NavigationControls** - Back/forward buttons
   
2. **Path Bar** - Current directory navigation
   - **PathBarDesktop** - Desktop layout
   - **PathBarMobile** - Mobile layout
   - **PathInput** - Type path directly
   
3. **SearchInput** - File search input
4. **SortDropdown** - Sort by name/size/date
5. **ViewToggle** - Grid vs list view toggle

### File Viewer Components
1. **FileViewer** - Main viewer wrapper
2. **ViewerWrapper** - Viewport container
3. **ImageViewer** - Image with zoom/pan/rotate
4. **VideoViewer** - HLS video player
5. **AudioViewer** - Audio with equalizer
   - **Equalizer** - 10-band EQ UI
6. **PdfViewer** - PDF with page navigation
7. **Downloader** - Fallback download option

### File Dialogs
1. **ShareInfoDialog** - Share file/folder
   - **ShareToggle** - Enable/disable sharing
   - **PlatformSelector** - Choose OS instructions
   - Platform instructions:
     - **WindowsInstructions**
     - **MacOsInstructions**
     - **IosInstructions**
     - **LivosInstructions**
   - **InlineCopyableField** - Embedded copy button
   
2. **PermanentlyDeleteConfirmationDialog** - Confirm permanent deletion
3. **ExternalStorageUnsupportedDialog** - Warning for unsupported drives
4. **AddNetworkShareDialog** - SMB/NFS/AFP setup
5. **FormatDriveDialog** - Format external drive

### Floating Islands (Floating Panels)
1. **UploadingIsland**
   - **Minimized** - Shows count
   - **Expanded** - Progress list
   
2. **AudioIsland**
   - **Minimized** - Mini player
   - **Expanded** - Full player with EQ
   
3. **OperationsIsland**
   - **Minimized** - Status indicator
   - **Expanded** - Copy/paste/move operations
   
4. **FormattingIsland**
   - **Minimized** - Status
   - **Expanded** - Format progress

### Rewind/Versioning Components
1. **RewindOverlay** - Version history UI
2. **SnapshotCarousel** - Browse snapshots
3. **TimelineBar** - Timeline navigation
4. **PrerewindDialog** - Confirm restore
5. **RestoreProgressDialog** - Restore progress
6. **SnapshotDateLabel** - Date display
7. **Tooltip** - Show metadata

### File Utilities & Hooks
**Hooks:**
- `useListDirectory` - Fetch directory contents
- `useListRecents` - Fetch recent files
- `useSearchFiles` - Search implementation
- `useFilesOperations` - Copy/move/delete/rename
- `useNew Folder` - Create folder
- `useNavigate` - Change directory
- `useItemClick` - File interaction logic
- `useRewind` - Version history
- `useRewindAction` - Perform restore
- `useDragAndDrop` - D&D handler
- `useExternalStorage` - External drive detection
- `useNetworkStorage` - Network share detection
- `useShares` - Shared folders
- `useFavorites` - Bookmarks
- `usePreferences` - View settings
- `useIsFilesReadOnly` - Permission check

**Utils:**
- `getItemKey` - Item identifier
- `formatFilesystemSize` - File size formatting
- `formatFilesystemDate` - Date formatting
- `formatFilesystemName` - Name formatting
- `sortFilesystemItems` - Sorting logic
- `pathAlias` - Path aliasing (~/, /Apps, etc.)
- `isDirectoryANetworkDeviceOrShare`
- `isDirectoryAnExternalDrivePartition`
- `isDirectoryALivinityBackup`

---

## APP STORE DETAILED BREAKDOWN

### Discover Page Components
1. **AppsGallerySection** - Hero banner carousel
2. **AppsGridSection** - Grid layout (3+ columns)
3. **AppsRowSection** - Horizontal scroll carousel
4. **AppsThreeColumnSection** - 3-column grid
5. **FeaturedHeroRow** - Featured app spotlight

### App Page Components
1. **TopHeader** - App icon, name, install button
2. **AboutSection** - Description, screenshots, features
3. **ReleaseNotesSection** - Changelog/version history
4. **InfoSection** - Metadata (author, version, size, port, etc.)
5. **PublicAccessSection** - Enable public URL sharing
6. **SettingsSection** - Environment variables, config
7. **DependenciesSection** - Required apps
8. **RecommendationsSection** - Related apps

### App Installation/Management
1. **InstallButton** - Basic install
2. **InstallButtonConnected** - With connection check
3. **ProgressButton** - Loading/installing state
4. **UpdatesButton** - Show update available
5. **UpdatesDialog** - Multi-app update
6. **DefaultCredentialsDialog** - Show default login
7. **AppSettingsDialog** - App configuration dialog
8. **EnvironmentOverridesDialog** - Set env vars
9. **SelectDependenciesDialog** - Choose which dependencies
10. **OsUpdateRequired** - Warning if OS too old

### App Store Navigation
1. **ConnectedAppStoreNav** - Search, filters, tabs
2. **CommunityAppStoreDialog** - Browse other stores
3. **GallerySection** - Banners/featured apps
4. **AppIcon** - Cached app icon component

### Community App Store
1. **CommunityBadge** - Mark community apps
2. Support for multiple app stores (3rd party)

---

## BACKUPS DETAILED BREAKDOWN

### Wizards
1. **BackupsSetupWizard** - Initial configuration
2. **BackupsConfigureWizard** - Modify settings
3. **BackupsRestoreWizard** - Restore from snapshot

### Components
1. **BackupLocationDropdown** - Storage location picker
2. **RestoreLocationDropdown** - Restore destination picker
3. **BackupsExclusions** - Ignore path management
4. **ConfigureWizard** - Step-by-step config
5. **TabSwitcher** - Setup/Configure/Restore tabs
6. **FloatingIsland**
   - **Minimized** - Status
   - **Expanded** - Details

### Modals
1. **AlreadyConfiguredModal** - Backup exists
2. **ConnectExistingModal** - Use existing backup

### Hooks
- `useBackups` - Backup state
- `useBackupIgnoredPaths` - Exclusion list
- `useAppsBackupIgnore` - App-specific ignores
- `useAppsAutoExcludedPaths` - Auto excluded paths
- `useExistingBackupDetection` - Detect existing backups

---

## SETTINGS DETAILED BREAKDOWN

### Settings Container
- **SettingsPageLayout** - Page wrapper
- **SettingsContentDesktop** - Desktop layout
- **SettingsContentMobile** - Mobile layout
- **Settings Summary** - Overview panel
- **Settings Info Card** - Info box styling
- **ListRow** - Settings row (label + control)
- **SettingsToggleRow** - Toggle row
- **Shared** - Common styling

### Desktop Settings Pages
1. **2FA** - Two-Factor Authentication
   - **2FAEnable** - Setup 2FA
   - **2FADisable** - Remove 2FA
   
2. **Device Info** - System specifications
3. **Change Name** - Device name
4. **Change Password** - Password update
5. **Wifi** - WiFi configuration
6. **Backups** - Backup management
7. **Language** - Language selection
8. **Software Update** - OS updates
9. **Advanced** - Debug options
10. **Troubleshoot** - Log viewer (LivOS + App)
11. **Terminal** - Shell access (LivOS + App)
12. **Restart** - Restart server
13. **Shutdown** - Shutdown server

### Mobile Drawer Settings
1. **AccountDrawer** - Account settings
2. **WallpaperDrawer** - Wallpaper picker
3. **LanguageDrawer** - Language selection
4. **TorDrawer** - Tor enablement
5. **AppStorePreferencesDrawer** - Store settings
6. **DeviceInfoDrawer** - Device details
7. **BackupsMobileDrawer** - Backup wizard
8. **SoftwareUpdateDrawer** - Update notification

### New Embedded Pages
1. **NexusConfigPage** - Nexus worker settings
   - Retry policy
   - Timeout config
   - Health checks
   - Message logging
   
2. **AiConfigPage** - AI model setup
   - Anthropic API key
   - Gemini API key
   - Claude CLI status
   
3. **IntegrationsPage** - External services
   - Discord webhook
   - Slack webhook
   - Matrix webhook
   - Telegram bot
   
4. **DomainSetupPage** - Domain configuration
5. **DmPairingPage** - Device manager pairing

### System Monitoring
1. **CpuCardContent** - CPU stats with chart
2. **MemoryCardContent** - RAM stats with chart
3. **StorageCardContent** - Disk stats with chart
4. **CpuTemperatureCardContent** - Temperature monitoring
5. **UsageDashboard** - Full monitoring dashboard

### Hooks
- `use2fa` - 2FA management
- `useSoftwareUpdate` - Update checking
- `useCpuTemperature` - Temperature reading
- `useCpuForUi` - CPU formatting
- `useMemoryForUi` - Memory formatting
- `useDiskForUi` - Disk formatting
- `useVersion` - OS version
- `useDeviceInfo` - System info
- `useUserName` - Get user name
- `useTorEnabled` - Tor status
- `useLanguage` - Language state
- `useTemperatureUnit` - Unit preference

---

## AI CHAT DETAILED BREAKDOWN

### Main Chat Interface
1. **ChatMessage** - Message bubble rendering
   - User: right-aligned, blue
   - Assistant: left-aligned, dark with border
   
2. **ToolCallDisplay** - Tool execution results
   - Expandable params/output
   - Success/failure status
   - Truncated output (2000 chars)

3. **Panels** (lazy loaded)
   - **McpPanel** - Available tools
   - **SkillsPanel** - Available skills
   - **CanvasPanel** - Live Canvas iframe
   - **VoiceButton** - Audio input

### Chat Features
- Conversation history
- Delete conversation
- New conversation
- Elapsed time counter
- Message streaming
- Tool call tracking
- Error handling

### Hooks
- `useElapsed` - Elapsed time counter
- Auto-reconnect on disconnect

---

## SUBAGENTS DETAILED BREAKDOWN

### Subagent Form
**Create Form Fields:**
- Name (required)
- ID (auto-generated, optional override)
- Description (required)
- System Prompt (optional)
- Model Tier: Flash/Sonnet/Opus
- Max Turns: number input
- Cron Schedule: optional
- Scheduled Task: optional

### Subagent Management
1. List view with cards/rows
2. Create form
3. Edit form
4. Delete with confirmation
5. Execute/run
6. Status display

---

## SCHEDULES DETAILED BREAKDOWN

### Schedule Display
1. Schedule cards/rows showing:
   - Subagent name
   - Task description
   - Cron expression (mono font)
   - Timezone
   - Next run time (formatted date)
   
2. Empty state message
3. Loading indicator
4. Remove button with confirmation

### Auto-refresh
- 10-second polling interval

---

## SERVER CONTROL DETAILED BREAKDOWN

### Resource Cards
1. **ResourceCard** - Animated card component
   - Icon + title
   - Current value + subvalue
   - Progress bar
   - Real-time chart
   - Hover animation (scale)
   - Active state gradient

### Charts
Using Recharts:
- **AreaChart** - Resource usage over time
  - Gradient fills
  - Responsive sizing
  - Animation disabled for performance
  - Hover effects

### Resource Types
1. **CPU** - Usage %, frequency, cores
2. **Memory** - RAM usage, breakdown
3. **Disk** - Storage usage by partition
4. **Temperature** - CPU temps by core

### Hooks
- `useCpuForUi` - CPU data formatting
- `useSystemMemoryForUi` - Memory data
- `useSystemDiskForUi` - Disk data

---

## WINDOW SYSTEM DETAILED BREAKDOWN

### Window Manager State
**Position:** {x, y}
**Size:** {width, height}
**zIndex:** number
**ID:** unique identifier
**Title:** window title
**Icon:** app icon URL
**Children:** React content

### Window Chrome
1. Draggable title pill (centered)
   - App icon
   - Title text
   - Styled with backdrop blur
   - Border + shadow
   
2. Close button
   - Positioned left of pill
   - Hover state (red)
   - Stop propagation

### Window Interactions
1. **Dragging**
   - Track mouse move
   - Calculate delta
   - Clamp to screen bounds
   - Update on mouse up
   
2. **Resizing** (8 directions)
   - Track each corner/edge
   - Enforce minimum 400x400
   - Update position on N/W resize
   - Smooth transitions
   
3. **Focus**
   - Click brings to front
   - Z-index management

### Floating Islands
1. Mini windows for status
2. Minimizable/expandable
3. Examples:
   - Upload progress
   - Audio player
   - File operations
   - Formatting status

---

## DESKTOP SYSTEM DETAILED BREAKDOWN

### Desktop Layout
1. **Full-screen wallpaper** (parallax capable)
2. **Header** - Greeting + system info
3. **App Grid** - Paginated app grid
4. **Dock** - Bottom dock with icons

### App Grid
1. **AppGrid** - Main grid component
2. **Pagination** - Page navigation
3. **Paginator** - Page controls
4. **AppPaginationUtils** - Pagination logic
5. **AppIcon** - Grid app icon

### Dock
**Dock Items (left to right):**
1. Home (always present)
2. Files
3. App Store
4. Settings
5. Terminal
6. Server Control
7. AI Chat
8. Subagents
9. Schedules
10. Logout (right side)

**Dock Features:**
- Hover zoom (scale animation)
- Icon size: 50px (desktop), 48px (mobile)
- Zoom size: 80px (desktop), 60px (mobile)
- Spring animation on load
- Pointer tracking
- Notification badges
- Active state indication
- Mobile-responsive layout

### Desktop Features
1. **DesktopContent** - Main layout
2. **Header** - Top bar
3. **DesktopContextMenu** - Right-click menu
4. **DesktopPreview** - Demo mode
5. **LogoutDialog** - Confirm logout
6. **UninstallConfirmDialog** - Confirm uninstall
7. **UninstallThesFirstDialog** - Dependencies warning
8. **InstallFirstApp** - Empty state message
9. **GreetingMessage** - Time-based greeting
10. **BlurBelowDock** - Blur effect under dock
11. **DesktopMisc** - Other UI elements

---

## LAYOUT COMPONENTS

### Desktop Layout
- Full-window layout with dock
- Wallpaper background
- Header
- App grid
- Desktop context menu

### Sheet Layout
- Side panel for sheets/dialogs
- Used for Settings, Files, App Store

### Bare Layout
- Full-screen bare pages
- Used for Auth, Onboarding, Factory Reset
- **BarePageLayout** - Individual page
- **Shared** - Common elements

### Demo Layout
- Preview/showcase layout
- Same as desktop for demo purposes

---

## PROVIDER ARCHITECTURE

### Data Providers
1. **AppsProvider** - Installed apps + operations
2. **AvailableAppsProvider** - Registry apps
3. **GlobalFilesProvider** - Global files operations

### State Providers
1. **WindowManagerProvider** - Window state + management
2. **ConfirmationProvider** - Generic confirmation dialogs
3. **WallpaperProvider** - Background image state
4. **LanguageProvider** - i18n/translations
5. **PrefetchProvider** - Data preloading

### Context Providers
1. **AuthBootstrapProvider** - Auth initialization
2. **GlobalSystemStateProvider** - System events
   - Migrate
   - Reset
   - Restart
   - Shutdown
   - Update
3. **SheetStickyHeaderProvider** - Sticky headers
4. **FilesCapabilitiesContext** - Files mode + current path

### Window Router Provider
- Local routing within window context
- Alternative to global router

---

## TYPES & INTERFACES

### App Types
```typescript
interface RegistryApp {
  id: string
  name: string
  category: string
  icon: string
  description: string
  version: string
  author: string
  port: number
  dependencies?: string[]
  // ... more fields
}

interface UserApp {
  id: string
  status: 'running' | 'stopped' | 'installing'
  port: number
  environment?: Record<string, string>
  // ... more fields
}
```

### File Types
```typescript
interface FileItem {
  name: string
  path: string
  size: number
  isDirectory: boolean
  modifiedAt: string
  sharedWith?: string[]
  // ... more fields
}
```

### Window Types
```typescript
interface WindowState {
  id: WindowId
  title: string
  icon: string
  position: {x: number; y: number}
  size: {width: number; height: number}
  zIndex: number
}
```

---

## UTILITY FUNCTIONS

### Files
- `formatFilesystemSize` - "1.5 MB"
- `formatFilesystemDate` - Date formatting
- `formatFilesystemName` - Sanitize names
- `sortFilesystemItems` - Sort by name/size/date
- `pathAlias` - Convert paths (~/, /Apps)
- `getItemKey` - Get unique item ID

### Misc
- `cn` - Conditional className merging
- `tw` - Tailwind utility helper
- `prettyBytes` - File size formatting
- `secondsToEta` - Time formatting
- `dateTime` - Date/time utilities
- `search` - Text search
- `element-classes` - Element class helpers

### System
- `transitionViewIfSupported` - View transitions API
- `systemInfo` - Get system details

---

## KEYBOARD SHORTCUTS & INTERACTIONS

### Command Palette
- **Cmd/Ctrl+K** - Open search

### Files
- **Cmd/Ctrl+A** - Select all
- **Delete/Backspace** - Delete file
- **Enter** - Open file/folder
- **Cmd+C** - Copy
- **Cmd+V** - Paste
- **Cmd+X** - Cut
- **R** - Rename (when focused)

### General
- **Escape** - Close dialog/menu
- **Tab** - Navigate elements
- **Enter** - Confirm action
- **Arrow Keys** - Navigate menus/lists

---

## STYLING & THEMING

### Color System
- **Brand/Primary** - Main accent color
- **Destructive** - Red for delete actions
- **Border colors** - Subtle borders
- **Text colors** - Primary, secondary, tertiary
- **Surface colors** - Background surfaces

### Components Styling
- **Rounded radius** - sm, md, lg, xl
- **Shadows** - elevation system
- **Blur effects** - Backdrop blur
- **Gradients** - Linear/radial
- **Animations** - Spring, easing

### Responsive Breakpoints
- **Mobile** - <640px
- **Tablet** - 640px-1024px
- **Desktop** - >1024px

---

## INTERNATIONALIZATION (i18n)

### Translation Keys Structure
```
onboarding.start.title
onboarding.start.subtitle
onboarding.start.continue
login.title
login.password-label
login-2fa.title
files
settings
app-store.discover.section-title
...20+ more languages
```

### Supported Languages
English, Spanish, French, German, Italian, Portuguese, Dutch, Russian, Japanese, Chinese (Simplified), Chinese (Traditional), Korean, Arabic, Hebrew, Hindi, Thai, Vietnamese, Indonesian, Polish, Turkish, Greek, Swedish, Norwegian, Danish, Finnish, ...

---

## PERFORMANCE OPTIMIZATIONS

1. **Code Splitting** - React.lazy() for routes
2. **Suspense Boundaries** - Progressive loading
3. **Virtualization** - Large file lists
4. **Memoization** - Prevent re-renders
5. **Image Optimization** - Lazy loading
6. **Caching** - tRPC caching + local storage
7. **Debouncing** - Search, resize
8. **Pagination** - App grid, results
9. **Streaming** - AI chat responses
10. **Web Workers** - Heavy operations

---

## ERROR HANDLING

1. **Error Boundaries** - Component-level fallbacks
2. **tRPC Error Handling** - Server errors
3. **Toast Notifications** - User feedback
4. **Fallback UI** - Graceful degradation
5. **Retry Logic** - Failed requests
6. **Debug Mode** - Debug-only content

---

## TESTING

Test files in:
- `/tests/` - Component tests
- `/tests-examples/` - Example tests
- `playwright.config.ts` - E2E testing config

---

## EXTERNAL DEPENDENCIES KEY

- **React 18** - UI library
- **React Router v6** - Routing
- **tRPC** - RPC framework
- **React Query** - Server state
- **Tailwind CSS 3.4** - Styling
- **shadcn/ui** - Component library
- **Framer Motion** - Animations
- **Zustand** - State management
- **Tabler Icons React** - Icons
- **Recharts** - Charts
- **date-fns** - Date utilities
- **react-markdown** - Markdown rendering
- **xterm.js** - Terminal emulator
- **react-json-tree** - JSON viewer
- **Playwright** - E2E testing

---

## BUILD & DEPLOYMENT

- **Vite** - Build tool
- **TypeScript** - Type safety
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Docker** - Containerization
- **pnpm** - Package manager (monorepo)

---

This comprehensive breakdown covers every significant component, hook, utility, and pattern in the OLD UI codebase. Use this as reference when building the new UI to ensure feature parity.
