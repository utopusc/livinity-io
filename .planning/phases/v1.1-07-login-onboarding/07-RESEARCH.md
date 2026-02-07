# Phase 7: Login & Onboarding - Research

**Researched:** 2026-02-06
**Domain:** Auth Pages UI Redesign / Livinity Branding / 2FA UX
**Confidence:** HIGH

## Summary

This research investigates how to redesign the login, onboarding, and 2FA pages with Livinity branding, cleaner forms, step indicators, and improved 2FA UX. The current auth pages live in two contexts: (1) the main app's "bare layout" routes (`/login`, `/onboarding/*`) that use a `<Layout>` helper with wallpaper backgrounds and a darken layer, and (2) a standalone `app-auth` build entry for third-party app authentication that uses its own layout.

The auth pages already use the Livinity logo SVG component and the shared `<Layout>` helper. They are functionally complete but visually plain -- a title, subtitle, a form, and a footer. There are no step indicators in the multi-step onboarding flow (onboarding start -> create-account -> account-created), no visual progress tracking in the restore flow (which has 4 internal steps), and the login page has no distinctive brand identity beyond the logo. The 2FA PIN input uses the `rci` library (v0.1.0) with custom segment rendering.

The redesign is purely visual/UX -- no authentication logic changes are needed. All improvements apply semantic tokens from Phase 1's design system, add step indicators, improve spacing and form layout, and strengthen brand presence on auth pages.

**Primary recommendation:** Treat this as a pure styling and layout enhancement phase. Migrate all raw Tailwind values to semantic tokens, add a step indicator component for multi-step flows, redesign the shared `<Layout>` helper and `buttonClass`/`formGroupClass` exports with brand-focused styling, and improve the PinInput's visual feedback and segment styling.

## File Inventory

### Primary Auth Route Files

| File | Lines | Purpose | Raw Values to Migrate |
|------|-------|---------|----------------------|
| `src/routes/login.tsx` | 76 | Login page (password + 2FA steps) | Minimal -- delegates to Layout/PinInput |
| `src/routes/onboarding/index.tsx` | 62 | Onboarding start page | Minimal -- delegates to Layout |
| `src/routes/onboarding/create-account.tsx` | 102 | Account creation form (name + password + confirm) | `w-full`, `-my-2.5` spacing |
| `src/routes/onboarding/restore.tsx` | 353 | Multi-step backup restore (4 internal steps) | `border-white/10`, `bg-white/5`, `hover:bg-white/10`, `text-white/70`, `text-xs`, `opacity-60`/`opacity-80`, `text-[10px]`, `bg-white/10`, `rounded-full`, `rounded-8`, inline step nav styles |
| `src/routes/onboarding/account-created.tsx` | 59 | Success page after account creation | `text-xs`, `opacity-70`, `mb-2` |
| `src/routes/onboarding/onboarding-footer.tsx` | 46 | Footer component for onboarding pages | Uses IconButton, LanguageDropdown |

### Shared Layout Files

| File | Lines | Purpose | Raw Values to Migrate |
|------|-------|---------|----------------------|
| `src/layouts/bare/shared.tsx` | 79 | Layout helper, Title, SubTitle, button/form classes | **CRITICAL** -- `text-3xl`, `text-56`, `text-sm`, `opacity-50`, `text-13`, `text-white/60`, `text-white/80`, `bg-white`, `text-14`, `text-black`, `ring-white/40`, `bg-white/80`, `bg-white/90`, `bg-neutral-600/40`, `bg-neutral-600/60`, `rounded-full`, `h-[42px]`, `min-w-[112px]`, `gap-5`, `gap-1.5`, `gap-4` |
| `src/layouts/bare/bare-page.tsx` | 12 | Page wrapper with Wallpaper + DarkenLayer | `bg-black/50`, `p-5`, `min-h-[100dvh]` |
| `src/layouts/bare/bare.tsx` | 14 | Router layout with Suspense + Outlet | Clean -- no raw values |

### 2FA / PIN Input Files

| File | Lines | Purpose | Raw Values to Migrate |
|------|-------|---------|----------------------|
| `src/components/ui/pin-input.tsx` | 102 | PinInput using `rci` library | `border-white/20`, `bg-white/5`, `bg-[#D9D9D9]/10`, `rounded-8`, `w-0.5`, segment color `#fff`, `12px` padding, `10px` spacing |
| `src/hooks/use-2fa.ts` | 59 | 2FA enable/disable hooks (tRPC) | No styling -- pure logic |
| `src/routes/settings/2fa.tsx` | 18 | 2FA dialog switcher | No styling |
| `src/routes/settings/2fa-enable.tsx` | 159 | Enable 2FA dialog with QR code + PinInput | Uses semantic tokens (`text-body-sm`, `text-text-secondary`, `rounded-radius-sm`) -- mostly migrated already |
| `src/routes/settings/2fa-disable.tsx` | 64 | Disable 2FA dialog with PinInput | Uses semantic tokens (`text-heading-sm`) -- mostly migrated |

### Auth Infrastructure Files (No Visual Changes Needed)

| File | Lines | Purpose | Notes |
|------|-------|---------|-------|
| `src/modules/auth/use-auth.tsx` | 70 | Auth state management (JWT, login, logout) | Pure logic, no styling |
| `src/modules/auth/shared.ts` | 17 | JWT constants, token renewal | Pure logic |
| `src/modules/auth/redirects.tsx` | 77 | Redirect components (login, onboarding, home) | Pure logic |
| `src/modules/auth/ensure-logged-in.tsx` | 52 | Auth guards (EnsureLoggedIn/Out) | Pure logic |
| `src/modules/auth/ensure-user-exists.tsx` | 64 | User existence guards | Pure logic |
| `src/providers/auth-bootstrap.tsx` | 31 | Stale JWT cleanup | Pure logic |

### Brand Asset Files

| File | Lines | Purpose | Notes |
|------|-------|---------|-------|
| `src/assets/livinity-logo.tsx` | 22 | SVG logo component (256x256 viewBox, uses `currentColor`) | Already used in Layout via `<LivinityLogoLarge>` with `md:w-[120px]` |
| `public/figma-exports/livinity-ios.png` | -- | iOS-style app icon | Used in app-auth LoginWithLivinity |
| `public/figma-exports/livinity-app.svg` | -- | App icon SVG | Available for auth pages |
| `public/favicon/*` | -- | Favicon set (16/32/192/512px) | Standard set, no changes needed |

### Standalone App-Auth Build (Separate Entry Point)

| File | Lines | Purpose | Raw Values to Migrate |
|------|-------|---------|----------------------|
| `app-auth/src/login-with-livinity.tsx` | 229 | Third-party app login page | `bg-dialog-content/70`, `bg-black/50`, `rounded-20`, `shadow-dialog`, `text-17`, `text-13`, `text-white/40`, `rounded-12`, inline wallpaper fetch |
| `app-auth/src/main.tsx` | 12 | Entry point for app-auth | Minimal wrapper |
| `app-auth/index.html` | 25 | HTML entry for app-auth build | Standard HTML |
| `app-auth/vite.config.ts` | 29 | Separate vite build config | Aliases to main `src/` |

### Supporting Component Files (Already Migrated or Shared)

| File | Lines | Purpose | Notes |
|------|-------|---------|-------|
| `src/shadcn-components/ui/input.tsx` | 171 | Input + PasswordInput + AnimatedInputError | Already uses CVA + semantic tokens (`border-border-default`, `bg-surface-base`, `text-body-lg`, `focus-visible:border-brand`, `text-text-secondary`, etc.) |
| `src/components/darken-layer.tsx` | 8 | Dark overlay for bare pages | `bg-black/50` -- could use semantic token |
| `src/components/ui/icon-button.tsx` | 30 | Icon button component | Uses CVA buttonVariants from shadcn |

## Existing Brand Assets

### Logo
- **SVG component:** `src/assets/livinity-logo.tsx` -- 256x256 viewBox, `currentColor` fill, supports `viewTransitionName: 'livinity-logo'`
- **Already used:** In `shared.tsx` via `<LivinityLogoLarge />` which renders with `md:w-[120px]`
- **iOS icon:** `public/figma-exports/livinity-ios.png` -- Used in app-auth
- **App SVG:** `public/figma-exports/livinity-app.svg`

### Wallpaper System
- Auth pages use `<Wallpaper stayBlurred />` in `bare-page.tsx` for blurred background
- `<DarkenLayer>` adds `bg-black/50` overlay
- Dynamic brand color from wallpaper is available via CSS `--color-brand` variable

### Missing Brand Assets
- No wordmark/logotype (text "Livinity" or "LivOS" as styled text)
- No dedicated auth-page illustration or hero graphic
- No brand gradient or pattern assets

## Onboarding Flow Architecture

### Current Flow (No Step Indicators)
```
/onboarding          -> OnboardingStart (index.tsx)
  |                      Layout: title + subtitle + "Start" button
  |                      Footer: [Restore] [Language] [Support]
  v
/onboarding/create-account -> CreateAccount
  |                      Layout: title + subtitle + form (name, password, confirm)
  |                      Footer: [Restore] [Language] [Support]
  v
/onboarding/account-created -> AccountCreated
                         Layout: title + subtitle + "Next" button + ToS link
                         Footer: [Support] link only
```

### Restore Flow (Internal Steps, No Step Indicators)
```
/onboarding/restore  -> BackupsRestoreOnboarding
  Step 0: Choose Location (file browser + NAS discovery)
  Step 1: Password (encryption password)
  Step 2: Backups (list snapshots, select one)
  Step 3: Review (confirm selection)
  Navigation: Back button (ChevronLeft) + Continue/Restore button
  Footer: [Create Account] [Language] [Support]
```

### Key Observation: Two Different Step Patterns
1. **Inter-page flow** (onboarding start -> create-account -> account-created): Uses React Router navigation with `Link` components and view transitions. Step indicator would need to track current route.
2. **Intra-page flow** (restore page's 4 internal steps): Uses `useState<Step>` with an enum. Step indicator would read component state directly.

## 2FA Input Component Analysis

### Current Implementation (`pin-input.tsx`)
- Uses `rci` library (v0.1.0) -- a "React Code Input" package
- Also uses `use-is-focused` (v0.0.1) for focus detection
- Custom segment rendering with raw color values

### UX Issues Identified
1. **No clear feedback on loading state:** Segment borders pulse during loading via `animate-[pulse-border_...]` but there's no text or spinner
2. **Error state is brief:** Error shake animation lasts 0.5s, then clears input and re-focuses -- could be too fast for users to understand what happened
3. **No label or instructions:** PinInput renders standalone in login's 2FA step with title/subtitle above but no inline label
4. **Dot placeholder styling:** Uses `bg-[#D9D9D9]/10` -- hardcoded, nearly invisible
5. **Segment styling uses raw values:** `border-white/20`, `bg-white/5`, `rounded-8` -- not using semantic tokens
6. **No paste indication:** While `autoComplete='one-time-code'` is set, there's no visual cue that pasting is supported
7. **Accessibility:** Segment rendering uses `div` elements without ARIA roles; `rci` handles the underlying `input` element accessibility

### `rci` Library Assessment
- Very small library (0.1.0), minimal updates
- Provides `CodeInput` and `getSegmentCssWidth`
- Custom `renderSegment` callback allows full visual control
- The library handles the core input mechanics (focus, selection, segment state)
- Sufficient for the use case -- no need to replace

## Raw Values Requiring Migration

### `shared.tsx` (HIGHEST PRIORITY -- used by all auth pages)

| Current Value | Semantic Token | Context |
|---------------|---------------|---------|
| `text-3xl` (30px) | `text-display-sm` (32px) | Title on mobile |
| `text-56` (56px) | `text-display-lg` (48px) or keep custom | Title on desktop (md:) |
| `text-sm` (14px) | `text-body` | SubTitle |
| `opacity-50` | `text-text-secondary` | SubTitle color |
| `text-13` | `text-body-sm` | Footer link |
| `text-white/60` | `text-text-secondary` | Footer link color |
| `text-white/80` | `text-text-primary` | Footer link hover |
| `bg-white` | Consider `bg-brand` for primary action | Button background |
| `text-14` | `text-body` | Button text |
| `text-black` | Derived from button bg | Button text color |
| `ring-white/40` | `ring-brand/20` | Button focus ring |
| `h-[42px]` | Standardize to `h-10` (40px) or `h-12` (48px) | Button height |
| `min-w-[112px]` | Keep or move to token | Button min-width |
| `bg-neutral-600/40` | `bg-surface-2` | Secondary button |
| `rounded-full` | Keep for pill buttons | Button radius |

### `restore.tsx` (Inline Step Navigation)

| Current Value | Semantic Token | Context |
|---------------|---------------|---------|
| `border-white/10` | `border-border-default` | Backup snapshot border |
| `bg-white/5` | `bg-surface-base` | Hover state |
| `bg-white/10` | `bg-surface-2` | Badge/pill bg |
| `hover:bg-white/10` | `hover:bg-surface-2` | Button hover |
| `text-white/70` | `text-text-secondary` | Loading text |
| `text-xs` (12px) | `text-caption` | Small text |
| `text-[10px]` | `text-caption-sm` | Badge text |
| `opacity-60`/`opacity-80` | Use text-text-secondary/tertiary | Opacity-based dimming |
| `focus-visible:border-white/50` | `focus-visible:border-brand` | Focus state |
| `border-brand bg-brand/15` | Keep -- brand token usage is correct | Selected state |

### `pin-input.tsx`

| Current Value | Semantic Token | Context |
|---------------|---------------|---------|
| `border-white/20` | `border-border-emphasis` | Segment border |
| `bg-white/5` | `bg-surface-base` | Active segment |
| `bg-[#D9D9D9]/10` | `bg-surface-1` or `bg-text-tertiary` | Dot placeholder |
| `rounded-8` | `rounded-radius-sm` | Segment corners |
| `#fff` segment color | `var(--color-text-primary)` or `white` | Cursor/selection |
| `12px` padding | Use spacing token | Segment padding |
| `10px` spacing | Use spacing token | Segment gap |

### `app-auth/login-with-livinity.tsx`

| Current Value | Semantic Token | Context |
|---------------|---------------|---------|
| `bg-dialog-content/70` | `bg-surface-1` with backdrop | Card background |
| `bg-black/50` | Use DarkenLayer | Overlay |
| `rounded-20` | `rounded-radius-xl` | Card border radius |
| `shadow-dialog` | `shadow-elevation-lg` | Card shadow |
| `text-17` | `text-heading-sm` | Title |
| `text-13` | `text-body-sm` | Button/description |
| `text-white/40` | `text-text-tertiary` | Description |
| `rounded-12` | `rounded-radius-md` | App icon |

## Standard Stack

### Core (No new libraries needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 3.4.1 | Styling via semantic tokens from Phase 1 | Already in stack |
| CVA | 0.7.0 | Component variants for buttons/inputs | Already in stack |
| rci | 0.1.0 | Code input for 2FA PIN | Already in stack, sufficient |
| Framer Motion | 10.16.4 | Animations (step transitions, error shake) | Already in stack |
| react-router-dom | 6.x | Routing between auth pages | Already in stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| use-is-focused | 0.0.1 | Focus detection for PinInput | Already in stack |
| react-qr-code | latest | QR code for 2FA enable | Already in stack, used in settings 2FA |

## Architecture Patterns

### Pattern 1: Step Indicator Component
**What:** A shared step indicator that shows progress through multi-step flows
**When to use:** Onboarding create flow (3 steps) and restore flow (4 steps)
**Example:**
```typescript
// New component: src/components/ui/step-indicator.tsx
interface StepIndicatorProps {
  steps: number
  currentStep: number  // 0-indexed
  className?: string
}

export function StepIndicator({ steps, currentStep, className }: StepIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {Array.from({ length: steps }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            i === currentStep
              ? 'w-6 bg-brand'          // Active step
              : i < currentStep
                ? 'w-1.5 bg-brand/50'   // Completed step
                : 'w-1.5 bg-surface-3'  // Future step
          )}
        />
      ))}
    </div>
  )
}
```
**Rationale:** Pill/dot indicators are standard for onboarding flows. The active step uses an elongated pill (w-6) for clear identification. Uses brand color for consistency with Phase 1 tokens.

### Pattern 2: Auth Layout Brand Enhancement
**What:** Enhance the shared Layout component with stronger brand presence
**When to use:** All bare layout pages (login, onboarding)
**Example:**
```typescript
// Enhanced shared.tsx Layout
export function Layout({ title, subTitle, children, footer, stepIndicator }: LayoutProps) {
  return (
    <>
      <div className='flex-1' />
      <div className='flex w-full flex-col items-center gap-6'>
        <LivinityLogoLarge />
        {stepIndicator}
        <div className='flex flex-col items-center gap-2'>
          <Title>{title}</Title>
          <SubTitle>{subTitle}</SubTitle>
        </div>
        {children}
      </div>
      <div className='flex-1' />
      <div className='pt-5' />
      <div className={footerClass}>{footer}</div>
    </>
  )
}
```

### Pattern 3: Brand-Themed Primary Button
**What:** Convert the white button to use brand color for primary auth actions
**When to use:** Login submit, Create account submit, Start button
**Example:**
```typescript
// Replace `bg-white text-black` with brand-themed button
export const buttonClass = tw`
  flex h-12 items-center rounded-full
  bg-brand px-6 text-body font-semibold text-white
  ring-brand/20 transition-all duration-200
  hover:bg-brand-lighter
  focus:outline-none focus-visible:ring-3 focus-visible:border-brand
  active:scale-[0.98]
  min-w-[112px] justify-center
  disabled:pointer-events-none disabled:opacity-50
`
```
**Rationale:** The prior decisions specify `bg-brand for primary actions`. Current white button doesn't reflect brand identity.

### Anti-Patterns to Avoid
- **Adding step indicators to only some flows:** Both the onboarding create flow AND the restore flow need step indicators for consistency
- **Changing auth logic during styling:** This phase is purely visual. Do not modify `use-auth.tsx`, tRPC calls, JWT handling, or redirect logic
- **Creating new pages:** The existing route structure is correct. Enhance existing pages, don't add new ones

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Step/progress indicators | Custom step counter with manual div styling | Shared `<StepIndicator>` component with token-based styling | Reusability across onboarding and restore flows, consistent appearance |
| PIN input segments | Custom input grid with individual inputs | Keep `rci` library, enhance `renderSegment` callback styling | `rci` handles focus management, selection state, clipboard -- all hard to implement correctly |
| Form validation UX | Custom error display per form | Keep existing `AnimatedInputError` from `input.tsx` | Already has shake animation, enter/exit transitions via Framer Motion |
| View transitions | Custom page transition animations | Keep existing `viewTransitionName` and `unstable_viewTransition` patterns | Already wired up in current onboarding flow, working correctly |

## Common Pitfalls

### Pitfall 1: Breaking the app-auth Standalone Build
**What goes wrong:** Changes to shared components (`pin-input.tsx`, `input.tsx`, `shared.tsx`) break the separate `app-auth` build entry which imports from `@/` (aliased to main `src/`)
**Why it happens:** `app-auth/` has its own `vite.config.ts` and `index.html` but shares source code with the main app via path aliases
**How to avoid:**
- After any changes to shared components, verify both builds compile
- The `app-auth/login-with-livinity.tsx` file also needs brand alignment
- Test with `pnpm run app-auth:dev` as well as the main dev server
**Warning signs:** app-auth build fails, app-auth page looks different from main login

### Pitfall 2: Losing Wallpaper Contrast on Auth Pages
**What goes wrong:** Switching from white buttons to brand-colored buttons may reduce contrast against certain wallpaper colors (brand color comes from wallpaper)
**Why it happens:** Brand color is dynamically extracted from the wallpaper, so a red wallpaper means a red brand color -- making a red button on a red blurred background
**How to avoid:**
- The existing `<DarkenLayer>` provides `bg-black/50` which ensures contrast
- Keep the darken layer -- do not remove it
- Test with light wallpapers (bright wallpaper + bright brand color is the worst case)
- Consider keeping the white button variant as a fallback or for the primary CTA
**Warning signs:** Buttons invisible against certain wallpapers, text unreadable

### Pitfall 3: Inconsistent Step Indicator State for Route-Based Flow
**What goes wrong:** Step indicators show wrong state because the onboarding create flow uses router navigation (different URLs) while restore uses internal state
**Why it happens:** Two different step tracking mechanisms -- URL path vs. useState
**How to avoid:**
- For route-based flow: Derive step from `useLocation().pathname` mapping
- For state-based flow (restore): Pass step directly as prop
- StepIndicator component should accept `currentStep` as a number, letting the consumer handle state resolution
**Warning signs:** Step indicator doesn't update on navigation, shows wrong step after browser back

### Pitfall 4: Over-Theming the 2FA Settings Dialogs
**What goes wrong:** Redesigning the 2FA dialogs in settings when they were already migrated to semantic tokens
**Why it happens:** Phase scope says "2FA input" but the settings 2FA dialogs (`2fa-enable.tsx`, `2fa-disable.tsx`) already use semantic tokens
**How to avoid:**
- Only the PinInput component (`pin-input.tsx`) needs styling updates
- Only the login page's 2FA step (`login.tsx` case '2fa') needs layout improvement
- The settings dialogs are out of scope for this phase (they already use `text-body-sm`, `text-text-secondary`, etc.)
**Warning signs:** Touching files that are already migrated, scope creep into settings

## Code Examples

### Step Indicator Placement in Onboarding
```typescript
// In onboarding/create-account.tsx
<Layout
  title={title}
  subTitle={t('onboarding.create-account.subtitle')}
  stepIndicator={<StepIndicator steps={3} currentStep={1} />}
  footer={<OnboardingFooter action={OnboardingAction.RESTORE} />}
>
  {/* form content */}
</Layout>
```

### Enhanced PinInput Segment Styling
```typescript
// In pin-input.tsx - replace raw values in renderSegment
const baseClassName = tw`flex h-full relative appearance-none rounded-radius-sm border-hpx border-border-emphasis [--segment-color:rgb(var(--text-primary))]`
const activeClassName = tw`bg-surface-base data-[state]:border-[var(--segment-color)]`
const dotClass = tw`absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-2`
```

### Login 2FA Step with Better UX
```typescript
// Enhanced 2FA step in login.tsx
case '2fa': {
  return (
    <Layout title={t('login-2fa.title')} subTitle={t('login-2fa.subtitle')}>
      <div className='flex w-full flex-col items-center gap-6 px-4 md:px-0'>
        <PinInput autoFocus length={6} onCodeCheck={handleSubmit2fa} />
        <button
          type='button'
          className={secondaryButtonClass}
          onClick={() => setStep('password')}
        >
          {t('back')}
        </button>
      </div>
    </Layout>
  )
}
```

### Restore Flow with Step Indicator
```typescript
// In restore.tsx
const stepCount = 4
const stepLabels = ['Location', 'Password', 'Backup', 'Review']

<Layout
  title={title}
  subTitle={stepSubtitle}
  stepIndicator={<StepIndicator steps={stepCount} currentStep={step} />}
  footer={<OnboardingFooter action={OnboardingAction.CREATE_ACCOUNT} />}
>
  {/* step content */}
</Layout>
```

## Suggested Plan Grouping

### Group 1: Layout & Brand Foundation (shared.tsx, bare-page.tsx)
- Migrate `buttonClass`, `secondaryButtonClass`, `formGroupClass` to semantic tokens
- Migrate `Title`, `SubTitle` typography to semantic tokens
- Enhance `<Layout>` to accept optional `stepIndicator` prop
- Update `<DarkenLayer>` to use semantic token
- Update `<LivinityLogoLarge>` sizing if needed
- **Files:** `shared.tsx`, `bare-page.tsx`, `darken-layer.tsx`, `livinity-logo.tsx`

### Group 2: Step Indicator Component
- Create `<StepIndicator>` component
- Uses brand color tokens, minimal pill/dot design
- **Files:** New `src/components/ui/step-indicator.tsx`

### Group 3: Login Page Redesign (LO-01)
- Apply brand button styling
- Improve form spacing
- Add back button to 2FA step
- **Files:** `login.tsx`

### Group 4: Onboarding Flow Redesign (LO-02, LO-03)
- Add StepIndicator to onboarding start, create-account, account-created
- Improve form spacing in create-account
- Migrate raw values in account-created
- Add StepIndicator to restore flow (4 steps)
- Migrate raw values in restore.tsx (backup snapshots, inline navigation)
- **Files:** `onboarding/index.tsx`, `onboarding/create-account.tsx`, `onboarding/account-created.tsx`, `onboarding/restore.tsx`

### Group 5: PinInput 2FA UX (LO-04)
- Migrate raw color values to semantic tokens
- Improve dot placeholder visibility
- Consider enhanced error feedback (longer shake, subtle error color)
- Improve loading state visibility
- **Files:** `pin-input.tsx`

### Group 6: App-Auth Brand Alignment
- Migrate raw values in `login-with-livinity.tsx` to semantic tokens
- Ensure visual consistency with main login page
- **Files:** `app-auth/src/login-with-livinity.tsx`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| White/black buttons for auth CTAs | Brand-colored primary buttons | 2024-2025 UI trends | Stronger brand identity, visual consistency |
| Plain multi-step forms without indicators | Step indicators (dots/pills/progress bars) | Long-standing UX pattern | Users know where they are and how many steps remain |
| Individual digit inputs for OTP | Single input with segment rendering (rci pattern) | 2022+ | Better paste support, fewer focus issues, cleaner code |
| Minimal branding on auth pages | Full brand presence (logo, colors, typography) | SaaS standard | First impression, trust building, brand recognition |

## Open Questions

1. **Brand Button Color vs. White Button**
   - What we know: Prior decisions say `bg-brand for primary actions`
   - What's unclear: Brand color comes from wallpaper, so button could blend with background
   - Recommendation: Use `bg-brand` for primary button, but test with multiple wallpapers. The DarkenLayer provides enough contrast in most cases. If needed, keep white as secondary variant.

2. **Onboarding Create Flow Step Count**
   - What we know: Flow is start -> create-account -> account-created (3 pages)
   - What's unclear: Should "start" page count as step 1, or is it a landing page before the steps begin?
   - Recommendation: Treat it as 3 steps: Welcome (0), Create Account (1), Done (2). Alternatively, only show step indicator on create-account page (step 1 of 2).

3. **app-auth Scope**
   - What we know: It's a separate build entry for third-party app auth
   - What's unclear: Whether full brand redesign applies to app-auth or just the main login
   - Recommendation: Include it in scope -- it shares the logo and PinInput components, and visual inconsistency between login pages would look unprofessional.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all 23 files in the auth/login/onboarding domain
- Phase 1 design system research (`01-RESEARCH.md`) for semantic token definitions
- `tailwind.config.ts` for current token inventory (already has semantic tokens from Phase 1)

### Secondary (MEDIUM confidence)
- `rci` library documentation (GitHub README) for CodeInput API
- shadcn/ui Input component patterns with CVA

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis

## Metadata

**Confidence breakdown:**
- File inventory: HIGH -- Direct codebase analysis of every relevant file
- Raw values to migrate: HIGH -- Grep-verified against actual file contents
- Step indicator pattern: HIGH -- Standard UX pattern, straightforward implementation
- 2FA UX issues: HIGH -- Direct analysis of pin-input.tsx implementation
- Brand button recommendation: MEDIUM -- Brand color/wallpaper contrast interaction needs testing
- app-auth scope: MEDIUM -- Unclear if stakeholder wants it included

**Research date:** 2026-02-06
**Valid until:** ~30 days (March 2026) -- No external library dependencies to go stale, pure codebase analysis
