# Requirements — v5.3 UI Polish & Consistency

**Defined:** 2026-03-07
**Core Value:** One-command deployment of a personal AI-powered server that just works.

## Category: Files Polish (FP)

### REQ-FP-01: Path Bar Redesign
Redesign the desktop path bar with motion-primitives transitions:
- Rounded container with subtle bg and border
- Animated breadcrumb segment transitions when navigating
- Hover effects on path segments with Magnetic or subtle scale
- Improved overflow handling with gradient fades
- Consistent styling with v5.2 search input (rounded-xl, borderTrail-on-focus equivalent)

### REQ-FP-02: Empty States with Illustrations
Replace plain text empty states with visually rich illustrations:
- Empty folder: animated icon with gentle bounce, descriptive message, action buttons with hover effects
- Empty network: network-specific illustration with connection status
- Search with no results: search icon animation with helpful message
- AnimatedGroup staggered entry for empty state elements

### REQ-FP-03: Loading Skeletons
Replace spinner-only loading with skeleton placeholders:
- Grid view: skeleton cards matching file item dimensions with shimmer animation
- List view: skeleton rows matching list item layout
- Staggered reveal as real items load (AnimatedGroup)
- Smooth transition from skeleton to loaded content

### REQ-FP-04: File Operation Animations
Polish floating island animations for file operations:
- Smooth entry/exit animations for operations island
- Progress indicator with gradient animation
- Success/error state transitions
- Upload island visual polish with consistent styling

## Category: Dashboard & Home (DH)

### REQ-DH-01: Desktop Content Redesign
Apply motion-primitives to the main desktop content area:
- Header greeting with improved TextShimmerWave or TextEffect
- Content area transitions with AnimatedGroup staggered entry
- Improved spacing and layout for light theme

### REQ-DH-02: App Icon Cards
Apply v5.2-style motion effects to desktop app icons:
- Tilt 3D effect on hover (matching Files grid cards)
- Spotlight cursor-following glow per icon
- Consistent rounded corners and shadows
- Improved app name typography

### REQ-DH-03: Stats & Metrics Widgets
Polish stats display with motion-primitives:
- AnimatedNumber for CPU, Memory, Storage values
- Stat cards with subtle Tilt or Spotlight effects
- Progress bars with gradient animation
- Consistent card styling with v5.2 design language

### REQ-DH-04: Dock Visual Polish
Ensure dock consistency with v5.2 design language:
- Frosted glass container matching light theme
- Consistent icon sizing and hover magnification
- Separator styling consistency
- Active indicator consistency

## Category: Visual Consistency (VC)

### REQ-VC-01: Window Chrome Audit
Audit and fix window chrome across all app windows:
- Title bar styling consistency (background, text, controls)
- Window border and shadow consistency
- Close/minimize button positioning and styling
- Resize handle visibility

### REQ-VC-02: Shared Component Alignment
Audit buttons, inputs, dropdowns across all modules:
- Button sizes, border radius, hover states
- Input field styling (height, padding, focus states)
- Dropdown menu styling (width, item height, hover)
- Icon button sizes and spacing

### REQ-VC-03: Color & Typography Consistency
Ensure consistent use of design tokens across modules:
- Neutral scale usage (text-neutral-400/500/600/700/800/900)
- Accent color usage (only on CTAs and active states)
- Font size scale consistency (text-[10px] to text-[15px])
- Font weight consistency (medium for labels, semibold for active)

### REQ-VC-04: Border Radius & Spacing
Consistent rounded corners and spacing:
- Cards: rounded-xl or rounded-[20px]
- Buttons: rounded-xl
- Inputs: rounded-xl
- Dropdowns: rounded-xl
- Consistent gap/padding scale

## Category: Performance (PERF)

### REQ-PERF-01: Motion Component Performance Audit
Profile motion-primitives components for performance:
- Measure Tilt/Spotlight overhead per card in Files grid (100+ items)
- Measure AnimatedBackground re-renders on view toggle
- Identify any jank on lower-end devices
- Document performance baselines

### REQ-PERF-02: Re-render Optimization
Reduce unnecessary re-renders in animated components:
- Memoize heavy motion wrappers (Tilt, Spotlight)
- Debounce mouse move handlers where needed
- Use CSS transforms over layout properties
- Lazy-load motion components for off-screen items

### REQ-PERF-03: Build Verification
Clean build with no TypeScript errors after all changes:
- `pnpm --filter ui build` succeeds with zero errors
- No console warnings from motion-primitives
- Visual regression spot-check

## Out of Scope

| Feature | Reason |
|---------|--------|
| New app features | UI polish only |
| Backend changes | Frontend-only milestone |
| Dark theme | Light theme only |
| New motion-primitives components | Use already-installed 34 components |
| Mobile-specific redesign | Desktop-first polish |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-FP-01 | Phase 1 | Pending |
| REQ-FP-02 | Phase 1 | Pending |
| REQ-FP-03 | Phase 1 | Pending |
| REQ-FP-04 | Phase 1 | Pending |
| REQ-DH-01 | Phase 2 | Pending |
| REQ-DH-02 | Phase 2 | Pending |
| REQ-DH-03 | Phase 2 | Pending |
| REQ-DH-04 | Phase 2 | Pending |
| REQ-VC-01 | Phase 3 | Pending |
| REQ-VC-02 | Phase 3 | Pending |
| REQ-VC-03 | Phase 3 | Pending |
| REQ-VC-04 | Phase 3 | Pending |
| REQ-PERF-01 | Phase 4 | Pending |
| REQ-PERF-02 | Phase 4 | Pending |
| REQ-PERF-03 | Phase 4 | Pending |

**Coverage:**
- v5.3 requirements: 15 total
- Mapped to phases: 15/15
- Unmapped: 0

---
*Requirements defined: 2026-03-07*
