# LivOS UI Research: Modern Web OS & Dashboard Design

**Date:** 2026-02-06
**Purpose:** Comprehensive design research for LivOS v1.2 UI redesign -- moving beyond the Umbrel clone aesthetic toward a unique, premium identity.

---

## Table of Contents

1. [Modern Web OS / Dashboard UIs](#1-modern-web-os--dashboard-uis)
2. [Desktop/Dock Alternatives](#2-desktopdock-alternatives)
3. [App Store / Marketplace Designs](#3-app-store--marketplace-designs)
4. [File Manager Modern Designs](#4-file-manager-modern-designs)
5. [AI Chat Interface Trends](#5-ai-chat-interface-trends)
6. [Settings Page Patterns](#6-settings-page-patterns)
7. [Unique Visual Identity](#7-unique-visual-identity)
8. [New Feature Ideas](#8-new-feature-ideas)
9. [Actionable Design Recommendations for LivOS](#9-actionable-design-recommendations-for-livos)
10. [Sources](#10-sources)

---

## 1. Modern Web OS / Dashboard UIs

### The Competitive Landscape (2025-2026)

The self-hosted server OS space has six distinct approaches to dashboard design. Understanding each reveals what LivOS should NOT copy and where genuine whitespace exists.

#### 1A. Umbrel -- The iOS Clone

**Layout:** Desktop wallpaper + bottom dock + grid of app icons. Widgets on top. Search bar.
**What it does well:** Beautiful wallpapers, polished animations, "it just works" simplicity.
**What makes it generic:** It is literally a web-based iOS. The dock cannot be customized. Apps are alphabetically fixed. There is zero information density -- you see icons and nothing else. No status, no metrics, no data at a glance.

**LivOS lesson:** LivOS currently inherits this exact pattern. The dock-and-grid layout is recognizable, but it communicates nothing. A server OS should surface information, not hide it behind icons.

#### 1B. CasaOS -- The Launcher Panel

**Layout:** Single-page Vue.js app with centered card grid. System stats bar at top. App icons with status indicators. Sidebar for storage/Docker.
**What it does well:** Slightly more informational than Umbrel -- shows CPU/RAM/storage in a top bar. Docker container status visible.
**What makes it generic:** Still fundamentally an app-launcher grid. No widgets, no customization. The information density is still very low.

**LivOS lesson:** The top system stats bar is useful but pedestrian. LivOS could integrate system awareness more deeply rather than relegating it to a tiny bar.

#### 1C. Cosmos Server -- The Admin Panel

**Layout:** Traditional admin dashboard with sidebar navigation, content area, and header bar. Closer to a Portainer than an "OS".
**What it does well:** Security-first approach (SSO, anti-DDOS, anti-bot built in). Reverse proxy management is visual. Dark mode with near-black (#141414) background. Focuses on being a secure gateway.
**What makes it generic:** Looks like every SaaS admin panel. No personality, no delight. Functional but forgettable.

**LivOS lesson:** Cosmos proves that security features and good UX are not mutually exclusive. LivOS should bake security visibility into the dashboard (active connections, blocked threats, SSL status) but without the generic admin-panel aesthetic.

#### 1D. Homarr -- The Widget Dashboard

**Layout:** Drag-and-drop bento grid of widgets. Columns configurable. Multiple "boards" (pages). Widget types: app links, system stats, Docker status, RSS feeds, downloads, DNS controls.
**What it does well:** Highest customization of any dashboard. Users arrange their own layout. Live data integrations (PiHole, Sonarr, etc.). The drag-and-drop editor is inline, not a separate config page.
**What makes it generic:** It looks like a customizable homepage, not an OS. No window management, no file system, no AI. It is a dashboard, not a platform.

**LivOS lesson:** The widget/bento system is the most flexible layout pattern. LivOS should consider a hybrid: a home screen that mixes widgets (information) with app launchers (actions), rather than a pure icon grid.

#### 1E. Dashy -- The Power-User Dashboard

**Layout:** Header + toolbar + sections of grouped links. Four view modes: tiled (grid), vertical list, horizontal scroll, workspace (tabs). 50+ built-in widgets. Theme system with live customization. YAML-driven configuration.
**What it does well:** Most feature-rich dashboard. Instant type-to-search filtering. Status monitoring per service. Icon auto-fetching from favicons. Keyboard shortcuts for everything.
**What makes it generic:** Visual polish is lacking. It looks like a developer tool, not a consumer product. The theme system is flexible but the defaults are mediocre.

**LivOS lesson:** Dashy's instant search and keyboard-driven navigation are patterns LivOS must steal. But LivOS should provide Dashy-level power with Umbrel-level polish.

#### 1F. Glance -- The Minimal Feed

**Layout:** Three-column page layout with widgets (RSS, weather, calendar, stocks, Reddit, YouTube). Multiple pages (tabs). YAML config. Single binary, under 20MB.
**What it does well:** Extreme minimalism. Focuses on information consumption, not app launching. Beautiful typography and spacing. Lightweight.
**What makes it generic:** It is a personal start page, not a server OS. No Docker management, no file system. Purely informational.

**LivOS lesson:** Glance proves that a three-column layout with dense, well-typeset information can be more useful than a grid of icons. LivOS could adopt a "feed" view as an alternative home screen mode.

#### 1G. Homepage -- The Integration Hub

**Layout:** Sections with grouped service bookmarks. Widget bar at top (weather, search, system info). Over 100 service integrations with live API data. Docker auto-discovery via labels.
**What it does well:** Zero-config Docker integration. Services show live data (download progress, media counts, etc.) directly on the dashboard without opening the app. Static-site generation for instant loads.
**What makes it generic:** Config-file driven, not GUI driven. Looks like a well-organized bookmarks page.

**LivOS lesson:** Live data integration on the home screen is critical. When a user sees their Plex library count, their Pi-hole blocked queries, and their Nextcloud storage used -- all without opening any app -- the dashboard becomes genuinely useful.

### What Makes a Dashboard Look UNIQUE vs GENERIC

After analyzing all seven, the pattern is clear:

| Generic | Unique |
|---------|--------|
| Grid of identical square icons | Mixed-size cards with live data |
| Single fixed layout | User-customizable bento grid |
| No information until you open an app | Data surfaces on the home screen |
| macOS/iOS dock copy | Original navigation metaphor |
| One-size-fits-all | Density modes (comfortable, compact, spacious) |
| Static wallpaper + glass blur | Dynamic, context-aware backgrounds |
| Icons only | Icons + status + metrics + actions |

---

## 2. Desktop/Dock Alternatives

### Beyond the macOS Dock + Grid

The dock-at-bottom-with-magnification pattern is so strongly associated with macOS (and now Umbrel) that using it makes LivOS look derivative. Here are alternative navigation paradigms:

#### 2A. Sidebar Navigation (Linear, Notion, Vercel)

**Pattern:** Persistent left sidebar with collapsible sections. Top-level categories expand to show sub-items. Width is resizable. Can collapse to icon-only mode.

**Advantages:**
- Scales to dozens of items without scrolling (vertical space is abundant)
- Supports hierarchy (groups, sub-items, badges)
- Works identically on desktop and tablet
- Can show status indicators, unread counts, and live data per item
- Familiar from every productivity app

**How LivOS could use it:**
```
[Sidebar]
  Dashboard          (home icon)
  ---
  Apps               (grid icon, expandable)
    > Nextcloud      (green dot = running)
    > Plex           (green dot)
    > PiHole         (yellow dot = warning)
  ---
  Files              (folder icon)
  AI Chat            (sparkle icon, "3 new" badge)
  Terminal           (terminal icon)
  ---
  System
    > Monitoring     (cpu/ram mini-chart)
    > Docker         (container icon, "12 running")
    > Network        (globe icon)
    > Backups        (clock icon, "Last: 2h ago")
  ---
  Settings           (gear icon)
  App Store          (store icon)
```

This immediately communicates more information than a row of icons. The sidebar can collapse on mobile into a hamburger drawer or bottom tab bar.

#### 2B. Command Palette / Spotlight Search (cmdk, kbar)

**Pattern:** Press Cmd+K (or Ctrl+K) to open a floating search bar. Type to find anything: apps, settings, files, actions, system commands. Results are categorized and keyboard-navigable.

**Advantages:**
- Fastest way to navigate for power users
- Zero screen real estate when not in use
- Can search across all domains (apps, files, settings, Docker containers)
- Natural language queries ("restart Plex", "show disk usage")

**How LivOS could use it:**
LivOS already has a floating-island module. The command palette should be the PRIMARY way to interact with the system for keyboard users. Categories:
- **Apps**: Launch or manage any installed app
- **Files**: Search files by name, open recent
- **Docker**: Start, stop, restart, view logs
- **Settings**: Jump to any settings section
- **AI**: Ask Nexus a question directly from the palette
- **Quick Actions**: "Create backup", "Update all apps", "Reboot server"

Implementation: Use `cmdk` (React, headless) or the existing shadcn Command component. The palette should be accessible from EVERYWHERE in the UI, not just the home screen.

#### 2C. Top Navigation Bar + Tabs (Cloudron, Portainer)

**Pattern:** Horizontal top bar with main sections as tabs. Content area below changes per tab. Secondary navigation within each tab via breadcrumbs or sub-tabs.

**Advantages:**
- Clean, no sidebar eating horizontal space
- Clear "where am I" indication via active tab
- Works well for a small number of top-level sections (5-7)

**Disadvantages:**
- Does not scale well beyond 7 items
- Wastes vertical space on every page

**How LivOS could use it:** As a secondary navigation within sheets/full-page views, not as the primary nav. Good for: App Store categories, Settings sections, File Manager toolbar.

#### 2D. Hybrid: Sidebar + Floating Actions + Command Palette

**The recommended approach for LivOS:**

1. **Collapsible sidebar** as primary navigation (always available, shows live status)
2. **Command palette** (Cmd+K) as power-user navigation (searchable everything)
3. **Quick action FAB (floating action button)** on mobile for common actions
4. **Home dashboard** as a bento-grid widget layout (not an icon grid)

This combination means: the sidebar gives you persistent awareness, the command palette gives you speed, the home dashboard gives you glanceable information, and the mobile FAB gives you touch-friendly actions.

#### 2E. Bento Grid Home Screen (replacing icon grid)

Instead of a grid of identical app icons, the home screen becomes a customizable bento grid:

```
+-------------------------------------------+
| [System Monitor Widget - 2x1]             |
| CPU: 23%  RAM: 4.2/8GB  Disk: 67%  23 C  |
+-------------------+-----------------------+
| [App Grid - 1x2]  | [AI Chat Widget - 1x2]|
| (6 pinned apps    | Last conversation...   |
|  with status dots) | [Ask Nexus...]         |
|                    |                        |
+-------------------+-----------------------+
| [Recent Files - 2x1]                      |
| document.pdf  |  backup-jan.tar  |  ...   |
+-------------------+-----------------------+
| [Docker Status - 1x1] | [Quick Actions 1x1]|
| 12 running, 2 stopped | [Backup Now]       |
| [View All]             | [Update All]       |
+-------------------+-----------------------+
```

Each widget is:
- Resizable (small, medium, large)
- Rearrangeable (drag and drop)
- Optional (users choose which widgets to show)
- Interactive (click into widget expands to full view)

---

## 3. App Store / Marketplace Designs

### What Modern App Marketplaces Look Like (2025-2026)

#### 3A. Layout Patterns

**Hero/Featured Section:**
Every modern marketplace leads with a featured section. This is NOT just a larger card -- it is a curated editorial moment.

```
+---------------------------------------------------+
|                                                     |
|  [Full-width hero card with gradient background]    |
|                                                     |
|  Featured: Nextcloud                                |
|  "Your personal cloud, on your server"              |
|                                                     |
|  [Install]  [Learn More]                            |
|                                                     |
+---------------------------------------------------+
```

Followed by horizontal scrollable rows (Netflix pattern):
```
Popular This Week    [See All >]
[Card] [Card] [Card] [Card] [Card] -->

Media & Entertainment    [See All >]
[Card] [Card] [Card] [Card] [Card] -->

Development Tools    [See All >]
[Card] [Card] [Card] [Card] [Card] -->
```

**Category Navigation:**
Modern app stores use a horizontal pill/chip bar at the top:
```
[All]  [Media]  [Productivity]  [Development]  [Network]  [Security]  [AI]
```

Active pill: solid background (white on dark = high contrast).
Inactive pill: subtle surface background.
Scrollable horizontally on mobile.

**NOT a sidebar of categories.** Horizontal pills are faster to scan and take less space.

#### 3B. App Card Design

A modern app card should show:
```
+----------------------------+
| [Icon 48px] App Name       |
|            Short tagline    |
|                             |
| [Category Tag]   [Stars]   |
| [Install] or [Open]        |
+----------------------------+
```

Key elements:
- **Large, high-quality icon** (not a tiny favicon)
- **One-line tagline** (not a paragraph)
- **Status indicator**: Installed / Running / Update Available
- **Action button**: context-sensitive (Install / Open / Update)
- **Category tag**: small pill badge
- **Social proof**: star count or "Used by X servers"

Cards should have visible boundaries (border + shadow) and clear hover states. The current LivOS cards (surface-1 + border-subtle) are nearly invisible.

#### 3C. App Detail Page

When a user clicks an app, the detail page should be a sheet/modal (not a full page navigation) containing:

```
+---------------------------------------------------+
| [Back]                                    [X Close]|
|                                                     |
| [Icon 64px]  App Name v2.1.3                       |
|              By Developer Name                      |
|              [Category] [Docker] [Open Source]       |
|                                                     |
| [Install]  [Website]  [Source Code]                 |
|                                                     |
| --- Screenshots ---                                 |
| [Screenshot carousel with 3-4 images]               |
|                                                     |
| --- Description ---                                 |
| Full markdown description with formatting...         |
|                                                     |
| --- Configuration ---                               |
| Port: [8080]  Data Path: [/data]                    |
| Environment variables table...                       |
|                                                     |
| --- Resource Requirements ---                        |
| RAM: ~256MB  CPU: Low  Storage: ~500MB              |
|                                                     |
| --- Changelog ---                                   |
| v2.1.3: Bug fixes and performance improvements      |
| v2.1.0: New feature X, improved Y                   |
+---------------------------------------------------+
```

Critical missing element in most self-hosted stores: **screenshots.** Without screenshots, every app looks identical (just an icon and text). LivOS should require or auto-generate screenshots for listed apps.

---

## 4. File Manager Modern Designs

### What Makes a File Manager Feel Modern

#### 4A. View Modes

Modern file managers offer at minimum three views:
1. **List view** -- Dense rows with columns (name, size, date, type). Best for many files.
2. **Grid/Thumbnail view** -- Cards with large previews. Best for images/media.
3. **Column/Miller view** -- Cascading columns showing hierarchy. Best for deep folder structures.

LivOS currently has list view only. Adding grid view (with image thumbnails) and column view would be a significant upgrade.

#### 4B. Navigation

**Breadcrumb bar** (clickable path segments):
```
Home / Documents / Projects / LivOS / src
```

Each segment is clickable to jump back. The last segment can be editable (click to type a path directly). This is standard in every modern file manager.

**Sidebar with quick access:**
```
[Favorites]
  Home
  Documents
  Downloads
  Shared

[Storage]
  /opt/livos
  /mnt/external

[Tags]
  Important
  Work
  Personal
```

#### 4C. Inline Preview

When selecting a file, a preview panel appears (right side or bottom):
```
+----------------------------------+----------------+
| File List                        | Preview Panel  |
|                                  |                |
| [x] document.pdf                 | [PDF Preview]  |
|     photo.jpg                    |                |
|     script.sh                    | Name: doc.pdf  |
|     backup.tar.gz                | Size: 2.4 MB   |
|                                  | Modified: Today |
|                                  | Type: PDF      |
|                                  |                |
|                                  | [Open] [Share] |
|                                  | [Download]     |
+----------------------------------+----------------+
```

This eliminates the need to open files just to see what they are. Images show thumbnails, PDFs show first page, text files show content preview, videos show a frame.

#### 4D. Drag and Drop

Modern file managers support:
- Drag files between folders (move)
- Drag files to upload (from desktop to browser)
- Drag files to download (from browser to desktop, less common in web)
- Multi-select with Shift+Click and Ctrl+Click

#### 4E. Modern Touches

- **File type icons**: Color-coded by type (blue for docs, green for spreadsheets, red for PDFs, purple for code). Not generic folder/file icons.
- **Hover actions**: When hovering a row, show quick action buttons (share, delete, rename) without right-clicking.
- **Status indicators**: Syncing, shared, locked.
- **Search**: Real-time filtering as you type, with search scoped to current folder or global.
- **Bulk actions toolbar**: Appears when files are selected, showing count and available actions.
- **Empty states**: When a folder is empty, show a friendly illustration and "Upload files" CTA, not just blank space.

**How LivOS should implement:**
- Add grid view with thumbnails (Priority: High)
- Add breadcrumb navigation (Priority: High)
- Add inline preview panel (Priority: Medium)
- Add file type color coding (Priority: Low, high visual impact)
- Add hover quick actions (Priority: Medium)
- Add real-time search filtering (Priority: High)

---

## 5. AI Chat Interface Trends

### How Modern AI Interfaces Work (2025-2026)

#### 5A. Layout Structure

The dominant pattern across ChatGPT, Claude, and Gemini is:

```
+-------------------+-------------------------------+
| Conversation      | Active Chat                   |
| Sidebar           |                               |
|                   | [System/Model info]           |
| [New Chat]        |                               |
|                   | User: message                 |
| Today             |                               |
|   Chat about X    | AI: response with markdown    |
|   Debug issue Y   |     code blocks               |
|                   |     tool call indicators       |
| Yesterday         |                               |
|   Research Z      |                               |
|                   |                               |
| Projects          |                               |
|   [Project A]     |                               |
|   [Project B]     |                               |
|                   |                               |
+-------------------+-------------------------------+
|                   | [Input Area]                  |
|                   | [Attach] Type message... [Send]|
+-------------------+-------------------------------+
```

**Key elements:**
- **Conversation sidebar**: Grouped by time (Today, Yesterday, Last Week). Searchable. Renameable. Deletable.
- **Message area**: Wide, centered content with max-width (~720px) for readability.
- **Input area**: Fixed at bottom. Supports multiline. Attach button for files. Model selector.

#### 5B. Claude's Artifact Panel (Key Innovation)

Claude introduced the "Artifact" pattern: when the AI generates code, documents, or visualizations, they appear in a separate side panel rather than inline in the chat. This keeps the conversation readable while providing a full-size editor/preview for generated content.

```
+-------------------+-------------------+-------------------+
| Sidebar           | Chat              | Artifact Panel    |
|                   |                   |                   |
| Conversations     | User: Build a     | [Code Preview]    |
|                   | landing page      |                   |
|                   |                   | index.html        |
|                   | AI: Here is the   | <!DOCTYPE html>   |
|                   | landing page...   | <html>            |
|                   |                   |   ...             |
|                   |                   |                   |
|                   |                   | [Copy] [Download] |
|                   |                   | [Edit] [Version]  |
+-------------------+-------------------+-------------------+
```

**How LivOS should adapt this:**
Nexus (the AI) executes tool calls (shell commands, Docker operations, file operations). Instead of showing raw JSON tool calls in the chat, LivOS should show:

1. **Tool call cards** -- Collapsible cards that show what the AI is doing:
```
[Tool: Docker] Starting container "nextcloud"
  > Status: Success
  > Container ID: abc123...
  [Show Full Output v]
```

2. **Result panels** -- When the AI generates a file, config, or complex output, show it in a side panel with syntax highlighting and copy/download buttons.

3. **Action confirmations** -- Before destructive actions (delete, restart), show an inline confirmation:
```
AI: I will restart the Plex container. This will cause ~30s of downtime.
  [Confirm Restart]  [Cancel]
```

#### 5C. Input Area Patterns

Modern AI inputs are not just text boxes:
```
+----------------------------------------------------+
| [Attach File]  [@ Mention Context]  [/ Commands]   |
|                                                     |
| Type your message...                                |
|                                                     |
| [Model: Nexus]  [Temperature]          [Send ->]   |
+----------------------------------------------------+
```

- **Slash commands**: /restart, /status, /backup -- quick actions without natural language
- **@ mentions**: @nextcloud, @pihole -- reference specific services for context
- **File attachments**: Drag files into chat for AI analysis
- **Suggested prompts**: When chat is empty, show suggestion chips: "Check system status", "Update all apps", "Show recent logs"

#### 5D. Streaming and Progress Indicators

When the AI is "thinking" or executing tools:
- Show a typing indicator with the AI avatar
- For tool calls, show a progress stepper:
  ```
  [1. Analyzing request] -> [2. Executing command] -> [3. Processing result]
  ```
- For long operations, show a progress bar within the tool card
- Streaming text should appear word-by-word (already implemented via SSE)

---

## 6. Settings Page Patterns

### How Top Apps Organize Settings

#### 6A. The Linear/Vercel Pattern

```
+-------------------+-------------------------------+
| Settings Sidebar  | Settings Content              |
|                   |                               |
| [Search settings] | General                       |
|                   | ________________________________|
| General           |                               |
| Appearance        | Server Name                   |
| Network           | [LivOS Home Server]           |
| Security          |                               |
| Users             | Language                      |
| Docker            | [English v]                   |
| Backups           |                               |
| AI / Nexus        | Timezone                      |
| Integrations      | [UTC+0 v]                     |
| Advanced          |                               |
|                   | ________________________________|
|                   |                               |
|                   | Danger Zone                   |
|                   | [Factory Reset]  [Shutdown]   |
|                   |                               |
+-------------------+-------------------------------+
```

**Key principles from Linear, Notion, and Vercel:**

1. **Left sidebar for categories**: Always visible, shows all sections at a glance. Active section highlighted. Scrollable for many sections.

2. **Search in settings**: A search bar at the top of the sidebar that filters sections AND individual settings. Typing "port" should highlight the Network section and scroll to the port field.

3. **Grouped sections with clear headings**: Each settings page is divided into logical groups with horizontal dividers and group headings.

4. **Inline save, not submit buttons**: Changes save automatically or on blur. No "Save Settings" button at the bottom (Vercel pattern). Show a subtle "Saved" confirmation toast.

5. **Danger zone**: Destructive actions (reset, delete, shutdown) are always at the bottom, visually separated with a red-tinted section.

6. **Deep linking**: Each settings section has a URL (`/settings/network`) so users can link directly to a specific setting.

#### 6B. Settings Content Patterns

Each setting should follow this structure:
```
Setting Label                          [Control]
Description text explaining what
this setting does and its impact.
```

Controls should be:
- **Toggle switches** for boolean settings (not checkboxes)
- **Select dropdowns** for enumerated options
- **Text inputs** for strings/numbers
- **Sliders** for ranges (like AI temperature)
- **Color pickers** for theme colors

#### 6C. Specific Settings Pages for LivOS

**Appearance:**
```
Theme                   [Dark v]  (only dark for v1)
Accent Color            [Color Picker]
Wallpaper               [Gallery of wallpapers]
Dock Position           [Bottom] [Left] [Hidden]
Density                 [Comfortable] [Compact]
Animations              [On / Reduced / Off]
Font Size               [--slider--]
```

**Network:**
```
Domain                  [livinity.cloud]
HTTPS                   [Enabled - Auto via Caddy]
Ports                   [Table of port mappings]
Reverse Proxy Rules     [Table with add/edit/delete]
```

**Security:**
```
Two-Factor Auth         [Enable 2FA]
Session Timeout         [24 hours v]
Active Sessions         [Table with revoke buttons]
SSH Access              [Enabled / Disabled]
Allowed IPs             [Whitelist table]
```

**AI / Nexus:**
```
AI Model                [Select provider/model]
API Key                 [**** Configured]
Temperature             [--0.7--]
Max Tokens              [4096]
Channels
  WhatsApp              [Connected - +1 234...]
  Telegram              [Connected - @bot]
  Discord               [Connected - Server X]
Memory                  [Enabled] [Clear Memory]
Tools                   [Table of enabled/disabled tools]
```

---

## 7. Unique Visual Identity

### How to Make LivOS NOT Look Like an Umbrel Clone

#### 7A. The Problem with the Current Aesthetic

LivOS currently uses:
- Dark glassmorphism (translucent panels over wallpaper)
- macOS-style dock with magnification
- Grid of rounded square icons
- Plus Jakarta Sans font

This is indistinguishable from Umbrel. Every element screams "iOS/macOS clone in a browser."

#### 7B. Creating a Distinct Identity

**Option 1: "The Terminal" -- Developer-First Aesthetic**

Lean into the server/developer identity. LivOS is a SERVER OS, not a phone OS.

- **Typography**: Use a monospace or semi-monospace font for headings (JetBrains Mono, IBM Plex Mono, or Berkeley Mono). Body text in Inter or IBM Plex Sans. This immediately signals "this is a tool, not a toy."
- **Color**: Deep navy/midnight blue as the primary background (not pure black). A vivid accent (electric blue, mint green, or amber) for interactive elements. NOT the wallpaper-derived dynamic color -- that is an Umbrel pattern.
- **Layout**: Sidebar navigation, not dock. Dense information layout, not sparse icon grid.
- **Surfaces**: Solid surfaces with subtle noise texture, not transparent glass. Glass effects are overused and perform poorly.
- **Borders**: Visible, intentional borders. Not invisible gossamer threads.
- **Code aesthetic**: Inline code snippets, monospace data displays, terminal-like status readouts.

```
Background: #0B1120 (deep navy)
Surface-1:  #111827 (dark slate)
Surface-2:  #1F2937 (medium slate)
Border:     #374151 (visible gray)
Accent:     #06B6D4 (cyan) or #10B981 (emerald)
Text:       #F9FAFB (near-white)
Text-2:     #9CA3AF (medium gray)
```

**Option 2: "The Studio" -- Premium Creative Tool Aesthetic**

Position LivOS as a high-end creative tool, like Linear or Raycast.

- **Typography**: Geist (Vercel's font) or Inter Tight for headings. Clean, geometric, modern.
- **Color**: True black (#000000) or near-black (#0A0A0A) background. Pure white text. Single vibrant accent color used sparingly.
- **Layout**: Clean grid with generous whitespace. Subtle animations. Precision alignment.
- **Surfaces**: Very slightly elevated solid panels. No transparency. Separation via shadow only.
- **Borders**: Almost none. Use shadow and spacing for separation instead.
- **Motion**: Spring animations for state changes. Smooth, dampened, never bouncy.

```
Background: #000000 or #0A0A0A
Surface-1:  #141414
Surface-2:  #1A1A1A
Surface-3:  #262626
Border:     #262626 (only when needed)
Accent:     #FFFFFF (white as accent) + one color for CTAs
Text:       #FAFAFA
Text-2:     #737373
```

**Option 3: "The Bridge" -- Command Center Aesthetic (RECOMMENDED)**

Position LivOS as a mission control / command center for your server. Authoritative, information-dense, professional.

- **Typography**: Inter for body, DM Sans or Manrope for headings (wider, more authoritative than Jakarta Sans). Tabular numbers for all data displays.
- **Color**: Dark charcoal (#111111) base. Accent: a distinctive duo-tone palette (e.g., cyan + orange, or violet + gold). Status colors are prominent (green=healthy, amber=warning, red=error, blue=info).
- **Layout**: Three-zone layout: Sidebar (navigation) + Main (content) + Optional Panel (details/AI). Bento-grid home screen with live data widgets.
- **Surfaces**: Solid with very subtle gradient (top-to-bottom darken). 1px solid borders, visible but not heavy.
- **Icons**: Filled icons, not line icons. More weight and presence. Consider Phosphor Icons (has fill variants) or custom icons.
- **Data visualization**: Mini sparkline charts in widgets. Color-coded status dots. Progress rings.

```
Background: #111111
Surface-1:  #191919
Surface-2:  #222222
Surface-3:  #2A2A2A
Border:     #333333 (always visible)
Accent-1:   #7C3AED (violet) -- primary actions
Accent-2:   #F59E0B (amber) -- secondary accent / warnings
Success:    #10B981
Error:      #EF4444
Info:       #3B82F6
Text:       #EDEDED
Text-2:     #888888
```

#### 7C. Dark Theme Best Practices (2025-2026)

Research from multiple sources converges on these principles:

1. **DO NOT use pure black (#000000).** Use dark gray (#111111 to #1A1A1A). Pure black creates excessive contrast and eye strain. Google Material Design recommends #121212.

2. **DO NOT rely on white opacity for surfaces.** The current LivOS system (rgba(255,255,255,0.04-0.14)) produces invisible surfaces on most monitors. Use solid colors with slight lightness variation.

3. **DO use APCA contrast ratios** instead of WCAG 2. APCA (Accessible Perceptual Contrast Algorithm) better models how humans perceive contrast on dark backgrounds. Minimum Lc 60 for body text, Lc 75 for important text.

4. **DO desaturate colors on dark backgrounds.** Fully saturated colors (#FF0000 red, #00FF00 green) are harsh on dark backgrounds. Reduce saturation by 20-30% and increase lightness.

5. **DO use elevation via lightness, not shadows.** On dark themes, higher elements should be LIGHTER, not just have bigger shadows. This is the opposite of light themes where elevation = shadow. Material Design uses lighter surface colors for higher elevation.

6. **DO use consistent border radius.** Pick ONE radius value for components (8px, 10px, or 12px) and use it everywhere. Having 8px, 12px, 16px, 20px, 24px, 28px creates visual noise. LivOS currently uses six different radii.

7. **DO add micro-interactions.** Hover states, focus rings, button press feedback, loading skeletons. These make the UI feel alive without being distracting. Prefer opacity and transform animations over color animations.

8. **DO support reduced motion.** All animations should respect `prefers-reduced-motion`. Provide a manual toggle in settings.

#### 7D. Typography Recommendations

**Primary (Headings): Geist Sans or DM Sans**
- Geist: Created by Vercel. Clean, geometric, modern. Has a mono variant (Geist Mono). Available on Google Fonts/npm.
- DM Sans: Wider letterforms than Inter, feels more authoritative for headings.

**Secondary (Body): Inter**
- The industry standard for UI text. Designed specifically for screens. Excellent at small sizes. Has tabular-number support.

**Monospace (Code/Data): Geist Mono or JetBrains Mono**
- For terminal output, code blocks, technical data, port numbers, IP addresses, container IDs.

**Why not Plus Jakarta Sans?**
Jakarta Sans is a perfectly good font, but it is heavily associated with Umbrel (which uses it as its primary font). Switching the font is the single most effective way to break the visual association.

#### 7E. Animation and Motion

Replace the current spring animations (mass: 0.1, stiffness: 150, damping: 10 -- too bouncy) with more professional motion:

**Recommended spring config:**
```
mass: 1.0
stiffness: 300
damping: 30
```

This produces a quick, slightly underdamped motion that feels responsive without being playful.

**Duration-based animations:**
```
Hover transitions: 150ms ease-out
Sheet open/close: 300ms cubic-bezier(0.32, 0.72, 0, 1)
Sidebar expand: 200ms ease-out
Toast appear: 200ms ease-out, dismiss: 150ms ease-in
```

**Reduce animation surface area.** Not everything needs to animate. Focus animation budget on:
- Page transitions
- Sheet/modal open and close
- Toast notifications
- Loading states (skeleton shimmer)
- Hover feedback (subtle scale or brightness)

---

## 8. New Feature Ideas

### Features That Would Make LivOS Stand Out

#### 8A. AI-First Features (Nexus Integration)

**1. Natural Language System Control**
Let users type commands in natural language anywhere in the UI:
```
"How much disk space do I have left?"
"Stop all Docker containers"
"Show me which apps need updates"
"Create a backup of my Nextcloud data"
"Set up a reverse proxy for port 3000 at app.mydomain.com"
```

This is LivOS's killer feature. No other self-hosted OS has a built-in AI that can actually execute system commands. Make it prominent, not hidden.

**2. AI Dashboard Insights**
On the home screen, show AI-generated insights:
```
+-------------------------------------------+
| Nexus Insights                            |
| > Your Plex server has been using 90%     |
|   CPU for the past 3 hours. Consider      |
|   limiting transcoding.                   |
| > 3 apps have updates available.          |
| > Disk usage is at 78%. You may want      |
|   to clean up old Docker images.          |
| [Ask Nexus About This]                    |
+-------------------------------------------+
```

**3. AI-Powered Troubleshooting**
When a service goes down, instead of just showing a red dot, show:
```
[!] Nextcloud is not responding
    Nexus analyzed the logs and found:
    "PHP memory limit exceeded"
    Suggested fix: Increase PHP memory to 512MB
    [Apply Fix]  [View Logs]  [Ask Nexus]
```

**4. Conversational App Installation**
Instead of just clicking "Install" in the app store:
```
User: "I want to set up a media server"
Nexus: "I recommend Jellyfin for a self-hosted media server.
        I'll need to:
        1. Install Jellyfin container
        2. Set up a media directory at /mnt/media
        3. Configure reverse proxy at media.yourdomain.com

        Should I proceed? [Yes] [Customize] [Other Options]"
```

#### 8B. Dashboard Widgets

**1. System Health Ring**
A single circular visualization showing overall system health:
```
    ___
   / G \    G = Green (healthy)
  | 97% |   97% = composite health score
   \___/
  CPU RAM NET DISK
```

**2. Docker Container Grid**
Visual grid of all containers with real-time status:
```
[Nextcloud ] [Plex     ] [PiHole   ]
  Running     Running     Warning
  128MB RAM   2.1GB RAM   64MB RAM

[Caddy     ] [Redis    ] [Postgres ]
  Running     Running     Running
  32MB RAM    45MB RAM    96MB RAM
```

Each container tile shows: name, status color, memory usage. Click to expand: logs, restart, settings.

**3. Network Monitor**
Live bandwidth chart with current connections:
```
  IN: 12 MB/s  ||||||||||||
  OUT: 3 MB/s  ||||

  Active: 23 connections
  Blocked: 7 (today)
```

**4. Uptime Timeline**
Visual timeline of service uptime over the past 24h/7d/30d:
```
Nextcloud  [||||||||||||||||||||||||] 100% 30d
Plex       [|||||||||||| ||||||||||] 99.2% 30d
PiHole     [||||||||||||||||||| |||] 98.7% 30d
```

**5. Quick Actions Widget**
One-tap shortcuts for common operations:
```
[Update All Apps]  [Create Backup]  [Restart Docker]
[View Logs]        [Clear Cache]    [Reboot Server]
```

#### 8C. Unique UX Features

**1. Floating Island Notifications**
LivOS already has a floating-island module. Expand it to be a Dynamic Island-style notification center:
- Show background task progress (backup running, app installing)
- Show AI processing status (Nexus is thinking)
- Show system alerts (high CPU, disk full, service down)
- Animate between compact (pill) and expanded (card) states

**2. Split View**
Allow two sheets/windows side by side:
- File Manager + Terminal (for server management)
- AI Chat + App Settings (for guided configuration)
- Docker Logs + System Monitor (for debugging)

**3. Keyboard Shortcuts System**
```
Cmd+K         Command palette
Cmd+/         Toggle AI chat
Cmd+E         Quick file search
Cmd+T         Open terminal
Cmd+1-9       Switch to app by position
Cmd+,         Open settings
Cmd+Shift+B   Create backup
Escape        Close active panel/sheet
```

Display shortcuts in context menus and tooltips. Show a keyboard shortcut cheat sheet (Cmd+?).

**4. Activity/Audit Log**
A timeline of all system events:
```
14:32  Nexus installed Jellyfin
14:30  User started backup job
14:15  Docker image nextcloud updated to 28.0.2
13:45  Caddy renewed SSL for mydomain.com
13:00  Automated backup completed (2.3 GB)
12:30  PiHole blocked 1,247 queries (last hour)
```

Searchable, filterable, exportable. Each entry links to the relevant resource.

**5. Connection/Dependency Map**
Visual graph showing how services connect:
```
[Internet] --> [Caddy] --> [Nextcloud] --> [Postgres]
                    |
                    +--> [Plex]
                    |
                    +--> [PiHole]

[Redis] <--> [Nexus] <--> [BullMQ]
```

This helps users understand their infrastructure at a glance.

#### 8D. Mobile-Specific Features

**1. Bottom Sheet Navigation**
On mobile, replace the dock with a bottom sheet:
- Swipe up from bottom to reveal app grid + quick actions
- Pull further to reveal full navigation
- Similar to iOS Control Center

**2. Widget-Based Mobile Home**
On mobile, the home screen should be a vertical scroll of widgets (like iOS/Android home screen widgets), not a desktop-style grid that requires zooming.

**3. Push Notifications**
For mobile browsers (PWA):
- Service alerts ("Nextcloud is down")
- Backup completion
- AI responses to queued questions
- Security alerts ("New SSH login from unknown IP")

---

## 9. Actionable Design Recommendations for LivOS

### Priority Tier 1: Identity Overhaul (Do First)

These changes break the Umbrel association and establish LivOS's own identity:

| Change | Impact | Effort |
|--------|--------|--------|
| Replace Plus Jakarta Sans with Inter (body) + Geist/DM Sans (headings) + Geist Mono (code) | Instantly different font personality | Low -- font swap in config |
| Switch from white-opacity surfaces to solid dark surfaces (#191919, #222222, #2A2A2A) | Surfaces become visible, professional | Medium -- update design tokens |
| Add visible 1px borders (#333333) to all containers | Clear visual hierarchy | Low -- update border tokens |
| Choose a fixed accent color (not wallpaper-derived) | Consistent brand identity | Low -- set CSS variable |
| Replace line icons (Tabler) with filled icons (Phosphor) | More weight and presence | Medium -- icon swap |
| Reduce border-radius spread: use 8px (elements), 12px (cards), 16px (sheets) only | Tighter, more intentional | Low -- update radius tokens |

### Priority Tier 2: Navigation Overhaul (Do Second)

These changes make LivOS functionally different from Umbrel:

| Change | Impact | Effort |
|--------|--------|--------|
| Add collapsible sidebar as primary navigation | Scales better, shows status | High -- new component |
| Add command palette (Cmd+K) with cmdk/shadcn | Power user speed | Medium -- integrate library |
| Replace icon grid home screen with bento widget grid | Information density | High -- new layout system |
| Make the dock optional (sidebar replaces it on desktop) | Removes Umbrel's most iconic element | Medium -- conditional rendering |

### Priority Tier 3: Feature Differentiation (Do Third)

These changes make LivOS uniquely valuable:

| Change | Impact | Effort |
|--------|--------|--------|
| Prominent AI chat access (sidebar item, Cmd+/ shortcut) | AI is the differentiator | Low -- routing change |
| Tool call visualization cards in AI chat | Shows AI capability visually | Medium -- new component |
| AI insights widget on home screen | Proactive intelligence | Medium -- new widget |
| System health ring widget | At-a-glance server status | Medium -- new widget |
| Docker container status grid widget | Visual container management | Medium -- new widget |
| Keyboard shortcuts system with Cmd+? cheat sheet | Power user delight | Medium -- keybinding system |

### Priority Tier 4: Polish (Do Last)

These changes elevate the overall quality:

| Change | Impact | Effort |
|--------|--------|--------|
| File manager: add grid view + breadcrumbs | Modern file management | High -- new view mode |
| App store: add featured hero, Netflix-style rows, screenshots | Engaging browsing | Medium -- layout refactor |
| Settings: add search, sidebar categories, inline save | Professional settings UX | Medium -- component work |
| Activity/audit log page | System transparency | Medium -- new page |
| Refined animations (reduce bounciness, add loading skeletons) | Professional feel | Low -- spring config changes |
| Empty states with illustrations | Polished completeness | Low -- add SVG illustrations |

### Summary: The LivOS Identity

**LivOS is NOT:** A phone OS in a browser (Umbrel). A bookmarks page (Homepage). A developer tool (Dashy). An admin panel (Cosmos).

**LivOS IS:** A command center for your personal server. Information-dense but not overwhelming. AI-first but not AI-only. Beautiful but functional. For people who care about their data and want to control it.

**Visual identity:**
- **Dark, solid surfaces** (not glass)
- **Visible borders** (not invisible)
- **Professional typography** (Inter + Geist Mono)
- **Sidebar navigation** (not dock)
- **Bento grid home** (not icon grid)
- **Status-aware** (green/amber/red everywhere)
- **AI-prominent** (Nexus is always accessible)
- **Keyboard-native** (Cmd+K for everything)

---

## 10. Sources

### Self-Hosted Server OS Projects
- [1] Umbrel. "umbrelOS." GitHub. https://github.com/getumbrel/umbrel
- [2] Cosmos Server. "Cosmos Cloud." GitHub. https://github.com/azukaar/Cosmos-Server
- [3] CasaOS. "CasaOS-UI." GitHub/DeepWiki. https://deepwiki.com/IceWhaleTech/CasaOS-UI
- [4] Homarr. "Homarr Dashboard." GitHub. https://github.com/homarr-labs/homarr
- [5] Dashy. "Dashy Dashboard." GitHub. https://github.com/Lissy93/dashy
- [6] Glance. "Glance Dashboard." GitHub. https://github.com/glanceapp/glance
- [7] Homepage. "gethomepage." GitHub. https://github.com/gethomepage/homepage
- [8] Runtipi. "Runtipi vs CasaOS vs Umbrel." https://doesmycode.work/posts/casaos-vs-umbrel-vs-runtipi/

### UI/UX Design Trends
- [9] Lummi. "2025 UI Design Trends." https://www.lummi.ai/blog/ui-design-trends-2025
- [10] Senorit. "Bento Grid Design Trend 2025." https://senorit.de/en/blog/bento-grid-design-trend-2025
- [11] Mockuuups Studio. "Best Bento Grid Design Examples 2026." https://mockuuups.studio/blog/post/best-bento-grid-design-examples/
- [12] LogRocket. "Linear Design: The SaaS Design Trend." https://blog.logrocket.com/ux-design/linear-design/
- [13] Vercel. "Web Interface Guidelines." https://vercel.com/design/guidelines
- [14] Landdding. "UI Design Trends 2026." https://landdding.com/blog/ui-design-trends-2026

### Dark Theme Design
- [15] DesignStudio. "10 Dark Mode UI Best Practices 2026." https://www.designstudiouiux.com/blog/dark-mode-ui-design-best-practices/
- [16] UiNKits. "Dark Mode UI Design Best Practices 2025." https://www.uinkits.com/blog-post/best-dark-mode-ui-design-examples-and-best-practices-in-2025
- [17] Tech-RZ. "Dark Mode Design Best Practices 2026." https://www.tech-rz.com/blog/dark-mode-design-best-practices-in-2026/
- [18] Digital Silk. "Why Dark Mode Design Converts Better 2026." https://www.digitalsilk.com/digital-trends/dark-mode-design-guide/

### AI Chat Interface Design
- [19] IntuitionLabs. "Conversational AI UI Comparison 2025." https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025
- [20] MultitaskAI. "Chat UI Design Trends 2025." https://multitaskai.com/blog/chat-ui-design/
- [21] Smashing Magazine. "Design Patterns for AI Interfaces." https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/
- [22] Shape of AI. "UX Patterns for AI Design." https://www.shapeof.ai/

### Navigation and Command Palette
- [23] Mobbin. "Command Palette UI Design." https://mobbin.com/glossary/command-palette
- [24] Navbar Gallery. "Best Sidebar Menu Design 2025." https://www.navbar.gallery/blog/best-side-bar-navigation-menu-design-examples
- [25] cmdk. "Command Menu for React." https://github.com/pacocoursey/cmdk
- [26] kbar. "Command Palette for React." https://github.com/timc1/kbar

### File Manager Design
- [27] FileBrowser. "Web File Browser." GitHub. https://github.com/filebrowser/filebrowser
- [28] Webix. "JavaScript File Manager Widget." https://webix.com/filemanager/
- [29] Dribbble. "File Manager Designs." https://dribbble.com/tags/file-manager

### Typography and Brand Identity
- [30] Spellbrand. "Brand Identity System Guide 2025." https://spellbrand.com/blog/brand-identity-system
- [31] Hubstic. "Tech Fonts Every Brand Needs 2025." https://www.hubstic.com/resources/blog/12-tech-fonts-every-brand-needs-in-2025
- [32] Shakuro. "Best Fonts for Web Design 2025." https://shakuro.com/blog/best-fonts-for-web-design

### Self-Hosted Ecosystem
- [33] Virtualization Howto. "Cosmos Server Review 2026." https://www.virtualizationhowto.com/2026/01/i-tested-cosmos-server-is-this-the-best-home-server-os-yet/
- [34] XDA Developers. "Self-Hosted Dashboards." https://www.xda-developers.com/self-hosted-dashboards-that-can-change-your-life/
- [35] Fulghum.io. "2026 is the Year of Self-Hosting." https://fulghum.io/self-hosting
- [36] SelfH.st. "Favorite New Self-Hosted Apps 2025." https://selfh.st/post/2025-favorite-new-apps/

### System Monitoring
- [37] XDA Developers. "Beszel Zero-Config Dashboard." https://www.xda-developers.com/zero-config-dashboard-i-wish-id-installed-on-day-one/
- [38] Grafana. "Docker Monitoring Dashboard." https://grafana.com/grafana/dashboards/893-main/

### Notification Design
- [39] Smashing Magazine. "Design Guidelines for Better Notifications UX." https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/
- [40] Toptal. "Notification Design Guide." https://www.toptal.com/designers/ux/notification-design

---

*Research compiled: 2026-02-06*
*For: LivOS v1.2 UI Redesign*
