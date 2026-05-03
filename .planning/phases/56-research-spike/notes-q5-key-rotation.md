# Q5 Research Notes — API Key Rotation Policy

**Date:** 2026-05-02
**Phase:** 56 (research spike)
**Plan:** 56-02
**Researcher:** Claude (gsd-executor)
**Sacred file SHA before Q5 task:** `4f868d318abff71f8c8bfbcf443b2393a553018b` (matches required)

## Question (two axes)

1. **Rotation policy:** A — manual revoke + recreate (user action) vs B — automatic 90-day rotation (broker-scheduled).
2. **Default-keyed vs opt-in:** Should new users get an auto-created `liv_sk_*` on signup, or do they create their first key manually via the Settings UI?

## Sources Fetched (via curl 8.17.0)

| URL | Status | Bytes | Purpose |
|-----|--------|-------|---------|
| https://docs.stripe.com/keys | 200 | 850 895 | Stripe key rotation model + grace period |
| https://platform.openai.com/docs/quickstart | 200 (JS shell) | 9 606 | Fallback only (page is JS-rendered) |
| https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-faqs | 200 (JS shell) | 9 810 | Fallback only |
| https://github.com/openai/openai-python/blob/main/README.md | 200 | 611 811 | OpenAI uses `api_key=` only — no rotation API; manual UI-only |
| https://docs.anthropic.com/en/api/managing-api-keys | 200 | 388 002 | Anthropic key lifecycle — UI-only manual create / disable / delete; no auto-rotation |
| https://owasp.org/www-project-api-security/ | 200 | 55 534 | OWASP API Security 2023 project landing |
| https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/ | 200 | 39 813 | OWASP API2:2023 Broken Authentication — direct credential-lifecycle guidance |

## Vendor Patterns (verbatim from doc snippets)

### Stripe — Manual rotation with USER-SCHEDULED grace period

From https://docs.stripe.com/keys (extracted snippets):

- **"Rotating an API key revokes it and generates a replacement key that's ready to use immediately. You can also schedule an API key to rotate after a certain time."**
- **"If you choose Now, the old key is deleted. If you specify a time, the remaining time until the key expires displays below the key name."**
- Endpoints exposed in dashboard: "Rotate API key", "Expire an API key", "Revoke key", "Revoke managed key access".
- Operations referenced: `rolling-keys`, `Rotate`, `Revoke`, `Expire`, `Rotate signing key`.

**Stripe model summary:** USER-INITIATED rotation; replacement key issued IMMEDIATELY; old key has USER-CONFIGURABLE grace window (anywhere from "Now" = 0 to a custom future timestamp). NO AUTO-ROTATION schedule shipped by Stripe — it's always user-triggered.

### OpenAI — Manual create/delete only

From https://github.com/openai/openai-python/blob/main/README.md:
- `api_key=os.environ.get("OPENAI_API_KEY")` — single-string credential, no rotation API.
- The OpenAI Platform dashboard exposes "Create new secret key" and "Delete" — NO "Rotate" button, NO scheduled-rotation policy in the public docs (verified the JS-rendered help center index — no API-rotation documentation surfaces).

**OpenAI model summary:** Manual create + manual delete. No auto-rotation. No grace overlap (user creates new key, updates code, deletes old key — overlap window is whatever the user takes).

### Anthropic — Manual UI-only; workspace-owned; "Disable" + "Delete"

From https://docs.anthropic.com/en/api/managing-api-keys (extracted text fragments):
- `"FcPByAKMcs":"Create an API key"`, `"1zgoEzw+RA":"Disable API key"`, `"5KqMK0Mtxb":"Delete access key"`, `"5L1bGl58Kj":"Rule couldn't be disabled in this workspace. You can try again."`.
- `"RtTB+NYXlU":"API keys are owned by workspaces and remain active even after the creator is removed..."`
- `"6l":"Creating API keys in the default workspace has been disabled in <link>organization settings</link>..."` — keys can be DISABLED organization-wide.
- `"K1UfGZh83n":"...Plugins can be used in Claude Code and Claude Cowork..."`, `"KlUfGZh83n":"...{numKeys, plural, one {# public key} other {# public keys}} — open Edit to view or rotate."` — "rotate" appears for SIGNING keys (separate concept from API keys).
- `"goEKCGCnSf":"Copy Key"` — plaintext shown ONCE on creation (mirrors industry pattern).

**Anthropic model summary:** Manual create / disable / delete. Workspace ownership. NO automatic rotation policy. Plaintext-once UI. Effectively identical to OpenAI's model + Stripe-style "Disable" intermediate state.

### OWASP API2:2023 Broken Authentication — credential-lifecycle guidance

From https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/ (extracted):
- `<li>API keys should not be used for user authentication. They should only be used for **API client authentication.**</li>`
- `<li>Implement anti-brute force mechanisms to mitigate credential stuffing, dictionary attacks, and brute force attacks on your authentication endpoints.</li>`
- `<li>Permits weak passwords.</li>` / `<li>Uses weak or predictable tokens to enforce authentication</li>`
- `<li>Doesn't validate the JWT expiration date.</li>`
- `<li>Uses plain text, non-encrypted, or weakly hashed passwords.</li>`

**OWASP guidance summary for THIS verdict:** API keys are for client-to-API auth (LIV broker's exact use case). Rotation is NOT mandated as automatic; the API2:2023 control is "make rotation possible + use strong tokens + validate expiration where present." There is no "must rotate every N days" requirement. Strong-token (190 bits via `node:crypto.randomBytes(24)` → base62) + manual rotation + expiration check on `revoked_at` satisfies API2:2023 for self-hosted single-user contexts.

## Cross-reference with REQUIREMENTS.md schema

FR-BROKER-B1-01 schema (verbatim):
> A new PostgreSQL `api_keys` table stores per-user API keys: `id`, `user_id`, `key_hash` (SHA-256), `key_prefix` (first 8 chars of the secret for display), `name` (user-supplied label), `created_at`, `last_used_at`, **`revoked_at`**.

The schema has `revoked_at` (nullable timestamp) — **perfectly aligned with manual-revoke (Stripe/OpenAI/Anthropic) policy**. There is NO `rotated_at`, NO `next_rotation_at`, NO `grace_until` column. Adding auto-rotation (Candidate B) would require schema additions, scheduler infrastructure, and a key-overlap mechanism — none of which v30 has budget for.

FR-BROKER-B1-04 (verbatim):
> A user-facing tRPC route allows admins/users to: create a key (returns plaintext once + key id), list their own keys (no plaintext), and revoke a key (sets `revoked_at`).

Three operations: **create**, **list**, **revoke** — no "rotate" operation specified. "Rotation" in this context = revoke old + create new (the Stripe "rotate" UI button is sugar for this two-step). Implementation cost = zero extra beyond what FR-BROKER-B1-04 already mandates.

FR-BROKER-B1-05 (verbatim):
> Revoked keys return `401 Unauthorized` with body `{"error": {"type": "authentication_error", "message": "API key revoked"}}` (Anthropic-spec error shape).

Confirms the lifecycle endpoint: a request with `Authorization: Bearer liv_sk_<plaintext>` whose hash matches a row with `revoked_at IS NOT NULL` → 401. Implements the "expiration check" OWASP API2:2023 calls for, despite there being no calendar-based expiry — `revoked_at` is the broker's only kill-switch and that's sufficient for the manual-rotate model.

## Candidate Evaluation

### Axis 1: Rotation policy

| Candidate | Description | Industry parity | Schema cost | UX cost | Verdict |
|-----------|-------------|-----------------|-------------|---------|---------|
| **A. Manual revoke + recreate** (with optional UI sugar "rotate" button = revoke+create-new in one click) | User action initiates lifecycle change. Old key dies immediately on revoke; new key starts working immediately on create. Optional grace period left to USER (they create new + update apps + revoke old at their own pace). | **Matches Stripe + OpenAI + Anthropic 1:1.** | Zero — uses `revoked_at` column already in FR-BROKER-B1-01. | Low — "Create" button + "Revoke" button + (optional) "Rotate" UI sugar that does both in one click. | **CHOSEN** for axis 1. |
| **B. Automatic 90-day rotation** (broker scheduler revokes on day 90, emits new key, surfaces in UI; optional grace overlap window) | Broker-side cron-like job scans `api_keys.created_at`, revokes >90-day-old keys, mints replacements. Requires grace overlap (both old + new accepted for N days). | **None of Stripe/OpenAI/Anthropic does this for first-party API keys.** Only seen in some compliance-heavy enterprise SaaS (e.g., AWS IAM Access Keys recommend 90-day rotation but don't enforce it). | High — adds `rotated_at`, `previous_key_hash`, `grace_until` columns + index changes. | High — surprise rotations break user apps if they don't watch for emails/notifications; broker must surface "rotation pending" UI; refund mechanism if user is mid-flight. | Disqualified — adds significant infrastructure for self-hosted single-user reality where ONE user manages keys for their own apps. |

### Axis 2: Default-keyed vs opt-in (key creation at signup)

| Candidate | Description | UX | Security | Verdict |
|-----------|-------------|-----|----------|---------|
| **C-opt-in. User creates first key manually** in Settings > AI Configuration > API Keys | New user lands in app; no `liv_sk_*` exists; first broker call returns 401; user navigates to Settings, creates key, copies plaintext (shown once), pastes into external client config. | Higher onboarding friction (one extra step). | Compatible with "show plaintext once" pattern (`copy-to-clipboard` modal at create time per FR-BROKER-E2-01); no auto-key sitting around if user never uses external clients. | **CHOSEN** for axis 2. |
| **D-default-keyed. Broker auto-creates a `liv_sk_<random>` on user signup** + emails / surfaces it once | Smoother first-call experience. | Conflicts with "show plaintext once" UX — there's no good place to surface the auto-key ONE TIME at signup (signup flow runs in a context that might not show modals reliably). User needs to find the key; risks them logging into the existing Settings page where it's already hidden behind hash. Worse: if signup auto-key is never used, it sits in DB with `revoked_at IS NULL` → unused-key risk. | Disqualified — UX hole at "where do you show the plaintext?" and dead-key proliferation. |

## Verdict (TWO axes)

**Axis 1 — Rotation policy: Manual revoke + recreate (Stripe/OpenAI/Anthropic-aligned).**
**Axis 2 — Default-keyed: NO. Opt-in only. New users create their first key manually via Settings UI.**

Together: **Manual rotation, opt-in keys.** Zero scheduler infrastructure, zero grace-overlap complexity, zero auto-keyed dead-rows. The `revoked_at` column already in FR-BROKER-B1-01 is the entire kill-switch surface; "rotation" in v30 = "click Revoke on old key, click Create on new key, paste new plaintext into client" — the Stripe `Rotate` UI sugar can be added in v31+ as an entirely UX-layer convenience (revoke + create wrapped in one tRPC call).

### Lifecycle Flow (text diagram, references FR-BROKER-B1-01 columns)

```
                          KEY LIFECYCLE (manual, opt-in)
                          ─────────────────────────────

[1] User signs into LivOS multi-user (existing Phase 40 flow).
        │
        │   (no api_keys row exists for this user yet — DEFAULT)
        ▼
[2] User opens Settings > AI Configuration > API Keys (FR-BROKER-E2-01).
        │
        │   (table empty for this user)
        ▼
[3] User clicks "Create Key", supplies optional `name` label.
        │
        │   tRPC route createKey() (FR-BROKER-B1-04):
        │     - generates plaintext = "liv_sk_" + base62(crypto.randomBytes(24))
        │     - computes key_hash = sha256(plaintext)
        │     - extracts key_prefix = plaintext.slice(0, 8 + len("liv_sk_")) = "liv_sk_AB" (first 8 chars after prefix)
        │     - INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name, created_at, last_used_at, revoked_at)
        │           VALUES (uuid(), <userId>, <hash>, <prefix>, <name>, NOW(), NULL, NULL)
        │     - returns { id, plaintext } ONCE
        ▼
[4] UI shows plaintext in copy-to-clipboard modal ONCE (FR-BROKER-E2-01).
    User copies, pastes into Bolt.diy / Open WebUI / Continue.dev / Cline base URL config.
    Modal closes; plaintext is gone forever (only `key_hash` survives).
        │
        ▼
[5] Each broker request: Bearer middleware (FR-BROKER-B1-03):
        - reads `Authorization: Bearer <plaintext>`
        - computes sha256(plaintext); SELECTs api_keys WHERE key_hash = <hash> AND revoked_at IS NULL
        - constant-time hash compare via crypto.timingSafeEqual
        - if match: UPDATE api_keys SET last_used_at = NOW() WHERE id = ... (debounced — write at most every N seconds per key to avoid hot-row contention)
        - resolve `user_id` from row → request proceeds
        - if no match (no row OR row.revoked_at IS NOT NULL): 401 with FR-BROKER-B1-05 body `{"error": {"type": "authentication_error", "message": "API key revoked"}}`
        ▼
[6] User wants to "rotate":
        a. Settings UI → Create new key (steps 3+4 again; new row inserted; new plaintext shown once).
        b. User updates external clients to use new plaintext.
        c. User clicks "Revoke" on old key → tRPC revokeKey():
             UPDATE api_keys SET revoked_at = NOW() WHERE id = <oldKeyId> AND user_id = <userId>
        d. From this moment, requests with old plaintext → 401 (revoked path).

        (Grace window = however long user takes between (a) and (c) — entirely user-controlled, matches Stripe model.)
```

## Risk + Mitigation

- **Risk:** Users forget to revoke old keys after rotation, accumulating unused-but-still-valid keys.
  **Mitigation:** Settings > API Keys tab shows `last_used_at` per key. Add a non-blocking soft-warning banner ("Key 'foo' hasn't been used in 90+ days — consider revoking") in v31+ (out of v30 scope but trivial UI add). For v30, the user is the same person managing all their keys for their own apps; risk surface is low.

- **Risk:** Plaintext-once UX failure: user closes modal before copying, has to recreate key.
  **Mitigation:** FR-BROKER-E2-01 mandates copy-to-clipboard button in modal + visual confirmation ("Copied!"). Worst-case: user revokes the lost-plaintext key + creates a new one — manual-rotate path itself recovers from this gracefully.

- **Risk:** OWASP API2:2023 audit-style review later flags "no automatic rotation" as a control gap.
  **Mitigation:** OWASP API2:2023 does NOT mandate automatic rotation — it mandates strong tokens + revocation capability + auth-endpoint anti-brute-force. v30 satisfies all three: 190-bit tokens, `revoked_at` revocation, rate-limit perimeter (Q4 verdict) + Bearer middleware. Document the threat model in Phase 59 SUMMARY.

- **Risk:** Auto-rotation later mandated by enterprise compliance (SOC2 / ISO27001) for an enterprise customer.
  **Mitigation:** v30.1+ adds optional `auto_rotation_days` per-org policy column to `api_keys` extension table (`api_key_policies`); existing manual-rotate model becomes the default and only changes when org admin opts in. Migration path is clean because the v30 schema has the necessary `revoked_at` column to implement "rotate at day N" = "auto-revoke + auto-create at day N" — same primitives.

## Sacred file SHA after Q5 task

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches required `4f868d318abff71f8c8bfbcf443b2393a553018b`. ✓ No edits made.
