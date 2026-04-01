# Requirements: Livinity v23.0 Mobile PWA

**Defined:** 2026-04-01
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### PWA Foundation

- [x] **PWA-01**: User can install Livinity from iOS Safari via "Add to Home Screen" and it opens in standalone mode
- [x] **PWA-02**: App has a valid web manifest with start_url, scope, icons (192/512 + maskable), theme color matching UI
- [x] **PWA-03**: Service worker caches app shell and serves network-first for API/tRPC routes
- [x] **PWA-04**: Apple-specific meta tags enable standalone mode, status bar styling, and touch icon on iOS
- [ ] **PWA-05**: User sees a custom install prompt banner suggesting "Add to Home Screen" on first visit
- [ ] **PWA-06**: iOS splash screens display correctly during app launch (key device sizes)

### Mobile App Experience

- [ ] **MOB-01**: On mobile, dock is hidden and system apps (AI Chat, Settings, Files, Server, Terminal) appear in the app grid
- [ ] **MOB-02**: Tapping a system app in the grid opens it full-screen with a back button to return home
- [ ] **MOB-03**: Bottom tab bar provides quick access to 5 primary apps (Home, AI Chat, Files, Settings, Server)
- [ ] **MOB-04**: Full-screen apps reuse existing window content components (zero per-app rewrite)
- [ ] **MOB-05**: Desktop UI remains completely unchanged — all mobile changes gated on useIsMobile()

### iOS Hardening

- [x] **IOS-01**: Safe area insets properly applied (notch top padding, home indicator bottom padding)
- [ ] **IOS-02**: WebSocket reconnects automatically after iOS background/resume cycle via visibilitychange
- [ ] **IOS-03**: iOS keyboard opening doesn't break viewport layout (100dvh, visual viewport API)

## v2 Requirements

Deferred to future release.

### Mobile Enhancements

- **MOB-V2-01**: Tablet layout (768-1024px) with hybrid window/fullscreen experience
- **MOB-V2-02**: Push notifications via Web Push API
- **MOB-V2-03**: Offline mode with cached conversation history
- **MOB-V2-04**: Haptic feedback on interactions (Vibration API)
- **MOB-V2-05**: Share target API (share files/URLs to Livinity)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native mobile app (Swift/Kotlin) | PWA approach covers requirements without app store distribution |
| Android TWA (Trusted Web Activity) | Not needed — PWA installable directly from browser |
| Electron/Capacitor wrapper | Adds complexity without benefit over PWA |
| Background sync / periodic sync | iOS doesn't support these APIs in standalone PWA |
| Per-app mobile layouts | Existing responsive components are sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PWA-01 | Phase 37 | Complete |
| PWA-02 | Phase 37 | Complete |
| PWA-03 | Phase 37 | Complete |
| PWA-04 | Phase 37 | Complete |
| PWA-05 | Phase 40 | Pending |
| PWA-06 | Phase 40 | Pending |
| MOB-01 | Phase 39 | Pending |
| MOB-02 | Phase 38 | Pending |
| MOB-03 | Phase 39 | Pending |
| MOB-04 | Phase 38 | Pending |
| MOB-05 | Phase 38 | Pending |
| IOS-01 | Phase 37 | Complete |
| IOS-02 | Phase 40 | Pending |
| IOS-03 | Phase 40 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after roadmap creation*
