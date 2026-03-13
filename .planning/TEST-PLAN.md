# LivOS Comprehensive Test Plan (A to Z)

**Version:** v7.2
**Server:** 45.137.194.103 (livinity.cloud)
**Date:** 2026-03-13

---

## A. Authentication & Login

### A1. Multi-User Login Screen
- [ ] **A1.1** Navigate to `https://livinity.cloud` — login screen appears with user avatars
- [ ] **A1.2** All users display with correct avatars and usernames (abuziddin-hairyleg, utopusc, can)
- [ ] **A1.3** Click user avatar — password field appears with focus
- [ ] **A1.4** Enter correct password — redirected to desktop
- [ ] **A1.5** Enter wrong password — error message shown, stays on login
- [ ] **A1.6** JWT token stored in cookie after login
- [ ] **A1.7** `LIVINITY_SESSION` cookie set with `domain=.livinity.cloud` for cross-subdomain auth
- [ ] **A1.8** Refresh page after login — stays logged in (token valid)
- [ ] **A1.9** Token expiry — after 7 days, redirected back to login

### A2. Invite System
- [ ] **A2.1** Admin navigates to Settings > Users — "Invite User" button visible
- [ ] **A2.2** Click "Invite" — generates invite URL with unique token
- [ ] **A2.3** Open invite URL in incognito — account creation form appears
- [ ] **A2.4** Create account with username (3+ chars) and password (6+ chars)
- [ ] **A2.5** Weak password rejected (< 6 chars)
- [ ] **A2.6** Duplicate username rejected
- [ ] **A2.7** Successful registration — redirected to desktop
- [ ] **A2.8** Invite token expires after 7 days — "Invite expired" shown
- [ ] **A2.9** Re-using invite token — "Invite already used" shown
- [ ] **A2.10** Non-admin user cannot access invite creation

### A3. Session Management
- [ ] **A3.1** Logout from desktop context menu — redirected to login
- [ ] **A3.2** Logout clears JWT cookie
- [ ] **A3.3** Multiple browser sessions — each independent
- [ ] **A3.4** Admin can view active sessions in Settings > Users
- [ ] **A3.5** Token renewal works (auto-refresh before expiry)

### A4. Two-Factor Authentication (2FA)
- [ ] **A4.1** Settings > 2FA — "Enable 2FA" button shown
- [ ] **A4.2** Click enable — QR code displayed for authenticator app
- [ ] **A4.3** Enter TOTP code from authenticator — 2FA enabled
- [ ] **A4.4** Wrong TOTP code rejected
- [ ] **A4.5** Login with 2FA enabled — TOTP prompt appears after password
- [ ] **A4.6** Correct TOTP — login succeeds
- [ ] **A4.7** Wrong TOTP — login rejected
- [ ] **A4.8** Disable 2FA from settings — TOTP no longer required at login

### A5. Password Change
- [ ] **A5.1** Settings > Change Password — form with current + new password fields
- [ ] **A5.2** Wrong current password — rejected
- [ ] **A5.3** New password < 6 chars — rejected
- [ ] **A5.4** Valid change — success message, old sessions still work
- [ ] **A5.5** Login with new password works

---

## B. Desktop UI

### B1. Dock
- [ ] **B1.1** Dock visible at bottom of screen with default app icons
- [ ] **B1.2** Hover over dock icon — magnification zoom effect
- [ ] **B1.3** Click dock icon — opens corresponding app/route
- [ ] **B1.4** Click "Home" dock icon — navigates to desktop (/)
- [ ] **B1.5** Click "Files" dock icon — opens file manager
- [ ] **B1.6** Click "Settings" dock icon — opens settings window
- [ ] **B1.7** Click "App Store" dock icon — opens app store
- [ ] **B1.8** Click "AI Chat" dock icon — opens AI chat window
- [ ] **B1.9** Running app indicator (dot) shown for open apps
- [ ] **B1.10** User-installed apps appear in dock when running

### B2. Wallpaper
- [ ] **B2.1** Desktop shows wallpaper on load
- [ ] **B2.2** Right-click desktop — context menu with "Change Wallpaper" option
- [ ] **B2.3** Select static wallpaper — applies immediately
- [ ] **B2.4** Select animated wallpaper — animation plays smoothly
- [ ] **B2.5** Wallpaper persists across page refreshes (stored in user_preferences)
- [ ] **B2.6** Different users see different wallpapers
- [ ] **B2.7** Animated wallpaper settings (speed, hue, brightness, saturation) saveable
- [ ] **B2.8** Wallpaper settings persist per-user in PostgreSQL

### B3. Apple Spotlight Search
- [ ] **B3.1** Press Cmd/Ctrl+K or click search button — spotlight opens
- [ ] **B3.2** Type app name — matching apps shown
- [ ] **B3.3** Type file name — matching files shown
- [ ] **B3.4** Select result — navigates to app/file
- [ ] **B3.5** Press Escape — spotlight closes
- [ ] **B3.6** Settings shortcuts searchable (e.g., "wifi", "backup")
- [ ] **B3.7** System apps (Home, Files, Settings, etc.) all searchable

### B4. Windows
- [ ] **B4.1** Opening an app creates a window with title bar
- [ ] **B4.2** Window draggable by title bar
- [ ] **B4.3** Close button (X) closes window
- [ ] **B4.4** Minimize button minimizes to dock
- [ ] **B4.5** Morph animation from dock icon when opening
- [ ] **B4.6** Multiple windows can be open simultaneously
- [ ] **B4.7** Clicking a window brings it to front (z-index)

### B5. Desktop Context Menu
- [ ] **B5.1** Right-click desktop — menu appears
- [ ] **B5.2** "Change Wallpaper" option present
- [ ] **B5.3** "Logout" option present
- [ ] **B5.4** Click outside menu — menu closes

---

## C. File Manager

### C1. Directory Navigation
- [ ] **C1.1** Open Files — Home directory shown
- [ ] **C1.2** Click directory — navigates into it
- [ ] **C1.3** Path breadcrumbs show current location
- [ ] **C1.4** Click breadcrumb segment — navigates to that level
- [ ] **C1.5** Back button returns to previous directory
- [ ] **C1.6** Sidebar shows: Home, Recents, Favorites, Trash
- [ ] **C1.7** Click "Home" in sidebar — returns to home directory
- [ ] **C1.8** Empty directory shows empty state message

### C2. File Operations
- [ ] **C2.1** Upload file — drag-and-drop to file area
- [ ] **C2.2** Upload file — click upload button, select file
- [ ] **C2.3** Upload shows progress in floating island
- [ ] **C2.4** Large file upload (100MB+) completes successfully
- [ ] **C2.5** Create new folder — right-click > New Folder
- [ ] **C2.6** Rename file/folder — right-click > Rename or click name
- [ ] **C2.7** Delete file — right-click > Delete — moved to Trash
- [ ] **C2.8** Download file — right-click > Download
- [ ] **C2.9** Copy file — right-click > Copy, then Paste
- [ ] **C2.10** Move file — right-click > Cut, then Paste
- [ ] **C2.11** Multiple selection (Ctrl+click) — bulk operations work
- [ ] **C2.12** Marquee selection (click and drag) — selects files in area

### C3. File Viewing
- [ ] **C3.1** Click image file — image viewer opens with zoom/pan
- [ ] **C3.2** Click video file — video player opens
- [ ] **C3.3** Click audio file — audio player opens with equalizer
- [ ] **C3.4** Click PDF file — PDF viewer opens
- [ ] **C3.5** Click text file — text preview shown
- [ ] **C3.6** Click unknown file type — download offered

### C4. Search & Sort
- [ ] **C4.1** Type in search bar — files matching name shown
- [ ] **C4.2** Search returns results from subdirectories
- [ ] **C4.3** Sort by name — alphabetical order
- [ ] **C4.4** Sort by date — most recent first
- [ ] **C4.5** Sort by size — largest first
- [ ] **C4.6** Sort by type — grouped by extension
- [ ] **C4.7** Toggle ascending/descending sort
- [ ] **C4.8** Toggle grid/list view

### C5. Trash
- [ ] **C5.1** Click "Trash" in sidebar — shows deleted files
- [ ] **C5.2** Right-click trashed file > Restore — file restored to original location
- [ ] **C5.3** Right-click trashed file > Delete Permanently — file gone
- [ ] **C5.4** Empty Trash — all trashed files permanently deleted

### C6. Favorites & Recents
- [ ] **C6.1** Right-click file/folder > Add to Favorites — appears in sidebar
- [ ] **C6.2** Click Favorites item — navigates to it
- [ ] **C6.3** Remove from Favorites — disappears from sidebar
- [ ] **C6.4** Recents tab shows recently accessed files
- [ ] **C6.5** Opening a file adds it to Recents

### C7. Archive Operations
- [ ] **C7.1** Select files > right-click > Archive — creates .zip
- [ ] **C7.2** Right-click .zip > Extract — contents extracted
- [ ] **C7.3** Archive with multiple files works
- [ ] **C7.4** Nested archives handled correctly

### C8. Per-User File Isolation
- [ ] **C8.1** User A's files NOT visible to User B
- [ ] **C8.2** Each user has own Home directory
- [ ] **C8.3** File paths isolated: `/users/{username}/files/`
- [ ] **C8.4** Admin can access system-level files
- [ ] **C8.5** Member cannot access other users' files

---

## D. AI Chat

### D1. Basic Chat
- [ ] **D1.1** Open AI Chat window — empty conversation or last conversation
- [ ] **D1.2** Type message and press Enter — message sent
- [ ] **D1.3** AI response streams in real-time
- [ ] **D1.4** Response renders markdown (bold, code blocks, lists)
- [ ] **D1.5** Long response auto-scrolls to bottom
- [ ] **D1.6** Can send follow-up messages (multi-turn)
- [ ] **D1.7** Empty message not sendable

### D2. Conversation Management
- [ ] **D2.1** Sidebar shows list of conversations
- [ ] **D2.2** Click "New Chat" — starts fresh conversation
- [ ] **D2.3** Click existing conversation — loads history
- [ ] **D2.4** Conversation title auto-generated from first message
- [ ] **D2.5** Delete conversation — removed from list
- [ ] **D2.6** Conversations persist across browser sessions
- [ ] **D2.7** Per-user conversations isolated (User A's chats invisible to User B)

### D3. Commands
- [ ] **D3.1** Type `/help` — shows available commands list
- [ ] **D3.2** Type `/usage` — shows token usage summary
- [ ] **D3.3** Type `/usage cost` — shows cost estimates
- [ ] **D3.4** Type `/usage tokens` — shows token counts
- [ ] **D3.5** Type `/new` — starts new conversation, clears context
- [ ] **D3.6** Type `/new haiku` — starts new conversation with haiku model
- [ ] **D3.7** Type `/compact` — compacts conversation context
- [ ] **D3.8** Type `/think high` — sets high thinking level
- [ ] **D3.9** Type `/verbose full` — sets full verbose output
- [ ] **D3.10** Type `/model sonnet` — switches to sonnet tier
- [ ] **D3.11** Commands return JSON response (not SSE stream)
- [ ] **D3.12** Unrecognized `/command` falls through to AI

### D4. Tool Calling
- [ ] **D4.1** Ask AI to run a shell command — tool execution shown
- [ ] **D4.2** Tool output displayed in terminal-style block
- [ ] **D4.3** Multi-tool calls execute sequentially
- [ ] **D4.4** Ask AI to read a file — file content shown
- [ ] **D4.5** Ask AI to search the web — search results returned
- [ ] **D4.6** Tool approval prompt shown when policy requires it
- [ ] **D4.7** Approve tool — execution continues
- [ ] **D4.8** Deny tool — execution stops for that tool

### D5. Streaming
- [ ] **D5.1** Response streams character by character
- [ ] **D5.2** Thinking/reasoning shown before response (Kimi reasoning_content)
- [ ] **D5.3** Stop button visible during streaming
- [ ] **D5.4** Click Stop — streaming halts immediately
- [ ] **D5.5** Partial response preserved after stop
- [ ] **D5.6** Network disconnect handled gracefully (reconnect or error message)

### D6. Voice Mode
- [ ] **D6.1** Voice button visible in AI Chat toolbar
- [ ] **D6.2** Click voice button — microphone permission requested
- [ ] **D6.3** Grant mic permission — push-to-talk activated
- [ ] **D6.4** Hold button and speak — audio captured
- [ ] **D6.5** Release button — audio sent for STT (Deepgram)
- [ ] **D6.6** Transcribed text appears as user message
- [ ] **D6.7** AI responds with text AND TTS audio (Cartesia)
- [ ] **D6.8** Audio plays through speakers
- [ ] **D6.9** WebSocket connection to `/ws/voice` established (proxied through livinityd)
- [ ] **D6.10** Voice mode uses haiku tier for speed
- [ ] **D6.11** Voice responses are short (under 2 sentences)
- [ ] **D6.12** No markdown in voice responses

### D7. Canvas & Artifacts
- [ ] **D7.1** AI generates code artifact — canvas panel appears
- [ ] **D7.2** Canvas shows rendered artifact (HTML/React)
- [ ] **D7.3** Canvas shows code source
- [ ] **D7.4** Multiple artifacts per conversation
- [ ] **D7.5** Artifact versioning (updates tracked)

### D8. Per-User AI Isolation
- [ ] **D8.1** User A's conversations NOT visible to User B
- [ ] **D8.2** User A's tool calls execute in User A's context
- [ ] **D8.3** AI personalization applied per-user (role, style, use cases)
- [ ] **D8.4** Usage tracking per-user

---

## E. Settings

### E1. Account Settings
- [ ] **E1.1** Settings > Account — shows username, display name
- [ ] **E1.2** Change display name — saved and reflected
- [ ] **E1.3** Accent color picker — changes UI accent color
- [ ] **E1.4** Accent color persists per-user
- [ ] **E1.5** Language selector — changes UI language
- [ ] **E1.6** Temperature unit toggle (if present)

### E2. AI Configuration (Kimi)
- [ ] **E2.1** Settings > AI — shows "Kimi AI" section
- [ ] **E2.2** Not connected state — "Sign in with Kimi" button shown
- [ ] **E2.3** Click sign in — device auth flow starts (URL + code shown)
- [ ] **E2.4** Complete Kimi auth in browser — status changes to "Connected"
- [ ] **E2.5** Connected state shows green checkmark
- [ ] **E2.6** Sign Out button works — status returns to disconnected
- [ ] **E2.7** No Claude API key or Gemini sections visible

### E3. AI Personalization
- [ ] **E3.1** Personalization card visible in AI settings
- [ ] **E3.2** Select role (Developer, Student, Designer, etc.) — saves immediately
- [ ] **E3.3** Select response style (Concise, Balanced, Detailed) — saves immediately
- [ ] **E3.4** Toggle use cases (Coding, Research, Writing, etc.) — saves immediately
- [ ] **E3.5** Personalization persists per-user (different users see own settings)
- [ ] **E3.6** AI responses reflect selected personalization

### E4. Nexus Config (Agent Settings)
- [ ] **E4.1** Agent defaults: tier, max turns, timeout configurable
- [ ] **E4.2** Session management: reset triggers, compaction settings
- [ ] **E4.3** Retry configuration: max retries, backoff
- [ ] **E4.4** Logging level configurable
- [ ] **E4.5** Tool approval policy: always/destructive/never selectable
- [ ] **E4.6** Save — settings applied to next agent run
- [ ] **E4.7** Reset to defaults — restores original values

### E5. Voice Settings
- [ ] **E5.1** Deepgram API key input — saveable
- [ ] **E5.2** Cartesia API key input — saveable
- [ ] **E5.3** Voice selection dropdown (Cartesia voices)
- [ ] **E5.4** STT language/model selection
- [ ] **E5.5** Voice settings stored per-user in user_preferences
- [ ] **E5.6** Test voice connection after saving keys

### E6. Domain Setup
- [ ] **E6.1** Domain input field — enter domain name
- [ ] **E6.2** DNS verification check — shows pass/fail
- [ ] **E6.3** Activate HTTPS — Caddy obtains certificate
- [ ] **E6.4** Subdomain listing — shows all app subdomains
- [ ] **E6.5** Enable/disable individual subdomains
- [ ] **E6.6** Verify subdomain DNS records
- [ ] **E6.7** Remove domain — reverts to HTTP/localhost

### E7. User Management (Admin)
- [ ] **E7.1** Admin sees "Users" tab in settings
- [ ] **E7.2** List of all users with roles shown
- [ ] **E7.3** Change user role (admin ↔ member)
- [ ] **E7.4** Disable user account
- [ ] **E7.5** View user's active sessions
- [ ] **E7.6** Terminate user session
- [ ] **E7.7** Create invite link with expiry
- [ ] **E7.8** Member user cannot access user management

### E8. Integration Settings
- [ ] **E8.1** Telegram — enter bot token + chat ID, test connection
- [ ] **E8.2** Discord — enter app token + bot token, test connection
- [ ] **E8.3** Gmail — OAuth flow, connect Google account
- [ ] **E8.4** Gmail filters — configure senders, keywords, labels
- [ ] **E8.5** Slack — enter webhook URL, test connection
- [ ] **E8.6** Matrix — enter homeserver URL + room ID
- [ ] **E8.7** DM pairing policy — set to pairing/allowlist/open/disabled
- [ ] **E8.8** Integration configs stored per-user
- [ ] **E8.9** User A's Telegram config separate from User B's

### E9. Webhooks
- [ ] **E9.1** Create webhook — generates unique URL with secret
- [ ] **E9.2** POST to webhook URL — triggers action
- [ ] **E9.3** Delete webhook — URL no longer active
- [ ] **E9.4** List all webhooks with URLs

### E10. MCP Manager
- [ ] **E10.1** Browse MCP registry — list of available servers
- [ ] **E10.2** Search MCP servers by name
- [ ] **E10.3** Install MCP server — configuration saved
- [ ] **E10.4** View installed server's tools
- [ ] **E10.5** Restart MCP server
- [ ] **E10.6** Enable/disable MCP server
- [ ] **E10.7** Remove MCP server

### E11. Wallpaper Settings
- [ ] **E11.1** Settings > Wallpaper — preview grid of wallpapers
- [ ] **E11.2** Click static wallpaper — applies immediately
- [ ] **E11.3** Click animated wallpaper — animation plays
- [ ] **E11.4** Animation settings (speed, hue, brightness, saturation) adjustable
- [ ] **E11.5** Settings persist in PostgreSQL per-user

### E12. Software Updates
- [ ] **E12.1** Check for updates — shows current version
- [ ] **E12.2** Release channel selection (stable/beta)
- [ ] **E12.3** Update available — download and install button
- [ ] **E12.4** Update progress tracking
- [ ] **E12.5** Post-update "What's New" modal

### E13. Device Info & Advanced
- [ ] **E13.1** Device info shows: hostname, IP, uptime, CPU/RAM/disk
- [ ] **E13.2** System logs viewable
- [ ] **E13.3** App logs viewable
- [ ] **E13.4** Tor hidden service address shown (if enabled)
- [ ] **E13.5** Factory reset requires password confirmation
- [ ] **E13.6** Factory reset progress tracking

---

## F. App Store

### F1. Browsing
- [ ] **F1.1** Open App Store — discover page with categories
- [ ] **F1.2** Featured apps section visible
- [ ] **F1.3** Browse by category (Media, Utilities, etc.)
- [ ] **F1.4** Search apps by name — matching results shown
- [ ] **F1.5** Click app — detail page with description, screenshots
- [ ] **F1.6** App detail shows version, size, dependencies

### F2. Installation
- [ ] **F2.1** Click "Install" on uninstalled app — installation starts
- [ ] **F2.2** Installation progress shown (pulling image, starting)
- [ ] **F2.3** Dependencies dialog appears if app has dependencies
- [ ] **F2.4** Select optional dependencies — installed together
- [ ] **F2.5** Environment override dialog (if applicable)
- [ ] **F2.6** After install — button changes to "Open"
- [ ] **F2.7** Installed app appears in desktop dock

### F3. App Management
- [ ] **F3.1** Click "Open" — app opens in new tab/window
- [ ] **F3.2** Stop app — state changes to "stopped"
- [ ] **F3.3** Start app — state changes to "running"
- [ ] **F3.4** Restart app — brief downtime then running
- [ ] **F3.5** Uninstall app — container removed, data optionally kept
- [ ] **F3.6** App logs viewable in terminal window
- [ ] **F3.7** Default credentials shown (if applicable)

### F4. Subdomain Access
- [ ] **F4.1** Installed app accessible via `appname.livinity.cloud`
- [ ] **F4.2** Subdomain toggle in app settings
- [ ] **F4.3** Disabled subdomain returns 404
- [ ] **F4.4** Subdomain DNS verified
- [ ] **F4.5** HTTPS certificate works for subdomain

### F5. Community App Stores
- [ ] **F5.1** Add custom app store repository URL
- [ ] **F5.2** Browse apps from custom repository
- [ ] **F5.3** Install app from custom repository
- [ ] **F5.4** Remove custom repository

---

## G. Per-User Docker Isolation (v7.2)

### G1. Per-User App Installation
- [ ] **G1.1** Non-admin user clicks "Install" on already-global-installed app
- [ ] **G1.2** Separate Docker container created for user (`appname_server_user_username_1`)
- [ ] **G1.3** Dedicated port assigned (10000+)
- [ ] **G1.4** Dedicated volume created (`/data/users/username/app-data/appname/`)
- [ ] **G1.5** Compose file generated with resolved env vars (APP_DATA_DIR, UMBREL_ROOT, DEVICE_HOSTNAME)
- [ ] **G1.6** User's container is independent from global container
- [ ] **G1.7** Both containers run simultaneously on different ports
- [ ] **G1.8** `user_app_instances` table records instance correctly

### G2. Per-User Subdomain Routing
- [ ] **G2.1** Per-user subdomain format: `appname-username.livinity.cloud`
- [ ] **G2.2** Redis subdomain registry updated with per-user entry
- [ ] **G2.3** Caddy routes subdomain through livinityd gateway
- [ ] **G2.4** Gateway checks LIVINITY_SESSION cookie for authentication
- [ ] **G2.5** Gateway resolves per-user port from `user_app_instances` table
- [ ] **G2.6** Proxies request to correct container port
- [ ] **G2.7** User A's subdomain routes to User A's container (not global)
- [ ] **G2.8** User B's subdomain routes to User B's container

### G3. Per-User App Lifecycle
- [ ] **G3.1** Stop per-user app — only user's container stops
- [ ] **G3.2** Start per-user app — user's container starts
- [ ] **G3.3** Restart per-user app — user's container restarts
- [ ] **G3.4** Uninstall per-user app — removes user's container, volume, DB record
- [ ] **G3.5** Global app unaffected by per-user operations

### G4. Container Persistence
- [ ] **G4.1** Restart livinityd — per-user containers auto-restart
- [ ] **G4.2** `listAllUserAppInstances()` returns all per-user instances
- [ ] **G4.3** Each instance's compose file re-read and `docker compose up -d` called
- [ ] **G4.4** Container state matches DB state after restart

### G5. App Store UI (Per-User)
- [ ] **G5.1** Non-admin user sees "Install" for apps they don't have
- [ ] **G5.2** After install — button changes to "Open"
- [ ] **G5.3** myApps endpoint returns user-specific instances
- [ ] **G5.4** Per-user instance shows correct state (running/stopped)
- [ ] **G5.5** Admin sees all apps, members see only their own + shared

### G6. Port & Volume Isolation
- [ ] **G6.1** Manifest port (e.g., 8096) used as container internal port
- [ ] **G6.2** Host port auto-assigned (10000+), no conflicts
- [ ] **G6.3** Volume paths per-user: `/data/users/username/app-data/appname/`
- [ ] **G6.4** Storage volumes mapped to user's home directory
- [ ] **G6.5** Download volumes mapped to user's Downloads directory
- [ ] **G6.6** No volume cross-contamination between users

### G7. Manifest Compatibility
- [ ] **G7.1** Apps with `livinity-app.yml` load correctly
- [ ] **G7.2** Legacy apps with `umbrel-app.yml` load via fallback
- [ ] **G7.3** Manifest `port` field used for web UI port
- [ ] **G7.4** If no manifest port, compose port detection works (stripping /udp, /tcp)

---

## H. Multi-User Features

### H1. User Isolation
- [ ] **H1.1** User A's files invisible to User B
- [ ] **H1.2** User A's AI conversations invisible to User B
- [ ] **H1.3** User A's installed apps independent from User B's
- [ ] **H1.4** User A's wallpaper different from User B's
- [ ] **H1.5** User A's accent color different from User B's
- [ ] **H1.6** User A's integration configs separate from User B's
- [ ] **H1.7** User A's voice settings separate from User B's

### H2. Role-Based Access
- [ ] **H2.1** Admin can access all settings
- [ ] **H2.2** Admin can manage users (invite, disable, change role)
- [ ] **H2.3** Member cannot access user management
- [ ] **H2.4** Member cannot access admin-only settings
- [ ] **H2.5** Admin can view all apps
- [ ] **H2.6** Member sees only own + shared apps

### H3. App Sharing
- [ ] **H3.1** Admin grants app access to member
- [ ] **H3.2** Member can now see shared app in their app list
- [ ] **H3.3** Revoke access — app disappears from member's list
- [ ] **H3.4** Share dialog shows all users

---

## I. Server Control & Terminal

### I1. Terminal
- [ ] **I1.1** Open Terminal — xterm.js terminal appears
- [ ] **I1.2** Shell prompt responsive to input
- [ ] **I1.3** Run command (e.g., `ls`) — output shown
- [ ] **I1.4** Terminal WebSocket connection stable
- [ ] **I1.5** Terminal persists session on page refresh
- [ ] **I1.6** Terminal resizes on window resize
- [ ] **I1.7** App-specific terminal (logs for a specific app)

### I2. System Monitoring
- [ ] **I2.1** CPU usage displayed
- [ ] **I2.2** Memory usage displayed
- [ ] **I2.3** Disk usage displayed
- [ ] **I2.4** CPU temperature displayed
- [ ] **I2.5** System uptime displayed
- [ ] **I2.6** Values refresh periodically

---

## J. Domain & Caddy

### J1. Domain Configuration
- [ ] **J1.1** Enter domain name in settings
- [ ] **J1.2** DNS verification checks A record
- [ ] **J1.3** Public IP displayed for user to set DNS
- [ ] **J1.4** Activate — Caddy generates SSL certificate
- [ ] **J1.5** Site accessible via HTTPS after activation
- [ ] **J1.6** HTTP → HTTPS redirect works

### J2. Subdomain Routing
- [ ] **J2.1** Configure subdomain for app
- [ ] **J2.2** Subdomain resolves to correct app
- [ ] **J2.3** Multi-user mode: all subdomains route through gateway
- [ ] **J2.4** Gateway checks cookie authentication
- [ ] **J2.5** Unauthenticated request redirected to login
- [ ] **J2.6** Authenticated request proxied to app container

### J3. WebSocket Proxying
- [ ] **J3.1** App WebSocket connections work through subdomain
- [ ] **J3.2** Voice WebSocket (`/ws/voice`) proxied to nexus-core
- [ ] **J3.3** Terminal WebSocket (`/terminal`) works
- [ ] **J3.4** tRPC WebSocket (`/trpc`) works

---

## K. Backups

### K1. Repository Management
- [ ] **K1.1** Create backup repository (local or remote)
- [ ] **K1.2** Set repository password
- [ ] **K1.3** Connect to existing repository
- [ ] **K1.4** List all repositories
- [ ] **K1.5** Remove/forget repository

### K2. Backup Operations
- [ ] **K2.1** Run backup on-demand — progress shown
- [ ] **K2.2** Backup completes without errors
- [ ] **K2.3** List available backups with dates
- [ ] **K2.4** Browse backup contents

### K3. Restore
- [ ] **K3.1** Mount backup — browse files at point in time
- [ ] **K3.2** Restore individual file from backup
- [ ] **K3.3** Full system restore — warning shown
- [ ] **K3.4** Restore progress tracking
- [ ] **K3.5** Unmount backup after browse

### K4. Rewind UI
- [ ] **K4.1** Open Rewind in file manager
- [ ] **K4.2** Timeline slider to select date
- [ ] **K4.3** Files shown as they were at selected date
- [ ] **K4.4** Restore selected files from timeline

---

## L. Integrations

### L1. Telegram
- [ ] **L1.1** Enter bot token — saved per-user
- [ ] **L1.2** Enter chat ID — saved per-user
- [ ] **L1.3** Test connection — success/failure shown
- [ ] **L1.4** Send message from Telegram → AI responds
- [ ] **L1.5** AI can send messages back to Telegram

### L2. Discord
- [ ] **L2.1** Enter app token + bot token — saved per-user
- [ ] **L2.2** Test connection — success/failure shown
- [ ] **L2.3** Send message from Discord → AI responds
- [ ] **L2.4** AI can send messages back to Discord

### L3. Gmail
- [ ] **L3.1** Start OAuth flow — Google auth page opens
- [ ] **L3.2** Authorize — Gmail connected
- [ ] **L3.3** Configure email filters (senders, keywords, labels)
- [ ] **L3.4** Email notification received when matching email arrives
- [ ] **L3.5** Disconnect Gmail — clears OAuth tokens

### L4. DM Pairing
- [ ] **L4.1** Set pairing policy to "pairing"
- [ ] **L4.2** Send DM to bot — pairing code shown
- [ ] **L4.3** Enter code in LivOS UI — DM paired
- [ ] **L4.4** Subsequent DMs processed by AI
- [ ] **L4.5** Set policy to "disabled" — DMs ignored

---

## M. Skills & Subagents

### M1. Skills
- [ ] **M1.1** AI Chat > Skills panel — lists installed skills
- [ ] **M1.2** Browse marketplace — available skills shown
- [ ] **M1.3** Preview skill before install (permissions, description)
- [ ] **M1.4** Install skill — appears in installed list
- [ ] **M1.5** Uninstall skill — removed from list
- [ ] **M1.6** Skill triggers work (e.g., pattern matching on messages)
- [ ] **M1.7** Skill execution with scoped tools

### M2. Subagents
- [ ] **M2.1** Open Subagents window — list of configured subagents
- [ ] **M2.2** Create subagent — name, system prompt, skills, tier
- [ ] **M2.3** Execute subagent with message — response returned
- [ ] **M2.4** Subagent uses its own system prompt and tools
- [ ] **M2.5** Delete subagent — removed from list
- [ ] **M2.6** Schedule subagent (cron) — runs at configured times

---

## N. Schedules

### N1. Schedule Management
- [ ] **N1.1** Open Schedules window — list of schedules
- [ ] **N1.2** Create schedule — cron expression, task, timezone
- [ ] **N1.3** Schedule triggers at correct time
- [ ] **N1.4** Edit schedule — changes applied
- [ ] **N1.5** Delete schedule — no longer triggers
- [ ] **N1.6** Schedule status visible (active/paused)

---

## O. Live Usage & Statistics

### O1. Usage Dashboard
- [ ] **O1.1** Open Live Usage — token usage overview
- [ ] **O1.2** Input/output token counts displayed
- [ ] **O1.3** Session count displayed
- [ ] **O1.4** Daily usage graph (if available)
- [ ] **O1.5** Cost estimate (USD) shown
- [ ] **O1.6** Per-user usage tracking
- [ ] **O1.7** Data refreshes periodically

---

## P. Onboarding

### P1. New Account Setup
- [ ] **P1.1** First visit (no users) — onboarding wizard starts
- [ ] **P1.2** Step 1: Create admin account (name + password)
- [ ] **P1.3** Step 2: Select language
- [ ] **P1.4** Step 3: Select wallpaper
- [ ] **P1.5** Step 4: Option to restore from backup
- [ ] **P1.6** Complete — redirected to desktop
- [ ] **P1.7** Onboarding only shows once (won't re-appear)

### P2. Invited User Onboarding
- [ ] **P2.1** Accept invite — account creation form
- [ ] **P2.2** After account creation — personalization questions shown
- [ ] **P2.3** Select role, use cases, response style
- [ ] **P2.4** Preferences saved to user_preferences table
- [ ] **P2.5** Can skip personalization (defaults used)

---

## Q. Notifications

### Q1. System Notifications
- [ ] **Q1.1** Notification bell/icon visible in UI
- [ ] **Q1.2** Backup failure triggers notification
- [ ] **Q1.3** Update available triggers notification
- [ ] **Q1.4** Click notification — navigates to relevant area
- [ ] **Q1.5** Dismiss notification — removed from list

---

## R. External Storage & Network

### R1. External Storage
- [ ] **R1.1** Plug in USB drive — detected in Files sidebar
- [ ] **R1.2** Click external drive — browse contents
- [ ] **R1.3** Format drive (ext4/exfat) — format completes
- [ ] **R1.4** Mount/unmount drive

### R2. Network Shares (SMB)
- [ ] **R2.1** Discover SMB servers on network
- [ ] **R2.2** Enter credentials for SMB share
- [ ] **R2.3** Mount network share — browse contents
- [ ] **R2.4** Unmount network share

### R3. Samba Sharing
- [ ] **R3.1** Share folder via Samba — generates share URL
- [ ] **R3.2** Share password protected
- [ ] **R3.3** Access share from Windows/macOS
- [ ] **R3.4** Platform-specific instructions shown

---

## S. WebSocket Connections

### S1. WebSocket Health
- [ ] **S1.1** tRPC subscriptions via `/trpc` WebSocket
- [ ] **S1.2** Terminal via `/terminal` WebSocket
- [ ] **S1.3** Voice via `/ws/voice` WebSocket (proxied to nexus-core)
- [ ] **S1.4** All WebSockets require JWT token in query param
- [ ] **S1.5** Invalid token — socket destroyed
- [ ] **S1.6** No token — socket destroyed
- [ ] **S1.7** Unregistered WebSocket path — socket destroyed
- [ ] **S1.8** WebSocket reconnection after disconnect

---

## T. API Endpoints

### T1. tRPC Endpoints
- [ ] **T1.1** All tRPC queries require valid JWT (except public endpoints)
- [ ] **T1.2** Unauthorized request returns 401
- [ ] **T1.3** Invalid input returns validation error
- [ ] **T1.4** Rate limiting works (if configured)

### T2. Nexus REST API
- [ ] **T2.1** `/api/agent/stream` — accepts task, streams SSE response
- [ ] **T2.2** `/api/agent/stream` — handles commands before agent
- [ ] **T2.3** `/api/usage/summary/:userId` — returns usage stats
- [ ] **T2.4** `/api/usage/daily/:userId` — returns daily breakdown
- [ ] **T2.5** `/api/usage/overview` — returns system overview
- [ ] **T2.6** All Nexus endpoints require `X-Api-Key` or valid JWT

### T3. MCP API Proxy
- [ ] **T3.1** `/api/mcp/*` proxied to nexus-core (port 3200)
- [ ] **T3.2** Proxy requires valid `LIVINITY_PROXY_TOKEN` cookie
- [ ] **T3.3** Invalid token returns 401

---

## U. Performance & Stability

### U1. Page Load
- [ ] **U1.1** Desktop loads within 3 seconds
- [ ] **U1.2** Files loads within 2 seconds
- [ ] **U1.3** AI Chat loads within 2 seconds
- [ ] **U1.4** Settings loads within 1 second
- [ ] **U1.5** App Store loads within 2 seconds

### U2. Memory & Resources
- [ ] **U2.1** No memory leak after 30+ minutes of use
- [ ] **U2.2** No excessive CPU usage in idle state
- [ ] **U2.3** Multiple browser tabs don't crash server
- [ ] **U2.4** Docker containers stay within resource limits

### U3. Error Handling
- [ ] **U3.1** Network error shows user-friendly message
- [ ] **U3.2** Server error (500) shows error toast/message
- [ ] **U3.3** Component error caught by error boundary
- [ ] **U3.4** Expired JWT redirects to login (not crash)

---

## V. Security

### V1. Authentication Security
- [ ] **V1.1** JWT tokens expire after configured time
- [ ] **V1.2** Invalid JWT rejected at all endpoints
- [ ] **V1.3** Password not stored in plaintext (hashed)
- [ ] **V1.4** Cookie httpOnly flag set
- [ ] **V1.5** Cookie secure flag set (HTTPS)
- [ ] **V1.6** Cookie sameSite=lax
- [ ] **V1.7** CORS configured properly

### V2. Input Validation
- [ ] **V2.1** File paths validated (no path traversal)
- [ ] **V2.2** User input sanitized (no XSS)
- [ ] **V2.3** SQL injection prevented (parameterized queries)
- [ ] **V2.4** Command injection prevented in tool execution

### V3. Access Control
- [ ] **V3.1** Non-admin cannot access admin routes
- [ ] **V3.2** User cannot read other user's files
- [ ] **V3.3** User cannot read other user's preferences
- [ ] **V3.4** User cannot access other user's Docker containers
- [ ] **V3.5** Subdomain gateway enforces per-user access

---

## W. Cross-Browser Compatibility

### W1. Browser Support
- [ ] **W1.1** Chrome/Chromium — full functionality
- [ ] **W1.2** Firefox — full functionality
- [ ] **W1.3** Safari — full functionality (with WebSocket caveats)
- [ ] **W1.4** Edge — full functionality
- [ ] **W1.5** Mobile Chrome — responsive layout
- [ ] **W1.6** Mobile Safari — responsive layout

---

## X. Responsive Design

### X1. Mobile Layout
- [ ] **X1.1** Login screen responsive on mobile
- [ ] **X1.2** Desktop layout adapts to mobile (dock repositions)
- [ ] **X1.3** Files uses mobile-optimized layout
- [ ] **X1.4** Settings uses drawer-based navigation on mobile
- [ ] **X1.5** AI Chat usable on mobile (keyboard doesn't obscure input)
- [ ] **X1.6** App Store grid adapts to screen size

---

## Y. Data Persistence

### Y1. PostgreSQL
- [ ] **Y1.1** Users table populated correctly
- [ ] **Y1.2** User preferences persist across restarts
- [ ] **Y1.3** User app instances persist across restarts
- [ ] **Y1.4** Sessions tracked in database
- [ ] **Y1.5** App access records persist

### Y2. Redis
- [ ] **Y2.1** Domain config persists
- [ ] **Y2.2** Subdomain registry persists
- [ ] **Y2.3** AI conversation context persists
- [ ] **Y2.4** Integration configs persist

### Y3. File System
- [ ] **Y3.1** Uploaded files persist across restarts
- [ ] **Y3.2** Docker volumes persist across container restarts
- [ ] **Y3.3** JWT secret file persists
- [ ] **Y3.4** Kimi credentials persist

---

## Z. End-to-End Flows

### Z1. New User Complete Flow
- [ ] **Z1.1** Admin creates invite → shares URL
- [ ] **Z1.2** New user opens invite → creates account
- [ ] **Z1.3** Personalization questions → preferences saved
- [ ] **Z1.4** Desktop loads with default wallpaper
- [ ] **Z1.5** User opens Files → own home directory
- [ ] **Z1.6** User opens AI Chat → sends message → gets response
- [ ] **Z1.7** User opens App Store → installs app → opens app
- [ ] **Z1.8** User changes wallpaper → persists on refresh
- [ ] **Z1.9** User logs out → logs back in → all state preserved

### Z2. Multi-User App Isolation Flow
- [ ] **Z2.1** Admin installs Jellyfin globally
- [ ] **Z2.2** User B clicks Install on Jellyfin → per-user container created
- [ ] **Z2.3** User B opens `jellyfin-userb.livinity.cloud` → own Jellyfin instance
- [ ] **Z2.4** Admin opens `jellyfin.livinity.cloud` → global Jellyfin instance
- [ ] **Z2.5** Both instances run simultaneously
- [ ] **Z2.6** User B stops their Jellyfin → admin's still running
- [ ] **Z2.7** Server restart → both containers auto-restart

### Z3. AI Chat Complete Flow
- [ ] **Z3.1** User sends "What's the weather in Istanbul?"
- [ ] **Z3.2** AI uses web_search tool → returns answer
- [ ] **Z3.3** User sends follow-up → context maintained
- [ ] **Z3.4** User uses /new → fresh conversation
- [ ] **Z3.5** Previous conversation visible in sidebar
- [ ] **Z3.6** Click old conversation → history loaded
- [ ] **Z3.7** User uses voice mode → STT → AI → TTS

### Z4. Settings Persistence Flow
- [ ] **Z4.1** User A sets accent color → applies
- [ ] **Z4.2** User A sets wallpaper → applies
- [ ] **Z4.3** User A configures AI personalization
- [ ] **Z4.4** User B logs in → sees own defaults (not A's settings)
- [ ] **Z4.5** User A logs back in → all settings preserved
- [ ] **Z4.6** Server restart → all user settings preserved

### Z5. Domain & Subdomain Complete Flow
- [ ] **Z5.1** Set domain in settings
- [ ] **Z5.2** Verify DNS → passes
- [ ] **Z5.3** Activate HTTPS → certificate obtained
- [ ] **Z5.4** Access site via `https://domain.com` → works
- [ ] **Z5.5** Install app → subdomain registered
- [ ] **Z5.6** Access `appname.domain.com` → app loads
- [ ] **Z5.7** Per-user subdomain `appname-user.domain.com` → user's container

---

## Test Execution Notes

**Prerequisites:**
- Production server running (45.137.194.103 / livinity.cloud)
- Admin account: abuziddin-hairyleg or utopusc
- Member account: can
- All PM2 processes running (livos, nexus-core, nexus-mcp, nexus-memory, nexus-worker)
- PostgreSQL and Redis running

**Test Priority:**
1. **P0 (Critical):** A1-A5, D1, G1-G7, H1-H3, V1-V3 (Auth, AI, Docker isolation, Security)
2. **P1 (High):** C1-C8, D2-D8, E1-E13, F1-F5 (Files, Chat features, Settings, Apps)
3. **P2 (Medium):** B1-B5, I1-I2, J1-J3, L1-L4 (Desktop UI, Terminal, Domain, Integrations)
4. **P3 (Low):** K1-K4, M1-M2, N1, O1, P1-P2, Q1, R1-R3, W1, X1 (Backups, Skills, Schedules, etc.)

**Total Tests: ~350 test cases across 26 sections (A-Z)**
