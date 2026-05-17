# 133-02 — Hero URL = custom_domain only (Bug B, lucylu hotfix dropped)

**Status:** CODE-COMPLETE 2026-05-17

## Bug B root cause

`/opt/landing/livinity.io/dashboard.html:707`:
```js
const username = user.username;
const url = username + ".livinity.io";   // hard-coded tunnel URL
```

The hero rendered `{url}` in:
- `<div className="hero-url"><span>{url}</span> ...`
- `copy("https://" + url)` (Copy URL button)
- `<a className="h-btn solid" href={"https://" + url}>Open my computer</a>`

…regardless of any `custom_domains` row the user had. The dashboard
ALSO had a "Custom Domains" card (lines ~829-842) that loaded
`/api/account/domains` and listed entries — but the hero widget
never consulted that state.

## Patch diff

### `url` derivation (line 707)

```diff
- const url = username + ".livinity.io";
+ // Phase 133-02 Bug B: hero URL derives from custom_domains only.
+ // No tunnel fallback — Server5 relay is retired from user-visible surfaces.
+ // Include pending_dns so freshly-generated domains show immediately.
+ const activeDomain = (domains || [])
+   .filter(d => d && (d.status === "active" || d.status === "dns_verified" || d.status === "pending_dns"))
+   .sort((a, b) => (b.verified_at || "").localeCompare(a.verified_at || ""))[0];
+ const url = activeDomain ? activeDomain.domain : null;
+ const hasComputer = !!url;
```

The filter includes `pending_dns` per the `must_haves.truths` directive:
freshly-generated domains (via 133-01's auto-register) appear in the
hero immediately, before the DNS-verify worker flips them to `active`.

### Hero JSX (title + url + cta)

Replaced single-branch render with `{hasComputer ? (...) : (...)}`:

**`hasComputer === true`** (existing behavior — url + copy + Open):
```jsx
<h1 className="hero-title">Hey, <em>{username}.</em><br/>{online ? "your computer is awake." : "your computer is asleep."}</h1>
<>
  <div className="hero-url">
    <span>{url}</span>
    <button className="copy-btn" onClick={() => copy("https://" + url)}>...</button>
  </div>
  <div className="hero-cta-row">
    <a className="h-btn solid" href={"https://" + url}>Open my computer</a>
    <a className="h-btn" href="/profile">Profile</a>
  </div>
</>
```

**`hasComputer === false`** (NEW empty state):
```jsx
<h1 className="hero-title">Hey, <em>{username}.</em><br/>let's connect your computer.</h1>
<>
  <p className="hero-sub">Finish your install to see your computer's URL here.</p>
  <div className="hero-cta-row">
    <a className="h-btn solid" href="/dashboard/install">Go to install wizard</a>
    <a className="h-btn" href="/profile">Profile</a>
  </div>
</>
```

## Design rationale

Per user directive 2026-05-17 *"Hiç bir şekilde Server5'deki tunnel'i
kullansın istemiyorum"* + `feedback_relay_dependency_minimization`
memory: Server5 relay is a pain point; default tunnel fallback URL is
removed from user-visible UI. Users see either:
1. Their real custom domain (if they have one), OR
2. A clear empty state inviting them to finish install — no fake URL.

## Forward-only — no data backfill

Per user directive 2026-05-17 *"bunu illaki lucy için yapma genel
olarak bir güncelleme olarak yap"* — no per-user data hotfix.
Existing users with no `custom_domains` row (e.g. lucylu pre-fix)
will see the empty state until they re-run wizard Generate, which
133-01 makes self-registering. They can complete the round-trip
themselves without operator intervention.

## HERO_TUNNEL_URL_KILLED_VERIFIED

Static post-patch markers:
```
grep -c "Phase 133-02 Bug B" /opt/landing/livinity.io/dashboard.html  → 1
grep -c "hasComputer ? "    /opt/landing/livinity.io/dashboard.html  → ≥1
grep -c 'username + ".livinity.io"' /opt/landing/livinity.io/dashboard.html  → 0
```

Live browser UAT is part of Plan 133-03 UAT Flow A (empty-state walk)
and Flow C (existing-user empty-state + re-Generate round-trip).

## Deploy

No service restart required — Caddy's `file_server` handler at
`/opt/landing/livinity.io/` re-reads static HTML per request.

Backup at `/opt/landing/livinity.io/dashboard.html.bak-pre-133-02-B-20260517-034752`
+ `dashboard.html.bak-pre-133-02-B-2-20260517-034856` (the second-pass
correction for the hero JSX anchor whitespace mismatch — see "Patch
hiccup" below).

## Patch hiccup (recorded for forensics)

The first-pass `phase133-patch.py` had a regex with a space before `}`
in `is asleep." }` — actual file has `is asleep."}` (no space). 4 of 5
patches landed on first pass; the 5th (hero JSX block) failed with
"anchor matched 0 times". A fix-up script `phase133-patch-02B2.py`
with corrected whitespace landed the 5th patch cleanly. No data
corruption — the first-pass `02-B-1` patch only changed `url`
derivation; the hero JSX referencing `url` would have rendered
`null` until 02-B-2 landed, but no traffic hit the dashboard between
the two patches (both ran within ~1 minute).

## Follow-ups deferred to v35+

- **Multi-domain UX**: when user has 2+ active custom_domains, hero
  currently shows the first sorted by `verified_at DESC`. Could add
  a primary-domain selector or list-then-pick UX. Out of scope.
- **Pending-DNS badge polish**: currently a `pending_dns` row shows
  the same way as `active`. Could add a small "Pending DNS verification"
  badge next to the URL. Out of scope.
- **Tunnel-relay infra removal**: the Caddy `*.livinity.io` wildcard
  + relay backend on Server5 still exist; manually typing
  `lucylu.livinity.io` may still resolve. This phase only kills the
  user-visible UI surface; the actual relay teardown is v35+ infra work.
- **Profile-page hero parity**: `/profile` page may have similar
  hard-coded tunnel URL; not audited in this phase.

## Repo decision

On-server canonical (matches 132-01, 132-02, 133-01).

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
`liv/packages/core/src/sdk-agent-runner.ts` — preserved (this plan
only touches Server5; no repo source edits).
