# Phase 138 — Real TOTP 2FA Enrollment (MASTER PLAN)

> Companion to `138-CONTEXT.md`. Executable roadmap for `/gsd-execute-phase 138`.

## Goal

Replace Phase 135-F's client-side TOTP mock with a real RFC 6238 implementation: server-generated 160-bit secret, encrypted-at-rest, scannable real QR, ±1 window verification, 10 single-use recovery codes shown once, login mutation gates on `totp_enabled`.

## Atomic commit roadmap

### Plan 138-01 — DB migration

**Files:**
- ➕ `livos/packages/livinityd/source/modules/database/migrations/0XX-totp.sql`:
  ```sql
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_codes TEXT[];  -- encrypted blobs
  CREATE INDEX IF NOT EXISTS users_totp_enabled_idx ON users(totp_enabled) WHERE totp_enabled = TRUE;
  ```
- ✏️ Database init/migrate runner — register new file
- ✏️ `schema.sql` (the canonical reference) — append the new columns

### Plan 138-02 — Backend: register2fa + crypto

**Files:**
- ✏️ `livos/packages/livinityd/package.json` — add `otplib`, `qrcode`
- ➕ `livos/packages/livinityd/source/modules/auth/totp.ts`:
  - `generateSecret()` → 20 bytes, base32
  - `secretToOtpauthUrl(secret, accountName, issuer)` → `otpauth://totp/Livinity:bruce?secret=...&issuer=Livinity&algorithm=SHA1&digits=6&period=30`
  - `secretToQrSvg(otpauthUrl)` → SVG string
  - `verifyOtp(secret, code, window=1)` → boolean
  - `generateRecoveryCodes()` → 10 codes (8-char alphanumeric, hyphen-grouped: `ABCD-EFGH`)
- ➕ `livos/packages/livinityd/source/modules/auth/crypto-at-rest.ts` — pgcrypto wrapper: `encryptSecret(plain): cipherText`, `decryptSecret(cipher): plain`. Passphrase = `JWT_SECRET + user_id` (via Postgres `pgp_sym_encrypt(secret, passphrase)`).
- ✏️ `livos/packages/livinityd/source/modules/auth/procedures.ts` — extend `register` to accept `enableTotp?: boolean`; if true, generate + persist encrypted secret + recovery codes, return `{jwt: null, totp: {secret, qrSvg, recoveryCodes}}`. (User isn't logged in yet — they must verify first.)
- Tests: `totp.spec.ts` against RFC 6238 vectors

### Plan 138-03 — Backend: verify2fa + login gating

**Files:**
- ✏️ `livos/packages/livinityd/source/modules/auth/procedures.ts`:
  - New mutation `user.verify2fa({code})`: pulls pending enrollment for the calling session, decrypts secret, verifies OTP, on success sets `totp_enabled=true` + issues JWT
  - Existing `user.login`: if target user has `totp_enabled=true` and `totpToken === '' || !verifyOtp(secret, totpToken)` → throw `UNAUTHORIZED('INVALID_TOTP')`. If `totpToken` matches a recovery code, mark that code consumed and accept login.
- Tests: login with no TOTP (legacy), login with valid OTP, login with invalid OTP, login with recovery code (succeeds once, fails second time)

### Plan 138-04 — Frontend: AccountStep wired to real backend

**Files:**
- ✏️ `livos/packages/ui/src/features/onboarding-flow/steps/account-step.tsx`:
  - DELETE `generateOtpSecret`, `formatSecret`, `FakeQR` (lines 44-94)
  - Replace 2FA enrollment branch:
    - On entering 2FA mode (or on Continue if no enrollment yet), call `register2faMut` → returns `{secret, qrSvg, recoveryCodes}` → stash in component state (NOT wizard data, since they're sensitive and one-shot)
    - Render `<img src={`data:image/svg+xml,${encodeURIComponent(qrSvg)}`}>` in `.tfa-qr-side`
    - Display formatted secret (group every 4 chars)
    - On 6-digit OTP submit → `verify2faMut` → on success, set JWT (use existing pattern from password mode) + advance to recovery-codes modal (Plan 138-05)
  - Error states: invalid OTP shows inline below the grid; secret regen via existing UI re-fetches a new pending enrollment

### Plan 138-05 — RecoveryCodesModal

**Files:**
- ➕ `livos/packages/ui/src/features/onboarding-flow/steps/_account/recovery-codes-modal.tsx`:
  - Mounts after successful `verify2fa`
  - 2-col grid of 10 codes (monospace, large)
  - "Download as .txt" button — bundles codes into a Blob, triggers download as `livinity-recovery-codes.txt`
  - "Copy all" + per-code copy
  - "I've saved them, continue" button — disabled until either Download or Copy-all is clicked
  - On confirm → advance to step 2 (wallpaper)
- ✏️ AccountStep: render modal as overlay when `verify2faMut.isSuccess`

### Plan 138-06 — Mini PC deploy + UAT + memory

**Files:** docs only.
- `bash /opt/livos/update.sh` on Mini PC
- Walk `138-UAT-CHECKLIST.md`:
  - [ ] Enroll on Authy phone app — scan QR — code displays
  - [ ] Submit OTP — login succeeds, `totp_enabled=true` in DB
  - [ ] Recovery codes modal appears with 10 codes, downloadable
  - [ ] Log out (or close tab + clear localStorage)
  - [ ] Log back in with password only → 401 INVALID_TOTP
  - [ ] Log in with password + current Authy OTP → success
  - [ ] Log in with password + one of the recovery codes → success
  - [ ] Try same recovery code again → 401 (single-use consumed)
  - [ ] Existing legacy password-only user can still log in without totpToken (no regression)
- Memory: `project_phase_138_complete.md`
- ROADMAP flip + STATE update

## Rollback

DB migration is additive (NULL-able columns + index) — safe. `git revert` of any commit in 138-02..138-04 leaves the schema in place but removes the runtime use; legacy login path continues to work because `totp_enabled` defaults to FALSE. Plan 138-05 revert leaves recovery codes generated but no UI to display — operator can SQL-query if needed.

## Related memories

- `[[project-phase-135-complete]]`
- Existing `livos/packages/livinityd/source/modules/database/schema.sql`
