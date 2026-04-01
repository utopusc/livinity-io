# Requirements: Livinity v24.0 Mobile Responsive UI

**Defined:** 2026-04-01
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v1 Requirements

### AI Chat

- [ ] **CHAT-01**: Chat sidebar (conversations + agents) works as a drawer on mobile with proper touch targets
- [ ] **CHAT-02**: Message bubbles don't overflow horizontally, code blocks scroll within container
- [ ] **CHAT-03**: Tool call cards are compact on mobile with expandable details
- [ ] **CHAT-04**: Chat input area with file upload is properly sized and positioned on mobile

### Settings

- [ ] **SET-01**: Settings navigation uses single-column layout on mobile (no side nav + content split)
- [ ] **SET-02**: All settings sections (Users, Domains, AI, About) scroll properly without overflow
- [ ] **SET-03**: Form controls (inputs, selects, toggles) have proper touch target size (min 44px)
- [ ] **SET-04**: Modal dialogs are full-width on mobile, not clipped or overflowing

### Server Control

- [ ] **SRV-01**: Dashboard cards stack vertically on mobile (not side-by-side overflow)
- [ ] **SRV-02**: Docker container list is scrollable with compact rows on mobile
- [ ] **SRV-03**: Container actions (start/stop/restart) are accessible via touch-friendly buttons
- [ ] **SRV-04**: Server stats/charts resize properly to mobile width

### Files

- [ ] **FILE-01**: File browser sidebar (folders) works as a drawer on mobile
- [ ] **FILE-02**: File list/grid adapts to mobile width with proper item sizing
- [ ] **FILE-03**: File toolbar actions are accessible on mobile (compact toolbar or overflow menu)
- [ ] **FILE-04**: File preview/details panel doesn't overlap or overflow on mobile

### Terminal

- [ ] **TERM-01**: Terminal (xterm.js) fits mobile viewport width without horizontal scroll
- [ ] **TERM-02**: Terminal font size is readable on mobile (min 12px)
- [ ] **TERM-03**: Terminal works in landscape mode with proper resizing

## v2 Requirements

- **CHAT-V2-01**: Swipe to dismiss sidebar on mobile
- **SET-V2-01**: Search within settings on mobile
- **SRV-V2-01**: Pull-to-refresh for container status
- **FILE-V2-01**: Swipe actions on file items (delete, share, rename)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Complete UI rewrite | Fix existing responsive issues, don't rebuild |
| New mobile-specific features | Focus on making existing features work on mobile |
| Tablet-specific layout | Binary mobile/desktop for now |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | — | Pending |
| CHAT-02 | — | Pending |
| CHAT-03 | — | Pending |
| CHAT-04 | — | Pending |
| SET-01 | — | Pending |
| SET-02 | — | Pending |
| SET-03 | — | Pending |
| SET-04 | — | Pending |
| SRV-01 | — | Pending |
| SRV-02 | — | Pending |
| SRV-03 | — | Pending |
| SRV-04 | — | Pending |
| FILE-01 | — | Pending |
| FILE-02 | — | Pending |
| FILE-03 | — | Pending |
| FILE-04 | — | Pending |
| TERM-01 | — | Pending |
| TERM-02 | — | Pending |
| TERM-03 | — | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 0
- Unmapped: 19

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after initial definition*
