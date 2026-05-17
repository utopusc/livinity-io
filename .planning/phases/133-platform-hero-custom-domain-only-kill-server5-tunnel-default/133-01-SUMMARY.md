# 133-01 — Wizard auto-register domain + subdomain pre-fill (Bug A + C)

**Status:** CODE-COMPLETE 2026-05-17

## Bug A root cause (DB peek confirmed pre-patch)

`POST /api/account/api-keys` only minted the API key — never touched
`custom_domains`. Even when the wizard emitted `--mode hybrid --domain
<user-domain>`, the platform stayed blind to the user's actual install
URL. For lucylu (verified via DB peek 2026-05-17):

```
SELECT u.username, cd.domain FROM users u
  LEFT JOIN custom_domains cd ON cd.user_id = u.id
  WHERE u.username = 'lucylu';

 username | domain
----------+--------
 lucylu   |        ← empty after a successful hybrid install
```

## Bug C root cause

Wizard hybrid-mode `Domain` input was empty free-text:

```js
const [hybrid, setHybrid] = useState({ domain: "", cfToken: "", cfZoneId: "", ... });
```

User had to manually type the full `${subdomain}.${parent}.${tld}` —
no autofill from the logged-in username. v34 vision is
`{user}.{domain}.{tld}` per `project_v34_account_tunnel_marketplace_vision`
memory, so the field should pre-fill `${username}.` and let the user
type only the parent.

## Patch diff

### `/opt/platform/web/src/app/api/account/api-keys/route.ts`

Two insertions in the POST handler:

**Insertion 1** (before `// Generate fresh key`):
```ts
  // Phase 133-01 Bug A: optional hybrid-domain registration
  let bodyData: any = {};
  try { bodyData = await req.json(); } catch {}
  const domainToRegister = (bodyData?.domain ?? "").trim();
```

**Insertion 2** (after `const row = result.rows[0];`):
```ts
  // Phase 133-01 Bug A: register the domain (best-effort, non-fatal)
  if (domainToRegister) {
    try {
      await pool.query(
        `INSERT INTO custom_domains (user_id, domain, verification_token)
         VALUES ($1, $2, $3)
         ON CONFLICT (domain) DO NOTHING`,
        [user.userId, domainToRegister, nanoid(32)],
      );
    } catch (e) {
      console.error("[133-01] custom_domains INSERT failed:", e);
    }
  }
```

Uses raw `pool.query` (matching the existing route style — Drizzle is
loaded in the project but this route uses pg directly).

### `/opt/landing/livinity.io/dashboard-install.html`

**Bug A fetch body** (replaces empty body in the `fetch("/api/account/api-keys")` call):
```diff
  const res = await fetch("/api/account/api-keys", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
+   body: JSON.stringify(mode === "hybrid" ? { domain: (hybrid.domain || "").trim() } : {}),
  });
```

**Bug C HybridStep pre-fill** (new useEffect after the `gen` useState):
```jsx
useEffect(() => {
  if (mode === "hybrid" && user && user.username && !hybrid.domain) {
    setHybrid(h => ({ ...h, domain: user.username + "." }));
  }
}, [mode, user]);
```

The `!hybrid.domain` guard makes the pre-fill one-shot: if the user
clears the field, the effect doesn't re-fire. Users who want a
different subdomain can fully override.

## ON CONFLICT (domain) DO NOTHING rationale

`custom_domains.domain` has a UNIQUE constraint (verified in
`/opt/platform/web/src/db/schema.ts`). If a user re-runs Generate
with the same domain (common: regenerate API key while keeping
domain), the INSERT would otherwise 500. DO NOTHING preserves the
original row (status/verification_token intact) and lets the key
mint proceed.

## Why pre-fill not split-field

A single pre-filled field is less UX churn than splitting into
"subdomain" + "parent" inputs. Users who want a different subdomain
just clear the prefill and type freely. v35+ can split if needed.

## WIZARD_AUTO_REGISTER_VERIFIED

Static post-patch markers:
```
grep -c "Phase 133-01 Bug A" /opt/platform/web/src/app/api/account/api-keys/route.ts  → 2
grep -c "JSON.stringify(mode" /opt/landing/livinity.io/dashboard-install.html         → 1
```

Live POST endpoint smoke (no cookie → 401, session gate intact):
```
$ curl -sk -o /dev/null -w "HTTP %{http_code}\n" -X POST https://livinity.io/api/account/api-keys
HTTP 401
```

End-to-end verify (logged-in session + hybrid domain in body → 200 +
row inserted) is part of Plan 133-03 UAT Flow B.

## WIZARD_SUBDOMAIN_PREFILL_VERIFIED

Static marker:
```
grep -c "Phase 133-01 Bug C" /opt/landing/livinity.io/dashboard-install.html  → 1
```

Browser UAT (load `/dashboard/install` logged-in, select Hybrid mode →
Domain field auto-shows `${username}.`) is Plan 133-03 UAT Flow D.

## Schema NOT NULL columns covered

| Column | Source |
|--------|--------|
| user_id | `user.userId` from session |
| domain | `domainToRegister` from request body |
| verification_token | `nanoid(32)` (random 32-char) |
| status | DEFAULT `'pending_dns'` |
| dns_a_verified | DEFAULT `false` |
| dns_txt_verified | DEFAULT `false` |
| app_mapping | DEFAULT `'{}'::jsonb` |
| created_at / updated_at | DEFAULT `now()` |

No additional NOT NULL columns missed.

## Deploy

```
$ cd /opt/platform/web && npm run build  # succeeded
$ pm2 restart web                         # online
$ pm2 status web                          # online
```

## Backups

- `/opt/platform/web/src/app/api/account/api-keys/route.ts.bak-pre-133-01-A-20260517-034752`
- `/opt/landing/livinity.io/dashboard-install.html.bak-pre-133-01-A-C-20260517-034752`

## Follow-ups deferred to v35+

- **DNS-verify worker visibility:** `pending_dns` → `active` transition
  is handled by an existing process at `/opt/platform/web/src/lib/dns-polling.ts`
  + `/opt/platform/web/src/app/api/domains/[id]/verify/route.ts`. Verify
  it polls newly-INSERTed rows automatically (likely YES, but UAT in 133-03
  will confirm).
- **Wizard explicit domain validation:** today the pre-filled `${username}.`
  is invalid until the user types a parent. Could add client-side validation
  + a visible hint "Type the parent domain (e.g. bruceoz.com) after the dot."
- **Pre-fill on field-clear-then-blur:** today if user clears and tabs away,
  the field stays empty. Could re-fire pre-fill on blur if still empty. Minor.

## Repo decision

On-server canonical (no git tree for `/opt/platform/web/` or
`/opt/landing/livinity.io/`). Same shape as 132-01, 132-02. v35+
hardening: bring both trees under git management.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
`liv/packages/core/src/sdk-agent-runner.ts` — preserved (this plan
only touches Server5; no repo source edits).
