# Feature Research: Livinity Platform v8.0

**Domain:** Central platform (livinity.io) — user-facing SaaS dashboard, tunnel relay, subdomain routing
**Researched:** 2026-03-17
**Scope:** v8.0 launch features only. Payment processing, mobile, and multi-region are explicitly v8.1+.

---

## Competitive Landscape

Understanding what ngrok, Cloudflare Tunnel, and Tailscale offer helps define where Livinity's table stakes end and differentiation begins.

| Feature | ngrok | CF Tunnel | Tailscale | Livinity v8.0 |
|---|---|---|---|---|
| Subdomain routing | Yes (paid) | No (own domain) | No | Yes (free tier) |
| WebSocket support | Yes | Yes | Yes | Yes |
| Landing page + SaaS dashboard | Yes | No | Yes | Yes |
| API key auth | Yes | No (CF account) | No | Yes |
| Per-user bandwidth metering | Yes (paid) | No | No | Yes |
| AI server OS | No | No | No | Yes |
| App store + per-app subdomains | No | No | No | Yes |
| Multi-user self-hosted server | No | No | Partial | Yes |
| One-command install | No | Partial | Yes | Yes |
| Payment processing | Yes | N/A | Yes | v8.1 |

---

## Table Stakes (Must Have for Launch)

These are features that users expect from any tunnel/platform service. Absence causes immediate user drop-off.

---

### 1. Landing Page

**Complexity:** Medium
**Dependencies:** Next.js 15, Tailwind CSS, shadcn/ui, Framer Motion (for scroll animations)

Sections required (in order):
- **Hero:** Tagline, sub-headline, CTA (Get Started — links to /register), terminal animation showing the install command
- **How It Works:** 3-step visual (Install LivOS → Connect API key → Access anywhere)
- **Features:** 4-6 feature cards (subdomain routing, multi-user, AI server, bandwidth tracking, app store, one-click install)
- **Pricing:** Two-column free vs. premium comparison table. Premium pricing to be decided in v8.1, display "coming soon" price placeholder.
- **Footer:** Links to docs, GitHub, status page, privacy, terms

**Implementation notes:**
- Serve as a static Next.js page (`app/page.tsx`). All content is static — no DB queries.
- The terminal animation in the hero should show the actual install command that will be defined in v8.0 docs (e.g., `curl -sSL install.livinity.io | bash -s -- --api-key=<YOUR_KEY>`).
- Mobile-responsive is non-negotiable for a landing page.

---

### 2. User Registration + Email Verification

**Complexity:** Medium
**Dependencies:** Better Auth, Drizzle ORM (PostgreSQL), Resend (transactional email)

Flow:
1. User fills `/register` form: email + password (+ confirm password)
2. Server creates user record with `email_verified = false`, sends verification email via Resend
3. Email contains a one-time token link: `https://livinity.io/verify?token=<uuid>`
4. On click, server sets `email_verified = true`, redirects to `/dashboard`
5. Unverified users: can log in but see a banner; cannot generate API keys until verified

**Validation rules:**
- Email: format validation + uniqueness check (return generic "email or password incorrect" on duplicates to prevent enumeration)
- Password: minimum 8 characters, no maximum
- Rate limiting: 5 registration attempts per IP per hour (Better Auth built-in rate limiting covers this)

**Email template content:**
- Subject: `Confirm your Livinity account`
- Body: greeting, one-sentence explanation, large "Verify Email" button (token link), expiry notice (24 hours), ignore-if-not-you note

**Token storage:** Better Auth's email verification plugin handles token generation and storage. If implementing manually: store SHA-256 hash of token in `email_verification_tokens` table with `expires_at` = now + 24h. Delete token row on successful verification.

---

### 3. Login with Email + Password

**Complexity:** Low
**Dependencies:** Better Auth, Drizzle ORM

Flow:
1. `/login` form: email + password
2. Better Auth validates credentials, creates session, sets httpOnly secure cookie
3. Redirect to `/dashboard`
4. On invalid credentials: generic error message after artificial 300ms delay (timing attack mitigation)

**Session behavior:**
- Session cookie: `livinity_session`, httpOnly, secure, SameSite=Lax
- Session duration: 30 days with rolling expiry (activity resets timer)
- "Remember me" checkbox: no sliding expiry (fixed 30-day max)

**Additional states to handle:**
- Unverified email: redirect to `/verify-email` reminder page, not to dashboard
- Password reset: out of scope for v8.0 launch but the forgot-password link in the UI must exist (can show "coming soon" modal or a minimal form that sends a reset email — decide at implementation time)

---

### 4. Dashboard with API Key Generation

**Complexity:** Medium
**Dependencies:** Better Auth session, Drizzle ORM, crypto (Node.js built-in)

The primary dashboard screen. Users land here after login.

**Sections:**
- **Connection Status widget** — server online/offline (described separately)
- **API Key section** — shows current key prefix (e.g., `liv_k_a3f8...`) with a "Regenerate" button. On first visit, shows "No key generated yet" with a "Generate API Key" button.
- **Usage widget** — current month bandwidth gauge (bytes used / 50 GB free tier limit)
- **Subdomain widget** — shows `{username}.livinity.io`, copy button, link to instructions

**API key generation logic:**
```
rawKey = "liv_k_" + cryptoRandomBytes(24).toString("base64url")
// rawKey is shown ONCE to the user on generation, never again
keyHash = await bcrypt.hash(rawKey, 10)
prefix = rawKey.slice(0, 14)  // "liv_k_" + first 8 chars for display
INSERT INTO api_keys (userId, keyHash, prefix)
```

The relay server validates incoming API keys by:
1. Extracting prefix from the presented key
2. Looking up rows with that prefix (typically 1)
3. Running `bcrypt.compare(presentedKey, storedHash)`
4. Caching the result in Redis for 5 minutes to avoid bcrypt overhead on every tunnel keepalive

**Key regeneration:** Deletes the old key record and inserts a new one. Active tunnel connections authenticated with the old key are closed within the next heartbeat cycle (default: 30s).

---

### 5. Server Connection Status (Online/Offline)

**Complexity:** Low
**Dependencies:** Custom relay server, Redis, Next.js Server-Sent Events route

The relay server tracks which users have an active tunnel connection:

```
# In relay server, on tunnel connect:
redis.set(`tunnel:connected:{userId}`, "1", "EX", 90)  # 90-second TTL
# On each keepalive ping from client (every 30s):
redis.set(`tunnel:connected:{userId}`, "1", "EX", 90)  # reset TTL
# On tunnel disconnect:
redis.del(`tunnel:connected:{userId}`)
```

The dashboard queries `GET /api/tunnel/status` (a Next.js Route Handler) which reads the Redis key and returns `{ connected: boolean, connectedSince?: string }`.

**UI display:**
- Green dot + "Online" when connected
- Grey dot + "Offline" when not connected
- "Last seen: X minutes ago" (stored as `tunnel:lastseen:{userId}` timestamp in Redis, persisted to PostgreSQL `users.last_seen_at` on disconnect)

**Polling:** Dashboard polls `/api/tunnel/status` every 15 seconds via `setInterval` in a React client component. SSE is a better pattern but polling is simpler for v8.0.

---

### 6. Tunnel Connection Instructions

**Complexity:** Low
**Dependencies:** None (static content, personalized with API key prefix)

A dedicated page or drawer in the dashboard (`/dashboard/connect`) showing:

1. **Prerequisites section:** Node.js 18+ (for the LivOS client script)
2. **Install step:**
   ```bash
   curl -sSL https://livinity.io/install.sh | bash
   ```
3. **Configure step:**
   ```bash
   livinity connect --api-key=<YOUR_API_KEY>
   ```
4. **What happens next:** explanation that `{username}.livinity.io` will become accessible after connection

If the user's API key is already generated, the instructions page pre-fills the actual key (display the prefix + instructions to copy from the dashboard). Do not embed the full key in the page.

The `install.sh` script downloads and installs the LivOS tunnel client binary (the TypeScript relay client compiled via `pkg` or `esbuild`). This script is served from Next.js at `/install.sh` via a Route Handler that streams the shell script content.

---

### 7. Basic Bandwidth Usage Display

**Complexity:** Low
**Dependencies:** PostgreSQL `bandwidth_usage` table, Next.js Server Component

Displayed as a progress bar widget on the dashboard:

```
Bandwidth used this month
[================----------] 26.4 GB / 50 GB
Reset on April 1, 2026
```

**Data source:** `SELECT bytes_in + bytes_out AS total FROM bandwidth_usage WHERE user_id = $1 AND period_month = $2`

The Redis hot counter is not queried here — the 60-second flush latency is acceptable for a display widget that does not affect functionality.

**Visual thresholds:**
- 0-80% of limit: blue progress bar
- 80-95%: yellow, warning banner ("Approaching your free tier limit")
- 95-100%: red, urgent banner ("Near bandwidth limit — upgrade to premium for unlimited usage")
- Over 100%: red, blocked banner ("Bandwidth limit reached — tunnel connections will be rejected until next billing period or upgrade")

---

## Differentiators (vs ngrok / Cloudflare Tunnel / Tailscale)

These features are what make users choose Livinity over commodity tunnel tools. They depend on the LivOS integration and are unique to this platform.

---

### 8. Built-In AI Server OS

**Complexity:** N/A (LivOS exists; this is a platform integration feature)
**Dependencies:** LivOS v7.0 multi-user system

The differentiating value proposition. Marketing copy and the landing page should emphasize:
- Livinity is not just a tunnel — it exposes an entire AI-powered self-hosted OS
- Once connected, the user's server is accessible at `{username}.livinity.io` and the LivOS UI loads directly
- Each LivOS app gets its own subdomain: `homeassistant.alice.livinity.io`, `nextcloud.alice.livinity.io`

**Implementation note for v8.0:** No new code required in LivOS itself. The relay server routes `{username}.livinity.io` to the LivOS main port and `{app}.{username}.livinity.io` to the LivOS app gateway port. The LivOS app gateway middleware already handles app routing internally.

---

### 9. One-Command Install + API Key = Globally Accessible

**Complexity:** Medium (the install script + client binary are the work)
**Dependencies:** Custom relay client binary, shell script, CDN for binary distribution

Target experience:
```bash
# On the user's home server (LivOS already installed):
curl -sSL https://livinity.io/install.sh | bash
# Prompts for API key, then:
# Connected! Your server is live at https://alice.livinity.io
```

This is a differentiator because:
- ngrok: requires ngrok account + separate CLI + custom config to expose multiple services
- Cloudflare Tunnel: requires CF account, `cloudflared` install, JSON config, separate subdomain per service
- Tailscale: requires install on every device that needs access; no public URL

Livinity: single command, one API key, entire LivOS instance publicly routable via clean subdomain.

**Binary distribution:** Host the compiled client binary on GitHub Releases (free CDN via `github.com/releases/download`). The `install.sh` script detects OS/architecture and downloads the correct binary.

---

### 10. App Store with Subdomain Access

**Complexity:** Low (routing is handled by existing relay architecture)
**Dependencies:** LivOS app gateway, relay server Host routing, Caddy On-Demand TLS

Each LivOS app installed by the user becomes accessible at `{appName}.{username}.livinity.io`. The relay server's Host header routing handles this:

```
Request: GET / HTTP/1.1
Host: homeassistant.alice.livinity.io

Relay server:
  → parse subdomain: app=homeassistant, user=alice
  → look up alice's tunnel WebSocket connection
  → forward request with Host header rewritten
  → LivOS app gateway routes to homeassistant container
```

The dashboard shows a list of installed apps with their public URLs, with copy buttons. This requires one additional API call from the dashboard to the LivOS instance (via the tunnel): `GET /api/apps/installed` — already exists in the LivOS tRPC router.

---

### 11. Multi-User Support on Single Server

**Complexity:** Low (LivOS v7.0 already implements this)
**Dependencies:** LivOS v7.0 multi-user architecture

The marketing page and pricing table should highlight this as a premium feature that ngrok and Cloudflare Tunnel do not offer:
- Multiple household members each get their own LivOS login
- Admin can share specific apps with specific users
- Each user's apps are isolated at the Docker container level
- The tunnel exposes all users' apps under the same subdomain namespace

**Platform-side work for v8.0:** None. This is a LivOS feature, not a platform feature. The platform simply routes all subdomains under `{username}.livinity.io` to the single LivOS instance.

---

## Anti-Features (Explicitly NOT in v8.0)

These are features that would increase launch scope, delay the release, or require infrastructure that is not yet in place. They are documented here so they do not creep into v8.0 scope.

---

### Payment Processing

**Why deferred:** Stripe integration requires PCI compliance review, webhook handling for failed payments, proration logic for mid-month upgrades, and subscription management UI. This is a ~2-week feature on its own. v8.0 establishes the free tier and shows a "Premium — coming soon" placeholder. Users who want premium in v8.0 can be handled manually (email the team).

**Planned for v8.1.**
**v8.0 placeholder:** Pricing page with free tier details and a "Join the waitlist for premium" email capture form.

**Dependencies when implemented:** Stripe (payments), Stripe webhooks (subscription events), `subscriptions` table in PostgreSQL, premium flag on user record, quota enforcement change in relay.

---

### Mobile App

**Why deferred:** Requires React Native or native iOS/Android development, App Store review process, push notification infrastructure, and offline-capable tunnel status monitoring. None of this is necessary for the core use case (home server accessible from any browser).

**Not planned before v9.0.**

---

### Multi-Region Relay

**Why deferred:** A second relay server (e.g., US East + EU West) requires GeoDNS or Anycast routing, cross-region session sync (Redis replication or Upstash), and per-region bandwidth accounting. The current architecture is single-relay on Server5. Adding a second region is an infrastructure project.

**Not planned before v8.2.**
**v8.0 approach:** Single relay on Server5 (EU). Latency from US is acceptable for home server use (typically 80-120ms); this is not a real-time gaming platform.

---

### Custom Domain Support

**Why deferred:** Custom domains (`myserver.example.com`) require the user to configure a CNAME pointing to `livinity.io`, plus Caddy On-Demand TLS for arbitrary domains, plus domain ownership verification (TXT record challenge). The DNS provisioning flow becomes significantly more complex and requires user-side DNS configuration support.

**Planned for v8.1 as a premium feature.**
**v8.0 approach:** Users get `{username}.livinity.io` only.

---

### White-Label / Custom Branding

**Why deferred:** Different UI themes, custom logos, and CNAME-based dashboard hosting are enterprise features with minimal v8.0 demand.

**Not planned.**

---

### Third-Party API Access

**Why deferred:** Public REST/GraphQL API for managing tunnels, DNS records, and usage programmatically is a developer platform feature. v8.0 serves the self-hosted home user audience, not developers building on top of Livinity.

**Not planned before v9.0.**

---

## Feature Complexity Summary

| # | Feature | Complexity | Phase |
|---|---|---|---|
| 1 | Landing page | Medium | v8.0 |
| 2 | User registration + email verification | Medium | v8.0 |
| 3 | Login with email/password | Low | v8.0 |
| 4 | Dashboard + API key generation | Medium | v8.0 |
| 5 | Server connection status | Low | v8.0 |
| 6 | Tunnel connection instructions | Low | v8.0 |
| 7 | Bandwidth usage display | Low | v8.0 |
| 8 | AI server OS integration (LivOS) | Low (routing only) | v8.0 |
| 9 | One-command install script + client binary | Medium | v8.0 |
| 10 | App store subdomain access | Low | v8.0 |
| 11 | Multi-user support (LivOS v7.0) | Low (no new code) | v8.0 |
| 12 | Payment processing | High | v8.1 |
| 13 | Custom domain support | High | v8.1 |
| 14 | Multi-region relay | High | v8.2 |
| 15 | Mobile app | High | v9.0 |
| 16 | White-label / third-party API | High | Unplanned |

---

## Critical Path for v8.0

The features must be built in this order due to dependencies:

1. **Relay server** (core infrastructure — everything depends on it)
2. **DNS provisioning** (must work before registration completes)
3. **Registration + email verification** (before login can be tested end-to-end)
4. **Login + session** (before dashboard is accessible)
5. **API key generation** (before relay can authenticate connections)
6. **Connection status** (requires relay server running + Redis key pattern)
7. **Bandwidth display** (requires relay running + flush job)
8. **Landing page** (independent, can be built in parallel with any step above)
9. **Install script + client binary** (can be built after relay server API is stable)
10. **Connection instructions** (static content, last)

---

## Sources

- [GitHub - anderspitman/awesome-tunneling](https://github.com/anderspitman/awesome-tunneling)
- [ngrok documentation](https://ngrok.com/docs/universal-gateway/examples/paas-alternative-gateway)
- [Pangolin self-hosted tunnel platform](https://github.com/fosrl/pangolin)
- [My Self-Hosted Ngrok Alternative - Casey Primozic](https://cprimozic.net/notes/posts/self-hosted-ngrok-alternative/)
- [Top 10 Cloudflare Tunnel Alternatives 2026 - Pinggy](https://pinggy.io/blog/best_cloudflare_tunnel_alternatives/)
- [Best ngrok Alternatives 2026 - LocalXpose](https://localxpose.io/blog/best-ngrok-alternatives)
- [Caddy Automatic HTTPS Documentation](https://caddyserver.com/docs/automatic-https)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [Cloudflare Wildcard DNS Records](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/)
- [How to Programmatically Add DNS Records to Cloudflare in Node](https://www.buildwithmatija.com/blog/how-to-programmatically-add-dns-records-to-cloudflare-in-node)
- [Better Auth vs NextAuth - DevToolsAcademy](https://www.devtoolsacademy.com/blog/betterauth-vs-nextauth/)
- [Resend - Send emails with Next.js](https://resend.com/nextjs)
