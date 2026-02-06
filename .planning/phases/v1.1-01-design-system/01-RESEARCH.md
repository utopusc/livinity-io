# Phase 1: Design System Foundation - Research

**Researched:** 2026-02-06
**Domain:** Design System Refinement / Tailwind CSS / shadcn/ui
**Confidence:** HIGH

## Summary

This research investigates how to refine an existing Tailwind CSS + shadcn/ui design system from a heavy glassmorphism aesthetic to a cleaner, minimal Apple/Linear-style dark theme. The current system has design token sprawl (many font sizes, border radii, opacity variants, and shadow systems) that needs consolidation into a tighter, more systematic scale.

The standard approach for design system refinement in 2026 follows these principles: (1) Define semantic color tokens with clear naming hierarchies rather than raw values; (2) Consolidate typography into a clear type scale with 2-4 distinct heading levels and well-defined body/caption variants; (3) Standardize spacing using Tailwind's default 4px rhythm or a deliberate custom scale; (4) Reduce shadow complexity to 2-4 purposeful variants for different elevation levels; (5) Use CVA (class-variance-authority) patterns for component variants to maintain type safety and consistency.

The codebase analysis reveals heavy use of backdrop-blur, complex inset shadows, many custom font sizes (9px-56px), and numerical border-radius values (3px-32px). The goal is to preserve the wallpaper-based brand color theming while reducing visual weight and token complexity. Key recommendation: Prioritize semantic token definition first, then refactor components to use those tokens, ensuring backward compatibility during the transition.

**Primary recommendation:** Define semantic color, typography, spacing, and shadow tokens in tailwind.config.ts first, then iteratively refactor shadcn/ui components to use those tokens via CVA patterns, starting with the most-used components (Button, Input, Card).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 3.4.1 | Utility-first CSS framework with design token system | Industry standard for scalable utility CSS, built-in design token support via theme configuration |
| shadcn/ui | Latest | Copy-paste component library built on Radix UI | Not a dependency but a pattern - components you own, highly customizable, built for composition |
| Radix UI | 1.0+ (various) | Unstyled accessible component primitives | De-facto standard for accessible React components, handles complex accessibility patterns |
| class-variance-authority | 0.7.0 | Type-safe component variant API | Standard for shadcn/ui component styling, enables systematic variant management |
| tailwind-merge | 1.14.0 | Utility for merging Tailwind classes | Prevents class conflicts when composing components, essential for shadcn pattern |
| Framer Motion | 10.16.4 | Animation library | Already in stack, used for transitions and micro-interactions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss-animate | 1.0.7 | Animation utilities for Tailwind | Already installed, provides animation presets for components |
| tailwindcss-radix | 4.0.2 | Radix state utilities for Tailwind | Already installed, generates data-state utilities for Radix components |
| @tailwindcss/typography | 0.5.10 | Prose styling for content | Already installed, for styled content areas (not primary UI) |
| Plus Jakarta Sans | Variable font | Primary typeface | Current font, modern variable font with good weight range |
| Inter | Variable font | Fallback typeface | Current fallback, excellent for UI text |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui pattern | Pre-built component library (MUI, Chakra) | Pre-built libraries are faster to start but harder to customize to unique brand aesthetics |
| Manual variant classes | CVA (class-variance-authority) | Manual classes are simpler for small projects but don't scale or provide type safety |
| Custom color system | Tailwind default palette | Default palette is well-tested but wouldn't support wallpaper-based dynamic theming |

**Installation:**
```bash
# Already installed - no new dependencies needed
# Current stack supports all requirements
```

## Architecture Patterns

### Recommended Project Structure
```
livos/packages/ui/
├── tailwind.config.ts           # ALL design tokens defined here
├── src/
│   ├── index.css                # Global styles, CSS variables for dynamic colors
│   ├── shadcn-components/ui/    # Base shadcn components (Button, Input, Dialog)
│   ├── components/ui/           # Custom composed components (Card, IconButton)
│   ├── providers/               # Theme providers (wallpaper.tsx for brand colors)
│   └── utils/
│       ├── tw.ts                # Template literal helper for extracting classes
│       └── cn.ts                # Class merge utility (tailwind-merge + clsx)
```

### Pattern 1: Design Token Definition in tailwind.config.ts
**What:** All design tokens (colors, spacing, typography, shadows, radii) defined in a single source of truth
**When to use:** Always - tokens should never be defined ad-hoc in components
**Example:**
```typescript
// Source: Current codebase + Tailwind best practices
export default {
  theme: {
    extend: {
      // Semantic colors using CSS variables for dynamic theming
      colors: {
        brand: 'hsl(var(--color-brand) / <alpha-value>)',
        'brand-lighter': 'hsl(var(--color-brand-lighter) / <alpha-value>)',
        destructive: '#E03E3E',
        'surface-1': 'rgba(255, 255, 255, 0.06)', // Semantic naming
        'surface-2': 'rgba(255, 255, 255, 0.10)',
      },
      // Consolidated typography scale (reduce from 12 sizes to ~6)
      fontSize: {
        'caption': '11px',    // Small labels, metadata
        'body-sm': '13px',    // Small body text
        'body': '14px',       // Primary body text
        'body-lg': '15px',    // Large body text
        'heading-sm': '17px', // H4
        'heading': '19px',    // H3
        'heading-lg': '24px', // H2
        'display': '32px',    // H1
      },
      // Standardized border radius (reduce from 14 values to ~5)
      borderRadius: {
        'sm': '8px',   // Small elements (badges, pills)
        'md': '12px',  // Standard (buttons, inputs)
        'lg': '16px',  // Cards, dialogs
        'xl': '20px',  // Large surfaces
        'full': '9999px', // Pills, circular
      },
      // Reduced shadow system (down from 12+ to 4-5)
      boxShadow: {
        'sm': '0px 2px 8px rgba(0, 0, 0, 0.12)',
        'md': '0px 4px 16px rgba(0, 0, 0, 0.16)',
        'lg': '0px 8px 24px rgba(0, 0, 0, 0.20)',
        'xl': '0px 16px 48px rgba(0, 0, 0, 0.24)',
      },
    },
  },
}
```

### Pattern 2: Component Variants with CVA
**What:** Use class-variance-authority to define type-safe component variants that reference design tokens
**When to use:** For all shadcn/ui components with multiple visual states
**Example:**
```typescript
// Source: shadcn/ui Button component pattern + CVA documentation
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  // Base styles - applied to ALL variants
  'inline-flex items-center justify-center font-semibold transition-all disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-surface-1 hover:bg-surface-2 border border-white/10',
        primary: 'bg-brand hover:bg-brand-lighter',
        ghost: 'hover:bg-surface-1',
      },
      size: {
        sm: 'h-8 px-3 text-body-sm rounded-sm',
        md: 'h-10 px-4 text-body rounded-md',
        lg: 'h-12 px-6 text-body-lg rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface ButtonProps extends VariantProps<typeof buttonVariants> {
  // TypeScript automatically knows valid variant/size combinations
}
```

### Pattern 3: Dynamic Color Theming with CSS Variables
**What:** Use CSS custom properties for colors that change dynamically (brand color from wallpaper)
**When to use:** For theme-dependent colors that can't be static
**Example:**
```typescript
// Source: Current wallpaper.tsx provider
// In tailwind.config.ts:
colors: {
  brand: 'hsl(var(--color-brand) / <alpha-value>)',
}

// In provider (wallpaper.tsx):
useLayoutEffect(() => {
  document.documentElement.style.setProperty('--color-brand', brandColorHsl)
}, [brandColorHsl])

// In components:
<Button className="bg-brand hover:bg-brand-lighter" />
```

### Pattern 4: Semantic Token Abstraction Layer
**What:** Create an abstraction layer between raw values and component usage
**When to use:** Always - prevents direct color/size coupling to components
**Example:**
```typescript
// Source: Epic Web Design Tokens pattern
// BAD - direct coupling
<div className="bg-white/6 border border-white/5" />

// GOOD - semantic tokens
// In config: colors: { 'surface-subtle': 'rgba(255,255,255,0.06)' }
<div className="bg-surface-subtle border border-surface-border" />
```

### Anti-Patterns to Avoid
- **Arbitrary values in components:** `className="p-[13px]"` instead of using spacing tokens - creates inconsistency and maintenance burden
- **Magic numbers without tokens:** `shadow-[0px_4px_24px_rgba(0,0,0,0.56)]` instead of named shadows - impossible to maintain consistently
- **Direct opacity values:** `bg-white/6` scattered throughout components instead of semantic surface tokens - makes theme changes require widespread refactoring
- **Duplicate variant definitions:** Defining the same button styles in multiple places instead of centralizing in CVA - causes drift and inconsistency

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus state management | Custom focus rings on every component | Tailwind's `focus-visible:` utilities + ring utilities | WCAG 2.4.7 compliance requires 3:1 contrast, consistent sizing - easy to get wrong manually |
| Dark mode color adaptation | Manual color definitions for dark theme | Semantic color tokens with CSS variables | Dynamic wallpaper theming already uses this pattern, extending it prevents duplication |
| Component state variants | Inline conditional classes `className={isActive ? 'bg-blue' : 'bg-gray'}` | CVA (class-variance-authority) | Type safety, maintainability, prevents class name conflicts |
| Spacing inconsistency | Custom padding/margin values | Tailwind default spacing scale (4px rhythm) | Default scale is battle-tested, maintains visual rhythm automatically |
| Typography hierarchy | Ad-hoc font-size/weight combinations | Systematic type scale with semantic names | Prevents drift, ensures accessibility (WCAG requires clear hierarchy) |
| Animation timing | Random duration values | Tailwind animation utilities + Framer Motion presets | Consistent timing creates professional feel, random values feel janky |

**Key insight:** Design system refinement is 80% removing custom solutions and consolidating to standard patterns. The current codebase has accumulated many one-off solutions (12 font sizes, 14 border radii, 12+ shadows) that were added individually. The path forward is consolidation, not addition.

## Common Pitfalls

### Pitfall 1: Token Sprawl During Refactoring
**What goes wrong:** Adding new semantic tokens while keeping old arbitrary values, resulting in MORE complexity instead of less
**Why it happens:** Incremental refactoring without removing old patterns, fear of breaking existing UI
**How to avoid:**
- Audit existing usage first (grep for `text-[0-9]`, `rounded-[0-9]`, etc.)
- Define complete new token system upfront
- Migrate component-by-component, fully replacing old patterns
- Remove unused tokens after migration
**Warning signs:** Config file grows instead of shrinking, components use mix of old/new patterns

### Pitfall 2: Losing Wallpaper Theming During Color Consolidation
**What goes wrong:** Replacing CSS variable-based brand colors with static values, breaking dynamic theming
**Why it happens:** Not understanding the wallpaper.tsx provider's role in setting `--color-brand` CSS variable
**How to avoid:**
- Keep `brand`, `brand-lighter`, `brand-lightest` as CSS variables
- Define semantic surface colors as static rgba values (they don't change with wallpaper)
- Test with different wallpapers to ensure brand color updates
**Warning signs:** Brand color stops updating when wallpaper changes, components hardcoded to specific hues

### Pitfall 3: Over-Reducing Glassmorphism Without Depth Alternative
**What goes wrong:** Removing backdrop-blur and inset shadows without replacing with alternative depth cues, resulting in flat, hard-to-scan UI
**Why it happens:** Reacting against "too much glassmorphism" by removing all depth techniques
**How to avoid:**
- Replace backdrop-blur with subtle background color differences (surface-1, surface-2, surface-3 tokens)
- Use minimal shadows for actual elevation (not decorative inset shadows)
- Leverage border-white/10 for subtle separation
- Test with wallpapers of varying brightness to ensure depth remains visible
**Warning signs:** Components blend together, hard to distinguish interactive elements, visual hierarchy lost

### Pitfall 4: Breaking Accessibility During Shadow/Focus Reduction
**What goes wrong:** Removing or weakening focus indicators while cleaning up shadows, violating WCAG 2.4.7
**Why it happens:** Treating focus states as "just another shadow" during shadow system cleanup
**How to avoid:**
- Focus indicators are accessibility requirements, not aesthetic choices
- WCAG 2.4.13 requires 3:1 contrast ratio for focus indicators
- Define dedicated focus ring tokens separate from decorative shadows
- Test keyboard navigation after every component refactor
**Warning signs:** Focus states invisible against certain wallpapers, keyboard navigation unclear

### Pitfall 5: Inconsistent Component Migration Order
**What goes wrong:** Refactoring components randomly, creating inconsistent UI where some areas are refined and others aren't
**Why it happens:** No clear migration strategy, working on whatever component is currently being edited
**How to avoid:**
- Define token system completely first (all colors, typography, spacing, shadows, radii)
- Migrate high-impact components first (Button, Input, Card - used everywhere)
- Migrate entire component at once, not piecemeal
- Document migration status to track progress
**Warning signs:** UI feels inconsistent, some buttons refined while others still have heavy glassmorphism

## Code Examples

Verified patterns from official sources:

### Semantic Color Token Definition
```typescript
// Source: Epic Web Tailwind Color Tokens + current wallpaper.tsx pattern
// In tailwind.config.ts:
export default {
  theme: {
    extend: {
      colors: {
        // Dynamic brand colors (from wallpaper)
        brand: 'hsl(var(--color-brand) / <alpha-value>)',
        'brand-lighter': 'hsl(var(--color-brand-lighter) / <alpha-value>)',
        'brand-lightest': 'hsl(var(--color-brand-lightest) / <alpha-value>)',

        // Semantic surface colors (static, minimal glassmorphism)
        'surface-base': 'rgba(255, 255, 255, 0.04)',   // Lowest elevation
        'surface-1': 'rgba(255, 255, 255, 0.06)',      // Default cards
        'surface-2': 'rgba(255, 255, 255, 0.10)',      // Elevated elements
        'surface-3': 'rgba(255, 255, 255, 0.14)',      // Highest elevation

        // Semantic border colors
        'border-subtle': 'rgba(255, 255, 255, 0.06)',
        'border-default': 'rgba(255, 255, 255, 0.10)',
        'border-emphasis': 'rgba(255, 255, 255, 0.20)',

        // Semantic text colors
        'text-primary': 'rgba(255, 255, 255, 0.90)',
        'text-secondary': 'rgba(255, 255, 255, 0.60)',
        'text-tertiary': 'rgba(255, 255, 255, 0.40)',

        // Functional colors (unchanged)
        destructive: '#E03E3E',
        success: '#299E16',
      },
    },
  },
}
```

### Typography Scale with Semantic Names
```typescript
// Source: Material Design 3 Type Scale + Tailwind best practices
export default {
  theme: {
    extend: {
      fontSize: {
        // Caption level (metadata, labels)
        'caption-sm': ['11px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'caption': ['12px', { lineHeight: '1.4', letterSpacing: '0.01em' }],

        // Body level (primary text)
        'body-sm': ['13px', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'body': ['14px', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'body-lg': ['15px', { lineHeight: '1.5', letterSpacing: '0.01em' }],

        // Heading level (section titles)
        'heading-sm': ['17px', { lineHeight: '1.3', letterSpacing: '0em', fontWeight: '600' }],
        'heading': ['19px', { lineHeight: '1.3', letterSpacing: '0em', fontWeight: '600' }],
        'heading-lg': ['24px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],

        // Display level (page titles)
        'display-sm': ['32px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display': ['36px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg': ['48px', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
      },
    },
  },
}
```

### Refined Button Component with CVA
```typescript
// Source: shadcn/ui Button pattern + reduced glassmorphism
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  // Base styles - clean, minimal
  'inline-flex items-center justify-center font-semibold transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/20',
  {
    variants: {
      variant: {
        // Refined default - subtle surface, no heavy shadows
        default: 'bg-surface-1 hover:bg-surface-2 border border-border-default hover:border-border-emphasis',

        // Primary - uses brand color from wallpaper
        primary: 'bg-brand hover:bg-brand-lighter text-white',

        // Ghost - minimal, reveals on hover
        ghost: 'hover:bg-surface-1 border border-transparent hover:border-border-subtle',

        // Destructive - functional color
        destructive: 'bg-destructive hover:bg-destructive/90 text-white',
      },
      size: {
        sm: 'h-8 px-3 text-body-sm rounded-sm gap-1.5',
        md: 'h-10 px-4 text-body rounded-md gap-2',
        lg: 'h-12 px-6 text-body-lg rounded-lg gap-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface ButtonProps extends VariantProps<typeof buttonVariants> {}
```

### Refined Card Component
```typescript
// Source: Current Card component + minimal glassmorphism
import { cn } from '@/shadcn-lib/utils'

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // Clean card style - subtle depth without heavy blur
        'rounded-lg bg-surface-1 border border-border-subtle',
        'p-6 transition-all duration-200',
        // Hover state - subtle elevation increase
        'hover:bg-surface-2 hover:border-border-default hover:shadow-md',
        className
      )}
    >
      {children}
    </div>
  )
}
```

### Refined Input Component
```typescript
// Source: shadcn/ui Input + clean focus states
const inputVariants = cva(
  'flex w-full border transition-all duration-200 placeholder:text-text-tertiary disabled:opacity-50',
  {
    variants: {
      variant: {
        default: [
          'bg-surface-base border-border-default',
          'hover:bg-surface-1 hover:border-border-emphasis',
          'focus-visible:bg-surface-1 focus-visible:border-brand',
          'focus-visible:ring-3 focus-visible:ring-brand/20',
          'text-text-primary focus-visible:text-text-primary',
        ],
        destructive: [
          'border-destructive text-destructive',
          'focus-visible:ring-destructive/20',
        ],
      },
      sizeVariant: {
        default: 'h-12 px-4 text-body rounded-md',
        sm: 'h-10 px-3 text-body-sm rounded-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      sizeVariant: 'default',
    },
  }
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Arbitrary numeric font sizes (9, 11, 12, 13, 14, 15, etc.) | Semantic type scale (caption, body, heading, display) | 2024-2025 design systems | Easier to maintain hierarchy, better accessibility, prevents size drift |
| Heavy glassmorphism (backdrop-blur everywhere) | Minimal depth cues (subtle backgrounds, borders, shadows) | 2025-2026 UI trends | Cleaner aesthetic, better performance (blur is expensive), Apple/Linear influence |
| Direct color values in components | Semantic color tokens with abstraction layer | Ongoing best practice | Theme changes become config edits instead of component refactors |
| Manual class strings for variants | CVA (class-variance-authority) | 2023+ (shadcn/ui adoption) | Type safety, maintainability, prevents variant drift |
| Tailwind CSS v3 theme config | Tailwind CSS v4 @theme directive | Tailwind v4 (2024+) | Single source of truth, CSS-first tokens, better DX - not yet adopted in this codebase |

**Deprecated/outdated:**
- **Heavy glassmorphism:** 2020-2022 trend, now considered dated. Current aesthetic prefers subtle depth through layered surfaces and minimal shadows. Still acceptable for accent elements but not primary UI pattern.
- **Pixel-perfect numeric tokens:** Old pattern of defining every possible size (3px, 4px, 5px, 6px...). Modern systems use t-shirt sizing (sm, md, lg) or systematic scales (8, 12, 16, 24...) for better consistency.
- **Opacity-based light theme in dark mode:** Using white/opacity overlays. Modern approach uses semantic tokens that adapt to theme context, though this codebase intentionally uses dark-only which is acceptable for its aesthetic.

## Open Questions

Things that couldn't be fully resolved:

1. **Tailwind CSS v4 Migration Timing**
   - What we know: Tailwind CSS v4 introduces @theme directive for better token management
   - What's unclear: Whether to migrate during this refactor or defer to later phase
   - Recommendation: Stay on Tailwind v3.4.1 for this phase - v4 migration is a separate undertaking, would add complexity to already-large refactor

2. **Backdrop Blur Complete Removal vs. Selective Use**
   - What we know: Goal is "reduce glassmorphism" not "eliminate all blur"
   - What's unclear: Which components should keep subtle blur (if any) for brand differentiation
   - Recommendation: Remove backdrop-blur from all default states, consider keeping for dialogs/modals only where depth is critical

3. **Icon Sizing Standardization**
   - What we know: Requirement DS-08 mentions "consistent icon sizing and weight"
   - What's unclear: Current icon sizing patterns (not fully audited in research), whether Tabler icons need supplementing
   - Recommendation: Include icon size tokens (icon-sm: 16px, icon-md: 20px, icon-lg: 24px) in design system, audit during implementation

4. **Typography Weight Standardization**
   - What we know: Plus Jakarta Sans supports 200-800 weights, currently using various weights
   - What's unclear: Whether to standardize to specific weights (e.g., 400/500/600/700 only) or allow full range
   - Recommendation: Define semantic weight tokens (font-normal: 400, font-medium: 500, font-semibold: 600, font-bold: 700), limit to these four

5. **Shadow System Complexity Balance**
   - What we know: Need to reduce from 12+ shadows, Apple/Linear use subtle shadows
   - What's unclear: Exact number of shadow variants needed (3? 4? 5?)
   - Recommendation: Start with 4 elevation levels (sm/md/lg/xl), add more only if specific use case emerges during component refinement

## Sources

### Primary (HIGH confidence)
- Tailwind CSS official documentation - Theme configuration and design tokens
- shadcn/ui official patterns - Component architecture and CVA usage
- Current codebase analysis - tailwind.config.ts, button.tsx, input.tsx, card.tsx, wallpaper.tsx

### Secondary (MEDIUM confidence)
- [Tailwind CSS Best Practices 2025-2026: Design Tokens, Typography & Responsive Patterns](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns)
- [Tailwind CSS 4 @theme: The Future of Design Tokens (A 2025 Guide)](https://medium.com/@sureshdotariya/tailwind-css-4-theme-the-future-of-design-tokens-at-2025-guide-48305a26af06)
- [Semantic, themable color design tokens in Tailwind CSS](https://github.com/epicweb-dev/tailwindcss-color-tokens)
- [Introduction to Tailwind CSS Color Tokens - Epic Web Dev](https://www.epicweb.dev/tutorials/tailwind-color-tokens/tailwind-css-color-tokens-introduction/introduction-to-tailwind-css-color-tokens)
- [Mastering typography in design systems with semantic tokens and responsive scaling](https://uxdesign.cc/mastering-typography-in-design-systems-with-semantic-tokens-and-responsive-scaling-6ccd598d9f21)
- [Material Design 3 - Typography Type Scale Tokens](https://m3.material.io/styles/typography/type-scale-tokens)
- [Class Variance Authority - Official Documentation](https://cva.style/docs)
- [The Anatomy of shadcn/ui Components - Vercel Academy](https://vercel.com/academy/shadcn-ui/extending-shadcn-ui-with-custom-components)
- [Building a consistent corner radius system in UI](https://medium.com/design-bootcamp/building-a-consistent-corner-radius-system-in-ui-1f86eed56dd3)
- [Wise Design - Focus states](https://wise.design/foundations/focus-states)
- [A guide to designing accessible, WCAG-conformant focus indicators](https://www.sarasoueidan.com/blog/focus-indicators/)
- [WCAG 2.4.13: Focus Appearance (Level AAA)](https://www.wcag.com/designers/2-4-13-focus-appearance/)

### Tertiary (LOW confidence)
- [UI Design Trend 2026 #2: Glassmorphism and Liquid Design Make a Comeback](https://medium.com/design-bootcamp/ui-design-trend-2026-2-glassmorphism-and-liquid-design-make-a-comeback-50edb60ca81e) - WebSearch only, trend reporting
- [Liquid Glass UI 2026: Apple's New Design Language Explained](https://medium.com/@expertappdevs/liquid-glass-2026-apples-new-design-language-6a709e49ca8b) - WebSearch only, speculative content about Apple design direction
- [Tailwind CSS spacing scale discussion](https://github.com/tailwindlabs/tailwindcss/discussions/12263) - Community discussion, not official guidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries currently in package.json, well-established patterns
- Architecture: HIGH - Based on actual codebase analysis and shadcn/ui official patterns
- Pitfalls: HIGH - Identified from current codebase issues (token sprawl, inconsistent patterns) and design system best practices
- Code examples: HIGH - Derived from current codebase patterns + verified shadcn/ui/Tailwind patterns
- 2026 trends: MEDIUM - WebSearch results on glassmorphism/minimal trends, verified with multiple sources but trend reporting is inherently speculative

**Research date:** 2026-02-06
**Valid until:** ~30 days (March 2026) - Design system patterns are stable, but Tailwind v4 adoption trends may shift recommendations
