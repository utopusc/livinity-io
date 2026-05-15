# Mini PC UI Component Inventory — `livos/packages/ui/src/`

**Phase:** 115 (v35.0 Design System Unification milestone foundation)
**Plan:** 115-01 — Mini PC livinityd UI inventory
**Snapshot date:** 2026-05-14
**Total TSX files inventoried:** 654 across 7 top-level directories + misc
**Source root:** `livos/packages/ui/src/`
**Constraint honored:** D-115-READ-ONLY — zero source-tree edits.

## Migration tag taxonomy

| Tag | Meaning |
|---|---|
| `canonical` | Already matches dashboard.html design language; no migration needed |
| `needs-migration` | Functional component, needs visual restyle to canonical tokens |
| `replace-with-library` | Duplicates a primitive that will be replaced by `@livinity/ui-kit` (Phase 119) |
| `wontfix` | Out-of-scope for v35 (note column explains why) |
| `unknown` | Agent could not classify from first-40-lines inspection; needs operator review |

## Methodology

1. Enumerated all TSX files under `livos/packages/ui/src/` (deterministic sort).
2. For each file, read first 40 lines and extracted: imports (shadcn / framer-motion / CSS modules), inline `style={{...}}` occurrences, default/named export, JSX root tag, leading JSDoc/line comment.
3. Applied the classification rules from the plan (`shadcn-components/` → `replace-with-library`; bootstrap roots → `wontfix`; framer/bespoke/Tailwind → `needs-migration` with notes; no-signal → `unknown`).
4. Per-file purpose is inferred from the default export name (humanized) + JSX root, OR from leading JSDoc/comment when substantive.

## Summary by directory

| Directory | TSX file count | Predominant idiom | Predominant tag |
|---|---|---|---|
| `components/` | 95 | Tailwind utility | needs-migration |
| `modules/` | 123 | Tailwind utility | needs-migration |
| `routes/` | 219 | shadcn + Tailwind utility | needs-migration |
| `shadcn-components/` | 29 | Tailwind utility | replace-with-library |
| `features/` | 142 | n/a | needs-migration |
| `layouts/` | 7 | Tailwind utility + inline-style | needs-migration |
| `providers/` | 23 | n/a | needs-migration |
| `misc/` | 16 | n/a | wontfix |

## components/

_Shared cross-feature React components (95 files). Predominantly Tailwind utility with occasional shadcn primitive wrappers and framer-motion accents._

| File | Primary purpose | Route/feature | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `components/ai-quick.tsx` | ── Types ────────────────────────────────────────────── | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/animated-wallpapers.tsx` | ─── Shared WebGL2 helpers ────────────────────────────────────────── | shared (cross-feature) | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/app-icon.tsx` | App Icon — renders <img> root | shared (cross-feature) | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `components/apple-spotlight.tsx` | --------------------------------------------------------------------------- | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/cmdk-providers.tsx` | --------------------------------------------------------------------------- | shared (cross-feature) | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/cmdk.tsx` | Pluggable search providers rendered inside the command palette | shared (cross-feature) | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `components/darken-layer.tsx` | Darken Layer — renders <div> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/fade-scroller/index.tsx` | Fade Scroller — renders <div> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/highlighted-text.tsx` | HighlightedText — Phase 75-06 / CONTEXT D-27. | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/highlighted-text.unit.test.tsx` | @vitest-environment jsdom | shared (cross-feature) | n/a | wontfix | test file — not shipped UI |
| `components/iframe-checker.tsx` | Iframe Checker — renders <div> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/inline-tool-pill.tsx` | InlineToolPill — Phase 68-03. Suna-pattern inline tool indicator for | shared (cross-feature) | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/inline-tool-pill.unit.test.tsx` | @vitest-environment jsdom | shared (cross-feature) | n/a | wontfix | test file — not shipped UI |
| `components/install-button-connected.tsx` | Install Button Connected — renders <InstallButton> root | shared (cross-feature) | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `components/install-button.tsx` | import {t} from '@/utils/i18n' | shared (cross-feature) | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `components/install-prompt-banner.tsx` | Install Prompt Banner — renders <AnimatePresence> root | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/liv-tour/index.tsx` | Phase 76 Plan 76-05 — '<LivTour>' root component. | shared (cross-feature) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `components/liv-tour/integration.test.tsx` | @vitest-environment jsdom | shared (cross-feature) | n/a | wontfix | test file — not shipped UI |
| `components/liv-tour/spotlight.tsx` | Phase 76 Plan 76-05 — Tour spotlight overlay. | shared (cross-feature) | Tailwind utility | wontfix | SVG icon component — not themable chrome |
| `components/markdown.tsx` | IMPORTANT: Want to avoid any risk of tracking pixels, XSS, etc. | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/motion-primitives/accordion.tsx` | Accordion — renders <AccordionContext.Provider> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/motion-primitives/animated-background.tsx` | Animated Background component | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion-primitives/animated-group.tsx` | Animated Group component | shared (cross-feature) | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/animated-number.tsx` | Animated Number — renders <MotionComponent> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/motion-primitives/border-trail.tsx` | Border Trail — renders <div> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/carousel.tsx` | Carousel — renders <CarouselContext.Provider> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/motion-primitives/cursor.tsx` | Cursor — renders <motion.div> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/dialog.tsx` | Dialog component | shared (cross-feature) | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/disclosure.tsx` | Disclosure — renders <DisclosureContext.Provider> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/motion-primitives/glow-effect.tsx` | Glow Effect component | shared (cross-feature) | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/image-comparison.tsx` | Image Comparison — renders <ImageComparisonContext.Provider> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/in-view.tsx` | In View — renders <MotionComponent> root | shared (cross-feature) | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `components/motion-primitives/infinite-slider.tsx` | Infinite Slider — renders <div> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/magnetic.tsx` | Magnetic — renders <motion.div> root | shared (cross-feature) | framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s); logic shell — verify on migration |
| `components/motion-primitives/morphing-dialog.tsx` | Morphing Dialog — renders <MorphingDialogContext.Provider> root | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion-primitives/morphing-popover.tsx` | Morphing Popover — renders <MorphingPopoverContext.Provider> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/motion-primitives/progressive-blur.tsx` | GRADIENT_ANGLES — renders <div> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/scroll-progress.tsx` | Scroll Progress — renders <motion.div> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/sliding-number.tsx` | Sliding Number — renders <div> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/spinning-text.tsx` | Spinning Text — renders <motion.div> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/spotlight.tsx` | Spotlight — renders <motion.div> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/text-effect.tsx` | Text Effect component | shared (cross-feature) | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/text-loop.tsx` | Text Loop — renders <div> root | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion-primitives/text-morph.tsx` | Text Morph — renders <Component> root | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion-primitives/text-roll.tsx` | Text Roll — renders <span> root | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion-primitives/text-scramble.tsx` | Text Scramble — renders <MotionComponent> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/motion-primitives/text-shimmer-wave.tsx` | Text Shimmer Wave — renders <MotionComponent> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/text-shimmer.tsx` | Text Shimmer — renders <MotionComponent> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/motion-primitives/tilt.tsx` | Tilt — renders <motion.div> root | shared (cross-feature) | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `components/motion-primitives/toolbar-dynamic.tsx` | Toolbar Dynamic — renders <button> root | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion-primitives/toolbar-expandable.tsx` | Toolbar Expandable — renders <MotionConfig> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/motion-primitives/transition-panel.tsx` | Transition Panel — renders <div> root | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion-primitives/useClickOutside.tsx` | Click Outside component | shared (cross-feature) | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/usePreventScroll.tsx` | Prevents scrolling on the document body on mount, and | shared (cross-feature) | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion/FadeIn.tsx` | Liv design-system entrance primitive. | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion/GlowPulse.tsx` | Liv design-system breathing glow primitive. | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion/SlideInPanel.tsx` | Liv design-system directional panel entrance. | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion/StaggerList.tsx` | Liv design-system staggered list primitive. | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/motion/TypewriterCaret.tsx` | Liv design-system streaming-text caret. | shared (cross-feature) | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `components/progress-button.tsx` | Check if CSS available | shared (cross-feature) | shadcn + Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; uses shadcn primitives; 1 inline-style site(s) |
| `components/reload-page-button.tsx` | Reload Page Button — renders <Button> root | shared (cross-feature) | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `components/theme-toggle.tsx` | ThemeToggle — Phase 89 (V32-A11Y-01) | shared (cross-feature) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `components/ui/alert.tsx` | Error Alert — renders <div> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/animated-number.tsx` | Animated Number — renders <span> root | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/ui/arc.tsx` | Used ChatGPT to generate the basics of the arc, then added 'circleFraction' and other things myself | shared (cross-feature) | Tailwind utility | wontfix | SVG icon component — not themable chrome |
| `components/ui/button-link.tsx` | Stolen from 'next/link' node_modules/next/dist/client/link.d.ts and modified to add custom props | shared (cross-feature) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `components/ui/card.tsx` | Liv Design System v1 (Phase 66 / DESIGN-07) — opt-in variant prop. | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/copy-button.tsx` | Copy Button — renders <Tooltip> root | shared (cross-feature) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `components/ui/copyable-field.tsx` | Copyable Field — renders <div> root | shared (cross-feature) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `components/ui/cover-message.tsx` | Bare Cover Message — renders <CoverMessageContent> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/debug-only.tsx` | Debug Only — renders <div> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/dialog-close-button.tsx` | Dialog Close Button component | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/error-boundary-card-fallback.tsx` | Used for larger areas like the settings page, dialog content, etc. | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/error-boundary-component-fallback.tsx` | Used for when we can replace the error with text. EX: buttons, page content | shared (cross-feature) | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `components/ui/error-boundary-page-fallback.tsx` | Used for when we can't reasonably replace the component with error text. EX: wallpaper or cmdk | shared (cross-feature) | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `components/ui/fade-in-img.tsx` | Fade In Img — renders <img> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/generic-error-text.tsx` | Generic Error Text — renders <div> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/icon-button-link.tsx` | Stolen from 'next/link' node_modules/next/dist/client/link.d.ts and modified to add custom props | shared (cross-feature) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `components/ui/icon-button.tsx` | Icon Button — renders <button> root | shared (cross-feature) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `components/ui/icon.tsx` | Icon — renders <Comp> root | shared (cross-feature) | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 1 inline-style site(s) |
| `components/ui/immersive-dialog.tsx` | Immersive Dialog Separator — renders <hr> root | shared (cross-feature) | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `components/ui/list.tsx` | List Radio Item — renders <div> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/loading.tsx` | Loading — renders <div> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/notification-badge.tsx` | Phase 30 hot-patch round 2: switched from SlidingNumber to plain text. | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/numbered-list.tsx` | Numbered List — renders <ol> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/orb.tsx` | User avatar with deterministic animal emoji and pastel gradient. | shared (cross-feature) | Tailwind utility + inline-style | needs-migration | 3 inline-style site(s) |
| `components/ui/pin-input.tsx` | From: | shared (cross-feature) | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `components/ui/segmented-control.tsx` | Based on: | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/ui/step-indicator.tsx` | Step Indicator — renders <div> root | shared (cross-feature) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `components/ui/toast.tsx` | Toaster — renders <SonnerPrimitive.Toaster> root | shared (cross-feature) | shadcn + Tailwind utility + inline-style | replace-with-library | thin wrapper around shadcn primitive — ui-kit replacement target |
| `components/update-confirm-modal.tsx` | Phase 30 hot-patch round 6: shared confirm modal for "Install update". | shared (cross-feature) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `components/update-log-viewer-dialog.tsx` | Phase 33 Plan 33-03 — Update log viewer dialog (OBS-03 surface). | shared (cross-feature) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `components/update-log-viewer-dialog.unit.test.tsx` | @vitest-environment jsdom | shared (cross-feature) | n/a | wontfix | test file — not shipped UI |
| `components/update-notification.tsx` | Phase 30 UPD-04 — desktop-only "new update available" card. | shared (cross-feature) | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `components/window-aware-link.tsx` | A Link component that works both inside windows and in the main app. | shared (cross-feature) | n/a | needs-migration | logic shell with JSX — verify styling on migration |

## modules/

_Feature modules — large composite components grouped by top-level feature folder (123 files)._

| File | Primary purpose | Route/feature | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `modules/app-store/app-page/about-section.tsx` | About Section component | Module: app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/app-store/app-page/app-content.tsx` | v29.4 Phase 47 Plan 05 — AppHealthCard dual-mount (FR-PROBE-01). | Module: app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/app-store/app-page/app-settings-dialog.tsx` | App Settings Dialog — renders <AppSettingsDialogForApp> root | Module: app-store | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `modules/app-store/app-page/default-credentials-dialog.tsx` | Default Credentials Dialog — renders <Dialog> root | Module: app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/app-store/app-page/dependencies.tsx` | Dependencies Section — renders <Loading> root | Module: app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/app-store/app-page/info-section.tsx` | Info Section — renders <div> root | Module: app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/app-store/app-page/public-access-section.tsx` | Public Access Section — renders <div> root | Module: app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/app-store/app-page/recommendations-section.tsx` | Recommendations Section — renders <div> root | Module: app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/app-store/app-page/release-notes-section.tsx` | Release Notes Section component | Module: app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/app-store/app-page/settings-section.tsx` | Settings Section — renders <div> root | Module: app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/app-store/app-page/shared.tsx` | Read More Markdown Section component | Module: app-store | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `modules/app-store/app-page/top-header.tsx` | Top Header — renders <button> root | Module: app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/app-store/app-store-nav.tsx` | Connected App Store Nav — renders <AppStoreNav> root | Module: app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/app-store/community-app-store-dialog.tsx` | Community App Store Dialog — renders <Dialog> root | Module: app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/app-store/discover/apps-grid-section.tsx` | Apps Grid Section — renders <section> root | Module: app-store | Tailwind utility + inline-style | needs-migration | 2 inline-style site(s) |
| `modules/app-store/discover/apps-row-section.tsx` | Apps Row Section — renders <section> root | Module: app-store | Tailwind utility + inline-style | needs-migration | 2 inline-style site(s) |
| `modules/app-store/discover/apps-three-column-section.tsx` | Apps Three Column Section — renders <section> root | Module: app-store | Tailwind utility + inline-style | needs-migration | 2 inline-style site(s) |
| `modules/app-store/environment-overrides-dialog.tsx` | Environment Overrides Dialog — renders <Dialog> root | Module: app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/app-store/gallery-section.tsx` | Apps Gallery Section — renders <div> root | Module: app-store | Tailwind utility + inline-style | needs-migration | 2 inline-style site(s) |
| `modules/app-store/os-update-required.tsx` | OS Update Required Dialog — renders <AlertDialog> root | Module: app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/app-store/select-dependencies-dialog.tsx` | Select Dependencies Dialog — renders <Dialog> root | Module: app-store | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `modules/app-store/shared.tsx` | ─── Animations ───────────────────────────────────────────────── | Module: app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/app-store/updates-button.tsx` | Updates Button — renders <UpdatesDialogConnected> root | Module: app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/app-store/updates-dialog.tsx` | Updates Dialog Connected — renders <UpdatesDialog> root | Module: app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/auth/ensure-backend-available.tsx` | Ensure Backend Available — renders <BareCoverMessage> root | Module: auth | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/auth/ensure-logged-in.tsx` | Ensure Logged In — renders <EnsureLoggedInState> root | Module: auth | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/auth/ensure-user-exists.tsx` | Ensure User Doesnt Exist — renders <EnsureUser> root | Module: auth | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/auth/redirects.tsx` | Redirect Onboarding — renders <BareCoverMessage> root | Module: auth | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/auth/use-auth.tsx` | Make sure to hard reload page after updating this because trpc client is created on page load and it's only po | Module: auth | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/bare/alert.tsx` | Alert — renders <div> root | Module: bare | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/bare/failed-layout.tsx` | Failed Layout — renders <div> root | Module: bare | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/bare/progress-layout.tsx` | Progress Layout component | Module: bare | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `modules/bare/progress.tsx` | Progress — renders <div> root | Module: bare | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `modules/bare/shared.tsx` | Bare Logo Title component | Module: bare | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/bare/success-layout.tsx` | Success Layout — renders <div> root | Module: bare | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/community-app-store/community-badge.tsx` | Community Badge — renders <Badge> root | Module: community-app-store | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/desktop/add-webapp-dialog.tsx` | Phase 94-02 — AddWebAppDialog. | Module: desktop | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/desktop/app-grid/app-grid.tsx` | ── Grid dimension hook ────────────────────────────────── | Module: desktop | inline-style | needs-migration | 1 inline-style site(s); logic shell — verify on migration |
| `modules/desktop/app-grid/app-pagination-utils.tsx` | Calculate which apps will go into which pages based on the returned 'pageInnerRef' | Module: desktop | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/desktop/app-grid/paginator.tsx` | Page — renders <div> root | Module: desktop | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/desktop/app-icon.tsx` | APP_ICON_PLACEHOLDER_SRC component | Module: desktop | shadcn + Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; uses shadcn primitives; 1 inline-style site(s) |
| `modules/desktop/blur-below-dock.tsx` | Blur Below Dock — renders <div> root | Module: desktop | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `modules/desktop/desktop-content.tsx` | ── Folder metadata storage ────────────────────────────── | Module: desktop | framer-motion | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/desktop/desktop-context-menu.tsx` | Desktop Context Menu — renders <Dialog> root | Module: desktop | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/desktop/desktop-folder.tsx` | Desktop Folder — renders <svg> root | Module: desktop | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 2 inline-style site(s) |
| `modules/desktop/desktop-misc.tsx` | Search — renders <button> root | Module: desktop | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/desktop/desktop-preview-basic.tsx` | Desktop Preview Connected — renders <DesktopPreview> root | Module: desktop | Tailwind utility + inline-style | needs-migration | 3 inline-style site(s) |
| `modules/desktop/desktop-preview.tsx` | Desktop Preview — renders <div> root | Module: desktop | Tailwind utility + inline-style | needs-migration | 5 inline-style site(s) |
| `modules/desktop/dock-item.tsx` | Phase 101-07 Task 3 — Dock composes both WebApps and native apps. The | Module: desktop | framer-motion | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/desktop/dock-profile.tsx` | Animal emoji list for icon picker | Module: desktop | shadcn + Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; uses shadcn primitives; 2 inline-style site(s) |
| `modules/desktop/dock.tsx` | Dock component | Module: desktop | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `modules/desktop/header.tsx` | Header — renders <div> root | Module: desktop | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/desktop/install-first-app.tsx` | Install First App — renders <div> root | Module: desktop | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `modules/desktop/logout-dialog.tsx` | Logout Dialog — renders <AlertDialog> root | Module: desktop | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/desktop/share-app-dialog.tsx` | Share App Dialog — renders <Dialog> root | Module: desktop | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 1 inline-style site(s) |
| `modules/desktop/uninstall-confirmation-dialog.tsx` | Uninstall Confirmation Dialog — renders <AlertDialog> root | Module: desktop | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `modules/desktop/uninstall-these-first-dialog.tsx` | Uninstall These First Dialog — renders <Dialog> root | Module: desktop | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/desktop/webapp-icon.tsx` | Phase 94-04 — WebAppIcon. | Module: desktop | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/desktop/widgets/app-status-widget.tsx` | App Status Widget — renders <span> root | Module: desktop | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/desktop/widgets/clock-widget.tsx` | Clock Widget — renders <AnalogClock> root | Module: desktop | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/desktop/widgets/quick-notes-widget.tsx` | Quick Notes Widget — renders <WidgetContainer> root | Module: desktop | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/desktop/widgets/system-info-compact-widget.tsx` | System Info Compact Widget — renders <WidgetContainer> root | Module: desktop | Tailwind utility + inline-style | needs-migration | 2 inline-style site(s) |
| `modules/desktop/widgets/system-info-detailed-widget.tsx` | System Info Detailed Widget — renders <div> root | Module: desktop | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `modules/desktop/widgets/top-apps-widget.tsx` | Top Apps Widget — renders <WidgetContainer> root | Module: desktop | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `modules/desktop/widgets/widget-container.tsx` | Widget Container — renders <div> root | Module: desktop | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/desktop/widgets/widget-context-menu.tsx` | Widget Context Menu — renders <ContextMenu> root | Module: desktop | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/desktop/widgets/widget-picker-dialog.tsx` | Widget Picker Dialog — renders <span> root | Module: desktop | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 1 inline-style site(s) |
| `modules/desktop/widgets/widget-renderer.tsx` | Widget Renderer — renders <ClockWidget> root | Module: desktop | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/dock/native-app-form.test.tsx` | @vitest-environment jsdom | Module: dock | n/a | wontfix | test file — not shipped UI |
| `modules/dock/native-app-form.tsx` | Heuristic: strip directory + trailing extension, lowercase. Matches the | Module: dock | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/dock/native-app-icon.test.tsx` | @vitest-environment jsdom | Module: dock | n/a | wontfix | test file — not shipped UI |
| `modules/dock/native-app-icon.tsx` | Phase 101-07 Task 3 — NativeAppIcon. | Module: dock | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/dock/use-launch-native-app.test.tsx` | @vitest-environment jsdom | Module: dock | n/a | wontfix | test file — not shipped UI |
| `modules/floating-island/bare-island.tsx` | Animation configurations | Module: floating-island | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `modules/floating-island/container.tsx` | Floating Island Container component | Module: floating-island | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `modules/immersive-picker/index.tsx` | Immersive Picker Dialog Content Init — renders <ImmersiveDialogContent> root | Module: immersive-picker | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/migrate/migrate-image.tsx` | Migrate Image — renders <FadeInImg> root | Module: migrate | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/migrate/migrate-inner.tsx` | Migrate Inner — renders <motion.div> root | Module: migrate | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `modules/mobile/mobile-app-context.tsx` | Mobile App Provider — renders <MobileAppContext.Provider> root | Module: mobile | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/mobile/mobile-app-renderer.tsx` | Mobile App Renderer — renders <AnimatePresence> root | Module: mobile | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `modules/mobile/mobile-nav-bar.tsx` | Mobile Nav Bar — renders <div> root | Module: mobile | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/mobile/mobile-tab-bar.tsx` | Mobile Tab Bar — renders <div> root | Module: mobile | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/settings/master-chrome-login.test.tsx` | @vitest-environment jsdom | Module: settings | n/a | wontfix | test file — not shipped UI |
| `modules/settings/master-chrome-login.tsx` | Phase 102-07 — Master Chrome Login UI affordance (D-102-MASTER-LOGIN-UI). | Module: settings | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/sheet-top-fixed.tsx` | Sheet Fixed Target — renders <div> root | Module: sheet-top-fixed.tsx | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/app-contents/ai-chat-content.tsx` | Ai Chat Window Content — renders <ErrorBoundary> root | Module: window | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/app-contents/app-store-content.tsx` | App Store Window Content — renders <div> root | Module: window | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `modules/window/app-contents/app-store-routes/app-page-window.tsx` | App Page Window — renders <Loading> root | Module: window | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/window/app-contents/app-store-routes/app-store-layout-window.tsx` | App Store Layout Window — renders <div> root | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/app-contents/app-store-routes/category-page-window.tsx` | Category Page Window — renders <ErrorBoundary> root | Module: window | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/app-contents/app-store-routes/discover-window.tsx` | Discover Window — renders <div> root | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/app-contents/app-store-routes/marketplace-app-window.tsx` | Build-time constant defined in vite.config.ts | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/app-contents/app-store-routes/shared-components.tsx` | ─── App Card — used in search results & fallback grids ───────── | Module: window | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `modules/window/app-contents/chrome-content.tsx` | Chrome Window Content — renders <div> root | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/app-contents/docker-content.tsx` | Docker Window Content — renders <ErrorBoundary> root | Module: window | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/app-contents/files-content.tsx` | Files Window Content — renders <WindowRouterProvider> root | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/app-contents/my-devices-content.tsx` | My Devices Window Content — renders <ErrorBoundary> root | Module: window | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/app-contents/remote-desktop-content.tsx` | Remote Desktop Content — renders <iframe> root | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/app-contents/schedules-content.tsx` | Schedules Window Content — renders <ErrorBoundary> root | Module: window | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/app-contents/server-control-content.tsx` | Server Control Window Content — renders <ErrorBoundary> root | Module: window | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/app-contents/settings-content.tsx` | Lazy load the settings content component | Module: window | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/app-contents/subagents-content.tsx` | Subagents Window Content — renders <ErrorBoundary> root | Module: window | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/app-contents/terminal-content.tsx` | Lazy load the XTermTerminal component | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/app-contents/webapp-chat-bottom-bar.tsx` | DEPRECATED 2026-05-10 (P100-09-08): persistent inline chat bar removed. | Module: window | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/window/app-contents/webapp-chat-drawer.tsx` | Phase 100-09-05 — DEPRECATED. | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/app-contents/webapp-skills-popover.tsx` | Phase 100-09-06 — WebAppSkillsPopover. | Module: window | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `modules/window/app-contents/webapp-stream-window.tsx` | Phase 95-08 / 100-03 — WebAppStreamWindow. | Module: window | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/window/app-contents/webapp-teach-drawer.tsx` | Phase 100-09-06 — DEPRECATED. | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/app-contents/webapp-teach-popup-host.test.tsx` | React 18 synthetic-event-aware input setter. React reads 'value' through | Module: window | n/a | wontfix | test file — not shipped UI |
| `modules/window/app-contents/webapp-teach-popup-host.tsx` | Phase 101-08 Task 3 — WebAppTeachPopupHost (v3 popover-driven). | Module: window | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `modules/window/skill-replay-scrubber.tsx` | Phase 96-06 — SkillReplayScrubber. | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/teach-popover.test.tsx` | @vitest-environment jsdom | Module: window | n/a | wontfix | test file — not shipped UI |
| `modules/window/teach-popover.tsx` | THREAT T-101-04 mitigation: strip control chars + < > and cap length at | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/webapp-floating-action-bar.test.tsx` | @vitest-environment jsdom | Module: window | n/a | wontfix | test file — not shipped UI |
| `modules/window/webapp-floating-action-bar.tsx` | Phase 100-06: floating action bar rendered OUTSIDE the WebApp window | Module: window | shadcn + framer-motion | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/window/webapp-floating-skills-button.tsx` | Phase 100-10-05 — WebAppFloatingSkillsButton. | Module: window | shadcn + Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; uses shadcn primitives; 1 inline-style site(s) |
| `modules/window/webapp-mode-selector.tsx` | Phase 100-04 — webapp-mode-selector — constants-only module. | Module: window | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/window/webapp-skills-sidebar.tsx` | Phase 96-05 — WebAppSkillsSidebar. | Module: window | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 1 inline-style site(s) |
| `modules/window/webapp-stream-window.unit.test.tsx` | @vitest-environment jsdom | Module: window | n/a | wontfix | test file — not shipped UI |
| `modules/window/window-chrome.tsx` | Window Chrome — renders <div> root | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/window-content.tsx` | Lazy load content components for each app type | Module: window | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `modules/window/window.tsx` | Window component | Module: window | framer-motion | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `modules/window/windows-container.tsx` | Windows Container — renders <AnimatePresence> root | Module: window | framer-motion | needs-migration | uses framer-motion; logic shell — verify on migration |

## routes/

_File-based routes powering the React Router tree (219 files). One row per page/segment-level component._

| File | Primary purpose | Route/feature | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `routes/agent-marketplace/agent-card.tsx` | Phase 76 Plan 76-04 — AgentCard component (GREEN). | Route: /agent-marketplace | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/agent-marketplace/agent-card.unit.test.tsx` | @vitest-environment jsdom | Route: /agent-marketplace | n/a | wontfix | test file — not shipped UI |
| `routes/agent-marketplace/index.tsx` | Phase 76 Plan 76-04 — Agent Marketplace route. | Route: /agent-marketplace | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/ai-chat/agent-status-overlay.tsx` | Agent Status Overlay — renders <div> root | Route: /ai-chat | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/ai-chat/agents-panel.tsx` | ── Helpers ────────────────────────────────────────────────────── | Route: /ai-chat | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/ai-chat/canvas-iframe.tsx` | ── Types ──────────────────────────────────────────────────────────────────── | Route: /ai-chat | n/a | wontfix | SVG icon component — not themable chrome |
| `routes/ai-chat/canvas-panel.tsx` | Canvas Panel — renders <div> root | Route: /ai-chat | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/ai-chat/capabilities-panel.tsx` | ── Types ────────────────────────────────────────────────────── | Route: /ai-chat | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/ai-chat/chat-input.tsx` | Chat Input component | Route: /ai-chat | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/ai-chat/chat-messages.tsx` | --- Helpers --- | Route: /ai-chat | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `routes/ai-chat/computer-use-panel.tsx` | Computer Use Panel — renders <IconMouse> root | Route: /ai-chat | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/ai-chat/index.tsx` | Index — renders <div> root | Route: /ai-chat | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/ai-chat/luse-thumbnail.tsx` | Attempt to extract a displayable image URL from a tool call's output string. | Route: /ai-chat | framer-motion | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/ai-chat/mcp-panel.tsx` | ─── Types ────────────────────────────────────────────────────── | Route: /ai-chat | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/ai-chat/skills-panel.tsx` | ─── Types ────────────────────────────────────────────────────── | Route: /ai-chat | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/ai-chat/slash-command-menu.tsx` | Slash Command Menu — renders <div> root | Route: /ai-chat | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/ai-chat/streaming-message.tsx` | Typewriter — gradually reveals targetText at ~60fps. | Route: /ai-chat | Tailwind utility + bespoke (inline styles) | needs-migration | heavy inline styles |
| `routes/ai-chat/voice-button.tsx` | VoiceButton — Push-to-talk voice interaction component. | Route: /ai-chat | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/app-store/app-page/index.tsx` | App Page — renders <Loading> root | Route: /app-store/app-page | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/app-store/category-page.tsx` | Category Page — renders <Navigate> root | Route: /app-store | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `routes/app-store/discover.tsx` | Discover — renders <div> root | Route: /app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/app-store/use-discover-query.tsx` | Static discover data for LivOS App Store | Route: /app-store | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/community-app-store/app-page/index.tsx` | Community App Page — renders <Loading> root | Route: /community-app-store/app-page | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/community-app-store/index.tsx` | Community App Store Home — renders <Loading> root | Route: /community-app-store | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/_components/ai-alerts-bell.tsx` | Phase 23 AID-02 — AlertsBell dropdown. | Route: /docker/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/_components/compose-graph-viewer.tsx` | Topologically sort services so dependees appear left of dependers. | Route: /docker/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/_components/environment-selector.tsx` | Phase 22 MH-03 — Environment selector dropdown for the Server Control header. | Route: /docker/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/activity/activity-filters.tsx` | Phase 28 Plan 28-02 — ActivityFilters chip row (DOC-14). | Route: /docker/activity | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/activity/activity-row.tsx` | Phase 28 Plan 28-02 — ActivityRow (DOC-14). | Route: /docker/activity | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/activity/activity-section.tsx` | Phase 28 Plan 28-02 — Activity Timeline section (DOC-14). | Route: /docker/activity | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `routes/docker/dashboard/env-card-grid.tsx` | Phase 25 Plan 25-01 — Env card grid wrapper. | Route: /docker/dashboard | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/dashboard/env-card.tsx` | Phase 25 Plan 25-01 — Single-environment health card. | Route: /docker/dashboard | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/dashboard/tag-filter-chips.tsx` | Phase 25 Plan 25-02 — Tag filter chip row (DOC-06). | Route: /docker/dashboard | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/dashboard/top-cpu-panel.tsx` | Phase 25 Plan 25-02 — Top-CPU panel (DOC-05). | Route: /docker/dashboard | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/docker-app.tsx` | Phase 24-01 — DockerApp top-level shell. | Route: /docker | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/index.tsx` | Phase 24-01 — default export for React.lazy(() => import('@/routes/docker')) | Route: /docker | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/logs/logs-section.tsx` | Phase 28 Plan 28-01 — LogsSection composition (DOC-13). | Route: /docker/logs | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/logs/logs-sidebar.tsx` | Phase 28 Plan 28-01 — LogsSidebar (DOC-13). | Route: /docker/logs | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 1 inline-style site(s) |
| `routes/docker/logs/logs-viewer.tsx` | Compile a grep pattern. Returns the compiled regex OR an Error if the | Route: /docker/logs | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/palette/command-palette.tsx` | Phase 29 Plan 29-01 — cmd+k command palette modal (DOC-18). | Route: /docker/palette | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/registry/add-credential-dialog.tsx` | Phase 29 Plan 29-02 — Add Registry Credential dialog (DOC-16). | Route: /docker/registry | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/registry/credentials-tab.tsx` | Phase 29 Plan 29-02 — Registry Credentials tab (DOC-16). | Route: /docker/registry | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/registry/image-search-tab.tsx` | Phase 29 Plan 29-02 — Image Search tab (DOC-16). | Route: /docker/registry | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/registry/registry-section.tsx` | Phase 29 Plan 29-02 — Registry section (DOC-16). | Route: /docker/registry | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/resources/action-button.tsx` | Phase 26 Plan 26-01 — Resource action button. | Route: /docker/resources | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/resources/container-create-form.tsx` | Container Create Form component | Route: /docker/resources | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/resources/container-detail-sheet.tsx` | --------------------------------------------------------------------------- | Route: /docker/resources | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/resources/container-files-tab.tsx` | --------------------------------------------------------------------------- | Route: /docker/resources | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/resources/container-section.tsx` | Phase 26 Plan 26-01 (DOC-07 + DOC-20 partial) — Docker Containers section. | Route: /docker/resources | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/docker/resources/domains-tab.tsx` | Domains Tab — renders <span> root | Route: /docker/resources | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/docker/resources/image-dialogs.tsx` | Phase 26 Plan 26-01 — Image-related dialogs. | Route: /docker/resources | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/resources/image-history-panel.tsx` | Phase 26 Plan 26-01 — Image layer history panel. | Route: /docker/resources | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/resources/image-section.tsx` | Phase 26 Plan 26-01 (DOC-08 + DOC-20 partial) — Docker Images section. | Route: /docker/resources | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/docker/resources/network-dialogs.tsx` | Phase 26 Plan 26-02 — Network dialogs (Create + Remove). | Route: /docker/resources | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/resources/network-section.tsx` | Phase 26 Plan 26-02 (DOC-10 + DOC-20 partial) — Docker Networks section. | Route: /docker/resources | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/docker/resources/rename-dialog.tsx` | Phase 26 Plan 26-01 — Container rename dialog. | Route: /docker/resources | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/resources/scan-result-panel.tsx` | Phase 26 Plan 26-01 — Image vulnerability scan result panel. | Route: /docker/resources | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/resources/state-badge.tsx` | Phase 26 Plan 26-01 — Container state colour badge. | Route: /docker/resources | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/resources/volume-dialogs.tsx` | Phase 26 Plan 26-02 — Volume dialogs (Remove + Create). | Route: /docker/resources | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/resources/volume-section.tsx` | Phase 26 Plan 26-02 (DOC-09 + DOC-20 partial) — Docker Volumes section. | Route: /docker/resources | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/docker/resources/volume-usage-panel.tsx` | Phase 26 Plan 26-02 — VolumeUsagePanel. | Route: /docker/resources | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/schedules/add-backup-dialog.tsx` | Phase 27-02 (DOC-12) — port of legacy | Route: /docker/schedules | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/schedules/index.tsx` | Phase 27-02 (DOC-12) — port of legacy | Route: /docker/schedules | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/schedules/job-card.tsx` | Phase 27-02 (DOC-12) — verbatim port of legacy | Route: /docker/schedules | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/search-button.tsx` | Phase 24-02 placeholder replaced in Phase 29 Plan 29-01 (DOC-18). | Route: /docker | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/sections/activity.tsx` | Phase 28 Plan 28-02 — DOC-14. Global Activity timeline. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/containers.tsx` | Phase 26 Plan 26-01 — replaces the Phase 24 placeholder. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/dashboard.tsx` | Phase 25 Plan 25-01 — Dashboard section (DOC-04). | Route: /docker/sections | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/sections/images.tsx` | Phase 26 Plan 26-01 — replaces the Phase 24 placeholder. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/logs.tsx` | Phase 28 Plan 28-01 — DOC-13. Cross-container Logs section. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/networks.tsx` | Phase 26 Plan 26-02 — replaces the Phase 24 placeholder. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/registry.tsx` | Phase 29 Plan 29-02 — Registry section (DOC-16). Replaces the Phase 24 | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/schedules.tsx` | Phase 27-02 — replaces the Phase 24 placeholder. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/security.tsx` | Phase 46 Plan 46-04 — FR-F2B-01..06. Fail2ban admin Security section. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/settings.tsx` | Phase 29 Plan 29-02 — Docker Settings section (DOC-17). Replaces the | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/shell.tsx` | Phase 29 Plan 29-01 — replaced Phase 24 placeholder. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/stacks.tsx` | Phase 27-01 — replaces the Phase 24 placeholder. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/volumes.tsx` | Phase 26 Plan 26-02 — replaces the Phase 24 placeholder. | Route: /docker/sections | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/security/audit-log-tab.tsx` | Phase 46 Plan 46-04 — AuditLogTab (FR-F2B-04). | Route: /docker/security | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/security/ban-ip-modal.tsx` | Phase 46 Plan 46-04 — BanIpModal (FR-F2B-03 + FR-F2B-05 + pitfalls B-02 / B-03 / B-19). | Route: /docker/security | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/security/jail-status-card.tsx` | Phase 46 Plan 46-04 — JailStatusCard (FR-F2B-01 + FR-F2B-02). | Route: /docker/security | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/security/security-section.tsx` | Phase 46 Plan 46-04 — SecuritySection (FR-F2B-01..06). | Route: /docker/security | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/security/ssh-sessions-tab.tsx` | Phase 48 Plan 48-02 — SshSessionsTab (FR-SSH-02). | Route: /docker/security | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/security/unban-modal.tsx` | Phase 46 Plan 46-04 — UnbanModal (FR-F2B-02 + pitfall B-01 / W-01). | Route: /docker/security | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/settings/appearance-tab.tsx` | Phase 29 Plan 29-02 — Docker > Settings > Appearance tab (DOC-17, DOC-19). | Route: /docker/settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/settings/environments-tab.tsx` | Phase 29 Plan 29-02 — Docker > Settings > Environments tab (DOC-17). | Route: /docker/settings | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/settings/settings-section.tsx` | Phase 29 Plan 29-02 — Docker Settings section (DOC-17). | Route: /docker/settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/shell/exec-tab-pane.tsx` | Phase 29 Plan 29-01 — single-tab xterm session (DOC-15). | Route: /docker/shell | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/shell/shell-section.tsx` | Phase 29 Plan 29-01 — top-level ShellSection composition (DOC-15). | Route: /docker/shell | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/shell/shell-sidebar.tsx` | Phase 29 Plan 29-01 — ShellSidebar (DOC-15). | Route: /docker/shell | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `routes/docker/sidebar.tsx` | Phase 24-01 — Docker app sidebar. | Route: /docker | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/stacks/add-git-credential-dialog.tsx` | Phase 27-01 — verbatim port of legacy routes/server-control/index.tsx:3314-3448 | Route: /docker/stacks | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/stacks/ai-compose-tab.tsx` | Phase 27-01 — verbatim port of legacy routes/server-control/index.tsx:2680-2796 | Route: /docker/stacks | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 2 inline-style site(s) |
| `routes/docker/stacks/deploy-stack-form.tsx` | Phase 27-01 — verbatim port of legacy routes/server-control/index.tsx:2799-3307 | Route: /docker/stacks | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/stacks/stack-dialogs.tsx` | Phase 27-01 — verbatim port of legacy routes/server-control/index.tsx (deleted Phase 27-02). | Route: /docker/stacks | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/docker/stacks/stack-section.tsx` | Phase 27-01 (DOC-11) — port of legacy routes/server-control/index.tsx | Route: /docker/stacks | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/docker/status-bar.tsx` | Round 2 hot-patch — Docker app top StatusBar (minimal). | Route: /docker | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/status-footer.tsx` | Round 2 hot-patch — Docker app sticky bottom StatusFooter. | Route: /docker | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/docker/theme-toggle.tsx` | Phase 24-02 — Theme toggle button for the StatusBar. | Route: /docker | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/factory-reset/_components/factory-reset-error-page.tsx` | Phase 38 Plan 04 — D-RT-02 error page. | Route: /factory-reset/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx` | @vitest-environment jsdom | Route: /factory-reset/_components | n/a | wontfix | test file — not shipped UI |
| `routes/factory-reset/_components/factory-reset-modal.tsx` | Phase 38 Plan 03 — explicit-list confirmation modal (FR-UI-02..04 + FR-UI-07). | Route: /factory-reset/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/factory-reset/_components/factory-reset-modal.unit.test.tsx` | @vitest-environment jsdom | Route: /factory-reset/_components | n/a | wontfix | test file — not shipped UI |
| `routes/factory-reset/_components/factory-reset-progress.tsx` | Phase 38 Plan 04 — BarePage overlay that takes over after the user confirms | Route: /factory-reset/_components | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `routes/factory-reset/_components/factory-reset-progress.unit.test.tsx` | @vitest-environment jsdom | Route: /factory-reset/_components | n/a | wontfix | test file — not shipped UI |
| `routes/factory-reset/_components/factory-reset-recovery-page.tsx` | Phase 38 Plan 04 — D-RT-03 rolled-back recovery success page. | Route: /factory-reset/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/factory-reset/_components/misc.tsx` | Phase 38 Plan 03 — 'description()' legacy export removed (no longer | Route: /factory-reset/_components | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/factory-reset/_components/use-preflight.unit.test.tsx` | @vitest-environment jsdom | Route: /factory-reset/_components | n/a | wontfix | test file — not shipped UI |
| `routes/factory-reset/index.tsx` | Phase 38 Plan 03 — replaces the legacy multi-route password gate. The | Route: /factory-reset | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `routes/help/factory-reset-recovery.tsx` | Phase 38 Plan 04 — D-RT-02 manual SSH recovery static instructions page. | Route: /help | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/invite.tsx` | ─── Constants ────────────────────────────────────────────────── | Route: / (root) | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/live-usage.tsx` | Live Usage Dialog — renders <ImmersiveDialog> root | Route: / (root) | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/login.tsx` | Login — renders <Layout> root | Route: / (root) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/login/index.tsx` | Multi User Login — renders <LoginShell> root | Route: /login | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/my-devices/index.tsx` | --------------------------------------------------------------------------- | Route: /my-devices | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/not-found.tsx` | Not Found component | Route: / (root) | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `routes/notifications.tsx` | Parses backup notification ID to extract repository ID if present. | Route: / (root) | shadcn + Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; uses shadcn primitives; 2 inline-style site(s) |
| `routes/onboarding/account-created.tsx` | Account Created — renders <Layout> root | Route: /onboarding | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/onboarding/create-account.tsx` | Create Account — renders <Layout> root | Route: /onboarding | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/onboarding/index.tsx` | Attempt to auto-select a suitable language from the user's browser preferences | Route: /onboarding | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/onboarding/onboarding-footer.tsx` | Onboarding Footer — renders <div> root | Route: /onboarding | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/onboarding/restore.tsx` | Backups Restore Onboarding — renders <Layout> root | Route: /onboarding | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `routes/onboarding/setup-wizard.tsx` | ─── Domain Sub-Step Types ─────────────────────────────────────── | Route: /onboarding | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `routes/playground/liv-design-system.tsx` | Liv Design System v1 — Playground (Phase 66, Plan 05). | Route: /playground | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 1 inline-style site(s) |
| `routes/schedules/index.tsx` | Schedules — renders <div> root | Route: /schedules | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/server-control/index.tsx` | Cross-import from new Docker app home (relocated in Phase 27-02). | Route: /server-control | shadcn + Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; uses shadcn primitives; 3 inline-style site(s) |
| `routes/settings/_components/admin-cross-user-view.tsx` | Phase 44 Plan 44-04 — Admin-only cross-user usage view. | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/admin-devices-section.tsx` | Phase 16 ADMIN-01 + ADMIN-02 — cross-user admin device table. | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/ai-config-dialog.tsx` | Ai Config Dialog — renders <Dialog> root | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/api-keys-create-modal.tsx` | Phase 62 Plan 62-04 — ApiKeysCreateModal (FR-BROKER-E2-01). | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/api-keys-create-modal.unit.test.tsx` | @vitest-environment jsdom | Route: /settings/_components | n/a | wontfix | test file — not shipped UI |
| `routes/settings/_components/api-keys-revoke-modal.tsx` | Phase 62 Plan 62-04 — ApiKeysRevokeModal (FR-BROKER-E2-01). | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/api-keys-revoke-modal.unit.test.tsx` | @vitest-environment jsdom | Route: /settings/_components | n/a | wontfix | test file — not shipped UI |
| `routes/settings/_components/api-keys-section.tsx` | Phase 62 Plan 62-04 — ApiKeysSection (FR-BROKER-E2-01). | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/api-keys-section.unit.test.tsx` | @vitest-environment jsdom | Route: /settings/_components | n/a | wontfix | test file — not shipped UI |
| `routes/settings/_components/app-store-preferences-content.tsx` | App Store Preferences Content component | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/cpu-card-content.tsx` | Cpu Card Content — renders <ProgressStatCardContent> root | Route: /settings/_components | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `routes/settings/_components/cpu-temperature-card-content.tsx` | Cpu Temperature Card Content — renders <div> root | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/daily-counts-chart.tsx` | Phase 44 Plan 44-04 — Last-30-days request count BarChart. | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/danger-zone.tsx` | Phase 38 Plan 02 — Settings > Advanced > Danger Zone section. | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/danger-zone.unit.test.tsx` | @vitest-environment jsdom | Route: /settings/_components | n/a | wontfix | test file — not shipped UI |
| `routes/settings/_components/device-info-content.tsx` | Device Info Content — renders <div> root | Route: /settings/_components | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `routes/settings/_components/device-info-livinity-home.tsx` | Device Info Livinity Home component | Route: /settings/_components | framer-motion | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/settings/_components/domain-setup-dialog.tsx` | Domain Setup Dialog — renders <Dialog> root | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/environments-section.tsx` | Phase 22 MH-03 — Settings > Environments management UI. | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/language-dropdown.tsx` | Language Dropdown — renders <DropdownMenu> root | Route: /settings/_components | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `routes/settings/_components/list-row.tsx` | List Row — renders <El> root | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/memory-card-content.tsx` | Memory Card Content — renders <ProgressStatCardContent> root | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/menu-item-badge.tsx` | Phase 33 Plan 33-03 — UX-04 sidebar menu badge. | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/menu-item-badge.unit.test.tsx` | @vitest-environment jsdom | Route: /settings/_components | n/a | wontfix | test file — not shipped UI |
| `routes/settings/_components/my-domains-section.tsx` | My Domains Section — renders <span> root | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/no-forgot-password-message.tsx` | No Forgot Password Message — renders <p> root | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/past-deploys-table.tsx` | Phase 33 Plan 33-03 — Past Deploys table (OBS-02 surface). | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/past-deploys-table.unit.test.tsx` | @vitest-environment jsdom | Route: /settings/_components | n/a | wontfix | test file — not shipped UI |
| `routes/settings/_components/per-app-table.tsx` | Phase 44 Plan 44-04 — Sortable per-app stats table. | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/progress-card-content.tsx` | Progress Stat Card Content — renders <div> root | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/scheduler-section.tsx` | Phase 20 — Settings > Scheduler section. | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/security-toggle-row.tsx` | Phase 46 Plan 46-04 — SecurityToggleRow (FR-F2B-06). | Route: /settings/_components | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `routes/settings/_components/settings-content-mobile.tsx` | import {useNavigate} from 'react-router-dom' | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/settings-content.tsx` | Settings Content component | Route: /settings/_components | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/settings/_components/settings-info-card.tsx` | Settings Info Card — renders <div> root | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/settings-page-layout.tsx` | Settings Page Layout — renders <div> root | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/settings-summary.tsx` | Settings Summary — renders <dl> root | Route: /settings/_components | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `routes/settings/_components/settings-toggle-row.tsx` | Settings Toggle Row — renders <div> root | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/shared.tsx` | Contact Support Link — renders <p> root | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/software-update-list-row.tsx` | Software Update List Row — renders <ListRow> root | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/storage-card-content.tsx` | Storage Card Content — renders <ProgressStatCardContent> root | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/usage-banner.tsx` | Phase 44 Plan 44-04 — Rate-limit banner. | Route: /settings/_components | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/_components/usage-section.tsx` | Phase 44 Plan 44-04 — Top-level Usage section for Settings > AI Configuration. | Route: /settings/_components | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/_components/usage-section.unit.test.tsx` | @vitest-environment jsdom | Route: /settings/_components | n/a | wontfix | test file — not shipped UI |
| `routes/settings/_components/wallpaper-picker.tsx` | Wallpaper Picker — renders <button> root | Route: /settings/_components | Tailwind utility + inline-style | needs-migration | 3 inline-style site(s) |
| `routes/settings/2fa-disable.tsx` | Two Factor Disable Dialog — renders <Drawer> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/2fa-enable.tsx` | Two Factor Enable Dialog — renders <Drawer> root | Route: /settings | shadcn + Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; uses shadcn primitives; 2 inline-style site(s) |
| `routes/settings/2fa.tsx` | Two Factor Dialog — renders <TwoFactorDisableDialog> root | Route: /settings | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `routes/settings/advanced.tsx` | Advanced Settings Drawer Or Dialog — renders <CoverMessage> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/ai-config.tsx` | Ai Config Page component | Route: /settings | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `routes/settings/app-store-preferences.tsx` | App Store Preferences Dialog — renders <Dialog> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/change-name.tsx` | Change Name Dialog — renders <Dialog> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/change-password.tsx` | Change Password Dialog — renders <Dialog> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/chrome-master.tsx` | Phase 102-07 — Chrome Master Login settings page (D-102-MASTER-LOGIN-UI). | Route: /settings | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/device-info.tsx` | Device Info Dialog — renders <Dialog> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/diagnostics/app-health-card.tsx` | Phase 47 Plan 05 — App Health diagnostic card (FR-PROBE-01/02). | Route: /settings/diagnostics | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/diagnostics/diagnostics-section.tsx` | Phase 47 Plan 05 — Diagnostics Section (D-DIAGNOSTICS-CARD). | Route: /settings/diagnostics | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/diagnostics/model-identity-card.tsx` | Phase 47 Plan 05 — Model Identity diagnostic card (FR-MODEL-01). | Route: /settings/diagnostics | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/diagnostics/registry-card.tsx` | Phase 47 Plan 05 — Capability Registry diagnostic card (FR-TOOL-01/02). | Route: /settings/diagnostics | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/dm-pairing.tsx` | ───────────────────────────────────────────────────────────────────────────── | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/domain-setup.tsx` | ─── Types ────────────────────────────────────────────────────── | Route: /settings | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/gmail.tsx` | ───────────────────────────────────────────────────────────────────────────── | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/index.tsx` | import {SettingsContent} from './_components/settings-content' | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/integrations.tsx` | ───────────────────────────────────────────────────────────────────────────── | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/liv-agent.tsx` | ───────────────────────────────────────────────────────────────────────────── | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/local-access.tsx` | livos/packages/ui/src/routes/settings/local-access.tsx | Route: /settings | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `routes/settings/memory.tsx` | Memory Management — View, search, and delete AI memories and conversation history. | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/migration-assistant.tsx` | Migration Assistant Dialog — renders <AlertDialog> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/mobile/account.tsx` | Account Drawer — renders <Drawer> root | Route: /settings/mobile | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/mobile/app-store-preferences.tsx` | App Store Preferences Drawer — renders <Drawer> root | Route: /settings/mobile | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/mobile/backups-mobile-drawer.tsx` | Backups Mobile Drawer — renders <Drawer> root | Route: /settings/mobile | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/mobile/device-info.tsx` | Device Info Drawer — renders <Drawer> root | Route: /settings/mobile | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `routes/settings/mobile/language.tsx` | Language Drawer — renders <Drawer> root | Route: /settings/mobile | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/mobile/software-update.tsx` | Software Update Drawer — renders <Drawer> root | Route: /settings/mobile | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/mobile/start-migration-drawer-or-dialog.tsx` | Start Migration Drawer Or Dialog — renders <MigrationAssistantDialog> root | Route: /settings/mobile | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/mobile/tor.tsx` | Tor Drawer — renders <Drawer> root | Route: /settings/mobile | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/mobile/wallpaper.tsx` | Wallpaper Drawer — renders <Drawer> root | Route: /settings/mobile | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 2 inline-style site(s) |
| `routes/settings/restart.tsx` | Restart Dialog — renders <AlertDialog> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/shutdown.tsx` | Shutdown Dialog — renders <AlertDialog> root | Route: /settings | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `routes/settings/software-update-confirm.tsx` | Software Update Confirm Dialog — renders <Dialog> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/terminal/_shared.tsx` | Terminal Title Back Link — renders <BackLink> root | Route: /settings/terminal | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `routes/settings/terminal/app.tsx` | App — renders <ImmersivePickerDialogContent> root | Route: /settings/terminal | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/terminal/index.tsx` | Terminal Dialog — renders <ImmersiveDialog> root | Route: /settings/terminal | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `routes/settings/terminal/livos.tsx` | Livinity Os — renders <ImmersivePickerDialogContent> root | Route: /settings/terminal | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/troubleshoot/_shared.tsx` | Troubleshoot Title Back Link — renders <BackLink> root | Route: /settings/troubleshoot | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `routes/settings/troubleshoot/app.tsx` | Troubleshoot App — renders <ImmersivePickerDialogContent> root | Route: /settings/troubleshoot | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/troubleshoot/index.tsx` | Troubleshoot Dialog — renders <ImmersiveDialog> root | Route: /settings/troubleshoot | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `routes/settings/troubleshoot/livos.tsx` | Troubleshoot Livinity Os — renders <ImmersivePickerDialogContent> root | Route: /settings/troubleshoot | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/usage-dashboard.tsx` | Usage Dashboard — Token usage and cost tracking for Settings. | Route: /settings | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `routes/settings/users.tsx` | Users Section — renders <div> root | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/voice.tsx` | Voice Settings — Configure push-to-talk voice mode. | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/settings/webhooks.tsx` | Webhooks Settings — Manage webhook endpoints. | Route: /settings | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `routes/subagents/index.tsx` | Index — renders <form> root | Route: /subagents | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |

## shadcn-components/

_All 29 entries default-tagged `replace-with-library` — these are the shadcn primitives that `@livinity/ui-kit` (Phase 119) will supersede. Notes column records the primitive name._

| File | Primary purpose | Route/feature | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `shadcn-components/ui/alert-dialog.tsx` | https://github.com/radix-ui/primitives/issues/1281#issuecomment-1081767007 | shared (shadcn primitives) | shadcn + Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/alert.tsx` | Alert component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/badge.tsx` | Badge — renders <div> root | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/button.tsx` | Button — renders <Comp> root | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/carousel.tsx` | Carousel — renders <CarouselContext.Provider> root | shared (shadcn primitives) | shadcn | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/checkbox.tsx` | Removing 'peer-disabled:cursor-not-allowed' because we want to disable the checkbox while it's going to the se | shared (shadcn primitives) | Tailwind utility + inline-style | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/command.tsx` | Command — renders <Dialog> root | shared (shadcn primitives) | shadcn + Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/context-menu.tsx` | Context Menu component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/dialog.tsx` | Dialog — renders <DialogContent> root | shared (shadcn primitives) | shadcn + Tailwind utility + inline-style | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/drawer.tsx` | Drawer — renders <FadeScroller> root | shared (shadcn primitives) | Tailwind utility + inline-style | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/dropdown-menu.tsx` | Dropdown Menu component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/form.tsx` | Form — renders <FormFieldContext.Provider> root | shared (shadcn primitives) | shadcn + Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/input.tsx` | Labeled — renders <label> root | shared (shadcn primitives) | Tailwind utility + framer-motion | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/label.tsx` | Label component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/pagination.tsx` | Pagination component | shared (shadcn primitives) | shadcn + Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/popover.tsx` | Popover component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/progress.tsx` | Progress component | shared (shadcn primitives) | Tailwind utility + inline-style | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/radio-group.tsx` | Radio Group — renders <RadioGroupPrimitive.Root> root | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/resizable.tsx` | Phase 95-03 — shadcn 'resizable' copy-paste, adapted for the LivOS | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/scroll-area.tsx` | Scroll Area — renders <ScrollAreaPrimitive.Root> root | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/select.tsx` | Select component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/separator.tsx` | Separator component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/sheet-scroll-area.tsx` | Sheet Scroll Area — renders <ScrollAreaPrimitive.Root> root | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/sheet.tsx` | Sheet component | shared (shadcn primitives) | Tailwind utility + inline-style | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/slider.tsx` | Slider component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/switch.tsx` | Switch component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/table.tsx` | Table component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/tabs.tsx` | Tabs component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |
| `shadcn-components/ui/tooltip.tsx` | Tooltip component | shared (shadcn primitives) | Tailwind utility | replace-with-library | shadcn primitive — superseded by @livinity/ui-kit (Phase 119) |

## features/

_Feature folders — vertical slices grouping route, module, and component bits for a given product surface (142 files)._

| File | Primary purpose | Route/feature | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `features/backups/cmdk-search-provider.tsx` | Backups Cmdk Search Provider — renders <CommandItem> root | Feature: backups | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/backups/components/backup-device-icon.tsx` | Backup Device Icon — renders <img> root | Feature: backups | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/backups/components/backup-location-dropdown.tsx` | Restore Location Dropdown — renders <DropdownMenu> root | Feature: backups | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/backups/components/backups-exclusions.tsx` | This is the "Exclude from Backups" section of the Backups Configure Wizard | Feature: backups | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/backups/components/configure-wizard.tsx` | Backups Configure Wizard — renders <div> root | Feature: backups | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `features/backups/components/floating-island/expanded.tsx` | Expanded Content — renders <div> root | Feature: backups | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `features/backups/components/floating-island/index.tsx` | Backups Island — renders <Island> root | Feature: backups | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/backups/components/floating-island/minimized.tsx` | Minimized Content — renders <div> root | Feature: backups | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/backups/components/modals/already-configured-modal.tsx` | Modal presented when the chosen backup folder already contains an Livinity backup | Feature: backups | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/backups/components/modals/connect-existing-modal.tsx` | Modal shown when a backup repository is detected at the selected location but | Feature: backups | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/backups/components/restore-location-dropdown.tsx` | We reuse this dropdown for both the: | Feature: backups | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/backups/components/restore-wizard.tsx` | Backups Restore Wizard component | Feature: backups | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/backups/components/review-card.tsx` | Review Card — renders <div> root | Feature: backups | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/backups/components/setup-wizard.tsx` | Setup Wizard component | Feature: backups | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/backups/components/tab-switcher.tsx` | Tab Switcher — renders <div> root | Feature: backups | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `features/backups/components/tiles.tsx` | Selectable Tile — renders <div> root | Feature: backups | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/backups/index.tsx` | Backups Restore Dialog — renders <ImmersiveDialog> root | Feature: backups | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/assets/add-folder-icon.tsx` | Add Folder Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/apps-icon.tsx` | Apps Icon — renders <svg> root | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/caret-right.tsx` | Caret Right Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/chevron-left.tsx` | Chevron Left Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/chevron-right.tsx` | Chevron Right Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/copy-icon.tsx` | Copy Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/cursor-text-icon.tsx` | Cursor Text Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/empty-folder-icon.tsx` | Empty Folder Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/file-items-thumbnails/index.tsx` | We convert the SVG sources to the WebP format at build | Feature: files | bespoke (inline styles) | needs-migration | heavy inline styles |
| `features/files/assets/flame-icon.tsx` | Flame Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/grid-layout-icon.tsx` | Grid Layout Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/home-icon.tsx` | Home Icon — renders <svg> root | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/list-layout-icon.tsx` | List Layout Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/recents-icon.tsx` | Recents Icon — renders <svg> root | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/rewind-icon.tsx` | Rewind Icon — renders <svg> root | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/search-icon.tsx` | Search Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/shared-folder-badge.tsx` | Shared Folder Badge component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/assets/trash-icon.tsx` | Trash Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/cmdk-search-provider.tsx` | how many max results we want to show in the command-k | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/cards/server-cards.tsx` | Add Manually Card — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/dialogs/add-network-share-dialog/index.tsx` | Validation schemas | Feature: files | shadcn + framer-motion | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/dialogs/external-storage-unsupported-dialog/index.tsx` | External Storage Unsupported Dialog — renders <AlertDialog> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/dialogs/format-drive-dialog/index.tsx` | Format Drive Dialog — renders <button> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/dialogs/permanently-delete-confirmation-dialog/index.tsx` | Permanently Delete Confirmation Dialog — renders <AlertDialog> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/dialogs/share-info-dialog/index.tsx` | Share Info Dialog component | Feature: files | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `features/files/components/dialogs/share-info-dialog/platform-instructions/index.tsx` | Platform Instructions — renders <MacOSInstructions> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/dialogs/share-info-dialog/platform-instructions/inline-copyable-field.tsx` | Inline Copyable Field — renders <span> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/dialogs/share-info-dialog/platform-instructions/instruction.tsx` | Instruction Container — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/dialogs/share-info-dialog/platform-instructions/ios-instructions.tsx` | IOS Instructions — renders <InstructionContainer> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/dialogs/share-info-dialog/platform-instructions/livos-instructions.tsx` | Liv OS Instructions — renders <div> root | Feature: files | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `features/files/components/dialogs/share-info-dialog/platform-instructions/macos-instructions.tsx` | Mac OS Instructions — renders <div> root | Feature: files | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `features/files/components/dialogs/share-info-dialog/platform-instructions/windows-instructions.tsx` | Windows Instructions — renders <InstructionContainer> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/dialogs/share-info-dialog/platform-selector.tsx` | Platform Selector — renders <div> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/dialogs/share-info-dialog/share-toggle.tsx` | Share Toggle — renders <div> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/embedded/index.tsx` | This EmbeddedFiles component is a wrapper we use to embed the Files UI inside other features (e.g., Rewind fea | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/file-viewer/audio-viewer/index.tsx` | Audio Viewer component | Feature: files | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/file-viewer/downloader/index.tsx` | Download Dialog component | Feature: files | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/file-viewer/image-viewer/index.tsx` | Image Viewer — renders <ViewerWrapper> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/file-viewer/index.tsx` | File Viewer — renders <DownloadDialog> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/file-viewer/pdf-viewer/index.tsx` | Pdf Viewer — renders <ViewerWrapper> root | Feature: files | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `features/files/components/file-viewer/video-viewer/index.tsx` | Video Viewer — renders <ViewerWrapper> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/file-viewer/viewer-wrapper.tsx` | Viewer Wrapper — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/files-dnd-wrapper/files-dnd-overlay.tsx` | Files Dnd Overlay — renders <DragOverlay> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/files-dnd-wrapper/index.tsx` | From: https://github.com/clauderic/dnd-kit/pull/334#issuecomment-1965708784 | Feature: files | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/floating-islands/audio-island/equalizer.tsx` | Pre-calculate frequency ranges for better performance | Feature: files | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `features/files/components/floating-islands/audio-island/expanded.tsx` | Expanded Content component | Feature: files | Tailwind utility + inline-style | needs-migration | 2 inline-style site(s) |
| `features/files/components/floating-islands/audio-island/index.tsx` | The actual island component that will be registered | Feature: files | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/floating-islands/audio-island/minimized.tsx` | Minimized Content — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/floating-islands/formatting-island/expanded.tsx` | Expanded Content — renders <div> root | Feature: files | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `features/files/components/floating-islands/formatting-island/index.tsx` | Formatting Island — renders <Island> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/floating-islands/formatting-island/minimized.tsx` | Minimized Content — renders <div> root | Feature: files | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `features/files/components/floating-islands/operations-island/expanded.tsx` | Expanded Content — renders <div> root | Feature: files | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 1 inline-style site(s) |
| `features/files/components/floating-islands/operations-island/index.tsx` | Operations Island — renders <Island> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/floating-islands/operations-island/minimized.tsx` | Minimized Content — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/floating-islands/uploading-island/expanded.tsx` | Expanded Content — renders <div> root | Feature: files | shadcn + Tailwind utility + inline-style | needs-migration | uses shadcn primitives; 1 inline-style site(s) |
| `features/files/components/floating-islands/uploading-island/index.tsx` | Uploading Island — renders <Island> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/floating-islands/uploading-island/minimized.tsx` | Minimized Content — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/listing/actions-bar/actions-bar-context.tsx` | Configuration options that influence the behaviour and rendering of the | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/listing/actions-bar/index.tsx` | Actions/navigation bar displayed above every files listing. Its | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/listing/actions-bar/mobile-actions.tsx` | Mobile Actions — renders <div> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/listing/actions-bar/navigation-controls.tsx` | File browser navigation controls that track visited folder paths. | Feature: files | Tailwind utility + framer-motion | needs-migration | uses framer-motion |
| `features/files/components/listing/actions-bar/path-bar/index.tsx` | Path Bar — renders <ContextMenu> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/listing/actions-bar/path-bar/path-bar-desktop.tsx` | Path Bar Desktop component | Feature: files | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/actions-bar/path-bar/path-bar-mobile.tsx` | Path Bar Mobile — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/listing/actions-bar/path-bar/path-input.tsx` | Path Input — renders <div> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/listing/actions-bar/search-input.tsx` | Search Input — renders <div> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/listing/actions-bar/sort-dropdown.tsx` | Sort Dropdown — renders <DropdownMenu> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/listing/actions-bar/view-toggle.tsx` | View Toggle — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/listing/apps-listing/index.tsx` | Apps Listing — renders <Listing> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/listing/directory-listing/empty-state.tsx` | Empty State Directory — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/listing/directory-listing/index.tsx` | 'marqueeScale' is threaded through so embedded contexts (like Rewind) can tell marquee selection | Feature: files | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/file-item/circular-progress.tsx` | Circular Progress — renders <div> root | Feature: files | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `features/files/components/listing/file-item/editable-name.tsx` | Editable Name component | Feature: files | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/file-item/icons-view-file-item.tsx` | Color-coded styles for known folders | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/listing/file-item/index.tsx` | Helper function to detect touch or pen events | Feature: files | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/file-item/list-view-file-item.tsx` | List View File Item — renders <div> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/listing/file-item/truncated-filename.tsx` | Truncated Filename — renders <span> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/listing/index.tsx` | Listing — renders <Card> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/listing/listing-and-file-item-context-menu.tsx` | Listing And File Item Context Menu component | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/listing/listing-body.tsx` | Listing Body — renders <VirtualizedList> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/listing/marquee-selection.tsx` | Marquee selection component | Feature: files | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/recents-listing/index.tsx` | Recents Listing — renders <Listing> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/listing/search-listing/index.tsx` | The search query is read directly from the URL (the 'q' query parameter). We | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/listing/trash-listing/index.tsx` | Trash Listing — renders <Listing> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/listing/virtualized-list.tsx` | Common index range used for virtualized rendering | Feature: files | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/mini-browser/index.tsx` | Mini Browser component | Feature: files | shadcn | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/rewind/index.tsx` | Sidebar Rewind — renders <div> root | Feature: files | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `features/files/components/rewind/overlay-context.tsx` | Rewind Overlay Provider — renders <Ctx.Provider> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/rewind/prerewind-dialog.tsx` | We show this dialog when the user clicks Rewind in Files to select a backup repository | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/rewind/restore-progress-dialog.tsx` | Restore Progress Dialog — renders <Dialog> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/components/rewind/snapshot-carousel.tsx` | Snapshot Carousel — renders <AnimatePresence> root | Feature: files | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 2 inline-style site(s) |
| `features/files/components/rewind/timeline-bar.tsx` | Timeline Bar — renders <div> root | Feature: files | Tailwind utility + inline-style | needs-migration | 2 inline-style site(s) |
| `features/files/components/rewind/tooltip.tsx` | This is a pure shadcn component that we use specifically for Rewind feature | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/shared/circular-progress.tsx` | Circular Progress — renders <div> root | Feature: files | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `features/files/components/shared/drag-and-drop.tsx` | Draggable — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/shared/file-item-icon/animated-folder-icon.tsx` | -- Variants for each part: numeric transforms only -- | Feature: files | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 2 inline-style site(s) |
| `features/files/components/shared/file-item-icon/embedded-overlay-icons.tsx` | Documents Icon component | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/components/shared/file-item-icon/folder-icon.tsx` | Folder Icon — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/shared/file-item-icon/index.tsx` | File Item Icon — renders <img> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/shared/file-item-icon/unknown-file-thumbnail.tsx` | Helper function to convert a string to a hue value | Feature: files | n/a | wontfix | SVG icon component — not themable chrome |
| `features/files/components/shared/file-upload-drop-zone.tsx` | File Upload Drop Zone — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/shared/upload-input.tsx` | Upload Input — renders <input> root | Feature: files | inline-style | needs-migration | 1 inline-style site(s); logic shell — verify on migration |
| `features/files/components/sidebar/index.tsx` | Note: the sidebar and sidebar-link components re-render on every navigation click. | Feature: files | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `features/files/components/sidebar/mobile-sidebar-wrapper.tsx` | Mobile Sidebar Wrapper — renders <AnimatePresence> root | Feature: files | Tailwind utility + framer-motion + inline-style | needs-migration | uses framer-motion; 1 inline-style site(s) |
| `features/files/components/sidebar/sidebar-apps.tsx` | Sidebar Apps — renders <SidebarItem> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/sidebar/sidebar-external-storage-item.tsx` | Sidebar External Storage Item — renders <div> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/sidebar/sidebar-external-storage.tsx` | Sidebar External Storage — renders <AnimatePresence> root | Feature: files | shadcn + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives; logic shell — verify on migration |
| `features/files/components/sidebar/sidebar-favorites.tsx` | Sidebar Favorites — renders <AnimatePresence> root | Feature: files | shadcn + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives; logic shell — verify on migration |
| `features/files/components/sidebar/sidebar-home.tsx` | Sidebar Home — renders <ContextMenu> root | Feature: files | shadcn | needs-migration | uses shadcn primitives; logic shell — verify on migration |
| `features/files/components/sidebar/sidebar-item.tsx` | Sidebar Item — renders <Droppable> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/sidebar/sidebar-network-share-item.tsx` | Sidebar Network Share Item — renders <Droppable> root | Feature: files | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/files/components/sidebar/sidebar-network-storage.tsx` | Sidebar Network Storage — renders <Droppable> root | Feature: files | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `features/files/components/sidebar/sidebar-recents.tsx` | Sidebar Recents — renders <SidebarItem> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/components/sidebar/sidebar-shares.tsx` | Sidebar Shares — renders <AnimatePresence> root | Feature: files | shadcn + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives; logic shell — verify on migration |
| `features/files/components/sidebar/sidebar-storage.tsx` | Sidebar Storage — renders <button> root | Feature: files | Tailwind utility + inline-style | needs-migration | 1 inline-style site(s) |
| `features/files/components/sidebar/sidebar-trash.tsx` | Sidebar Trash — renders <SidebarItem> root | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/index.tsx` | Files Layout — renders <FilesDndWrapper> root | Feature: files | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |
| `features/files/providers/files-capabilities-context.tsx` | This FilesCapabilities Context is a centralized configuration for the Files feature. | Feature: files | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `features/files/routes.tsx` | Routes component | Feature: files | n/a | wontfix | barrel re-export / non-rendering helper (no JSX return) |
| `features/local-setup/__tests__/LocalSetupWizard.test.tsx` | livos/packages/ui/src/features/local-setup/__tests__/LocalSetupWizard.test.tsx | Feature: local-setup | n/a | wontfix | test file — not shipped UI |
| `features/local-setup/HybridDnsSetup.tsx` | livos/packages/ui/src/features/local-setup/HybridDnsSetup.tsx | Feature: local-setup | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/local-setup/LocalSetupWizard.tsx` | livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx | Feature: local-setup | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/local-setup/ModePickStep.tsx` | livos/packages/ui/src/features/local-setup/ModePickStep.tsx | Feature: local-setup | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/local-setup/PlatformInstructions.tsx` | livos/packages/ui/src/features/local-setup/PlatformInstructions.tsx | Feature: local-setup | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `features/local-setup/QrCodeStep.tsx` | livos/packages/ui/src/features/local-setup/QrCodeStep.tsx | Feature: local-setup | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |

## layouts/

_Layout shells (chrome, root layout, panel layouts) — 7 files. Migration touches the chrome tokens directly._

| File | Primary purpose | Route/feature | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `layouts/app-store.tsx` | App Store Layout — renders <AppStoreSheetInner> root | shared (layouts) | shadcn + Tailwind utility + framer-motion | needs-migration | uses framer-motion; uses shadcn primitives |
| `layouts/bare/bare-page.tsx` | Premium gradient background with animated floating orbs for onboarding/setup flows. | shared (layouts) | Tailwind utility + inline-style | needs-migration | 3 inline-style site(s) |
| `layouts/bare/bare.tsx` | Bare Layout — renders <BarePage> root | shared (layouts) | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `layouts/bare/shared.tsx` | Livinity Logo Large — renders <h1> root | shared (layouts) | Tailwind utility + inline-style | needs-migration | 3 inline-style site(s) |
| `layouts/demo-layout.tsx` | Demo — renders <Suspense> root | shared (layouts) | n/a | needs-migration | logic shell with JSX — verify styling on migration |
| `layouts/desktop.tsx` | Desktop — renders <DesktopPage> root | shared (layouts) | Tailwind utility | needs-migration | Tailwind component — restyle to canonical tokens |
| `layouts/sheet.tsx` | Determine if scroll position should be restored ('true'), reset ('false') or | shared (layouts) | shadcn + Tailwind utility | needs-migration | uses shadcn primitives |

## providers/

_React context providers (23 files). Most are non-visual; those that render chrome are tagged `needs-migration`._

| File | Primary purpose | Route/feature | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `providers/apps.tsx` | Phase 94-05 — unified desktop entries for the AppGrid consumer. | shared (providers) | n/a | wontfix | pure provider/context — no rendered chrome |
| `providers/auth-bootstrap.tsx` | Clear a stale JWT at page load if livinityd reports we're not logged in. | shared (providers) | n/a | wontfix | pure provider/context — no rendered chrome |
| `providers/available-apps.tsx` | Available Apps Provider — renders <AppsContext.Provider> root | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/confirmation/confirmation-context.tsx` | Create the context with a default value | shared (providers) | n/a | wontfix | pure provider/context — no rendered chrome |
| `providers/confirmation/confirmation-provider.tsx` | Confirmation Provider — renders <ConfirmationContext.Provider> root | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/confirmation/generic-confirmation-dialog.tsx` | Generic Confirmation Dialog — renders <AlertDialog> root | shared (providers) | shadcn + Tailwind utility | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/global-files.tsx` | Types | shared (providers) | n/a | wontfix | pure provider/context — no rendered chrome |
| `providers/global-system-state/index.tsx` | Global System State Provider component | shared (providers) | n/a | wontfix | pure provider/context — no rendered chrome |
| `providers/global-system-state/migrate.tsx` | Migrating Cover — renders <BarePage> root | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/global-system-state/reset.tsx` | Phase 38 Plan 01 — schema rewrite from {password: string} to | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/global-system-state/restart.tsx` | Restarting Cover — renders <CoverMessage> root | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/global-system-state/restore.tsx` | Restore Cover — renders <BarePage> root | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/global-system-state/shutdown.tsx` | Shutting Down Cover — renders <CoverMessage> root | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/global-system-state/update.tsx` | v29.0 UX-01: classify mutation errors so the toast surface text actionable | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/keyboard-shortcuts-provider.tsx` | KeyboardShortcutsProvider — Phase 89 (V32-A11Y-02) | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/language.tsx` | Remote Language Injector component | shared (providers) | n/a | wontfix | pure provider/context — no rendered chrome |
| `providers/onboarding-sync.tsx` | Syncs onboarding personalization data from localStorage to the server | shared (providers) | n/a | wontfix | pure provider/context — no rendered chrome |
| `providers/prefetch.tsx` | Prefetcher component | shared (providers) | n/a | wontfix | pure provider/context — no rendered chrome |
| `providers/sheet-sticky-header.tsx` | NOTE: in the future, may want to use this for dialogs, but for now only works for sheets | shared (providers) | Tailwind utility + inline-style | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/theme-provider.tsx` | Exported so use-theme.ts can reference it without a circular dep | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/wallpaper.tsx` | Wallpaper Provider Connected — renders <WallpaperProvider> root | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |
| `providers/window-manager.tsx` | Types | shared (providers) | n/a | wontfix | pure provider/context — no rendered chrome |
| `providers/window-router.tsx` | Window Router Provider — renders <WindowRouterContext.Provider> root | shared (providers) | n/a | needs-migration | provider with rendered chrome — restyle to canonical tokens |

## misc/

_Files outside the seven canonical buckets: src/ root bootstrap entries (`init.tsx`, `main.tsx`, `router.tsx`) plus support sub-trees (`assets/`, `hooks/`, `lib/`, `trpc/`) that contain a small number of TSX files._

| File | Primary purpose | Route/feature | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `assets/caret-right.tsx` | Svg Component component | shared (assets) | Tailwind utility | wontfix | asset/icon module — SVG mark, no themable chrome |
| `assets/chevron-down.tsx` | Most icons have a box around them. This one's bounding box matches the icon. | shared (assets) | n/a | wontfix | asset/icon module — SVG mark, no themable chrome |
| `assets/livinity-logo.tsx` | forward Ref component | shared (assets) | inline-style | wontfix | asset/icon module — SVG mark, no themable chrome |
| `assets/tor-icon.tsx` | Tor Icon component | shared (assets) | n/a | wontfix | asset/icon module — SVG mark, no themable chrome |
| `assets/tor-icon2.tsx` | Tor Icon2 component | shared (assets) | n/a | wontfix | asset/icon module — SVG mark, no themable chrome |
| `hooks/use-auto-height-animation.tsx` | Use Auto Height Animation component | shared (hooks) | framer-motion | wontfix | non-visual support module (hook/lib/trpc glue) |
| `hooks/use-is-livinity-home.tsx` | Use Is Livinity Home component | shared (hooks) | n/a | wontfix | non-visual support module (hook/lib/trpc glue) |
| `hooks/use-teach-recorder.unit.test.tsx` | @vitest-environment jsdom | shared (hooks) | n/a | wontfix | test file — not shipped UI |
| `hooks/use-webapp-agent.unit.test.tsx` | @vitest-environment jsdom | shared (hooks) | n/a | wontfix | test file — not shipped UI |
| `hooks/use-webapp-vnc.unit.test.tsx` | @vitest-environment jsdom | shared (hooks) | n/a | wontfix | test file — not shipped UI |
| `init.tsx` | Disable default browser context menu | shared (root) | shadcn | wontfix | bootstrap/router config — not visual |
| `lib/use-liv-agent-stream.unit.test.tsx` | @vitest-environment jsdom | shared (lib) | n/a | wontfix | test file — not shipped UI |
| `main.tsx` | Geist Variable fonts — imported before index.css so Tailwind font-family cascade resolves correctly | shared (root) | n/a | wontfix | bootstrap/router config — not visual |
| `router.tsx` | v34 — Native local-mode App Store imports REMOVED (route entries also removed below). | shared (root) | n/a | wontfix | bootstrap/router config — not visual |
| `trpc/loading-indicator.tsx` | Loading Indicator — renders <Portal> root | shared (trpc) | Tailwind utility | wontfix | non-visual support module (hook/lib/trpc glue) |
| `trpc/trpc-provider.tsx` | Trpc Provider — renders <trpcReact.Provider> root | shared (trpc) | n/a | wontfix | non-visual support module (hook/lib/trpc glue) |

## Aggregate counts

| Migration tag | Count | % |
|---|---|---|
| canonical | 0 | 0.0% |
| needs-migration | 484 | 74.0% |
| replace-with-library | 30 | 4.6% |
| wontfix | 140 | 21.4% |
| unknown | 0 | 0.0% |
| **TOTAL** | **654** | **100.0%** |

## Operator review queue (tag = unknown)

_None — every file received a definite tag from the first-40-lines inspection._

## Wontfix rationale (tag = wontfix)

These files are non-visual or pure infrastructure (bootstrap, context providers without rendered UI, asset modules, hook/lib/trpc helpers). They are excluded from the v35 design migration scope.

| File | Rationale |
|---|---|
| `assets/caret-right.tsx` | asset/icon module — SVG mark, no themable chrome |
| `assets/chevron-down.tsx` | asset/icon module — SVG mark, no themable chrome |
| `assets/livinity-logo.tsx` | asset/icon module — SVG mark, no themable chrome |
| `assets/tor-icon.tsx` | asset/icon module — SVG mark, no themable chrome |
| `assets/tor-icon2.tsx` | asset/icon module — SVG mark, no themable chrome |
| `components/animated-wallpapers.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/cmdk-providers.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/highlighted-text.unit.test.tsx` | test file — not shipped UI |
| `components/inline-tool-pill.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/inline-tool-pill.unit.test.tsx` | test file — not shipped UI |
| `components/liv-tour/integration.test.tsx` | test file — not shipped UI |
| `components/liv-tour/spotlight.tsx` | SVG icon component — not themable chrome |
| `components/motion-primitives/animated-group.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/dialog.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/glow-effect.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/text-effect.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/useClickOutside.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/motion-primitives/usePreventScroll.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/ui/arc.tsx` | SVG icon component — not themable chrome |
| `components/ui/error-boundary-component-fallback.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `components/update-log-viewer-dialog.unit.test.tsx` | test file — not shipped UI |
| `features/backups/components/restore-wizard.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/backups/components/setup-wizard.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/assets/add-folder-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/apps-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/caret-right.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/chevron-left.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/chevron-right.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/copy-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/cursor-text-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/empty-folder-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/flame-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/grid-layout-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/home-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/list-layout-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/recents-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/rewind-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/search-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/shared-folder-badge.tsx` | SVG icon component — not themable chrome |
| `features/files/assets/trash-icon.tsx` | SVG icon component — not themable chrome |
| `features/files/components/dialogs/add-network-share-dialog/index.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/file-viewer/audio-viewer/index.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/file-viewer/downloader/index.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/files-dnd-wrapper/index.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/floating-islands/audio-island/index.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/actions-bar/path-bar/path-bar-desktop.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/directory-listing/index.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/file-item/editable-name.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/file-item/index.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/marquee-selection.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/listing/virtualized-list.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/mini-browser/index.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/files/components/shared/file-item-icon/embedded-overlay-icons.tsx` | SVG icon component — not themable chrome |
| `features/files/components/shared/file-item-icon/unknown-file-thumbnail.tsx` | SVG icon component — not themable chrome |
| `features/files/routes.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `features/local-setup/__tests__/LocalSetupWizard.test.tsx` | test file — not shipped UI |
| `hooks/use-auto-height-animation.tsx` | non-visual support module (hook/lib/trpc glue) |
| `hooks/use-is-livinity-home.tsx` | non-visual support module (hook/lib/trpc glue) |
| `hooks/use-teach-recorder.unit.test.tsx` | test file — not shipped UI |
| `hooks/use-webapp-agent.unit.test.tsx` | test file — not shipped UI |
| `hooks/use-webapp-vnc.unit.test.tsx` | test file — not shipped UI |
| `init.tsx` | bootstrap/router config — not visual |
| `lib/use-liv-agent-stream.unit.test.tsx` | test file — not shipped UI |
| `main.tsx` | bootstrap/router config — not visual |
| `modules/auth/use-auth.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/desktop/add-webapp-dialog.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/desktop/app-grid/app-pagination-utils.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/desktop/desktop-content.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/desktop/dock-item.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/dock/native-app-form.test.tsx` | test file — not shipped UI |
| `modules/dock/native-app-form.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/dock/native-app-icon.test.tsx` | test file — not shipped UI |
| `modules/dock/use-launch-native-app.test.tsx` | test file — not shipped UI |
| `modules/settings/master-chrome-login.test.tsx` | test file — not shipped UI |
| `modules/settings/master-chrome-login.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/window/app-contents/webapp-stream-window.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/window/app-contents/webapp-teach-popup-host.test.tsx` | test file — not shipped UI |
| `modules/window/teach-popover.test.tsx` | test file — not shipped UI |
| `modules/window/webapp-floating-action-bar.test.tsx` | test file — not shipped UI |
| `modules/window/webapp-floating-action-bar.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/window/webapp-mode-selector.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `modules/window/webapp-stream-window.unit.test.tsx` | test file — not shipped UI |
| `modules/window/window.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `providers/apps.tsx` | pure provider/context — no rendered chrome |
| `providers/auth-bootstrap.tsx` | pure provider/context — no rendered chrome |
| `providers/confirmation/confirmation-context.tsx` | pure provider/context — no rendered chrome |
| `providers/global-files.tsx` | pure provider/context — no rendered chrome |
| `providers/global-system-state/index.tsx` | pure provider/context — no rendered chrome |
| `providers/language.tsx` | pure provider/context — no rendered chrome |
| `providers/onboarding-sync.tsx` | pure provider/context — no rendered chrome |
| `providers/prefetch.tsx` | pure provider/context — no rendered chrome |
| `providers/window-manager.tsx` | pure provider/context — no rendered chrome |
| `router.tsx` | bootstrap/router config — not visual |
| `routes/agent-marketplace/agent-card.unit.test.tsx` | test file — not shipped UI |
| `routes/ai-chat/canvas-iframe.tsx` | SVG icon component — not themable chrome |
| `routes/ai-chat/chat-input.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/ai-chat/luse-thumbnail.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/ai-chat/mcp-panel.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/ai-chat/voice-button.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/app-store/use-discover-query.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/index.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/logs/logs-viewer.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/palette/command-palette.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/resources/container-create-form.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/resources/container-files-tab.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/schedules/add-backup-dialog.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/activity.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/containers.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/images.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/logs.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/networks.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/registry.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/schedules.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/security.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/settings.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/shell.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/stacks.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/sections/volumes.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/security/ban-ip-modal.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/security/security-section.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/security/ssh-sessions-tab.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/shell/exec-tab-pane.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/docker/stacks/deploy-stack-form.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/factory-reset/_components/factory-reset-error-page.unit.test.tsx` | test file — not shipped UI |
| `routes/factory-reset/_components/factory-reset-modal.unit.test.tsx` | test file — not shipped UI |
| `routes/factory-reset/_components/factory-reset-progress.unit.test.tsx` | test file — not shipped UI |
| `routes/factory-reset/_components/misc.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/factory-reset/_components/use-preflight.unit.test.tsx` | test file — not shipped UI |
| `routes/settings/_components/api-keys-create-modal.unit.test.tsx` | test file — not shipped UI |
| `routes/settings/_components/api-keys-revoke-modal.unit.test.tsx` | test file — not shipped UI |
| `routes/settings/_components/api-keys-section.unit.test.tsx` | test file — not shipped UI |
| `routes/settings/_components/danger-zone.unit.test.tsx` | test file — not shipped UI |
| `routes/settings/_components/device-info-livinity-home.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/settings/_components/menu-item-badge.unit.test.tsx` | test file — not shipped UI |
| `routes/settings/_components/past-deploys-table.unit.test.tsx` | test file — not shipped UI |
| `routes/settings/_components/settings-content.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `routes/settings/_components/usage-section.unit.test.tsx` | test file — not shipped UI |
| `routes/settings/ai-config.tsx` | barrel re-export / non-rendering helper (no JSX return) |
| `trpc/loading-indicator.tsx` | non-visual support module (hook/lib/trpc glue) |
| `trpc/trpc-provider.tsx` | non-visual support module (hook/lib/trpc glue) |

## Heuristic notes (for 115-02 replication)

- **Shadcn-import detection** matches both `@/shadcn-components/...` and relative imports. Components that re-export a single shadcn primitive (named like the primitive) are flagged `replace-with-library` even if they live under `components/` — they are ui-kit substitution candidates.
- **Framer-motion** is flagged whenever `framer-motion` appears anywhere in the first 40 lines OR `<motion.` is used in JSX. Motion patterns will be restandardized in Phase 116.
- **Inline-style threshold** for `bespoke` idiom is >5 `style={{...}}` occurrences in the first 40 lines. 1–5 occurrences are noted as `inline-style` accents but still tagged `needs-migration`.
- **Provider files** that have no `className=` / inline-style / module-css signals are tagged `wontfix` (pure context plumbing). Those that DO render chrome get `needs-migration`.
- **`hooks/`, `lib/`, `trpc/`, `assets/`** sub-trees contain TSX files that are non-visual helpers (e.g., trpc client glue, icon barrel exports, hook factories). All tagged `wontfix`.
- **`unknown` tags** typically indicate barrel re-export files or component shells whose body is below line 40. Operator should spot-check during 115-02 review.
