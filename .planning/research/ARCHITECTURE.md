# Architecture Patterns: Multi-User Integration

**Domain:** Multi-user support for existing single-user home server OS
**Researched:** 2026-03-12
**Overall confidence:** HIGH (based on direct codebase analysis)

---

## Table of Contents

1. [Current Architecture Snapshot](#current-architecture-snapshot)
2. [JWT to Multi-User Session Migration](#1-jwt-to-multi-user-session-migration)
3. [tRPC Context Extension](#2-trpc-context-extension)
4. [YAML to PostgreSQL Migration](#3-yaml-to-postgresql-migration)
5. [Dynamic Proxy Middleware (App Gateway)](#4-dynamic-proxy-middleware-app-gateway)
6. [Docker Compose Templating Per User](#5-docker-compose-templating-per-user)
7. [Caddy Simplification](#6-caddy-simplification)
8. [Redis Key Namespacing](#7-redis-key-namespacing)
9. [File System Restructuring](#8-file-system-restructuring)
10. [App Manifest Extension](#9-app-manifest-extension)
11. [Login Page Routing](#10-login-page-routing)
12. [Component Dependency Graph](#component-dependency-graph)
13. [Suggested Build Order](#suggested-build-order)

---

## Current Architecture Snapshot

Before designing multi-user integration, here is the exact current state derived from reading every relevant source file.

### Authentication Flow (Current)

```
Login Request
  -> user.login (tRPC mutation, publicProcedure)
  -> User.validatePassword() reads user.hashedPassword from livinity.yaml via FileStore
  -> Optional 2FA via TOTP
  -> Server.signToken() -> jwt.sign(secret, {loggedIn: true}, expiresIn: 1 week)
  -> Also sets LIVINITY_PROXY_TOKEN cookie (separate JWT with {proxyToken: true})
  -> Client stores main JWT in localStorage, proxy token in httpOnly cookie
```

**Key facts from `jwt.ts`:**
- Payload is `{loggedIn: true}` -- no userId, no username, no role
- Both JWTs use same secret from `{dataDirectory}/secrets/jwt`
- Expiry is 1 week (both tokens)
- Algorithm: HS256

**Key facts from `is-authenticated.ts`:**
- Middleware extracts token from `Authorization: Bearer <token>` header
- Calls `ctx.server.verifyToken(token)` which just verifies signature and `loggedIn: true`
- WebSocket connections bypass auth middleware (auth handled on upgrade by Server class)
- `isAuthenticatedIfUserExists` allows unauthenticated access when no user registered

### tRPC Context (Current)

From `context.ts`:
```typescript
{
  livinityd,      // The main Livinityd instance
  server,         // Server module (JWT signing/verification)
  user,           // SINGLETON User class (reads from livinity.yaml)
  appStore,       // App template repository
  apps,           // App management (Docker compose, Caddy)
  logger,
  dangerouslyBypassAuthentication: false,
  // Express context adds: transport, request, response
  // WSS context adds: transport
}
```

**Critical observation:** `ctx.user` is a SINGLETON `User` class backed by the single YAML file. There is no concept of "which user is making this request." Every authenticated request accesses the same user data.

### Data Storage (Current)

**Primary store:** `FileStore<StoreSchema>` at `{dataDirectory}/livinity.yaml`
- YAML format, read-parse-modify-write cycle
- PQueue with concurrency 1 for writes (serialized)
- All data in single file: user info, app list, widgets, files preferences, backup config, settings
- Access via dot-prop paths: `store.get('user.name')`, `store.set('apps', [...])`, etc.

**StoreSchema structure (from `index.ts`):**
```
version, apps[], appRepositories[], widgets[], torEnabled,
user: { name, hashedPassword, totpUri, wallpaper, language, temperatureUnit },
settings: { releaseChannel, wifi, externalDns },
development: { hostname },
recentlyOpenedApps[],
files: { preferences: {...}, favorites[], recents[], shares[], networkStorage[] },
notifications[], backups: { repositories[], ignore[] }
```

**Per-app store:** `FileStore<AppSettings>` at `{dataDirectory}/app-data/{appId}/settings.yml`
- Contains: hideCredentialsBeforeOpen, dependencies, backupIgnore, autoStart

**Redis (via AiModule):** Used for AI conversations, Nexus sessions, domain config, Caddy subdomains
- Key patterns in livinityd: `livos:domain:config`, `livos:domain:subdomains`, `liv:ui:conv:*`, `liv:ui:convs`
- Key patterns in nexus-core: `nexus:session:*`, `nexus:session_history:*`, `nexus:config:*`, `nexus:kimi:*`, `nexus:approval:*`, `nexus:canvas:*`, `nexus:gmail:*`, `nexus:wa_*`, `nexus:dm:*`, `nexus:activation:*`, `nexus:task_state:*`, `nexus:loop_state:*`, `nexus:stats`, `nexus:notifications`

### File System (Current)

From `files.ts`, base directories map virtual paths to system paths:
```
/Home     -> {dataDirectory}/home
/Trash    -> {dataDirectory}/trash
/Apps     -> {dataDirectory}/app-data
/External -> {dataDirectory}/external
/Backups  -> {dataDirectory}/backups
/Network  -> {dataDirectory}/network
```

**All users share the same flat directory tree.** There is no per-user isolation at the filesystem level.

### App Architecture (Current)

- App templates cloned from `appStore.getAppTemplateFilePath(appId)` via rsync
- Data directory: `{dataDirectory}/app-data/{appId}/`
- Compose files at: `{dataDirectory}/app-data/{appId}/docker-compose.yml`
- `patchComposeFile()` modifies ports (binds to `127.0.0.1:{manifest.port}:{internalPort}`), fixes container names, handles GPU passthrough
- Container naming: `{appId}_{serviceName}_1`
- Caddy receives subdomain registrations stored in Redis, rebuilds Caddyfile

### Nexus-Core (AI Backend)

- Runs on port 3200, authenticated via `X-API-Key` header (LIV_API_KEY)
- Also verifies JWT from `/data/secrets/jwt` for some paths
- SessionManager uses `per-sender` or `global` scope -- sender ID is a string, not tied to LivOS user
- Conversations stored in Redis: `liv:ui:conv:{conversationId}`

---

## 1. JWT to Multi-User Session Migration

### Current State

The JWT payload is `{loggedIn: true}`. No user identity whatsoever. The proxy token payload is `{proxyToken: true}`. Both are signed with the same secret.

### Recommended Approach: Phased JWT Extension

**Phase 1: Add userId to JWT payload (backward-compatible)**

Modify `jwt.ts`:

```typescript
// New payload type
type JwtPayload = {
  loggedIn: boolean
  userId?: string    // Optional for backward compat
  role?: 'admin' | 'member'
}

export async function sign(secret: string, userId?: string, role?: string) {
  validateSecret(secret)
  const payload: JwtPayload = { loggedIn: true }
  if (userId) payload.userId = userId
  if (role) payload.role = role as any
  return jwt.sign(payload, secret, { expiresIn: ONE_WEEK, algorithm: JWT_ALGORITHM })
}

export async function verify(token: string, secret: string): Promise<JwtPayload> {
  validateSecret(secret)
  const payload = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] }) as JwtPayload
  if (payload.loggedIn !== true) throw new Error('Invalid JWT')
  return payload  // Return full payload, not just true
}
```

**Why this works:**
- Old JWTs without userId still pass validation (loggedIn: true is still checked)
- New JWTs include userId and role
- `verify()` returns the full payload instead of just `true`, so callers can extract userId
- The proxy token stays separate (it only gates app proxy access)

**Phase 2: Thread userId through auth middleware**

Modify `is-authenticated.ts` to extract and attach userId:

```typescript
export const isAuthenticated = async ({ctx, next}: MiddlewareOptions) => {
  if (ctx.dangerouslyBypassAuthentication === true) return next()
  if (ctx.transport === 'ws') return next()

  try {
    const token = ctx.request?.headers.authorization?.split(' ')[1]
    if (token === undefined) throw new Error('Missing token')
    const payload = await ctx.server.verifyToken(token)
    // Attach userId to context for downstream use
    // Falls back to 'owner' for legacy single-user JWTs
    ctx.currentUserId = payload.userId || 'owner'
    ctx.currentUserRole = payload.role || 'admin'
  } catch (error) {
    ctx.logger.error('Failed to verify token', error)
    throw new TRPCError({code: 'UNAUTHORIZED', message: 'Invalid token'})
  }

  return next()
}
```

**Dual-mode transition strategy:**
1. Deploy JWT with optional userId first
2. The owner (original user) gets `userId: 'owner'` or their new UUID
3. Old tokens in localStorage still work (userId defaults to 'owner')
4. Once multi-user UI is ready, require userId in JWT for new logins
5. Old tokens expire naturally within 1 week

**No breaking change needed.** The transition is fully backward-compatible because:
- `verify()` still checks `loggedIn: true`
- Missing `userId` defaults to `'owner'`
- Proxy token is unchanged

### Nexus-Core Alignment

Nexus-core has its own `verifyJwt()` in `auth.ts` that also checks `{loggedIn: true}`. This needs the same update to extract userId. Since both services read from `/data/secrets/jwt`, the same JWT works for both. Add userId extraction to `verifyJwt()` and pass it through the Express request.

### Confidence: HIGH
Direct analysis of `jwt.ts`, `is-authenticated.ts`, `user/routes.ts`. The backward-compatible approach is verified against the actual payload structure.

---

## 2. tRPC Context Extension

### Current State

The context creates a single `user` object (the `User` class singleton) that reads from the shared YAML file. Every procedure that accesses `ctx.user` gets the same data.

### Recommended Approach: Add currentUser Layer

**Step 1: Extend context type**

```typescript
// New type for multi-user context
type UserIdentity = {
  id: string          // UUID or 'owner'
  role: 'admin' | 'member'
}

const createContext = ({livinityd, logger}: ...) => {
  return {
    livinityd,
    server: livinityd.server,
    user: livinityd.user,       // KEEP: for backward compat and user-exists checks
    appStore: livinityd.appStore,
    apps: livinityd.apps,
    logger,
    dangerouslyBypassAuthentication: false,
    // NEW: populated by isAuthenticated middleware
    currentUserId: undefined as string | undefined,
    currentUserRole: undefined as ('admin' | 'member') | undefined,
  }
}
```

**Step 2: Create UserService (replaces direct User access for multi-user)**

The existing `User` class is tightly coupled to the single YAML store. Rather than refactoring it, introduce a new `UserService` that wraps user operations:

```typescript
class UserService {
  // For Phase 1 (before PostgreSQL migration):
  // Owner user = legacy User class (YAML)
  // Additional users = new storage (PostgreSQL when ready, or separate YAML files initially)

  async getUser(userId: string): Promise<UserData> { ... }
  async getUserPreferences(userId: string): Promise<Preferences> { ... }
  async validatePassword(userId: string, password: string): Promise<boolean> { ... }
}
```

**Step 3: Middleware chain design**

```
baseProcedure
  -> websocketLogger
  -> [publicProcedure: no auth]
  -> [privateProcedure: isAuthenticated -> resolveUser]
  -> [adminProcedure: isAuthenticated -> resolveUser -> requireAdmin]
```

The `resolveUser` middleware loads user data based on `ctx.currentUserId` and attaches it:

```typescript
const resolveUser = async ({ctx, next}: MiddlewareOptions) => {
  if (!ctx.currentUserId) {
    throw new TRPCError({code: 'UNAUTHORIZED'})
  }
  // Load user data from UserService
  const userData = await ctx.livinityd.userService.getUser(ctx.currentUserId)
  return next({
    ctx: { ...ctx, currentUser: userData }
  })
}

const requireAdmin = async ({ctx, next}: MiddlewareOptions) => {
  if (ctx.currentUserRole !== 'admin') {
    throw new TRPCError({code: 'FORBIDDEN', message: 'Admin access required'})
  }
  return next()
}
```

**Step 4: Procedure types**

```typescript
export const publicProcedure = baseProcedure
export const privateProcedure = baseProcedure.use(isAuthenticated).use(resolveUser)
export const adminProcedure = baseProcedure.use(isAuthenticated).use(resolveUser).use(requireAdmin)
```

### Migration Path for Existing Procedures

Every existing `privateProcedure` that accesses `ctx.user` needs auditing:

| Route file | Current usage | Multi-user change |
|-----------|--------------|-------------------|
| `user/routes.ts` | `ctx.user.get()` | Use `ctx.currentUser` instead |
| `user/routes.ts` | `ctx.user.setName()` | `ctx.livinityd.userService.setName(ctx.currentUserId, ...)` |
| `user/routes.ts` | `ctx.user.register()` | Only admin can create new users via new `createUser` mutation |
| `files/routes.ts` | Accesses shared files | Must scope to user's home directory |
| `apps/routes.ts` | `ctx.apps.install()` | Depends on app sharing mode (shared vs isolated) |
| `backups/routes.ts` | Global backup config | Admin-only, backs up all user data |
| `ai/routes.ts` | Conversations via Redis | Scope conversation IDs by userId |

### Confidence: HIGH
Direct analysis of `trpc.ts`, `context.ts`, `is-authenticated.ts`, and all route files.

---

## 3. YAML to SQLite Migration

### Current State

`FileStore` in `file-store.ts`:
- Reads entire YAML file on every `get()` call
- Writes entire file on every `set()` call (atomic via temp file + rename)
- PQueue(concurrency: 1) serializes writes
- `getWriteLock()` for read-modify-write transactions

This is fine for single-user but becomes problematic with multiple concurrent users writing to the same file.

### Recommended Approach: Feature-Flagged Dual-Write with SQLite (not PostgreSQL)

**Why SQLite instead of PostgreSQL:**
- LivOS is a self-hosted home server OS -- adding a PostgreSQL dependency is heavy
- SQLite handles concurrent reads excellently and serialized writes safely
- The data volume is small (user preferences, app configs, not high-throughput)
- SQLite is embedded, zero-config, zero-maintenance -- perfect for home server
- The existing codebase already has TODO comments mentioning SQLite migration (`files.ts`: "TODO: This should really be in a proper DB, refactor this once we've moved to SQLite")
- If PostgreSQL is already available via Docker for Nexus, it could be used, but SQLite is simpler and more aligned with the self-hosted philosophy

**Migration strategy:**

```
Phase 1: Create new UserStore (SQLite)
  - users table: id, name, hashedPassword, totpUri, role, createdAt
  - user_preferences table: userId, key, value (JSON)
  - Keep owner data in YAML during transition

Phase 2: Dual-write mode
  - FEATURE_FLAG: multiUser = false (default)
  - When false: reads from YAML, writes to both YAML + SQLite
  - When true: reads from SQLite, writes to SQLite only
  - Migration script copies YAML owner data into SQLite

Phase 3: YAML becomes read-only fallback
  - SQLite is source of truth
  - YAML still exists for backward compat (read-only)
  - New user data only in SQLite
```

**Schema design:**

```sql
-- Core users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- UUID or 'owner' for migration
  name TEXT NOT NULL,
  hashed_password TEXT NOT NULL,
  totp_uri TEXT,
  role TEXT NOT NULL DEFAULT 'member',  -- 'admin' or 'member'
  wallpaper TEXT DEFAULT 'aurora',
  language TEXT DEFAULT 'en',
  temperature_unit TEXT DEFAULT 'celsius',
  accent_color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- App installations per user (for isolated apps)
CREATE TABLE user_apps (
  user_id TEXT NOT NULL REFERENCES users(id),
  app_id TEXT NOT NULL,
  auto_start BOOLEAN DEFAULT true,
  PRIMARY KEY (user_id, app_id)
);

-- Shared system settings (admin-only)
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL  -- JSON
);

-- User-specific preferences
CREATE TABLE user_preferences (
  user_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,  -- JSON
  PRIMARY KEY (user_id, key)
);
```

**FileStore adapter pattern:**

Create a `SqliteStore` that implements the same interface as `FileStore` so existing code can be migrated gradually:

```typescript
class SqliteStore<T> {
  async get(property?: string, defaultValue?: any) { ... }
  async set(property: string, value: any) { ... }
  async delete(property: string) { ... }
  async getWriteLock(job: Function) { ... }
}
```

### Data to Migrate vs Keep

| Current YAML path | Destination | Scope |
|------------------|-------------|-------|
| `user.*` | `users` table | Per-user |
| `apps[]` | `user_apps` or shared `system_settings` | Depends on app mode |
| `widgets[]` | `user_preferences` | Per-user |
| `recentlyOpenedApps[]` | `user_preferences` | Per-user |
| `files.preferences` | `user_preferences` | Per-user |
| `files.favorites[]` | `user_preferences` | Per-user |
| `files.recents[]` | `user_preferences` | Per-user |
| `files.shares[]` | `system_settings` | Admin-managed |
| `files.networkStorage[]` | `system_settings` | Admin-managed |
| `settings.*` | `system_settings` | Admin-only |
| `backups.*` | `system_settings` | Admin-only |
| `torEnabled` | `system_settings` | Admin-only |
| `notifications[]` | `user_preferences` | Per-user |

### Confidence: HIGH
Direct analysis of `FileStore`, `StoreSchema`, and all store access patterns. The TODO comment in files.ts confirms SQLite was already planned.

---

## 4. Dynamic Proxy Middleware (App Gateway)

### Current State

The Express middleware chain in `server/index.ts` is:
```
1. cookieParser()
2. helmet (CSP, referrerPolicy)
3. Request logger
4. /app/:appId proxy (http-proxy-middleware, cache per appId)
5. WebSocket upgrade handler (checks token, routes to wss)
6. /manager-api/v1/system/update-status (legacy)
7. /api/mcp proxy -> nexus-core:3200 (proxy token auth)
8. /api/gmail proxy -> nexus-core:3200 (public)
9. /trpc (tRPC Express handler)
10. /terminal (WebSocket)
11. /api/files (public + private routers, proxy token auth)
12. /logs/ (proxy token auth)
13. Static UI (Vite proxy in dev, static files in prod)
14. Error handler
```

### Where the App Gateway Fits

The App Gateway should go **before tRPC but after the request logger**, replacing the current `/app/:appId` proxy:

```
1. cookieParser()
2. helmet
3. Request logger
4. *** NEW: App Gateway middleware ***
   - Check if request is for app subdomain (Host header)
   - Check authentication (JWT or session)
   - If unauthenticated -> redirect to login (see Section 10)
   - If authenticated -> verify user has access to this app
   - Proxy to correct port (shared app) or user-specific port (isolated app)
5. /api/mcp proxy
6. /api/gmail proxy
7. /trpc
8. /terminal
9. /api/files
10. /logs/
11. Static UI
```

**Why before tRPC:** The App Gateway handles subdomain-based routing for app access. These requests should never reach tRPC. By placing it early, we avoid unnecessary middleware execution.

**Why after helmet:** Security headers should still be applied to proxied responses.

### Implementation Pattern

```typescript
// In server/index.ts
this.app.use(createAppGateway({
  livinityd: this.livinityd,
  logger: this.logger,
  // Function to check if a request is for an app subdomain
  isAppSubdomain: (hostname: string) => {
    // Parse hostname against known subdomains from Redis
    // e.g., "nextcloud.livinity.cloud" -> appId: "nextcloud"
  },
  // Function to resolve target port
  resolveTarget: async (appId: string, userId: string) => {
    // For shared apps: return manifest.port (same as current)
    // For isolated apps: return user-specific port from allocation table
  },
  // Authentication
  authenticate: async (req: Request) => {
    // Check JWT from cookie or Authorization header
    // Return userId or null
  },
  // Authorization
  authorize: async (userId: string, appId: string) => {
    // Check if user has access to this app
  },
  // Unauthenticated redirect
  loginRedirect: (req: Request, res: Response) => {
    // Redirect to main domain login page
  },
}))
```

### Current App Proxy Analysis

The existing `/app/:appId` proxy creates `http-proxy-middleware` instances and caches them per appId:

```typescript
// Current (from server/index.ts line 171-219)
const appProxyCache = new Map<string, ReturnType<typeof createProxyMiddleware>>()
this.app.use('/app/:appId', async (request, response, next) => {
  // Find app, read manifest.port, create/cache proxy
})
```

This needs to evolve to support:
1. **Subdomain-based routing** (Host header matching instead of /app/ path prefix)
2. **Per-user port allocation** (for isolated apps)
3. **Authentication before proxy** (currently no auth on /app/ proxy)
4. **User access control** (not all users have access to all apps)

### Confidence: HIGH
Direct analysis of `server/index.ts` middleware chain and WebSocket upgrade handler.

---

## 5. Docker Compose Templating Per User

### Current State

From `app.ts`, app installation flow:
1. `Apps.install(appId)` copies template from app store via rsync
2. Creates data directory at `{dataDirectory}/app-data/{appId}/`
3. `App.patchComposeFile()` modifies the compose YAML:
   - Removes legacy `app_proxy` service
   - Exposes `127.0.0.1:{manifest.port}:{internalPort}` port mapping
   - Forces container names to `{appId}_{serviceName}_1`
   - Migrates volume paths (old `data/storage` -> new `home`)
   - Handles GPU passthrough

### Multi-User App Isolation Strategy

Apps fall into two categories:

**Shared apps** (e.g., Nextcloud, Gitea): One instance, multiple users authenticate directly in the app.
- No Docker changes needed
- One compose file, one set of containers
- App handles its own user management
- LivOS just proxies authenticated traffic

**Isolated apps** (e.g., code-server, VS Code): Each user gets their own instance.
- Need per-user compose file and containers
- Need per-user port allocation
- Need per-user data volumes

### Implementation for Isolated Apps

**Directory structure:**
```
{dataDirectory}/app-data/{appId}/                    # Shared app template/data
{dataDirectory}/app-data/{appId}/docker-compose.yml  # Shared app compose

{dataDirectory}/users/{userId}/app-data/{appId}/                    # Isolated app per-user data
{dataDirectory}/users/{userId}/app-data/{appId}/docker-compose.yml  # Per-user compose
```

**Compose cloning and modification:**

```typescript
async cloneComposeForUser(appId: string, userId: string): Promise<void> {
  const templateCompose = await this.readCompose()  // Read shared template
  const userCompose = structuredClone(templateCompose)

  // 1. Rename containers to include userId
  for (const serviceName of Object.keys(userCompose.services!)) {
    userCompose.services![serviceName].container_name =
      `${appId}_${userId}_${serviceName}_1`
  }

  // 2. Allocate unique port
  const userPort = await this.allocatePort(appId, userId)
  // Remap port bindings from manifest.port to userPort
  // 127.0.0.1:{userPort}:{internalPort}

  // 3. Remap volumes to user-specific data directory
  for (const serviceName of Object.keys(userCompose.services!)) {
    userCompose.services![serviceName].volumes =
      userCompose.services![serviceName].volumes?.map(vol => {
        // Replace shared data path with user-specific path
        return (vol as string).replace(
          `${this.dataDirectory}`,
          `${this.livinityd.dataDirectory}/users/${userId}/app-data/${appId}`
        )
      })
  }

  // 4. Isolate Docker network
  userCompose.networks = {
    default: { name: `${appId}_${userId}_net` }
  }

  // Write per-user compose
  const userComposeDir = `${this.livinityd.dataDirectory}/users/${userId}/app-data/${appId}`
  await fse.ensureDir(userComposeDir)
  await writeYaml(`${userComposeDir}/docker-compose.yml`, userCompose)
}
```

**Port allocation strategy:**

```typescript
// Allocate ports in a range for user-isolated apps
// Base: manifest.port (e.g., 8080 for code-server)
// User ports: 10000 + (userIndex * 100) + appOffset
// This gives each user up to 100 apps, supports 550 users

class PortAllocator {
  private readonly BASE_PORT = 10000
  private readonly PORTS_PER_USER = 100

  async allocate(appId: string, userId: string): Promise<number> {
    // Store allocations in SQLite or Redis
    // Check for conflicts, return allocated port
  }
}
```

### Compose Project Name Isolation

Docker compose uses the directory name as the project name by default. Since we create per-user directories, the project names will naturally be unique:

```
Project: {appId}       (shared apps in {dataDirectory}/app-data/{appId}/)
Project: {appId}       (isolated: {dataDirectory}/users/{userId}/app-data/{appId}/)
```

To avoid collision, explicitly set `COMPOSE_PROJECT_NAME`:
```typescript
// In appScript (legacy-compat/app-script.ts), pass environment:
const env = {
  COMPOSE_PROJECT_NAME: isIsolated ? `${appId}-${userId}` : appId
}
```

### Confidence: HIGH
Direct analysis of `app.ts` patchComposeFile(), compose structure, container naming, and port mapping.

---

## 6. Caddy Simplification

### Current State

From `caddy.ts`:
- `generateFullCaddyfile()` creates one block per subdomain: `{subdomain}.{mainDomain} { reverse_proxy 127.0.0.1:{port} }`
- Caddyfile is regenerated and reloaded on every app install/uninstall
- Subdomain config stored in Redis at `livos:domain:subdomains`
- Main domain config stored in Redis at `livos:domain:config`

Current Caddyfile output:
```
livinity.cloud {
    reverse_proxy 127.0.0.1:8080
}

nextcloud.livinity.cloud {
    reverse_proxy 127.0.0.1:8081
}

code-server.livinity.cloud {
    reverse_proxy 127.0.0.1:8082
}
```

### Recommended Approach: Wildcard + Internal Gateway

**Phase 1: Replace per-app blocks with wildcard**

```
*.livinity.cloud {
    reverse_proxy 127.0.0.1:8080
}

livinity.cloud {
    reverse_proxy 127.0.0.1:8080
}
```

This sends ALL subdomain traffic to livinityd (port 8080), which then routes it internally.

**Why wildcard:**
1. No Caddyfile rebuild needed when apps are installed/uninstalled
2. No Caddy reload needed (avoids brief TLS gaps)
3. Caddy handles wildcard TLS via DNS challenge (needed) or on-demand TLS
4. All routing logic moves to the App Gateway middleware (Section 4)
5. Per-user app instances don't need separate subdomains in Caddy

**Phase 2: TLS consideration**

Wildcard certs require DNS-01 challenge. Caddy supports this with DNS plugins:
```
*.livinity.cloud {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    reverse_proxy 127.0.0.1:8080
}
```

If DNS-01 is not feasible, use Caddy's `on_demand_tls`:
```
{
    on_demand_tls {
        ask http://localhost:8080/api/caddy/check  # livinityd validates subdomain
    }
}

*.livinity.cloud {
    tls {
        on_demand
    }
    reverse_proxy 127.0.0.1:8080
}
```

**Transition strategy:**

1. Add the wildcard block alongside existing per-app blocks (both work simultaneously)
2. Test that wildcard routing works via the App Gateway
3. Remove per-app blocks once App Gateway handles all routing
4. Simplify `caddy.ts` to only manage the wildcard block

**Migration code change in `caddy.ts`:**

```typescript
export function generateFullCaddyfile(config: CaddyConfig): string {
  if (!config.mainDomain) {
    return `:80 {\n\treverse_proxy 127.0.0.1:8080\n}\n`
  }

  // Wildcard block for all subdomains
  return `${config.mainDomain} {\n\treverse_proxy 127.0.0.1:8080\n}\n\n` +
         `*.${config.mainDomain} {\n\treverse_proxy 127.0.0.1:8080\n}\n`
}
```

### What Changes for App Installation

Currently `Apps.registerAppSubdomain()` creates a Caddy block and reloads. With wildcard:
- Still register the subdomain in Redis (for the App Gateway to look up port mappings)
- No Caddyfile regeneration or reload needed
- The `rebuildCaddy()` call becomes a no-op after initial wildcard setup

### Confidence: HIGH
Direct analysis of `caddy.ts`, `apps.ts` subdomain management, and Caddyfile generation. Caddy wildcard TLS is well-documented.

---

## 7. Redis Key Namespacing

### Current State: Complete Key Inventory

**livinityd keys:**
```
livos:domain:config          - Domain configuration JSON
livos:domain:subdomains      - Subdomain registrations JSON array
liv:ui:conv:{conversationId} - AI conversation data
liv:ui:convs                 - Set of conversation IDs
```

**nexus-core keys:**
```
nexus:session:{id}           - Session state JSON
nexus:session_history:{id}   - Conversation history (list)
nexus:config                 - Nexus configuration JSON
nexus:config:kimi_api_key    - Kimi API key
nexus:kimi:authenticated     - Kimi auth status
nexus:approval:{requestId}   - Tool approval requests
nexus:approval:response:{id} - Tool approval responses
nexus:approval:audit         - Audit log
nexus:canvas:{id}            - Canvas data
nexus:gmail:*                - Gmail integration
nexus:wa_*                   - WhatsApp integration
nexus:dm:*                   - DM pairing
nexus:activation:{channelId} - Channel activation mode
nexus:task_state:{key}       - Task state
nexus:loop_state:{id}        - Loop runner state
nexus:stats                  - Usage statistics
nexus:notifications          - Notification queue
nexus:active_session         - Active terminal session
nexus:inbox                  - Pending messages
nexus:wa_outbox              - WhatsApp outbox (list)
nexus:wa_contacts            - WhatsApp contacts (hash)
nexus:wa_history:{jid}       - WhatsApp history per contact
nexus:wa_pending:{from}      - Pending WhatsApp messages
nexus:skills:registries      - Skill registries
nexus:{channel}_history:{id} - Channel-specific history
nexus:{channel}:last_chat_id - Last chat ID per channel
nexus:last_reflection        - Last reflection data
nexus:webhook:rate:{id}      - Webhook rate limiting
```

### Migration Strategy: Prefix Injection, Not Key Rename

**Do NOT rename existing keys.** Instead, introduce a key resolver function:

```typescript
// Key resolver that adds user scope when needed
class RedisKeyResolver {
  // System-scoped keys (no user prefix)
  private static SYSTEM_KEYS = new Set([
    'livos:domain:config',
    'livos:domain:subdomains',
    'nexus:config',
    'nexus:config:kimi_api_key',
    'nexus:kimi:authenticated',
    'nexus:stats',
    'nexus:gmail:*',
    'nexus:skills:registries',
  ])

  // Resolve key with optional user scope
  static resolve(key: string, userId?: string): string {
    // System keys are never user-scoped
    if (this.isSystemKey(key)) return key

    // If no userId, return key as-is (backward compat)
    if (!userId) return key

    // User-scoped keys get prefixed
    // nexus:session:{id} -> nexus:user:{userId}:session:{id}
    // liv:ui:conv:{id}   -> liv:ui:user:{userId}:conv:{id}
    return this.addUserPrefix(key, userId)
  }

  private static addUserPrefix(key: string, userId: string): string {
    if (key.startsWith('nexus:session')) {
      return key.replace('nexus:session', `nexus:user:${userId}:session`)
    }
    if (key.startsWith('nexus:session_history')) {
      return key.replace('nexus:session_history', `nexus:user:${userId}:session_history`)
    }
    if (key.startsWith('liv:ui:conv')) {
      return key.replace('liv:ui:conv', `liv:ui:user:${userId}:conv`)
    }
    if (key.startsWith('nexus:approval')) {
      return key.replace('nexus:approval', `nexus:user:${userId}:approval`)
    }
    // Default: inject user:{userId}: after first namespace
    const colonIndex = key.indexOf(':')
    return `${key.slice(0, colonIndex)}:user:${userId}:${key.slice(colonIndex + 1)}`
  }
}
```

**Migration for existing data:**

For the owner user, run a one-time migration:
```typescript
async function migrateRedisKeysForOwner(redis: Redis, ownerId: string) {
  // Scan for user-scopeable keys
  const patterns = ['nexus:session:*', 'nexus:session_history:*', 'liv:ui:conv:*']
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern)
    for (const key of keys) {
      const newKey = RedisKeyResolver.resolve(key, ownerId)
      if (newKey !== key) {
        await redis.rename(key, newKey)
      }
    }
  }
  // Migrate the conversation set
  const convIds = await redis.smembers('liv:ui:convs')
  if (convIds.length > 0) {
    await redis.sadd(`liv:ui:user:${ownerId}:convs`, ...convIds)
    await redis.del('liv:ui:convs')
  }
}
```

### Keys That Should NOT Be User-Scoped

| Key pattern | Reason |
|-------------|--------|
| `livos:domain:*` | System-wide domain config |
| `nexus:config` | Global Nexus configuration |
| `nexus:config:kimi_api_key` | Shared API key |
| `nexus:kimi:authenticated` | Global auth status |
| `nexus:gmail:*` | Shared email integration |
| `nexus:wa_*` | Shared WhatsApp integration |
| `nexus:skills:registries` | System-wide skill registries |
| `nexus:stats` | Aggregate statistics |

### Keys That SHOULD Be User-Scoped

| Key pattern | Reason |
|-------------|--------|
| `nexus:session:*` | Per-user AI sessions |
| `nexus:session_history:*` | Per-user conversation history |
| `liv:ui:conv:*` | Per-user UI conversations |
| `liv:ui:convs` | Per-user conversation list |
| `nexus:approval:*` | Per-user tool approvals |
| `nexus:canvas:*` | Per-user canvas data |
| `nexus:active_session` | Per-user terminal session |
| `nexus:notifications` | Per-user notification queue |

### Confidence: HIGH
Complete key inventory derived from grep across both codebases.

---

## 8. File System Restructuring

### Current State

From `files.ts`, the base directory mapping:
```
/Home     -> {dataDirectory}/home
/Trash    -> {dataDirectory}/trash
/Apps     -> {dataDirectory}/app-data
/External -> {dataDirectory}/external
/Backups  -> {dataDirectory}/backups
/Network  -> {dataDirectory}/network
```

All files operations go through `virtualToSystemPath()` which:
1. Normalizes the path (prevents traversal attacks)
2. Splits on first segment to find base directory
3. Resolves symlinks via `realpath()` to prevent escape
4. Returns system path

### Recommended Approach: Per-User Home with Shared System Directories

**New directory structure:**
```
{dataDirectory}/
  users/
    {userId}/
      home/          # User's home directory (/Home)
      trash/         # User's trash (/Trash)
      trash-meta/    # Trash metadata
  app-data/          # SHARED: app installations (no change)
  external/          # SHARED: external storage
  backups/           # SHARED: backup repositories (admin)
  network/           # SHARED: network storage
```

**Modified base directory mapping:**

```typescript
constructor(livinityd: Livinityd, userId?: string) {
  const userDir = userId
    ? `${livinityd.dataDirectory}/users/${userId}`
    : livinityd.dataDirectory  // Fallback for single-user mode

  this.baseDirectories = new Map<BaseDirectory, string>([
    ['/Home', `${userDir}/home`],
    ['/Trash', `${userDir}/trash`],
    ['/Apps', `${livinityd.dataDirectory}/app-data`],     // Always shared
    ['/External', `${livinityd.dataDirectory}/external`],  // Always shared
    ['/Backups', `${livinityd.dataDirectory}/backups`],    // Admin only
    ['/Network', `${livinityd.dataDirectory}/network`],    // Always shared
  ])

  this.trashMetaDirectory = `${userDir}/trash-meta`
}
```

### Migration Strategy for Owner's Existing Files

**Use symlinks for zero-downtime migration:**

```typescript
async migrateOwnerFiles(ownerId: string) {
  const ownerDir = `${this.dataDirectory}/users/${ownerId}`

  // 1. Create user directory
  await fse.ensureDir(ownerDir)

  // 2. Move existing home to user directory
  await fse.move(
    `${this.dataDirectory}/home`,
    `${ownerDir}/home`
  )

  // 3. Create symlink for backward compatibility
  // Any code still using the old path will follow the symlink
  await fse.symlink(`${ownerDir}/home`, `${this.dataDirectory}/home`)

  // 4. Same for trash
  await fse.move(`${this.dataDirectory}/trash`, `${ownerDir}/trash`)
  await fse.symlink(`${ownerDir}/trash`, `${this.dataDirectory}/trash`)

  // 5. Same for trash-meta
  await fse.move(`${this.dataDirectory}/trash-meta`, `${ownerDir}/trash-meta`)
  await fse.symlink(`${ownerDir}/trash-meta`, `${this.dataDirectory}/trash-meta`)
}
```

**Why symlinks work here:**
- `virtualToSystemPath()` resolves symlinks via `fse.realpath()` as a security check
- The security check verifies the resolved path starts with the base directory
- Since the symlink resolves to `{dataDirectory}/users/{ownerId}/home` which is still under `{dataDirectory}`, it passes validation
- However, we need to update the base directory check to accept the `users/` subdirectory

**Symlink removal timeline:**
1. Deploy with symlinks (backward compat)
2. After confirming all code paths use the new user-scoped Files instance
3. Remove symlinks, update any remaining hardcoded paths

### Permission Model

```typescript
async getAllowedOperations(virtualPath: string, userId: string): Promise<FileOperation[]> {
  const operations = new Set(ALL_OPERATIONS)

  // ... existing operation filtering ...

  // NEW: Multi-user access control
  if (virtualPath.startsWith('/Backups')) {
    // Only admin can access backups
    if (!this.isAdmin(userId)) {
      return []  // No operations allowed
    }
  }

  // Users can only access their own /Home and /Trash
  // /Apps, /External, /Network are shared with appropriate permissions

  return Array.from(operations)
}
```

### Confidence: HIGH
Direct analysis of `files.ts` virtualToSystemPath(), base directories, symlink handling, and permission model.

---

## 9. App Manifest Extension

### Current State

From `schema.ts`, the AppManifest type:
```typescript
{
  manifestVersion, id, disabled, name, tagline, icon, category, version,
  port, description, website, developer, submitter, submission, repo,
  support, gallery, releaseNotes, dependencies, permissions, path,
  defaultUsername, defaultPassword, deterministicPassword,
  optimizedForLivinityHome, torOnly, installSize, widgets,
  defaultShell, implements, backupIgnore
}
```

**Note:** `validateManifest()` currently does NOT use Zod validation in production (line 96: `return parsed as AppManifest`). It just validates manifestVersion.

### Recommended Extension

Add a `multiUser` field to the manifest:

```typescript
const AppManifestSchema = z.object({
  // ... existing fields ...

  // NEW: Multi-user behavior
  multiUser: z.object({
    mode: z.enum(['shared', 'isolated']).default('shared'),
    // For shared mode: does the app handle its own users?
    internalAuth: z.boolean().default(false),
    // For isolated mode: max instances (0 = unlimited)
    maxInstances: z.number().int().default(0),
    // Resources per isolated instance
    resources: z.object({
      memoryLimit: z.string().optional(),  // e.g., "512m"
      cpuLimit: z.string().optional(),     // e.g., "0.5"
    }).optional(),
  }).optional(),
})
```

### Backward Compatibility

Since `validateManifest()` already skips Zod validation and returns `parsed as AppManifest`, adding the optional field is fully backward-compatible:

```typescript
export function validateManifest(parsed: unknown): AppManifest {
  if (!isRecord(parsed)) throw new Error('invalid manifest')
  parsed.manifestVersion = tryNormalizeVersion(parsed.manifestVersion)

  // Default multiUser behavior for existing manifests
  if (!parsed.multiUser) {
    parsed.multiUser = { mode: 'shared', internalAuth: false }
  }

  return parsed as AppManifest
}
```

**Existing apps without `multiUser` in their YAML manifest** will default to `shared` mode, which matches current behavior exactly (one instance, all users access via proxy).

### App Mode Decision Guide

| App | Mode | Rationale |
|-----|------|-----------|
| Nextcloud | shared + internalAuth | Has its own user system |
| Gitea | shared + internalAuth | Has its own user system |
| Jellyfin | shared + internalAuth | Has its own user system |
| code-server | isolated | Per-user workspace |
| Portainer | shared | Admin-only tool |
| Home Assistant | shared | Single home automation instance |
| n8n | shared or isolated | Depends on use case |
| Uptime Kuma | shared | Monitoring is system-wide |

### Confidence: HIGH
Direct analysis of `schema.ts`, `validateManifest()`, and the existing manifest structure.

---

## 10. Login Page Routing

### Current State

From `server/index.ts`:
- The UI is served as static files at the root path `/`
- In production: `express.static(uiPath)` with `app.use('*', express.static('index.html'))` as SPA fallback
- In dev: proxied to Vite dev server
- The React frontend handles login/not-logged-in state client-side

Currently, when you hit `nextcloud.livinity.cloud`, Caddy proxies to the app port directly. There is no authentication layer -- you go straight to Nextcloud's own login.

### Problem Statement

With multi-user and wildcard Caddy, ALL subdomain requests come to livinityd on port 8080. When an unauthenticated user hits `code-server.livinity.cloud`, we need to:
1. Detect they are not authenticated
2. Show a login page
3. After login, redirect to the app

### Recommended Approach: Auth-Gated App Gateway

```typescript
// In the App Gateway middleware (from Section 4)
async function appGatewayMiddleware(req: Request, res: Response, next: NextFunction) {
  const hostname = req.hostname

  // 1. Check if this is a subdomain request
  const appId = resolveAppFromHostname(hostname)
  if (!appId) {
    // Not an app subdomain, pass through to normal routes
    return next()
  }

  // 2. Check authentication
  const userId = await authenticateRequest(req)

  if (!userId) {
    // 3. Unauthenticated: serve login page or redirect
    if (req.accepts('html')) {
      // Browser request: redirect to main domain login with return URL
      const returnUrl = `https://${hostname}${req.originalUrl}`
      return res.redirect(`https://${mainDomain}/login?redirect=${encodeURIComponent(returnUrl)}`)
    } else {
      // API request: return 401
      return res.status(401).json({ error: 'Authentication required' })
    }
  }

  // 4. Authenticated: check authorization
  const hasAccess = await checkAppAccess(userId, appId)
  if (!hasAccess) {
    return res.status(403).send('Access denied')
  }

  // 5. Proxy to app
  const target = await resolveAppTarget(appId, userId)
  return proxyToApp(req, res, target)
}
```

### Login Flow for Subdomain Requests

```
User visits code-server.livinity.cloud
  -> Caddy wildcard catches *.livinity.cloud
  -> Forwards to livinityd:8080
  -> App Gateway detects subdomain "code-server"
  -> No valid JWT/session cookie
  -> Redirect to livinity.cloud/login?redirect=https://code-server.livinity.cloud
  -> User logs in on main domain
  -> Frontend receives JWT, stores in localStorage
  -> Frontend also receives a session cookie (LIVINITY_SESSION) that works across subdomains
  -> Redirect back to code-server.livinity.cloud
  -> App Gateway finds valid session cookie
  -> Proxies to code-server
```

### Cookie Strategy for Subdomains

The current proxy token uses `sameSite: 'lax'` which does NOT send cookies to subdomains by default. For subdomain-aware auth:

```typescript
// During login, set a domain-wide session cookie
const sessionCookie = await signSessionToken(userId)
res.cookie('LIVINITY_SESSION', sessionCookie, {
  httpOnly: true,
  expires: new Date(Date.now() + ONE_WEEK),
  sameSite: 'lax',
  domain: `.${mainDomain}`,  // Leading dot = all subdomains
  secure: true,               // HTTPS only
})
```

**Key:** The `domain: '.livinity.cloud'` ensures the cookie is sent on requests to `code-server.livinity.cloud`, `nextcloud.livinity.cloud`, etc.

### Server-Side Session vs JWT for Subdomains

For subdomain auth, a server-side session is safer than a JWT:
- JWT in localStorage cannot be sent to subdomains (different origin, different localStorage)
- A httpOnly cookie with `domain=.livinity.cloud` can
- The session cookie contains a signed session ID, not the full JWT
- Server looks up session data (userId, role) from Redis

```typescript
// Session token: lightweight signed reference
function signSessionToken(userId: string, secret: string): string {
  return jwt.sign({ sid: randomToken(32), userId }, secret, {
    expiresIn: '7d',
    algorithm: 'HS256'
  })
}
```

### Confidence: HIGH
Direct analysis of cookie handling in `user/routes.ts`, Express middleware chain, and Caddy configuration. The domain-scoped cookie strategy is standard web practice.

---

## Component Dependency Graph

### New Components

| Component | Description | Depends On |
|-----------|------------|------------|
| **UserService** | Multi-user CRUD, replaces singleton User for multi-user ops | SQLite (or YAML initially) |
| **UserStore (SQLite)** | Database for user accounts and preferences | SQLite library (better-sqlite3) |
| **AppGateway** | Subdomain routing + auth + user access control | UserService, PortAllocator |
| **PortAllocator** | Manages per-user port assignments for isolated apps | Redis or SQLite |
| **RedisKeyResolver** | Adds user scope to Redis keys | None |
| **SessionMiddleware** | Domain-wide cookie-based sessions | Redis |

### Modified Components

| Component | Modification | Impact |
|-----------|-------------|--------|
| `jwt.ts` | Add userId/role to payload | LOW (additive) |
| `is-authenticated.ts` | Extract userId from JWT, add resolveUser middleware | MEDIUM |
| `context.ts` | Add currentUserId, currentUserRole, currentUser fields | MEDIUM |
| `trpc.ts` | Add adminProcedure, update privateProcedure chain | MEDIUM |
| `User` class | Keep for owner backward compat, delegate to UserService | LOW |
| `Files` class | Accept userId, scope base directories per user | HIGH |
| `Apps` class | Add isolated app management, per-user install | HIGH |
| `App` class | Add cloneComposeForUser, user-scoped containers | HIGH |
| `caddy.ts` | Simplify to wildcard block | LOW |
| `server/index.ts` | Add AppGateway middleware, session cookie handling | HIGH |
| `user/routes.ts` | Multi-user login, user management (admin) | HIGH |
| `AiModule` | Scope conversations by userId | MEDIUM |
| `SessionManager` (nexus) | Use RedisKeyResolver for user-scoped keys | MEDIUM |

### Unchanged Components

| Component | Why Unchanged |
|-----------|---------------|
| `AppStore` | App templates are system-wide, no user scoping needed |
| `Backups` | System-wide backup (all user data), admin-only |
| `Dbus` | System-level, not user-scoped |
| `EventBus` | Can add user filtering later, not needed for initial multi-user |
| `Notifications` | System-level notifications (can scope later) |
| `Migration` | Startup migrations don't need user context |

---

## Suggested Build Order

Based on dependency analysis, here is the recommended build order. Each step builds on the previous.

### Phase 1: Foundation (No visible change, backward-compatible)

**1A. JWT Extension**
- Add optional `userId` and `role` to JWT payload
- Update `verify()` to return full payload
- `is-authenticated.ts` extracts userId (defaults to 'owner')
- Zero breaking changes -- old tokens still work

**1B. tRPC Context Extension**
- Add `currentUserId`, `currentUserRole` to context type
- Create `resolveUser` middleware
- Create `adminProcedure`
- All existing `privateProcedure` routes continue to work (userId defaults to 'owner')

**1C. SQLite Schema + UserService**
- Install better-sqlite3
- Create schema (users, user_preferences, user_apps, system_settings)
- Create UserService class
- Migration: copy owner data from YAML to SQLite
- Feature flag: still reads from YAML, dual-writes to SQLite

### Phase 2: Core Multi-User (New functionality)

**2A. Multi-User Login**
- Create additional users (admin-only mutation)
- Login returns JWT with userId and role
- Domain-wide session cookie for subdomain auth
- UI: user selection on login screen (or single password field with user dropdown)

**2B. Per-User File System**
- Create `{dataDirectory}/users/{userId}/home/` structure
- Migrate owner files with symlinks
- Files class accepts userId, scopes base directories
- Each user gets own /Home and /Trash

**2C. Redis Key Migration**
- Deploy RedisKeyResolver
- Run owner key migration
- All new user data uses scoped keys
- AI conversations scoped per user

### Phase 3: App Isolation

**3A. Wildcard Caddy**
- Switch to wildcard Caddyfile
- All subdomain traffic routes to livinityd

**3B. App Gateway Middleware**
- Insert in Express middleware chain
- Subdomain detection from Host header
- Auth check via session cookie
- Login redirect for unauthenticated requests

**3C. App Manifest Extension**
- Add `multiUser` field to schema
- Default existing apps to `shared` mode
- Implement isolated app compose cloning
- Port allocation for isolated instances

### Phase Ordering Rationale

1. **Phase 1 before Phase 2** because: Phase 2 needs userId in JWT and tRPC context. Phase 1 is purely additive with no breaking changes, making it safe to deploy independently.

2. **2A (login) before 2B (files)** because: Files need to know which user is requesting. Login provides the userId that scopes file access.

3. **2B (files) before 2C (Redis)** because: File system restructuring is the most impactful change for user experience. Redis key scoping is invisible to users but needed for data isolation.

4. **Phase 3 after Phase 2** because: App isolation is the most complex feature and depends on having multi-user auth, file scoping, and Redis scoping already working. The wildcard Caddy change is technically independent but makes more sense alongside the App Gateway.

5. **3A (Caddy) before 3B (gateway)** because: The App Gateway assumes all subdomain traffic reaches livinityd, which requires the wildcard Caddy setup.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Global User Object
**What:** Continuing to access `ctx.user` (the singleton) for multi-user operations.
**Why bad:** All users see the same data, no isolation.
**Instead:** Always use `ctx.currentUser` or `ctx.livinityd.userService.getUser(ctx.currentUserId)`.

### Anti-Pattern 2: User ID in URL Paths
**What:** `/api/users/{userId}/files` style routes where userId is a path parameter.
**Why bad:** Requires manual authorization check on every route. Easy to forget, leads to IDOR vulnerabilities.
**Instead:** Always derive userId from the authenticated JWT/session. Never trust userId from request parameters.

### Anti-Pattern 3: Shared Docker Networks for Isolated Apps
**What:** Running all user instances of an isolated app on the same Docker network.
**Why bad:** Containers can communicate with each other, breaking isolation.
**Instead:** Each isolated app instance gets its own Docker network: `{appId}_{userId}_net`.

### Anti-Pattern 4: Premature PostgreSQL
**What:** Adding PostgreSQL as a dependency for the multi-user database.
**Why bad:** Adds operational complexity to a home server. Another service to manage, update, backup.
**Instead:** Use SQLite (better-sqlite3) -- zero config, embedded, handles the data volume easily.

### Anti-Pattern 5: Big Bang Migration
**What:** Converting YAML to SQLite in one step, requiring all code to update simultaneously.
**Why bad:** High risk of bugs, hard to rollback.
**Instead:** Feature flag + dual-write. YAML remains authoritative until SQLite is verified.

---

## Sources

- All findings derived from direct codebase analysis of the following files:
  - `livos/packages/livinityd/source/index.ts` (Livinityd main class, StoreSchema)
  - `livos/packages/livinityd/source/modules/server/index.ts` (Express middleware chain)
  - `livos/packages/livinityd/source/modules/server/trpc/context.ts` (tRPC context)
  - `livos/packages/livinityd/source/modules/server/trpc/trpc.ts` (procedure types)
  - `livos/packages/livinityd/source/modules/server/trpc/index.ts` (router, routes)
  - `livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts` (auth middleware)
  - `livos/packages/livinityd/source/modules/jwt.ts` (JWT signing/verification)
  - `livos/packages/livinityd/source/modules/user/user.ts` (User class)
  - `livos/packages/livinityd/source/modules/user/routes.ts` (login, register, etc.)
  - `livos/packages/livinityd/source/modules/apps/apps.ts` (app management, Caddy)
  - `livos/packages/livinityd/source/modules/apps/app.ts` (compose patching, Docker)
  - `livos/packages/livinityd/source/modules/apps/schema.ts` (AppManifest)
  - `livos/packages/livinityd/source/modules/domain/caddy.ts` (Caddyfile generation)
  - `livos/packages/livinityd/source/modules/files/files.ts` (file system, virtual paths)
  - `livos/packages/livinityd/source/modules/utilities/file-store.ts` (YAML FileStore)
  - `livos/packages/livinityd/source/modules/ai/index.ts` (AI module, Redis conversations)
  - `nexus/packages/core/src/auth.ts` (Nexus JWT verification)
  - `nexus/packages/core/src/session-manager.ts` (Redis session management)
  - Redis key patterns from grep across `nexus/packages/core/src/*.ts`
