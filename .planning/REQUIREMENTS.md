# Requirements: Livinity v24.0 Mobile Responsive UI

**Defined:** 2026-04-01
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v1 Requirements

### AI Chat

- [x] **CHAT-01**: Chat sidebar (conversations + agents) works as a drawer on mobile with proper touch targets
- [x] **CHAT-02**: Message bubbles don't overflow horizontally, code blocks scroll within container
- [x] **CHAT-03**: Tool call cards are compact on mobile with expandable details
- [x] **CHAT-04**: Chat input area with file upload is properly sized and positioned on mobile

### Settings

- [x] **SET-01**: Settings navigation uses single-column layout on mobile (no side nav + content split)
- [x] **SET-02**: All settings sections (Users, Domains, AI, About) scroll properly without overflow
- [x] **SET-03**: Form controls (inputs, selects, toggles) have proper touch target size (min 44px)
- [x] **SET-04**: Modal dialogs are full-width on mobile, not clipped or overflowing

### Server Control

- [x] **SRV-01**: Dashboard cards stack vertically on mobile (not side-by-side overflow)
- [x] **SRV-02**: Docker container list is scrollable with compact rows on mobile
- [x] **SRV-03**: Container actions (start/stop/restart) are accessible via touch-friendly buttons
- [x] **SRV-04**: Server stats/charts resize properly to mobile width

### Files

- [x] **FILE-01**: File browser sidebar (folders) works as a drawer on mobile
- [x] **FILE-02**: File list/grid adapts to mobile width with proper item sizing
- [x] **FILE-03**: File toolbar actions are accessible on mobile (compact toolbar or overflow menu)
- [x] **FILE-04**: File preview/details panel doesn't overlap or overflow on mobile

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
| CHAT-01 | Phase 1 | Complete |
| CHAT-02 | Phase 1 | Complete |
| CHAT-03 | Phase 1 | Complete |
| CHAT-04 | Phase 1 | Complete |
| SET-01 | Phase 2 | Complete |
| SET-02 | Phase 2 | Complete |
| SET-03 | Phase 2 | Complete |
| SET-04 | Phase 2 | Complete |
| SRV-01 | Phase 3 | Complete |
| SRV-02 | Phase 3 | Complete |
| SRV-03 | Phase 3 | Complete |
| SRV-04 | Phase 3 | Complete |
| FILE-01 | Phase 4 | Complete |
| FILE-02 | Phase 4 | Complete |
| FILE-03 | Phase 4 | Complete |
| FILE-04 | Phase 4 | Complete |
| TERM-01 | Phase 5 | Pending |
| TERM-02 | Phase 5 | Pending |
| TERM-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after roadmap creation*
