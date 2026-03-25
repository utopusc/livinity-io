# Requirements: Livinity v17.0 Precision Computer Use

**Defined:** 2026-03-25
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v17.0 Requirements

Requirements for precision computer use. Each maps to roadmap phases.

### Screenshot Pipeline (DPI Fix)

- [ ] **DPI-01**: Agent resizes screenshots from physical to logical pixel dimensions using sharp before sending to AI
- [ ] **DPI-02**: Screenshot coordinate metadata reports logical dimensions (monitor.width/height) not physical (image.width/height)
- [ ] **DPI-03**: toScreenX/toScreenY uses 1:1 mapping after proper resize (no broken scaling logic)
- [ ] **DPI-04**: AI system prompt clearly states coordinate space is logical pixels with explicit dimensions

### Windows Accessibility Tree

- [ ] **UIA-01**: Agent sets DPI awareness to PerMonitorAwareV2 at startup on Windows
- [ ] **UIA-02**: `screen_elements` tool traverses Windows UIA tree and returns interactive elements with center coordinates
- [ ] **UIA-03**: Elements formatted as structured text for AI: id, window, control_type, name, coordinates
- [ ] **UIA-04**: Element list filtered to interactive elements only, capped at 50-100 elements to prevent token explosion
- [ ] **UIA-05**: UIA backend uses persistent subprocess (not cold-start PowerShell per call) for acceptable latency

### AI Prompt & Hybrid Mode

- [ ] **AIP-01**: Computer use system prompt updated: "Use element coordinates from screen_elements, screenshot for visual context only"
- [ ] **AIP-02**: Hybrid mode: AI tries accessibility tree coordinates first, falls back to screenshot coordinates if no matching element
- [ ] **AIP-03**: Agent skips screenshot re-capture when accessibility tree content hasn't changed since last capture

## Future Requirements

### Cross-Platform Accessibility

- **XPA-01**: macOS AXUIElement accessibility tree integration via Swift CLI binary
- **XPA-02**: Linux AT-SPI2 accessibility tree integration via Python/pyatspi2
- **XPA-03**: Unified screen_elements interface across all platforms with platform detection

### Enhanced Features

- **ENH-01**: Element highlighting — draw bounding boxes on screenshot matching accessibility tree elements
- **ENH-02**: Multi-monitor accessibility tree support with per-monitor DPI handling
- **ENH-03**: Accessibility tree diff detection for incremental updates

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full desktop streaming (RDP/VNC) | Stays as structured screenshot+action approach |
| OCR-based element detection | Using OS native accessibility tree instead |
| Browser-only automation (Playwright) | This is desktop-level automation |
| Custom ML model for UI detection | Leveraging OS built-in accessibility APIs |
| Multi-monitor orchestration | Single primary monitor for now |
| macOS accessibility (this milestone) | Requires Swift binary build pipeline, deferred |
| Linux accessibility (this milestone) | AT-SPI2 availability varies by distro, deferred |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DPI-01 | — | Pending |
| DPI-02 | — | Pending |
| DPI-03 | — | Pending |
| DPI-04 | — | Pending |
| UIA-01 | — | Pending |
| UIA-02 | — | Pending |
| UIA-03 | — | Pending |
| UIA-04 | — | Pending |
| UIA-05 | — | Pending |
| AIP-01 | — | Pending |
| AIP-02 | — | Pending |
| AIP-03 | — | Pending |

**Coverage:**
- v17.0 requirements: 12 total
- Mapped to phases: 0
- Unmapped: 12 ⚠️

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after initial definition*
