# Phase 138 — Real TOTP 2FA Enrollment (CONTEXT)

**Opened:** 2026-05-17
**Driver:** Phase 135-F's AccountStep ships the 2FA UI visually complete (segmented Password/Two-factor toggle, FakeQR component, base32 secret display, 6-cell OTP grid with paste support) but the TOTP enrollment is client-side mock: `generateOtpSecret()` produces a random 16-char base32 string with no server registration, and the "Verify & continue" button just advances the wizard without verifying the code. Phase 138 ships the real backend: server-generated TOTP secret persisted to `user.totp_secret`, real QR image (otpauth:// URI), OTP verification via standard TOTP HMAC-SHA1, and login mutation accepts `totpToken` for users with 2FA enabled.

**User context:** Phase 135 commit 8dd5ee60 explicitly flagged: *"2FA mode: visual flow complete, but backend TOTP enrollment is TODO 135-F-2FA"*.

## Locked decisions

| # | Decision | Locked value | Source |
|---|----------|--------------|--------|
| D-138-ALGORITHM | TOTP algorithm | RFC 6238 standard: HMAC-SHA1, 6 digits, 30s period, T0=0 | Universal compatibility (Authy, 1Password, Google Authenticator) |
| D-138-LIBRARY | TOTP implementation | `otplib` (npm — Java RFC test-vectors verified; ~7k weekly downloads; zero runtime deps) | Established + audited |
| D-138-SECRET-LEN | Secret length | 20 bytes (160 bits, RFC 4226 minimum for HMAC-SHA1) base32-encoded → 32 chars | Industry standard; UI's current 16-char mock is non-compliant |
| D-138-STORAGE | Secret storage | Encrypted-at-rest in `users.totp_secret` (PostgreSQL `pgcrypto` `pgp_sym_encrypt` with passphrase derived from livinityd JWT secret + per-user salt) | Defense-in-depth; secret leak ≠ DB dump leak |
| D-138-QR-RENDERING | QR code rendering | Server-side via `qrcode` npm → SVG string returned in `register2fa` response. UI replaces FakeQR with an `<img src={...}>` of the SVG. | Real QR scannable by any TOTP app; eliminates client-side fake |
| D-138-ENROLL-FLOW | Enrollment ordering | (1) User picks 2FA in AccountStep → `register2fa({name, password, language})` returns `{secret, qrCodeSvg}`; (2) UI displays QR + secret; (3) User enters first OTP → `verify2fa({code})` validates against server-stored secret with ±1 window for clock skew; (4) On success, user is logged in + `totp_enabled=true`; (5) Future logins require `totpToken` param. | Matches industry-standard enrollment-then-verify pattern |
| D-138-LOGIN-PARAM | Login mutation 2FA arg | Existing `user.login` already accepts `totpToken: string` (verified in V1 wizard at setup-wizard.tsx:212 where `totpToken: ''` is passed). 138 makes it validated server-side: if `totp_enabled=true` and `totpToken === '' or invalid` → reject with `INVALID_TOTP`. | Keep public API stable |
| D-138-RECOVERY | Recovery codes | 10 single-use recovery codes generated at enrollment, encrypted-at-rest, shown ONCE in a download-as-text modal post-enrollment + before DoneStep | Standard recovery UX; user must save them |
| D-138-DISABLE-2FA | Post-onboarding disable path | Settings → Security → "Disable two-factor" (requires current OTP). Out of Phase 138 scope; settings UI is separate. | Defer to v34+ |
| D-138-DOWNGRADE-WARNING | Phase 135 mock secret in flight | Any user who reached step 1 with the mock secret before Phase 138 deploys: backend rejects their fake `data.otpCode`; UI surfaces "your authenticator setup needs to be re-done" and re-runs `register2fa`. | Migration safety |
| D-138-SACRED-SHA | sdk-agent-runner.ts SHA | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved every commit | Project invariant |

## Codebase baseline (audited 2026-05-17)

**Frontend (Phase 135 state):**
- `account-step.tsx` lines 44-50: `generateOtpSecret()` (client-side fake) — DELETE
- `account-step.tsx` lines 60-94: `FakeQR` component — REPLACE with `<img src={qrCodeSvg}>`
- `account-step.tsx` lines 109-129: 2FA enrollment state machine (authMode, otpDigits, otpRefs) — KEEP, repoint at server-issued secret + verify mutation
- `account-step.tsx` lines 147-178: handleContinue → in 2FA mode just calls `onContinue()` (the TODO) — REPLACE with `verify2faMut.mutate({code})`

**Backend (existing surface):**
- `trpcReact.user.register` — currently doesn't generate or store TOTP secret. EXTEND with optional `enableTotp: boolean` flag; if true, generate secret + qrCode and return them in the response (instead of just JWT). Existing callers (V1 wizard, create-account.tsx) pass no flag → no behavior change.
- `trpcReact.user.login` — already accepts `totpToken`. EXTEND server-side validation: when target user has `totp_enabled=true`, validate `totpToken` against `users.totp_secret` via otplib.
- Database: add columns `users.totp_secret TEXT NULL`, `users.totp_enabled BOOLEAN DEFAULT FALSE`, `users.recovery_codes TEXT[]` (encrypted). Migration script in `livos/packages/livinityd/source/modules/database/migrations/`.

## Acceptance criteria (master)

- [ ] AC-138-M1: User picks 2FA in AccountStep → real QR rendered (scannable by Authy on phone)
- [ ] AC-138-M2: After scanning, user enters first 6-digit OTP → `verify2fa` returns success → user is logged in, `totp_enabled=true` in DB, JWT issued
- [ ] AC-138-M3: Wrong OTP returns "invalid code" inline + lets user retry without re-registering
- [ ] AC-138-M4: ±1 30-second window honored for clock skew (test by manually setting Mini PC clock 25s off)
- [ ] AC-138-M5: Recovery codes modal appears post-verify with 10 codes; user must click "I've saved them" before "Continue" enables; codes are downloadable as .txt
- [ ] AC-138-M6: Future login attempts: empty totpToken → 401 INVALID_TOTP; valid current OTP → success; valid recovery code → success + that code marked single-use in DB
- [ ] AC-138-M7: User with password-mode account (no totp_enabled) unaffected — login still works without totpToken
- [ ] AC-138-M8: Database schema migration is idempotent (re-running doesn't break)
- [ ] AC-138-M9: Sacred SHA preserved across all commits
- [ ] AC-138-M10: Live UAT — operator enrolls 2FA via Authy on phone, logs out, logs back in with OTP

## Non-goals

- WebAuthn / hardware keys (future phase)
- Backup-code regeneration UI (future phase; user has to re-enroll if codes exhausted)
- 2FA for admin-only or per-role (single-tier here)
- 2FA-protected sudo / sensitive-action prompts (future phase)
- SMS / email 2FA (not industry-best; TOTP only)

## Dependencies

- Phase 135 ✅ (AccountStep visual frame exists)
- Phase 137 helpful but not required (137 wires register/login but doesn't change shape; 138 extends both)

## Sub-plans

| # | Plan file | Scope | Approx LOC | Depends on |
|---|---|---|---|---|
| 138-01 | `138-01-PLAN.md` | DB migration: `users.totp_secret/totp_enabled/recovery_codes` cols; idempotent | +50 | — |
| 138-02 | `138-02-PLAN.md` | Backend: `otplib` + `qrcode` deps, pgcrypto wrapper, `register2fa` mutation (issues secret + qrSvg + recoveryCodes); test suite | +200 | 138-01 |
| 138-03 | `138-03-PLAN.md` | Backend: `verify2fa` mutation (validate OTP, mark enabled, return JWT); extend `user.login` to gate by totp_enabled; recovery-code consumption | +150 | 138-02 |
| 138-04 | `138-04-PLAN.md` | Frontend: AccountStep — drop FakeQR + client mock, consume real qrSvg, wire `verify2fa` mutation, error states | +120 | 138-03 |
| 138-05 | `138-05-PLAN.md` | Frontend: RecoveryCodesModal — appears post-verify, 10 codes in 2-col grid, "Download as .txt" + "I've saved them" gate | +130 | 138-04 |
| 138-06 | `138-06-PLAN.md` | Mini PC deploy + Authy phone UAT + memory | docs | 138-05 |

**Total est:** ~650 LOC, 6 atomic commits.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| User loses phone post-enrollment with no recovery codes | MEDIUM | Modal enforces save-confirmation before exit; download-as-text always offered |
| Clock skew between server and phone | LOW | ±1 window built in; document in error messages |
| `otplib` advisory CVE | LOW | Pin to latest patched version; track via `npm audit` in CI |
| pgcrypto passphrase exposure if JWT secret leaks | LOW | Defense-in-depth — secret leak still requires DB dump to decrypt; rotation procedure in security memory |
| Migration breaks existing password-only users | MEDIUM | Migration adds NULLABLE columns; existing users get `totp_enabled=false`; login path explicitly gates by this column |

## Related memories

- `[[project-phase-135-complete]]` — what shipped before (visual 2FA UI)
- (proposed new memory after close) `reference-totp-implementation.md` — recovery procedure, secret rotation, audit log
