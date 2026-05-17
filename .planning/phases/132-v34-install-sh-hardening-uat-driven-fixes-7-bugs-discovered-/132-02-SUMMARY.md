# 132-02 — Server5 emailVerified gate removed (Bug #3)

**Status:** CODE-COMPLETE 2026-05-17

## Path chosen: **Path A** (remove the gate)

Operator-confirmed via discuss-phase 2026-05-17 ("Path A — remove gate
now").

### Why Path A vs Path B

Diagnose results on Server5 `/opt/platform/web/`:

```
# Email delivery dependencies search
$ grep -rliE "resend|mailgun|nodemailer|sendgrid|@aws-sdk/client-ses" /opt/platform/web/src
(no matches)

# /verify route state
$ cat /opt/platform/web/src/app/verify/page.tsx
(stub — UI only, no token issuance flow)
```

No SMTP or email-provider package is wired. The `/verify` page is a
UI stub with no backend token issuance. Path B (build a real verify
flow) is correctly v35+ scope — out of band for this hardening phase.

Path A trade-off documented under "Security note" below.

## Bug #3 reproduction (UAT 2026-05-16)

New user registers on livinity.io → opens wizard → clicks "Generate
API Key":

```
POST https://livinity.io/api/account/api-keys 403 (Forbidden)
{"error":"Please verify your email before generating an API key"}
```

Wizard cannot proceed; install one-liner cannot be generated; new-user
install path is BROKEN.

## Repo decision: on-server canonical (matches 132-01)

```
$ git -C /opt/platform/web rev-parse --abbrev-ref HEAD
fatal: not a git repository (or any of the parent directories): .git
```

`/opt/platform/web/` is **not a git repository**. Same operational
shape as `/opt/landing/livinity.io/` (see 132-01-SUMMARY.md) — the
platform is hand-maintained on Server5. The patch is on-server-canonical.

## Patch (applied 2026-05-17)

**File:** `/opt/platform/web/src/app/api/account/api-keys/route.ts`

**Backup:** `route.ts.bak-pre-132-02-20260517-030607`

**Before:**
```ts
const user = await getUser(req);
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
if (!user.emailVerified) {
  return NextResponse.json(
    { error: "Please verify your email before generating an API key" },
    { status: 403 },
  );
}

// Generate fresh key
const rawKey = `liv_k_${nanoid(20)}`;
```

**After:**
```ts
const user = await getUser(req);
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// Phase 132-02: emailVerified gate removed — platform has no email
// delivery configured (v35+ scope). Session auth above is still required.
// See .planning/phases/132-.../132-02-SUMMARY.md.

// Generate fresh key
const rawKey = `liv_k_${nanoid(20)}`;
```

The patch was applied via an idempotent Python script with a strict
regex that matched the gate block exactly once (refused to run if zero
or multiple matches were found).

## Deploy

```
$ cd /opt/platform/web && npm run build
... (Next.js compile succeeded; routes list including /api/account/api-keys served)

$ pm2 restart web
[PM2] [web](1) ✓

$ pm2 status web
id 1  web  online  3s uptime  68.4mb mem
```

## API_KEY_FOR_NEW_USER_VERIFIED

Static post-patch checks:

```
$ grep -c "if (!user.emailVerified)" /opt/platform/web/src/app/api/account/api-keys/route.ts
0   (gate removed)

$ grep -c "Phase 132-02" /opt/platform/web/src/app/api/account/api-keys/route.ts
1   (comment present)
```

Smoke test (no session cookie → expect 401, NOT 403):

```
$ curl -sk -o /dev/null -w "HTTP %{http_code}\n" -X POST https://livinity.io/api/account/api-keys
HTTP 401
```

Session auth still required (401 from `getUser(req)` returning null).
The path that *previously* returned 403 (logged-in user with
`emailVerified=false`) will now flow through to the `nanoid` generation
block and return a `liv_k_*` token. Full live verification (register
fresh user → mint key → use in install) is the operator-walked
Plan 132-07 fresh-VPS UAT.

## Security note

**Trade-off:** Anyone with a valid session can mint an API key without
proving email ownership.

- **Pre-patch baseline:** Session auth + verified email required.
- **Post-patch baseline:** Session auth required (sole gate).

**Why this is acceptable for v34 ship:**
1. Registration already requires email entry; mass-signup spam needs
   to defeat the (existing) signup CAPTCHA + rate limit first.
2. API keys are scoped to the user's own account; an attacker minting
   their own key gains nothing they didn't already have from the
   session.
3. The relay (`api.livinity.io`) zone-level rate limits cover
   downstream LivOS API traffic regardless of how the key was minted.
4. No external-cost surface (e.g. broker subscription, paid AI calls)
   is reachable via api-keys creation alone.

The risk delta is "spam signups can hold API keys" — a hygiene issue,
not a privilege-escalation issue.

## Follow-ups deferred to v35+

- **Rate-limit middleware** on `POST /api/account/api-keys` (e.g.
  Upstash `@vercel/edge-rate-limit`, 10/hour/IP).
- **Full email-verification UX**: pick provider (Resend recommended),
  ship `/verify?token=X` real flow, replumb wizard to surface
  "check your email" if 403 returns on first attempt.
- **Move `/opt/platform/web/` under git management** so on-server
  hand-edits can be peer-reviewed before they hit prod.

## Carry-item from 132-01 (handled here)

132-01-SUMMARY.md flagged a UAT-triage edit to
`/opt/platform/web/src/app/dashboard/page.tsx` (a "Set up new server"
emerald button in the dashboard header). The live `/dashboard` route
is shadowed by the static `dashboard.html` rewrite in Caddyfile
lines 9-39, so the button is non-user-visible. **Not reverted in this
plan** to keep the diff scoped to the auth fix. Tracked as a hygiene
item for the v35+ platform-under-git work above.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
`liv/packages/core/src/sdk-agent-runner.ts` — preserved (this plan
touches `/opt/platform/web/` on Server5; no edits in this repo's source
tree).
