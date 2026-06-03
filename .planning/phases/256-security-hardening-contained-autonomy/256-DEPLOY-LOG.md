# Phase 256 — Deploy Log (256-05)

**Date:** 2026-06-03
**Target:** Mini PC `bruce@10.69.31.68` (only; Server4/5 off-limits)
**Deployed SHA:** `74fc49c` (push) → `dbfd3e0b` after 2 deploy-time hot-fixes
**Deploy method:** `sudo bash /opt/livos/update.sh` ×2 (run #1 lands new code + new update.sh; run #2 runs the new installer bootstrap — bubblewrap/tinyproxy apt, livos-egress, cred-proxy CA, LIV_API_KEY seed). Driven by Claude over SSH per operator authorization.

## Deploy-time bugs found + fixed live (this is why the live walk matters)

1. **`livos-egress` (tinyproxy) failed — `Syntax error on line 5`.** The generated `livos-egress.conf` had an UNQUOTED `Filter` path; tinyproxy requires `Filter "/path"` (stock `tinyproxy.conf` confirms). Hot-fixed live (quoted) → egress active. Installer fix committed `c919c2fc` (both `update.sh` + `deploy-livinityd.sh`).
2. **bwrap sandbox broke on Ubuntu 24.04 — `setting up uid map: Permission denied`.** `kernel.apparmor_restrict_unprivileged_userns=1` blocks unprivileged user namespaces; bwrap is not setuid and had no AppArmor profile. Because `sandbox.ts` gates on bwrap-on-PATH (`usable=true`), the agent shell tool would have errored on EVERY command. Hot-fixed live with a scoped AppArmor profile (`/etc/apparmor.d/bwrap` granting `userns,`; least-broad fix, does not disable userns globally) → bwrap works + SC1 enforced. Installer fix committed `dbfd3e0b`.

## Deploy checkpoints (256-05 Task 2) — ALL GREEN (post hot-fix)

| Check | Result |
|-------|--------|
| `bwrap` present | ✅ `/usr/bin/bwrap` (+ AppArmor userns profile loaded) |
| `livos-egress` service | ✅ active (after Filter-quote fix) |
| `tinyproxy` | ✅ active |
| `LIV_API_KEY` in `.env` | ✅ 1 |
| `credproxy-ca.pem` | ✅ present; **`credproxy-ca.key` mode 600 host-only** (never in container) |
| `agent-workspace` | ✅ `/opt/livos/data/agent-workspace` bruce-owned |
| core services | ✅ livos · liv-core · liv-worker · liv-memory · liv-assistant all active |
| `liv-claw-gateway` | ✅ active (pre-existing claw-client `next build` type warn — NOT this phase) |
| pnpm-store `@liv+core*` | ✅ single dir (no stale-dist quirk) |

## Success-criteria walk (256-05 Task 3)

### Live-PASS (genuinely exercised on the box)
- **SC1 (sandbox secret-deny)** ✅ — replaying `sandbox.ts`'s exact bwrap argv: `cat /opt/livos/.env` → *No such file or directory*; `cat .../secrets/jwt` → *No such file*; `echo x > /opt/liv/.../dist/index.js` → *Directory nonexistent* (self-modify blocked); write inside the workspace → *ok*. (After the AppArmor fix.)
- **SC2 (egress allowlist)** ✅ — via `livos-egress` :13128: `attacker.example` → **403**, `evil-exfil.net` → **CONNECT 403** (deny); `api.anthropic.com` → **405** (reached), `github.com` → **200** (allow). Default-deny exfil leg closed.
- **SC6 (auth fail-closed / LIVOS-008)** ✅ — `/auth/verify` (livinityd :8080): garbage `LIVINITY_SESSION` cookie → **401**, no cookie → **401**. Presence no longer unlocks; only a valid JWT passes. Caddyfile forward_auth wired.

### Deployed + wired + code/unit-verified — operator interactive agent-walk recommended for live confirmation
All implementing code is confirmed present in the RUNNING deployment (grepped live): `shell.ts` bwrap+scrub, liv-core **dist** classifier, `cred-egress-proxy.ts`, `compose-sanitizer.ts`, `is-authenticated.ts` fail-closed. gsd-verifier already scored these PASS at code/unit level (256-VERIFICATION.md). The remaining live confirmations require driving the real agent loop / installing apps / minting tokens (interactive or destructive — the plan's `checkpoint:human-verify` items):
- **SC3 (env scrub)** — `buildScrubbedEnv` deployed in `shell.ts`; live confirm = task the agent `env | grep -E 'LIV_API_KEY|DATABASE_URL|JWT'` → empty.
- **SC4 (cred proxy, no token mount)** — reinstall OpenDesign; `docker inspect` → no `.claude`/`.gemini` mount; in-container `HTTPS_PROXY=…credproxy:13129`; claude CLI still reaches the model via the now-complete TLS-MITM transport; no `.credentials.json` in container; CA + CLI inject mounts survive the sanitizer.
- **SC4b (metered key)** — install an UNVERIFIED community AI app → container holds an `lvb_…` per-app metered key (not operator OAuth); verified builtin → OAuth proxy.
- **SC5 (admin-gate)** — as non-admin: `apps.addRepository` → FORBIDDEN; install a non-builtin compose with `privileged`+docker.sock → rejected/stripped.
- **SC8 (irreversible classifier)** — task the agent `git push --force` / off-box `curl POST` → BLOCKS pending approval; ordinary `ls`/build runs autonomously; an injected "pre-approved" file does NOT flip the gate.
- **SC7 (regression)** — OpenDesign/OpenHands still open + run; the agent completes an ordinary multi-step task with NO approval prompt (autonomy preserved).

## Follow-up hardening (recommended, not blocking)
- `sandbox.ts` `usable` only checks bwrap-on-PATH, not that userns actually works. On any box where the AppArmor profile failed to load, `usable=true` + bwrap-fails would break the shell tool. Recommend a one-time runtime probe (e.g. `bwrap --unshare-user true`) to set `usable` so it falls back to env-scrubbed-unsandboxed instead of erroring. (The installer now ships the profile, so the live box is correct.)

## Verdict
Phase 256 is **DEPLOYED and live** on the Mini PC. Core containment proven live (SC1 sandbox, SC2 egress, SC6 auth gate); two real deploy-time bugs caught + fixed by the live walk. Remaining SCs are deployed + code/unit-verified, pending the operator's interactive agent-walk for end-to-end live confirmation. All services healthy; agent autonomy preserved.
