# Domain Pitfalls: Adding Multi-User to LivOS (v7.0)

**Domain:** Retrofitting multi-user support onto an existing single-user self-hosted home server OS
**Researched:** 2026-03-12
**Overall confidence:** HIGH (based on codebase analysis + verified web research)

---

## Critical Pitfalls

Mistakes that cause data loss, security breaches, or require full rewrites.

---

### P1: YAML FileStore Data Loss During PostgreSQL Migration

**What goes wrong:** The current system stores ALL state in a single YAML file (`livinity.yaml`) via `FileStore`. This file contains user credentials, app lists, widget preferences, file favorites, backup configs, and settings -- all as a flat nested object. Migrating this to PostgreSQL while the server is live risks partial writes, schema mismatches, and silent data corruption.

**Why it happens in LivOS specifically:**
- `FileStore` uses `PQueue({concurrency: 1})` for write serialization, but reads are unserialized -- a migration script reading while livinityd writes causes stale snapshots
- The YAML file uses `dot-prop` for nested access (`user.hashedPassword`, `files.preferences.view`), and these dot-paths have no direct SQL equivalent without explicit schema design
- `js-yaml` silently coerces types: the string `"true"` becomes boolean `true`, `"1000"` becomes number `1000` -- if PostgreSQL columns have different types, data silently corrupts
- Each app also has its own `settings.yml` FileStore in `app-data/{appId}/settings.yml` -- these must be migrated too, and the migration must know which apps exist

**Consequences:**
- User locked out (hashed password lost or corrupted)
- App list emptied (all installed apps disappear from UI)
- Backup repository passwords lost (backups become unrecoverable)
- 2FA TOTP URI lost (user locked out of 2FA entirely)

**Warning signs:**
- Migration script runs without errors but user can't log in
- Apps show as "not installed" after migration
- Settings revert to defaults
- `js-yaml.load()` returns different types than expected for edge-case values

**Prevention:**
1. **Snapshot before migrate:** Copy `livinity.yaml` to `livinity.yaml.pre-migration` atomically before any writes
2. **Stop livinityd during migration:** Don't attempt live migration -- the FileStore has no transactional guarantees across a schema change
3. **Explicit type mapping:** Create a schema mapping document that maps every dot-prop path to a PostgreSQL column with explicit type casting
4. **Verification step:** After migration, read back every value from PostgreSQL and compare to the YAML snapshot -- fail loudly on any mismatch
5. **Rollback path:** If verification fails, restore from YAML snapshot and abort

**Which phase should address it:** Phase 1 (Database & Auth Foundation) -- this is the very first thing that must work before anything else.

**Confidence:** HIGH -- based on direct codebase analysis of `FileStore`, `StoreSchema`, and `js-yaml` behavior.

---

### P2: JWT Payload Change Breaks All Existing Sessions

**What goes wrong:** Current JWT contains `{loggedIn: true}` with no user identity. Nexus verifies JWTs by checking `payload.loggedIn === true` (in `auth.ts`) and livinityd does the same (in `jwt.ts`). Both systems must accept old-format AND new-format tokens during migration, or every existing user gets logged out instantly and potentially locked out.

**Why it happens in LivOS specifically:**
- There are TWO independent JWT verification paths: livinityd (`jwt.ts` using `jsonwebtoken` library) and nexus-core (`auth.ts` using manual HMAC verification via Node crypto)
- Both hardcode the check `payload.loggedIn === true` -- adding `{userId, role, sessionId}` without updating BOTH verifiers means one system accepts tokens the other rejects
- The proxy token (`{proxyToken: true}`) is a THIRD token type stored in cookies -- it also needs user-scoping
- JWT secret is shared between livinityd and nexus (read from `/data/secrets/jwt`) -- changing the signing logic in one without the other causes cross-system auth failures
- Tokens have 1-week expiry -- a hard cutover means existing users must re-login, which requires the new multi-user login flow to be fully working

**Consequences:**
- All existing sessions invalidated simultaneously
- If new login flow has bugs, users are completely locked out
- Nexus API calls fail with 401 if it still checks `loggedIn === true` but receives `{userId: "abc", role: "admin"}`
- Proxy token cookies stop working for app access

**Warning signs:**
- 401 errors on API calls immediately after deployment
- "Invalid JWT" in logs from one system but not the other
- Cookie-based app proxy stops letting authenticated users through
- Login works but Nexus API calls fail (or vice versa)

**Prevention:**
1. **Dual-format verification:** Update both verifiers to accept EITHER `{loggedIn: true}` (legacy) OR `{userId, role, sessionId}` (new). Legacy tokens map to the admin user.
2. **Update BOTH paths simultaneously:** Ship livinityd `jwt.ts` and nexus `auth.ts` changes in the same deployment
3. **Grace period:** Keep dual-format support for 2+ weeks (longer than token expiry of 1 week), then remove legacy format
4. **Proxy token migration:** Add `userId` to proxy tokens too, but keep accepting `{proxyToken: true}` during grace period
5. **Smoke test script:** After deployment, verify auth works by hitting both livinityd tRPC endpoints AND nexus API endpoints with the same token

**Which phase should address it:** Phase 1 (Database & Auth Foundation) -- must be the first auth change, before any per-user logic depends on userId in tokens.

**Confidence:** HIGH -- directly verified by reading both `jwt.ts` and `auth.ts` source code.

---

### P3: Redis Key Collision Exposes Data Between Users

**What goes wrong:** Every Redis key in Nexus is globally scoped with the `nexus:` prefix. There is zero user-level namespacing. Adding multi-user without re-keying causes users to share conversation state, AI memory, inbox items, canvas artifacts, session history, and configuration.

**Why it happens in LivOS specifically:**
Exhaustive inventory of unscoped keys found in codebase:

| Key Pattern | What It Stores | Leak Risk |
|-------------|---------------|-----------|
| `nexus:inbox` | Task queue (list) | User B sees User A's pending tasks |
| `nexus:active_session` | Current session info | User B overwrites User A's session |
| `nexus:config` | Global Nexus config | Shared, but config changes affect all |
| `nexus:config:kimi_api_key` | AI provider credentials | All users share one API key (maybe OK, maybe not) |
| `nexus:notifications` | Notification queue | User B reads User A's notifications |
| `nexus:stats` | Usage statistics | Shared stats, no per-user breakdown |
| `nexus:session:{id}` | Chat session state | Session IDs could collide if not user-scoped |
| `nexus:session_history:{id}` | Chat message history | Direct conversation leakage |
| `nexus:canvas:{id}` | Canvas artifacts | User B sees User A's rendered canvases |
| `nexus:wa_history:*` | WhatsApp chat history | User B reads User A's WhatsApp messages |
| `nexus:wa_outbox` | WhatsApp outgoing queue | User B's messages sent as User A |
| `nexus:approval:{id}` | Tool approval requests | User B approves User A's tool calls |
| `nexus:dm:*` | DM pairing config | Cross-user DM routing |
| `nexus:task_state:*` | Background task state | Task state leaks |
| `nexus:result:{jobId}` | Worker job results | Job results visible to wrong user |
| `nexus:skills:registries` | Skill registries | Shared, possibly intentional |
| `nexus:gmail:*` | Gmail integration | User B accesses User A's email config |

**Consequences:**
- User B reads User A's AI conversations (privacy breach)
- User B receives User A's WhatsApp messages
- User B can approve/deny User A's tool execution requests
- User B's canvas artifacts appear in User A's chat
- Notification queue becomes a shared pile

**Warning signs:**
- "I didn't ask that" -- user sees responses to another user's prompts
- Notifications appearing that aren't yours
- WhatsApp messages sent to wrong contacts
- Canvas artifacts from someone else's session appearing

**Prevention:**
1. **Prefix strategy:** Change all keys to `nexus:{userId}:{rest}` pattern. Create a `userKey(userId, key)` helper function used everywhere.
2. **Migration script:** For each existing key, copy to `nexus:{adminUserId}:{rest}` and delete the old key. Run this BEFORE enabling multi-user.
3. **Global vs per-user audit:** Some keys are genuinely global (config, kimi_api_key, skills registries). Document which keys stay global and which become per-user.
4. **SCAN-based migration:** Use `SCAN` (not `KEYS`) to find all `nexus:*` keys and re-prefix them. `KEYS` blocks Redis on large datasets.
5. **Verification:** After migration, run `SCAN 0 MATCH nexus:*` excluding `nexus:{userId}:*` patterns -- anything left is an unscoped key that needs attention.
6. **PubSub channels:** Don't forget `nexus:config:updated`, `nexus:notify:approval`, `nexus:voice:response` -- these pubsub channels also need user-scoping or filtering.

**Which phase should address it:** Phase 1 (Database & Auth Foundation) -- Redis re-keying must happen alongside PostgreSQL migration since both change the data layer.

**Confidence:** HIGH -- exhaustive grep of all `nexus:` key patterns in the codebase.

---

### P4: Path Traversal in Multi-User File System

**What goes wrong:** The Files module maps virtual paths (`/Home`, `/Trash`, `/Apps`) to physical paths relative to `livinityd.dataDirectory`. In multi-user mode, each user needs their own `/Home` and `/Trash`. If user-scoping is done by string concatenation (e.g., `${dataDir}/users/${userId}/home`), path traversal attacks let User B access User A's files via paths like `../../users/admin/home/secrets.txt`.

**Why it happens in LivOS specifically:**
- `Files` class sets `baseDirectories` as a static Map in the constructor -- these are process-global, not per-request
- The `fileOwner` is hardcoded to `{userId: 1000, groupId: 1000}` -- all files belong to the same Linux user
- Trash metadata is stored in a global `trash-meta` directory with no user partitioning
- The existing path validation in `getBackupIgnoredFilePaths()` shows the right pattern (normalize + check `startsWith`) but this isn't applied consistently across all file operations
- Recent Node.js CVEs (CVE-2025-27210, CVE-2025-23084) demonstrate that `path.normalize()` alone is insufficient on Windows due to device name bypasses -- though LivOS runs on Linux, the principle of defense-in-depth applies

**Consequences:**
- User B reads User A's private files
- User B can overwrite/delete User A's files
- User B can access app data directories of User A's apps
- User B can read backup repository passwords from User A's config

**Warning signs:**
- API returns files from unexpected directories
- File operations succeed on paths that should be forbidden
- Trash showing items from another user's trash

**Prevention:**
1. **Per-user base directories:** Create separate `baseDirectories` Map per authenticated user: `/data/users/{userId}/home`, `/data/users/{userId}/trash`, etc.
2. **Resolve-then-check:** For every file operation, `path.resolve()` the full path, then verify it starts with the user's base directory. This is already done in `getBackupIgnoredFilePaths()` -- extract it into a reusable `assertPathWithinBoundary(resolvedPath, boundary)` utility.
3. **Chroot-like middleware:** At the tRPC/Express middleware level, inject the user's base directories into the request context before any file handler runs.
4. **Linux filesystem permissions:** Create separate Linux users (uid 1001, 1002, ...) for each LivOS user and set directory ownership accordingly. This provides OS-level isolation even if application-level checks fail.
5. **Symlink defense:** Check for symlinks that point outside the user's directory boundary -- `fs.lstat()` before following symlinks.

**Which phase should address it:** Phase 2 (User Data Isolation) -- after auth provides userId, before any user-facing features.

**Confidence:** HIGH -- directly verified `Files` class constructor and path handling patterns.

---

### P5: Docker Container Isolation Failure Between Users

**What goes wrong:** LivOS runs Docker apps with compose files that reference shared host directories. In multi-user mode, if User A's Nextcloud container and User B's Nextcloud container share the same host volume, they share all data. Port conflicts arise when two users install the same app.

**Why it happens in LivOS specifically:**
- `App` class uses `dataDirectory = ${livinityd.dataDirectory}/app-data/${appId}` -- app IDs are global, not per-user
- `patchComposeFile()` generates port mappings like `127.0.0.1:${manifest.port}:${internalPort}` -- if two users install the same app, both try to bind the same host port
- Container names are forced to `${appId}_${serviceName}_1` -- two users with the same app create container name conflicts
- Volume mounts in compose files reference relative paths that resolve to the app's data directory -- shared between all users in current architecture
- The `deriveDeterministicPassword()` method uses a global `livinity-seed` -- all users' apps get the same derived password

**Consequences:**
- Two users installing the same app: port bind failure, second install fails
- Shared volumes: User B sees User A's Nextcloud files
- Container name collision: Docker refuses to start the second container
- Same derived passwords: potential cross-user credential sharing in apps

**Warning signs:**
- "port already allocated" errors when second user installs an app
- Docker "container name already in use" errors
- One user's app data appearing in another user's app

**Prevention:**
1. **User-scoped app IDs:** Change app directory to `app-data/{userId}/{appId}`. Container names become `{userId}_{appId}_{serviceName}_1`.
2. **Dynamic port allocation:** Assign ports from a pool (e.g., 10000-60000) per user per app instead of using manifest-fixed ports. Store the mapping in PostgreSQL.
3. **Isolated Docker networks:** Create a Docker network per user (`docker network create user_{userId}`). Apps within a user's network can communicate, but cross-user network traffic is blocked.
4. **Per-user seed:** Derive user-specific seeds: `HMAC(global_seed, userId)` for password generation.
5. **Resource limits:** Set `--memory` and `--cpus` limits in compose files per user to prevent one user's containers from starving others (see P8).

**Which phase should address it:** Phase 3 (Per-User Apps & Docker) -- depends on auth (Phase 1) and data isolation (Phase 2).

**Confidence:** HIGH -- directly verified `App` class, `patchComposeFile()`, and container naming in the codebase.

---

### P6: AI Conversation Data Leakage Between Users

**What goes wrong:** Nexus stores AI memory, conversation history, and session state with minimal user isolation. The memory service (SQLite-based) already has a `user_id` column but the session manager, canvas manager, and WhatsApp history have no user scoping. One user's AI conversations, tool approvals, and agent context become visible to another.

**Why it happens in LivOS specifically:**
- `SessionManager` uses `REDIS_SESSIONS_PREFIX = 'nexus:session:'` with session IDs, but session IDs are not tied to user identity
- `CanvasManager` uses `CANVAS_KEY_PREFIX = 'nexus:canvas:'` with no user dimension
- WhatsApp history stored at `nexus:wa_history:{jid}` is globally accessible
- The agent's system prompt includes WhatsApp conversation context -- if sessions aren't isolated, User B's agent run could include User A's WhatsApp messages
- Memory service has `user_id` in the schema BUT the API endpoint may not enforce that the requesting user can only access their own memories
- Tool approval via `nexus:approval:*` keys -- User B could approve User A's pending tool execution

**Consequences:**
- User B asks AI "what did we discuss?" and gets User A's conversation
- User B's agent sees User A's WhatsApp messages in context
- User B can approve dangerous tool calls meant for User A to review
- Canvas artifacts from User A's session render in User B's UI

**Warning signs:**
- AI references conversations the user never had
- Tool approval prompts appearing for tools the user didn't invoke
- AI "remembers" facts the user never told it

**Prevention:**
1. **Session-to-user binding:** SessionManager must tag sessions with `userId`. The `getOrCreate` method must verify the requesting user owns the session.
2. **Canvas user-scoping:** Add `userId` to `CanvasArtifact` interface. `listByConversation()` must filter by userId.
3. **Memory API auth enforcement:** Verify the memory service API checks that `req.userId === memory.user_id` on every query, not just on store.
4. **Approval isolation:** Tool approval keys become `nexus:{userId}:approval:{id}`. Approval UI only shows the current user's pending approvals.
5. **WhatsApp per-user binding:** WhatsApp account pairing becomes per-user. History keys become `nexus:{userId}:wa_history:{jid}`.

**Which phase should address it:** Phase 2 (User Data Isolation) -- after auth provides userId, this is the highest-priority isolation task.

**Confidence:** HIGH -- directly verified SessionManager, CanvasManager, memory service schema, and WhatsApp history patterns.

---

## High Pitfalls

Mistakes that cause significant rework, security gaps, or user-facing bugs.

---

### P7: Cookie Scope Leaks Auth Between Users on Same Domain

**What goes wrong:** The current `LIVINITY_PROXY_TOKEN` cookie is set with `sameSite: 'lax'` and no explicit `domain` attribute. In multi-user mode, all users share the same domain (e.g., `livinity.cloud`). Without the `__Host-` prefix or explicit `Path` scoping, one user's proxy token could authenticate requests for another user's app subdomains.

**Why it happens in LivOS specifically:**
- `LIVINITY_PROXY_TOKEN` cookie is set in `user/routes.ts` login handler without a `domain` attribute -- browser defaults to current host, which is shared
- The proxy token payload is `{proxyToken: true}` with no user identity -- any valid proxy token authenticates any user's app proxy requests
- Caddy routes subdomains (e.g., `nextcloud.livinity.cloud`) to specific ports -- but the proxy token is the same for all subdomains
- Cookie with `sameSite: 'lax'` is sent on same-site navigations, including navigations to subdomains -- this is correct behavior but means the same cookie reaches all subdomain apps

**Consequences:**
- User B's proxy token grants access to User A's apps
- Logging out one user doesn't invalidate proxy access for apps
- Subdomain apps receive a cookie that doesn't identify which user is accessing them

**Warning signs:**
- User can access apps they didn't install
- Logout doesn't prevent app access (cookie still valid)
- Two users logged in simultaneously can access each other's apps

**Prevention:**
1. **User-scoped proxy tokens:** Include `userId` in the proxy token payload. Proxy middleware verifies the userId matches the app's owner.
2. **`__Host-` cookie prefix:** Use `__Host-LIVINITY_PROXY_TOKEN` which forces `Secure`, `Path=/`, and no `Domain` attribute -- preventing subdomain sharing.
3. **Per-app tokens:** Instead of one proxy token for all apps, issue per-app tokens that only authenticate for that specific app's subdomain.
4. **Proxy middleware user check:** Caddy or the app proxy layer must verify the token's userId against the app's owner before forwarding the request.

**Which phase should address it:** Phase 1 (Database & Auth Foundation) -- cookie changes must ship with the JWT changes.

**Confidence:** HIGH -- directly verified cookie settings in `user/routes.ts`.

---

### P8: Resource Exhaustion on 8GB Server

**What goes wrong:** The production server has 8GB RAM running 5+ PM2 processes (livos, nexus-core, nexus-mcp, nexus-memory, nexus-worker) plus Docker containers. Adding users who each run Docker apps without resource limits means one user can OOM-kill the entire server.

**Why it happens in LivOS specifically:**
- Current Docker containers have NO memory limits set -- `patchComposeFile()` never adds `deploy.resources.limits`
- PM2 processes have no memory limits configured
- A single Nextcloud + MariaDB stack uses ~500MB RAM. Two users each running 3 apps = 3GB just for Docker, leaving only ~5GB for PM2, Redis, PostgreSQL, and the OS
- `docker-compose.yml` files from the app store don't include resource limits -- they're designed for dedicated servers
- The OOM killer will terminate random processes, potentially killing nexus-core or Redis, causing cascading failures

**Consequences:**
- User B installs a memory-hungry app (e.g., Jellyfin transcoding), server OOMs
- OOM killer kills Redis, causing session loss for ALL users
- OOM killer kills nexus-core, AI agent becomes unresponsive for ALL users
- Server becomes unresponsive, requiring SSH reboot

**Warning signs:**
- `dmesg | grep oom` shows OOM killer activity
- Server becomes sluggish when second user starts their apps
- PM2 shows processes restarting due to memory pressure
- Docker containers exit with code 137 (SIGKILL from OOM)

**Prevention:**
1. **Per-user resource quotas:** Define resource budgets per user (e.g., 2GB RAM, 2 CPU cores). Enforce via Docker `--memory` and `--cpus` flags in `patchComposeFile()`.
2. **App resource profiles:** Add memory/CPU estimates to app manifests. Prevent installation if it would exceed the user's quota.
3. **System reservation:** Reserve 3GB for system processes (PM2, Redis, PostgreSQL, OS). Only remaining RAM is allocatable to user Docker containers.
4. **Cgroup enforcement:** Use Docker's `--memory` (hard limit) and `--memory-reservation` (soft limit). Set `--oom-kill-disable=false` to let Docker handle OOMs within containers rather than letting the host OOM killer make arbitrary choices.
5. **Admin dashboard:** Show real-time resource usage per user. Alert admin when total allocation approaches capacity.
6. **Max apps per user:** Set a configurable limit on how many apps each user can install based on available resources.

**Which phase should address it:** Phase 3 (Per-User Apps & Docker) -- must be implemented BEFORE enabling multi-user app installation.

**Confidence:** HIGH -- server specs confirmed in project memory, Docker resource behavior from official Docker docs.

---

### P9: Backward Compatibility Failure Breaks Existing Installation

**What goes wrong:** The migration from single-user to multi-user must preserve the existing admin user's data, installed apps, files, settings, and credentials exactly as they were. Any breakage means the existing (and only) user loses their setup.

**Why it happens in LivOS specifically:**
- The existing user has no `userId` -- they are "the user." Every piece of data assumes a single user.
- App data lives at `app-data/{appId}/` -- migrating to `app-data/{adminUserId}/{appId}/` requires moving directories while Docker containers may be running
- The system password is synced to Linux user `livinity` (uid 1000) -- adding more LivOS users means creating more Linux users without breaking the existing one
- Samba shares are configured globally -- they need to become per-user
- Backup repositories reference paths that will change if data is reorganized

**Consequences:**
- Existing user can't log in after migration
- Installed apps stop working (data directory moved, containers can't find volumes)
- Backups fail (repository paths no longer valid)
- Files disappear from the UI (base directories changed)

**Warning signs:**
- Apps show "stopped" after migration but won't start
- File manager shows empty directories
- Backup scheduling fails silently
- Samba shares become inaccessible

**Prevention:**
1. **Symlink bridge:** After reorganizing directories, leave symlinks at the old paths pointing to new locations. Remove symlinks only after verifying everything works.
2. **Docker volume rebind:** Stop all containers, move data, update compose volume paths, restart. Never move data while containers are running.
3. **Admin user auto-creation:** The first user becomes `admin` with a well-known userId (e.g., UUID v5 from the existing hashed password, or just "admin"). Migration maps all existing data to this userId.
4. **Backup path update:** Migration script must update backup repository paths in the new database to reflect new directory structure.
5. **Samba reconfiguration:** Regenerate Samba config with per-user shares after migration.
6. **Rollback flag:** `LIVINITY_MIGRATION_ROLLBACK=true` environment variable that reverts to pre-migration directory structure on next boot.
7. **One-shot migration with verification:** Migration runs once, verifies, sets a flag. Never re-runs. If verification fails, aborts and restores from snapshot.

**Which phase should address it:** Phase 1 (Database & Auth Foundation) -- the migration itself happens here.

**Confidence:** HIGH -- directly verified data directory structure and app volume patterns.

---

### P10: Admin Privilege Escalation by Member Users

**What goes wrong:** The current system has no concept of roles. Adding `admin` vs `member` roles requires auditing every API endpoint and tRPC procedure to ensure member users can't access admin-only operations.

**Why it happens in LivOS specifically:**
- tRPC has two auth levels: `publicProcedure` and `privateProcedure`. There is no `adminProcedure`.
- Every authenticated endpoint is equally accessible -- factory reset, system settings, backup management, app store management
- Nexus API uses a single `X-Api-Key` -- no per-user API keys
- System operations like `commitOsPartition()`, `setupPiCpuGovernor()`, domain configuration via Caddy are callable by any authenticated user
- The `register` endpoint checks `if (await ctx.user.exists())` -- in multi-user mode, this needs to check if registration is allowed, not just if "a" user exists

**Consequences:**
- Member user triggers factory reset, wiping all users' data
- Member user changes the domain/DNS settings
- Member user modifies global Nexus config (AI provider, model settings)
- Member user accesses admin user's backup repositories
- Member user registers additional accounts when they shouldn't be able to

**Warning signs:**
- Member user sees admin settings in the UI
- Factory reset button accessible to non-admin users
- Member user can add/remove app repositories

**Prevention:**
1. **Add `adminProcedure` to tRPC:** Create a middleware that checks `ctx.user.role === 'admin'` and rejects with 403 otherwise.
2. **Audit every endpoint:** Categorize all tRPC procedures and Express routes as `public`, `authenticated` (any user), or `admin-only`. Document the classification.
3. **Default deny for sensitive operations:** System settings, backup management, domain configuration, factory reset, app store management, user management -- all default to admin-only.
4. **Registration control:** `register` endpoint should only work if: (a) no users exist (first-time setup), or (b) caller is admin creating an invite, or (c) an invite token is presented.
5. **Nexus API per-user auth:** Replace single `X-Api-Key` with per-user API keys or JWT-based auth for the Nexus API.

**Which phase should address it:** Phase 1 (Database & Auth Foundation) for the role system, then Phase 2 for auditing every endpoint.

**Confidence:** HIGH -- directly verified tRPC middleware patterns and endpoint accessibility.

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded user experience.

---

### P11: Caddy Reverse Proxy Misrouting Between Users

**What goes wrong:** Caddy generates subdomain blocks like `nextcloud.livinity.cloud -> 127.0.0.1:{port}`. In multi-user mode, both User A and User B might have Nextcloud, but they need different subdomains and different ports. The Caddyfile generation logic doesn't account for per-user subdomains.

**Why it happens in LivOS specifically:**
- `generateFullCaddyfile()` takes a flat list of `SubdomainConfig[]` -- no user dimension
- Subdomain format is `{appId}.{mainDomain}` -- if two users have Nextcloud, there's only one `nextcloud.livinity.cloud`
- The current implementation validates subdomain format but not uniqueness across users
- Caddyfile is written as a whole file and reloaded -- partial updates are not supported, so every user's app change requires regenerating the entire config

**Consequences:**
- Second user's app overrides first user's subdomain routing
- Caddy reload fails due to duplicate domain blocks
- User A's Nextcloud URL starts serving User B's Nextcloud

**Prevention:**
1. **User-scoped subdomains:** Format: `{appId}-{username}.{mainDomain}` (e.g., `nextcloud-alice.livinity.cloud`). Sanitize username for subdomain compatibility.
2. **Wildcard certificate:** Use `*.livinity.cloud` with DNS challenge instead of per-subdomain certs. Prevents rate-limiting from Let's Encrypt as users grow.
3. **Atomic Caddyfile generation:** Generate from database state (all users' apps), not from incremental changes. Prevents drift between Caddy config and actual state.
4. **Conflict detection:** Before creating a subdomain, check if it already exists. Return a user-friendly error, not a Caddy crash.

**Which phase should address it:** Phase 3 (Per-User Apps & Docker) -- after port allocation and container isolation.

**Confidence:** HIGH -- directly verified `caddy.ts` and Caddyfile generation logic.

---

### P12: Docker Compose File Manipulation Breaks on Edge Cases

**What goes wrong:** LivOS programmatically reads, modifies, and writes `docker-compose.yml` files from app store repositories. YAML round-tripping through `js-yaml` loses comments, changes formatting, and can alter semantics. Per-user templating adds another mutation layer.

**Why it happens in LivOS specifically:**
- `patchComposeFile()` reads YAML, mutates the JS object, writes back -- comments are stripped, key ordering changes
- Environment variables in compose files can be string or array format -- `patchComposeFile()` handles both but round-tripping may convert between formats
- YAML anchors and aliases (`<<: *defaults`) are resolved on parse and lost on dump
- The `compose-spec-schema` type is used but compose files from third-party repos may not conform to the spec exactly
- Adding per-user environment variables (like user-specific passwords) to compose files requires modifying environment sections that may use `${VARIABLE}` interpolation syntax -- `js-yaml` doesn't preserve these as literal strings

**Consequences:**
- App won't start after compose file modification (invalid YAML)
- Environment variables expanded prematurely or escaped incorrectly
- Compose file differs from upstream, making updates/diffs impossible
- Per-user password injection fails silently

**Warning signs:**
- `docker compose up` fails with parse errors after `patchComposeFile()`
- Environment variables show literal `${VAR}` instead of expanded values (or vice versa)
- App updates fail because compose file format changed

**Prevention:**
1. **Store patches, not mutations:** Instead of round-tripping YAML, store a "patch" (the overrides) and apply them at compose-up time via Docker Compose's override mechanism (`docker-compose.yml` + `docker-compose.override.yml`).
2. **Per-user override files:** `docker-compose.user-{userId}.yml` with just the port, volume, and environment overrides. Never modify the base compose file.
3. **Test round-trip fidelity:** Before deploying, round-trip every app store compose file through `js-yaml` and verify `docker compose config` produces identical output.
4. **Pin js-yaml behavior:** Use `js-yaml.dump()` with `{lineWidth: -1, noRefs: true}` to prevent unexpected line folding and anchor generation.

**Which phase should address it:** Phase 3 (Per-User Apps & Docker) -- when implementing per-user app installations.

**Confidence:** MEDIUM -- YAML edge cases are well-documented in general, but the specific interaction with `compose-spec-schema` types needs testing.

---

### P13: Registration and Invite System Abuse

**What goes wrong:** Without a proper invite system, anyone with network access to the server can register an account. The current `register` endpoint only checks if "a user" exists -- it doesn't check if registration is currently open.

**Why it happens in LivOS specifically:**
- `user.register()` checks `if (await this.exists())` -- this is "does a user exist", not "is this user authorized to register"
- There's no invite token, registration toggle, or admin approval workflow
- The server is accessible via public domain (`livinity.cloud`) -- anyone who knows the URL can reach the registration endpoint
- tRPC procedures are all reachable from the browser -- no IP allowlisting

**Consequences:**
- Random internet user registers on your server
- Attacker creates account, installs resource-heavy apps, DoS's the server
- No way to remove unwanted users without direct database access

**Warning signs:**
- Unknown users appearing in the system
- Resource usage spikes from unknown Docker containers
- Registration API being called from unexpected IPs

**Prevention:**
1. **Invite-only registration:** Admin generates invite tokens. Registration requires a valid, unexpired token.
2. **Registration toggle:** Admin can enable/disable public registration in settings.
3. **Rate limiting:** Limit registration attempts per IP (e.g., 3 per hour).
4. **Admin notification:** Notify admin when a new user registers (even with valid invite).

**Which phase should address it:** Phase 1 (Database & Auth Foundation) -- registration control is part of the auth system.

**Confidence:** HIGH -- directly verified registration endpoint logic.

---

### P14: Livinityd Store Schema Has No Multi-User Awareness

**What goes wrong:** The `StoreSchema` type in `index.ts` has a single `user` object. Not `users: User[]`. The entire store architecture assumes one user. Bolting multi-user onto this schema leads to an awkward hybrid where some data is in YAML (for backwards compat) and some in PostgreSQL.

**Why it happens in LivOS specifically:**
```typescript
type StoreSchema = {
  user: {         // Singular. Not users[].
    name: string
    hashedPassword: string
    // ...
  }
  files: {        // Global file preferences, not per-user
    preferences: {...}
    favorites: string[]
  }
  apps: string[]  // Global app list, not per-user
  widgets: string[] // Global widget list, not per-user
}
```

Every module that reads the store assumes `store.get('user.name')` returns THE user, not A user.

**Consequences:**
- Attempting to add `users` array to StoreSchema requires updating every `store.get('user.*')` call
- Mixed data model (some in YAML, some in PostgreSQL) creates maintenance burden
- Risk of data going stale if YAML and PostgreSQL disagree

**Prevention:**
1. **Clean break:** Move ALL user data to PostgreSQL. Don't try to extend the YAML schema.
2. **Keep YAML for system-only config:** `StoreSchema` retains `version`, `settings`, `development` -- things that are truly system-wide. Everything per-user moves to PostgreSQL.
3. **Adapter pattern:** Create `UserStore` class that reads from PostgreSQL but exposes the same `get('user.name')` interface during migration. Swap internals without changing callers.
4. **Deprecation timeline:** After migration, remove per-user fields from `StoreSchema`. Add runtime warnings if old paths are accessed.

**Which phase should address it:** Phase 1 (Database & Auth Foundation) -- core data model change.

**Confidence:** HIGH -- directly verified `StoreSchema` type definition.

---

## Minor Pitfalls

Mistakes that cause annoyance or minor bugs but are fixable without rework.

---

### P15: WebSocket Auth Doesn't Carry User Identity

**What goes wrong:** WebSocket connections are authenticated at connection time. Current auth verifies a valid token but doesn't extract or store user identity on the socket. In multi-user mode, the server can't determine which user a WebSocket belongs to.

**Prevention:** On WebSocket upgrade, decode the JWT, extract `userId`, and store it on the socket instance (`ws.userId = payload.userId`). All message handlers then use `ws.userId` for user-scoped operations.

**Which phase should address it:** Phase 1 (Database & Auth Foundation) -- with JWT changes.

---

### P16: Single Linux User for All File Operations

**What goes wrong:** All file operations run as `userId: 1000, groupId: 1000` (hardcoded in `Files` class). Adding LivOS users doesn't create corresponding Linux users, meaning OS-level file permissions can't distinguish between users.

**Prevention:** Create a Linux user per LivOS user during registration (uid 1001, 1002, ...). Run file operations via `setuid`/`setgid` for the requesting user. This provides defense-in-depth even if application-level checks fail.

**Which phase should address it:** Phase 2 (User Data Isolation) -- with file system partitioning.

---

### P17: Notification and Event Bus Global Broadcast

**What goes wrong:** `EventBus` and `Notifications` modules broadcast to all connected clients. In multi-user mode, User B receives User A's notifications (app installed, backup complete, etc.).

**Prevention:** Tag events with `userId`. WebSocket broadcast filters to sockets matching the event's userId. System-wide events (e.g., server update available) go to admin only or all users depending on type.

**Which phase should address it:** Phase 2 (User Data Isolation) -- with WebSocket user-scoping.

---

### P18: UI Assumes Single User State

**What goes wrong:** The React UI stores auth state as `isLoggedIn: boolean` with no user identity. UI components assume they are "the user" and display settings/data without filtering by userId.

**Prevention:** Auth context must store `{userId, role, name}` from the JWT. All data-fetching hooks must include userId in queries. Admin-only UI sections must be conditionally rendered.

**Which phase should address it:** Phase 4 (UI) -- after backend supports multi-user.

---

## Phase-Specific Risk Summary

| Phase | Critical Risks | Key Pitfalls |
|-------|---------------|--------------|
| Phase 1: DB & Auth | Data loss during migration, session breakage | P1, P2, P3, P7, P9, P10, P13, P14 |
| Phase 2: Data Isolation | Path traversal, AI data leakage | P4, P6, P16, P17 |
| Phase 3: Per-User Docker | Container isolation, resource exhaustion | P5, P8, P11, P12 |
| Phase 4: UI | Privilege escalation via UI, state leakage | P10, P15, P18 |

## Migration Day Checklist

Before enabling multi-user on production:

- [ ] Full backup of `/opt/livos/data/` directory
- [ ] Snapshot of `livinity.yaml` preserved separately
- [ ] All Redis keys inventoried and migration plan verified
- [ ] Docker containers stopped during migration
- [ ] JWT dual-format verification tested with both old and new tokens
- [ ] Existing user login verified after migration
- [ ] All installed apps start correctly with new directory structure
- [ ] File manager shows correct files for migrated admin user
- [ ] Backup repositories accessible with updated paths
- [ ] Registration endpoint properly gated
- [ ] Admin role can access all settings
- [ ] Member role cannot access admin-only settings
- [ ] Rollback procedure tested on staging server

## Sources

- LivOS codebase: `livos/packages/livinityd/source/` (direct analysis)
- Nexus codebase: `nexus/packages/core/src/` (direct analysis)
- [Session Security in 2025](https://www.techosquare.com/blog/session-security-in-2025-what-works-for-cookies-tokens-and-rotation) -- cookie and session security patterns
- [Docker Resource Constraints](https://docs.docker.com/engine/containers/resource_constraints/) -- container memory/CPU limits
- [Redis Multi-Tenancy Isolation](https://oneuptime.com/blog/post/2026-01-25-redis-tenant-isolation-key-prefixes/view) -- Redis key prefix patterns
- [Redis Data Isolation in Multi-Tenant SaaS](https://redis.io/blog/data-isolation-multi-tenant-saas/) -- tenant data isolation strategies
- [Cross Session Leak in AI Assistants](https://www.giskard.ai/knowledge/cross-session-leak-when-your-ai-assistant-becomes-a-data-breach) -- AI conversation data leakage patterns
- [Node.js Path Traversal CVE-2025-27210](https://zeropath.com/blog/cve-2025-27210-nodejs-path-traversal-windows) -- recent path traversal bypass patterns
- [Docker Network Isolation Pitfalls](https://hexshift.medium.com/docker-network-isolation-pitfalls-that-put-your-applications-at-risk-b60356a14033) -- container network isolation failures
- [Effective JWT Invalidation Strategies](https://sqlpey.com/javascript/effective-jwt-invalidation-strategies/) -- JWT migration and session management
- [Cookie Domain Sharing Between Subdomains](https://www.codegenes.net/blog/share-cookies-between-subdomain-and-domain/) -- subdomain cookie scoping risks
- [Multi-Tenant Architecture Guide 2026](https://www.future-processing.com/blog/multi-tenant-architecture/) -- general multi-tenant patterns
- [HashiCorp Docker Compose YAML Best Practices](https://support.hashicorp.com/hc/en-us/articles/43302441913491-Best-practices-to-avoid-malformed-docker-compose-yaml-leading-to-startup-issues) -- YAML parsing edge cases
