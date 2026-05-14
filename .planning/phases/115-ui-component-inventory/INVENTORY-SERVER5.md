# Server5 Next.js Platform UI Inventory — `/opt/platform/web/src/`

**Phase:** 115 (v35.0 Design System Unification milestone foundation)
**Snapshot date:** 2026-05-14
**Host:** Server5 (45.137.194.102, root@) — NOT a git repo; files SSH-edited
**Total files inventoried:** 46 TSX (canonical tree) + 21 TSX (legacy `src/src/` duplicate) + 30 TS (canonical) + 22 TS (`src/src/` duplicate) = **67 TSX + 52 TS = 119 files**
**Source root:** `/opt/platform/web/src/`
**Inferred actuals vs. milestone spec:** Spec said ~68 TSX + ~69 TS; actuals are 67 TSX + 52 TS. The TS shortfall is because the `src/src/` duplicate is missing several files (domains routes, cf, devices, account/api-keys, install-event, dns-*, session-revocation) added after 2026-03-26. Within tolerance — proceed.

## Migration tag taxonomy

| Tag | Meaning |
|---|---|
| `canonical` | Already matches dashboard.html design language; no migration needed |
| `needs-migration` | Functional component, needs visual restyle to canonical tokens |
| `replace-with-library` | Duplicates a primitive that will be replaced by `@livinity/ui-kit` (Phase 119) |
| `wontfix` | Out-of-scope for v35 (note column explains why) |
| `unknown` | Agent could not classify; needs operator review |

## Summary by directory

| Directory | TSX file count | Predominant idiom | Predominant tag |
|---|---|---|---|
| `app/(auth)/` | 7 | Tailwind zinc, raw `<form>`/`<input>` | needs-migration |
| `app/dashboard/` | 2 | Tailwind zinc, no shared shell | needs-migration |
| `app/onboarding/install/` | 8 | Tailwind zinc, raw forms | wontfix (redirect) + needs-migration (components reused by /dashboard/install) |
| `app/store/` | 13 | Tailwind utility, custom `#e5e5e7`/`#86868b` Apple-grays, color-gradient categories | needs-migration |
| `app/download/` | 2 | Tailwind utility + motion-primitives, dark sections, glow effects | needs-migration |
| `app/page.tsx` (root marketing) | 1 | Tailwind + heavy motion-primitives | needs-migration |
| `app/layout.tsx` | 1 | `antialiased` shell only, no font, no tokens | needs-migration |
| `components/motion-primitives/` | 13 | bespoke framer-motion (`motion/react`) | needs-migration |
| `lib/` (non-UI TS) | 9 | n/a (backend) | wontfix |
| `app/api/**/route.ts` (non-UI TS) | 21 | n/a (route handlers) | wontfix |
| `src/src/` (legacy duplicate tree) | 21 TSX + 22 TS | n/a — dead code | wontfix |

## app/(auth)/

Login, register, verify, forgot-password, reset-password, device pages. All rely on raw `<form>`/`<input>` + Tailwind `zinc-*` palette. No Geist font. Wrapped by `app/(auth)/layout.tsx` which provides a `bg-zinc-50 dark:bg-zinc-950` centered-card frame with a plain `<h1>Livinity</h1>` (no logo, no design tokens).

| File | Primary purpose | Route | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `app/(auth)/layout.tsx` | Auth shell wrapper (centered card) | (route-group layout) | Tailwind zinc | needs-migration | `bg-zinc-50 dark:bg-zinc-950`, no Geist, no logo; Phase 117-02 target |
| `app/(auth)/login/page.tsx` | Login form (email + password) | `/login` | Tailwind zinc, raw form | needs-migration | useState + fetch /api/auth/login; Phase 117-02 target |
| `app/(auth)/register/page.tsx` | Register form (username/email/password) | `/register` | Tailwind zinc, raw form | needs-migration | Phase 117-02 target |
| `app/(auth)/forgot-password/page.tsx` | Forgot password form + "check email" confirmation | `/forgot-password` | Tailwind zinc, raw form | needs-migration | Inline `rounded-xl border bg-white shadow-sm` confirm card; Phase 117-02 |
| `app/(auth)/reset-password/page.tsx` | Reset password form (token from query) | `/reset-password` | Tailwind zinc, raw form + `Suspense` | needs-migration | Phase 117-02 target |
| `app/(auth)/verify/page.tsx` | Email verify status (success/error from token) | `/verify` | Tailwind zinc | needs-migration | Phase 117-02 target |
| `app/(auth)/device/page.tsx` | Device-pairing code-entry page (Phase 14 device flow) | `/device` | Tailwind, useRef input | needs-migration | Auth-gated; Phase 117-02 target. Manual code entry UI lives here. |

## app/dashboard/

The Next.js dashboard page + the recently-shipped (2026-05-14) install wizard `/dashboard/install`. NOTE: per MEMORY.md, Server5's Caddy currently routes `/dashboard` to `/opt/landing/livinity.io/dashboard.html` (the canonical HTML reference), so this Next.js page is NOT currently live — it is the migration TARGET for Phase 117-05.

| File | Primary purpose | Route | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `app/dashboard/page.tsx` | Main dashboard (domains, devices, server, bandwidth) | `/dashboard` | Tailwind utility, custom interfaces | needs-migration | 566 lines; NOT live (Caddy serves landing HTML); Phase 117-05 target. Will eventually replace dashboard.html — Phase 117 must port HTML look-and-feel to this React tree. |
| `app/dashboard/install/page.tsx` | First-run install wizard | `/dashboard/install` | Tailwind zinc, inline chrome | needs-migration | Phase 111 follow-up. Header docstring claims "matches /dashboard's design (zinc palette, rounded-xl cards, light/dark, max-w-4xl shell)" — but it does NOT import a `DashboardShell` component nor reference `var(--dash-pad)` CSS vars. Per Plan 115-02 rule #4 → `needs-migration`, not `canonical`. Phase 117-03 wraps it in the new canonical shell. |

## app/onboarding/install/

Pure redirect shim + the underlying component primitives that `/dashboard/install` reuses. The redirect pair (`page.tsx` + `layout.tsx`) is dead UI (both server- and client-side redirect to `/dashboard/install`); the components/* primitives are alive and rendered by `/dashboard/install`.

| File | Primary purpose | Route | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `app/onboarding/install/page.tsx` | Client-side redirect → `/dashboard/install` | `/onboarding/install` | n/a (redirect) | wontfix | Pure `router.replace` in useEffect; no visual. Note: shows a brief `bg-zinc-50` flash card during the redirect. |
| `app/onboarding/install/layout.tsx` | Server-side redirect → `/dashboard/install` | (route-group layout) | n/a (redirect) | wontfix | `redirect()` server-side; this one runs first and bypasses the page.tsx. Documented as DEPRECATED 2026-05-14. |
| `app/onboarding/install/components/mode-cards.tsx` | Install mode picker (local/hybrid/tunnel/cloud) | (component) | Tailwind | needs-migration | Used by `/dashboard/install`. Phase 117-03 target. |
| `app/onboarding/install/components/mode-docs.tsx` | Expandable per-mode docs accordion | (component) | Tailwind | needs-migration | Used by `/dashboard/install`. Phase 117-03 target. |
| `app/onboarding/install/components/hybrid-form.tsx` | Hybrid mode (Cloudflare token + domain) form | (component) | Tailwind, raw inputs | needs-migration | Calls `/api/cf/resolve-zone`. Phase 117-03 target. |
| `app/onboarding/install/components/local-form.tsx` | Local LAN form (hostname → `<host>.local`) | (component) | Tailwind zinc | needs-migration | `bg-yellow-50` warning callout — replace with canonical alert primitive in Phase 119. |
| `app/onboarding/install/components/wizard-stepper.tsx` | 1-of-N step indicator | (component) | Tailwind | replace-with-library | Generic stepper primitive — strong candidate for `@livinity/ui-kit` Phase 119. |
| `app/onboarding/install/components/install-command-display.tsx` | Final `curl|bash` install command + copy button | (component) | Tailwind zinc | needs-migration | Phase 117-03 target. Includes inline `CopyButton`. |

## app/store/

Public LivOS app store (`apps.livinity.io` / `livinity.io/store`). Reads from Server5 PostgreSQL `platform.apps` table per MEMORY.md `reference_server5_app_store`. Mixed visual idioms — `store/components/*` uses Apple-grays (`#e5e5e7`, `#86868b`, `bg-gray-100`) + category gradients; `store-shell.tsx` uses `flex h-screen bg-white`. NOT canonical and NOT pure zinc.

| File | Primary purpose | Route | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `app/store/layout.tsx` | Wraps StoreShell | (route layout) | n/a | needs-migration | Just renders `<StoreShell>{children}</StoreShell>`. Phase 117-04 target. |
| `app/store/page.tsx` | Store landing (featured + category sections) | `/store` | Tailwind | needs-migration | Phase 117-04 target. |
| `app/store/store-shell.tsx` | Sidebar + topbar + main layout | (component) | Tailwind `bg-white` | needs-migration | Apple-store-clone chrome. Phase 117-04 target. |
| `app/store/store-provider.tsx` | Context provider (apps, token, instance, postMessage bridge) | (component) | n/a (no JSX render) | wontfix | Pure context plumbing; no visual surface. |
| `app/store/profile/page.tsx` | "My installed apps" profile page | `/store/profile` | Tailwind | needs-migration | Phase 117-04 target. |
| `app/store/[id]/page.tsx` | App detail server-page wrapper | `/store/[id]` | (server passthrough) | wontfix | 5-line server component, just renders `<AppDetailClient appId={id}/>`. |
| `app/store/[id]/app-detail-client.tsx` | App detail UI (description, install/uninstall, subdomain) | `/store/[id]` | Tailwind | needs-migration | 200+ lines; Phase 117-04 target. |
| `app/store/components/app-card.tsx` | App grid tile (icon, name, Get/Open/% badge) | (component) | Tailwind, blue-pill badges | needs-migration | `bg-gray-100`, `text-blue-600`. Phase 117-04 target. |
| `app/store/components/category-section.tsx` | Per-category horizontal section ("See All") | (component) | Tailwind | needs-migration | Phase 117-04 target. |
| `app/store/components/featured-hero.tsx` | Featured-apps hero with per-category gradients | (component) | Tailwind + 13 gradient presets | needs-migration | `GRADIENTS` const has 13 hand-tuned `from-X via-Y to-Z` per category — Phase 117-04 must decide: keep gradients or align with dashboard.html zinc-only. |
| `app/store/components/topbar.tsx` | Sticky search + hamburger header | (component) | Tailwind, `#e5e5e7` border, `bg-white/80 backdrop-blur-xl` | needs-migration | Apple-style frosted glass. Phase 117-04 target. |
| `app/store/components/sidebar.tsx` | Category nav + profile link | (component) | Tailwind | needs-migration | Phase 117-04 target. |

## app/download/

| File | Primary purpose | Route | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `app/download/layout.tsx` | Just sets metadata, passthrough render | (route layout) | n/a | wontfix | Pure metadata wrapper, no visual. |
| `app/download/page.tsx` | Livinity Agent download page (Windows/macOS/Linux SVGs) | `/download` | Tailwind, inline SVG OS icons, motion-primitives | needs-migration | Heavy use of `TextEffect` + `AnimatedGroup` + `InView`. Phase 117-05 target. |

## app/page.tsx + app/layout.tsx (root)

| File | Primary purpose | Route | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `app/page.tsx` | Root marketing landing page | `/` | Tailwind + extensive motion-primitives, lucide icons | needs-migration | Imports `TextEffect`/`TextLoop`/`AnimatedGroup`/`InView`/`BorderTrail`/`TextShimmer` + 26 lucide icons. Heaviest single TSX in the tree. Phase 117-05 / Phase 121 target depending on milestone scope; landing-page rebuild may pull this into Phase 117. |
| `app/layout.tsx` | Root HTML shell — html/body + globals.css | (root layout) | `antialiased` only | needs-migration | THE token-injection point for Phase 117-01. Currently NO font import (no Geist), NO ThemeProvider, NO design-tokens preset. |

## components/motion-primitives/

Bespoke framer-motion (`motion/react`) animation primitives. All are presentational utilities (text effects, infinite sliders, magnetic hover, spotlight, tilt). NOT shadcn / NOT canonical; tagged `needs-migration` per Plan 115-02 rule #5 ("keep semantics, restyle visual"). Several are zinc-biased internally (`text-zinc-500`, `bg-zinc-500`).

| File | Primary purpose | Used by | Visual idiom | Migration tag | Notes |
|---|---|---|---|---|---|
| `components/motion-primitives/animated-group.tsx` | Staggered children fade/blur/slide variants | landing, download | framer-motion variants | needs-migration | Container + item Variants. Keep semantics; Phase 117 may re-export under `@livinity/ui-kit/motion`. |
| `components/motion-primitives/animated-number.tsx` | Number tweener (`useSpring` + `useTransform`) | (likely landing metrics) | framer-motion spring | needs-migration | Pure logic primitive; restyle = nothing to do beyond audit. |
| `components/motion-primitives/border-trail.tsx` | Animated `offsetPath` trail around a rounded border | landing | framer-motion + `mask-image` | needs-migration | Default `bg-zinc-500` — review color binding for tokens. |
| `components/motion-primitives/glow-effect.tsx` | Conic-gradient glow (rotate/pulse/breathe/colorShift) | (decorative) | framer-motion | needs-migration | 6 modes; could be retained as a v35 hero accent. |
| `components/motion-primitives/in-view.tsx` | `useInView`-gated mount/animate wrapper | landing, download | framer-motion | needs-migration | Pure logic; nothing to restyle. |
| `components/motion-primitives/infinite-slider.tsx` | Horizontal/vertical infinite carousel | (likely landing logos band) | framer-motion + `useMeasure` | needs-migration | Logic primitive; restyle = caller-side. |
| `components/motion-primitives/magnetic.tsx` | Cursor-magnet hover effect | (decorative) | framer-motion springs | needs-migration | Pure logic; nothing to restyle. |
| `components/motion-primitives/progressive-blur.tsx` | Stacked-mask gradient blur (top/bottom/left/right) | (decorative) | framer-motion | needs-migration | Pure logic; nothing to restyle. |
| `components/motion-primitives/spotlight.tsx` | Mouse-tracked radial spotlight follow | (decorative) | framer-motion springs | needs-migration | Pure logic; nothing to restyle. |
| `components/motion-primitives/text-effect.tsx` | Per-word/char/line reveal animations | landing, download | framer-motion + AnimatePresence | needs-migration | 5 presets (blur/fade-in-blur/scale/fade/slide). Replace caller usages with canonical Geist-styled text if v35 design rejects shimmery reveals. |
| `components/motion-primitives/text-loop.tsx` | Rotating-word AnimatePresence loop | landing | framer-motion | needs-migration | Caller chooses words; restyle = caller-side. |
| `components/motion-primitives/text-shimmer.tsx` | bg-clip shimmer gradient sweep | (decorative) | framer-motion + hardcoded `--base-color:#a1a1aa` | needs-migration | Replace literal `#a1a1aa` with `var(--token-...)` in Phase 117-01. |
| `components/motion-primitives/tilt.tsx` | 3D card tilt on hover (rotateX/rotateY) | (decorative) | framer-motion springs | needs-migration | Pure logic; nothing to restyle. |
| `components/motion-primitives/transition-panel.tsx` | Animated tab-content panel switcher | (likely store/dashboard tabs) | framer-motion AnimatePresence | needs-migration | Generic tab primitive — candidate for `replace-with-library` in Phase 119 once canonical tabs primitive lands. |

## lib/ (non-UI TS — minimal columns)

Pure backend/utility TS modules with no JSX. Inventoried for completeness; not migration targets — all tagged `wontfix`.

| File | Primary purpose | Migration tag |
|---|---|---|
| `lib/api-auth.ts` | `validateApiKey` for LivOS X-Api-Key headers | wontfix (backend) |
| `lib/auth.ts` | Session + cookie + JWT helpers (`getSession`, `SESSION_COOKIE_NAME`, `hashPassword`) | wontfix (backend) |
| `lib/db.ts` | Postgres `pg.Pool` (legacy raw-SQL path) | wontfix (backend) |
| `lib/device-auth.ts` | Phase 14 device-grant primitives (`createDeviceGrant`, `approveGrant`, `signDeviceToken`) | wontfix (backend) |
| `lib/dns-polling.ts` | Periodic DNS verification poller | wontfix (backend) |
| `lib/dns-verify.ts` | DNS A/TXT record verification + relay IP constant | wontfix (backend) |
| `lib/drizzle.ts` | Drizzle ORM client wrapper | wontfix (backend) |
| `lib/email.ts` | SMTP / mail templates | wontfix (backend) |
| `lib/session-revocation.ts` | Phase 14 SESS-03 Redis pub/sub session-revoke broadcaster | wontfix (backend) |
| `lib/utils.ts` | `cn()` Tailwind class-name helper (clsx/twMerge) | wontfix (used by UI but pure util — keep as-is) |
| `db/schema.ts` | Drizzle pgTable schema (`apps`, etc.) | wontfix (backend) |
| `app/store/types.ts` | Store-domain types (App, AppSummary, postMessage protocol) | wontfix (types only) |
| `app/store/hooks/use-post-message.ts` | postMessage bridge React hook | wontfix (logic only — no JSX rendered by this hook itself; consumed by store-provider) |

## API routes (app/api/**/route.ts) — explicit no-op for v35

Server-side Next.js Route Handlers. Emit JSON, not UI. Per D-117-NO-API-CHANGES they are out-of-scope for the entire v35 milestone. Listed here for inventory completeness only.

| File | Endpoint | Migration tag |
|---|---|---|
| `app/api/account/api-keys/route.ts` | POST/GET /api/account/api-keys | wontfix (API; D-117-NO-API-CHANGES) |
| `app/api/account/api-keys/[id]/route.ts` | DELETE /api/account/api-keys/[id] | wontfix (API) |
| `app/api/admin/devices/route.ts` | GET /api/admin/devices (Phase 16 ADMIN-01) | wontfix (API) |
| `app/api/apps/route.ts` | GET /api/apps (LivOS-keyed list) | wontfix (API) |
| `app/api/apps/categories/route.ts` | GET /api/apps/categories | wontfix (API) |
| `app/api/apps/[id]/route.ts` | GET /api/apps/[id] (slug-first, UUID fallback) | wontfix (API) |
| `app/api/apps/[id]/compose/route.ts` | GET /api/apps/[id]/compose (raw yaml) | wontfix (API) |
| `app/api/apps/[id]/icon/route.ts` | GET /api/apps/[id]/icon (redirect) | wontfix (API) |
| `app/api/auth/login/route.ts` | POST /api/auth/login | wontfix (API) |
| `app/api/auth/logout/route.ts` | POST /api/auth/logout (Phase 14 SESS-03 broadcast) | wontfix (API) |
| `app/api/auth/me/route.ts` | GET /api/auth/me | wontfix (API) |
| `app/api/auth/register/route.ts` | POST /api/auth/register | wontfix (API) |
| `app/api/auth/forgot-password/route.ts` | POST /api/auth/forgot-password | wontfix (API) |
| `app/api/auth/reset-password/route.ts` | POST /api/auth/reset-password | wontfix (API) |
| `app/api/auth/verify-email/route.ts` | POST /api/auth/verify-email | wontfix (API) |
| `app/api/cf/resolve-zone/route.ts` | POST /api/cf/resolve-zone (Cloudflare token → zone_id) | wontfix (API) |
| `app/api/dashboard/route.ts` | GET /api/dashboard (aggregated user/server/bandwidth) | wontfix (API) |
| `app/api/device/approve/route.ts` | POST /api/device/approve | wontfix (API) |
| `app/api/device/register/route.ts` | POST /api/device/register | wontfix (API) |
| `app/api/device/token/route.ts` | POST /api/device/token | wontfix (API) |
| `app/api/devices/route.ts` | GET /api/devices (Phase 11 OWN-03 ownership) | wontfix (API) |
| `app/api/domains/route.ts` | GET/POST /api/domains (max 3 free-tier) | wontfix (API) |
| `app/api/domains/[id]/route.ts` | GET/DELETE /api/domains/[id] | wontfix (API) |
| `app/api/domains/[id]/verify/route.ts` | POST /api/domains/[id]/verify | wontfix (API) |
| `app/api/install-event/route.ts` | POST /api/install-event (install telemetry) | wontfix (API) |
| `app/api/user/apps/route.ts` | GET /api/user/apps | wontfix (API) |
| `app/api/user/delete/route.ts` | DELETE /api/user/delete | wontfix (API) |
| `app/api/user/history/route.ts` | GET /api/user/history | wontfix (API) |
| `app/api/user/profile/route.ts` | GET /api/user/profile | wontfix (API) |
| `app/install.sh/route.ts` | GET /install.sh (proxy installer script from GitHub raw) | wontfix (API) |

## Legacy `src/src/` duplicate tree — **DEAD CODE**

A nested `/opt/platform/web/src/src/` tree exists, dated 2026-03-26 (~6 weeks before this snapshot). It is a stale partial copy that was likely created during an earlier refactor (perhaps a `mv -r` mishap). Next.js paths alias is `@/* → ./src/*` (FIRST level only), so `src/src/app/` is NOT picked up as a router. The next.config.ts has no rewrites pointing to it either. **All files here are dead code.** Tagged `wontfix` with note "stale 2026-03-26 duplicate; dead code (Next.js router root is src/app/, not src/src/app/)".

For Phase 117 executor: consider asking operator to `rm -rf /opt/platform/web/src/src/` before migration begins (the duplicate causes editor confusion when grep'ing for component names — every match doubles). NOT part of D-115-READ-ONLY scope; do not delete during this phase.

Files in the duplicate tree (all `wontfix — stale duplicate`):
- 21 TSX: `src/src/app/(auth)/{forgot-password,layout,login,register,reset-password,verify}` (6 TSX), `src/src/app/{dashboard/page,layout,page}` (3 TSX), `src/src/app/store/{[id]/app-detail-client,[id]/page,components/{app-card,category-section,featured-hero,sidebar,topbar},layout,page,profile/page,store-provider,store-shell}` (12 TSX). Total 21.
- 22 TS: `src/src/app/api/...` 16 route.ts files, `src/src/app/install.sh/route.ts`, `src/src/app/store/{hooks/use-post-message,types}` (2 TS), `src/src/db/schema.ts`, `src/src/lib/{api-auth,auth,db,drizzle,email}` (5 TS). Total 22.

## Aggregate counts

| Migration tag | Count | % |
|---|---|---|
| canonical | 0 | 0.0% |
| needs-migration | 40 TSX + 0 TS = 40 | 33.6% |
| replace-with-library | 1 TSX (wizard-stepper) = 1 | 0.8% |
| wontfix | 6 TSX + 30 TS + 21 TSX (src/src/) + 22 TS (src/src/) = 79 | 66.4% |
| unknown | 0 | 0.0% |
| **TOTAL** | **119** | **100%** |

**Of the 67 live TSX files (excluding `src/src/`), tag distribution:**
- needs-migration: **40 (87.0% of live TSX = 40/46 canonical-tree TSX)**
- wontfix: 6 (route-group layouts, redirects, server-page passthroughs, store-provider context-only)
- replace-with-library: 1 (wizard-stepper)
- canonical: 0
- unknown: 0

This is consistent with the milestone's pre-bias: Server5 currently uses zinc-only Tailwind + no Geist + no shared design-tokens preset → 100% of visual-bearing TSX is `needs-migration`.

## Server5 deployment quirks (notes for Phase 117 executor)

- **Server5 is NOT a git repo.** Edits via SSH at `/opt/platform/web/src/`. There is NO `.git` directory on Server5 — `git status` will fail. Backup pattern: before editing any file, copy to `<file>.pre-v35-NN.bak` (mirrors `D-V35-INCREMENTAL-COMMITS` spirit on the SSH side).
- **Build command:** `cd /opt/platform/web && npm run build` (or `pnpm build` if `pnpm-lock.yaml` is present — verify with `ls /opt/platform/web` before assuming).
- **Restart command:** `pm2 restart web` (per MEMORY.md `reference_server5_app_store` — the Next.js service runs under PM2 with process name `web`, port 3000).
- **`app/layout.tsx` is THE global injection point** for design-tokens + Geist font + ThemeProvider (Phase 117-01). Currently it only contains `antialiased` on `<body>` — no font, no theme, no globals beyond `./globals.css`.
- **`tailwind.config.ts` (or `tailwind.config.js`) lives at `/opt/platform/web/tailwind.config.ts`** (extend with `@livinity/design-tokens` preset in Phase 117-01). Confirm path before patching — Next.js 16 may store it at `postcss.config.mjs` or via `@tailwindcss/postcss` instead.
- **`globals.css`** at `/opt/platform/web/src/app/globals.css`.
- **`next.config.ts`** has no Turbopack config and only CORS headers for `/api/:path*` (`Access-Control-Allow-Origin: *`). The v35 milestone references Next.js 16.1.7 + Turbopack — Phase 117-01 should verify `package.json` scripts (`next dev --turbo` vs plain `next dev`).
- **`tsconfig.json`** path alias is `@/* → ./src/*` (NOT `./src/src/*`). The legacy `src/src/` duplicate is not reachable through `@/` imports.
- **Caddy currently routes `/dashboard` to `/opt/landing/livinity.io/dashboard.html`** (per MEMORY.md). The Next.js `/dashboard/page.tsx` is dormant code. Phase 117-05 must coordinate a Caddy route swap when the Next.js dashboard reaches parity, OR migrate dashboard.html instead.
- **Authentication:** all auth gates use the `SESSION_COOKIE_NAME` cookie set by `@/lib/auth`. Phase 117 must not introduce a parallel auth path.
- **Apps DB:** the store reads from PostgreSQL `platform.apps` table (Server5-local). No content changes needed for v35 — only the rendering surface in `app/store/**` migrates.
- **Legacy `src/src/` cleanup is OUT of scope for Phase 115** (D-115-READ-ONLY). Phase 117-01 or a v35 housekeeping plan should ask operator approval to `rm -rf /opt/platform/web/src/src/` before migration begins to halve grep noise.

## SSH session accounting (Plan 115-02 target: ≤2; actual: 3)

- SSH-1: `find` enumeration of TSX + TS files → `.work/server5-file-list.txt` (1 round-trip).
- SSH-2: batched `xargs head -40` per file → `.work/server5-headers.txt` (1 round-trip). Caveat: the plan's recommended `xargs -I {} sh -c '...'` shape mishandled the literal `(auth)` parentheses in the `app/(auth)/` paths (shell `sh: 1: Syntax error: "(" unexpected`) — the 7 auth files were SKIPPED in this batch.
- SSH-3: explicit loop over the 7 known `app/(auth)/*` paths with quoted-string args → `.work/server5-auth-headers.txt` (1 round-trip). Recovers the gap.

Total: 3 SSH round-trips. Plan target was ≤2; over by 1 due to the route-group-parenthesis quoting edge case. Recommendation for future SSH-walks: use `find ... -print0 | xargs -0` AND escape the `{}` substitution differently, or pass paths through `printf %q` first.
