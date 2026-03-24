# Requirements: Livinity v15.0 -- AI Computer Use

**Defined:** 2026-03-24
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v15.0 Requirements

Requirements for AI Computer Use milestone. Each maps to roadmap phases.

### Mouse Automation

- [x] **MOUSE-01**: AI can click at specific screen coordinates (left click)
- [x] **MOUSE-02**: AI can double-click at specific screen coordinates
- [x] **MOUSE-03**: AI can right-click at specific screen coordinates
- [x] **MOUSE-04**: AI can move the mouse cursor to specific coordinates
- [x] **MOUSE-05**: AI can drag from one coordinate to another (drag and drop)
- [x] **MOUSE-06**: AI can scroll up/down at current position or specific coordinates

### Keyboard Automation

- [x] **KEY-01**: AI can type arbitrary text strings on the device
- [x] **KEY-02**: AI can press individual keys and key combinations (Enter, Tab, Ctrl+C, Alt+F4, etc.)

### Screen

- [x] **SCREEN-01**: AI can query screen resolution and display configuration
- [x] **SCREEN-02**: Screenshot tool returns coordinate metadata for vision analysis (existing tool extended)

### Computer Use Loop

- [x] **LOOP-01**: Nexus AI can enter "computer use" mode -- an autonomous screenshot-analyze-action cycle
- [x] **LOOP-02**: AI uses multimodal vision to analyze screenshots and determine next action coordinates
- [ ] **LOOP-03**: Computer use sessions have configurable step limits (max actions per session)
- [ ] **LOOP-04**: AI can report task completion or failure back to the user with reasoning
- [ ] **LOOP-05**: User can request computer use tasks via natural language ("Open Chrome and go to YouTube")

### Live Monitoring UI

- [ ] **UI-01**: LivOS shows a live screenshot stream of the device during computer use sessions
- [ ] **UI-02**: Action overlay shows where AI clicked/typed on the live view (visual indicators)
- [ ] **UI-03**: Session timeline shows chronological list of AI actions taken (click, type, etc.)
- [ ] **UI-04**: User can pause, resume, or stop a computer use session from the LivOS UI

### Security

- [ ] **SEC-01**: User must explicitly consent before AI takes mouse/keyboard control of a device
- [ ] **SEC-02**: Emergency stop hotkey (3x Escape) immediately kills AI control on the device
- [ ] **SEC-03**: Every mouse/keyboard action is logged to the audit trail with coordinates and timestamps
- [ ] **SEC-04**: Computer use sessions auto-timeout after configurable inactivity period

## Future Requirements (v15.1+)

- **ACU-01**: Per-application permission scoping (only allow AI to control specific apps)
- **ACU-02**: Visual element recognition (OCR/object detection for UI elements, not just coordinates)
- **ACU-03**: Multi-monitor awareness and cross-monitor navigation
- **ACU-04**: Clipboard read/write as AI tool
- **ACU-05**: Multi-device orchestration (AI controls multiple devices in sequence)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full desktop streaming (RDP/VNC) | AI uses screenshot+action, not continuous video -- lower bandwidth, structured control |
| Browser-only sandbox mode | Full desktop for v15.0; browser sandboxing is v15.1+ |
| Voice commands during computer use | Separate feature, not needed for core computer use |
| Mobile device control | Desktop-only for v15.0 (Windows/Mac/Linux) |
| Self-hosted vision model | Uses Kimi multimodal API; local model is future |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MOUSE-01 | Phase 5 | Complete |
| MOUSE-02 | Phase 5 | Complete |
| MOUSE-03 | Phase 5 | Complete |
| MOUSE-04 | Phase 5 | Complete |
| MOUSE-05 | Phase 5 | Complete |
| MOUSE-06 | Phase 5 | Complete |
| KEY-01 | Phase 5 | Complete |
| KEY-02 | Phase 5 | Complete |
| SCREEN-01 | Phase 6 | Complete |
| SCREEN-02 | Phase 6 | Complete |
| LOOP-01 | Phase 7 | Complete |
| LOOP-02 | Phase 7 | Complete |
| LOOP-03 | Phase 7 | Pending |
| LOOP-04 | Phase 7 | Pending |
| LOOP-05 | Phase 7 | Pending |
| UI-01 | Phase 8 | Pending |
| UI-02 | Phase 8 | Pending |
| UI-03 | Phase 8 | Pending |
| UI-04 | Phase 8 | Pending |
| SEC-01 | Phase 9 | Pending |
| SEC-02 | Phase 9 | Pending |
| SEC-03 | Phase 9 | Pending |
| SEC-04 | Phase 9 | Pending |

**Coverage:**
- v15.0 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation -- all 23 requirements mapped to Phases 5-9*
