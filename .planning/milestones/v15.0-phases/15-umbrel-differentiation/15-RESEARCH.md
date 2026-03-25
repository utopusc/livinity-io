# Phase 15: Complete Umbrel Differentiation

## What Must Change

### CRITICAL (Direct copies)
1. **Purple brand color (#8B5CF6)** → New brand color (teal/cyan family: #06B6D4 or #0EA5E9)
2. **Dock magnification** (same Big Sur reference) → Completely different dock design (sidebar or top bar)
3. **Glassmorphic cards** (identical pattern) → Different card style (solid cards with subtle borders)
4. **"umbrel" text references** in code → Remove all, replace with "livinity"
5. **Docker image refs** (getumbrel/*) → Own images or alternatives

### HIGH (Same design language)
6. **Login screen** (centered glass card over wallpaper) → Full-page split layout or different approach
7. **App icon grid with paginator** → Different layout (list view, categorized, or sidebar nav)
8. **Settings as slide-in sheet** → Settings as a proper page/route
9. **App Store grid layout** → Different card design, different navigation
10. **Font (Plus Jakarta Sans)** → Different font (Geist, Space Grotesk, or DM Sans)

### MEDIUM (Structural similarity)
11. **Greeting "Good morning, Name"** → Different home screen concept
12. **Floating island** → Remove or redesign completely
13. **Window chrome** → Different window design
14. **Step indicator dots** → Different progress indicator
15. **Context menu on app icons** → Different interaction pattern

### LOW (Code-level)
16. **Semantic color tokens** (same naming as Umbrel) → Rename token system
17. **Animation spring constants** → Different animation feel
18. **Docker compose template structure** → Already different, clean up references

## Design Direction: "LivOS Identity"

### New Visual Language
- **Color**: Teal/Cyan primary (#06B6D4), warm accent (#F59E0B amber)
- **Typography**: Geist or Space Grotesk (modern, techy, NOT Plus Jakarta Sans)
- **Cards**: Solid backgrounds with subtle borders, no glassmorphism
- **Layout**: Left sidebar navigation instead of bottom dock
- **Home**: Dashboard-style with widgets instead of icon grid
- **Login**: Full-bleed gradient with side panel form
- **Animations**: Snappy, minimal — not spring-heavy

### Key Differentiators
- Sidebar nav (NOT bottom dock)
- Dashboard home (NOT icon grid)
- Clean flat cards (NOT glassmorphic)
- Teal brand (NOT purple)
- Geist font (NOT Plus Jakarta Sans)
