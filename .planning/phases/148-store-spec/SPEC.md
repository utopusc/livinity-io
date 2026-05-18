# Phase 148 — SPEC: Sectioned Store + Plugin Platform Data Model

**Milestone:** v37 Store Reimagining + Plugin Platform
**Status:** ✅ LOCKED — operator-approved 2026-05-18 (kickoff for v37 autonomous run)
**Authoritative across:** Phases 149–155
**Drafted:** 2026-05-18
**Sacred SHA footer (commit):** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

This document is the lockfile for v37. Phases 149–155 implement against the schemas, enums and TypeScript contracts below. Any drift from this spec during implementation must amend SPEC.md first (same-PR), not silently diverge.

---

## 0. Zero Server5 dependency (hard constraint)

**Operator-locked 2026-05-18:** v37 must not introduce any Server5 (`45.137.194.102`) dependency. Server5 VM destroy date is 2026-05-25. Every catalog read, install write, pubkey lookup, and plugin-bundle fetch must route to **Supabase + Vercel + GitHub + Mini PC livinityd** — Server5 is out of the topology.

### 0.1 Component placement (authoritative)

| Concern | Lives on | NOT on |
|---|---|---|
| `apps` catalog table | **Supabase Postgres** (managed by Drizzle migrations) | ~~Server5 `platform.apps`~~ |
| `install_history` audit | **Supabase Postgres** | ~~Server5~~ |
| `devices`, `device_grants`, `custom_domains` | **Supabase Postgres** (Phase 146 baseline) | ~~Server5~~ |
| Plugin bundle binaries (`.livpkg.tgz`) | **GitHub releases** on `utopusc/livinity-apps` | ~~Server5 static hosting~~ |
| Plugin pubkey registry | **GitHub raw** `livinity-apps/.signing/pubkeys.json` | ~~Server5~~ |
| Install event callback target | **Vercel** `/api/install-events` → Supabase | ~~Server5 relay~~ |
| Realtime presence + chat WS | **Supabase Realtime** (Phase 146 baseline) | ~~Server5 ws relay~~ |
| Plugin runtime + handler execution | **Mini PC livinityd** (per-user) | ~~Server5~~ |
| Apex / `*.livinity.io` HTTP | **Vercel** (apex) + **Cloudflare DNS-only** → Mini PC tunnel | ~~Server5 reverse proxy~~ |

### 0.2 Pre-v37 migration (one-shot, ships in Phase 149's first task)

Phase 149 task 0 (before any UI work):

1. **Schema migration on Supabase** — apply `0013_phase_148_add_section_enum.sql` (this SPEC §1.3) on Supabase Postgres via `mcp__supabase__apply_migration` (or `supabase db push` from local).
2. **Data sync from Server5 → Supabase** — one-time SQL dump-and-load of the 27 existing `platform.apps` rows from Server5 into Supabase `apps`. After this, Server5 `platform.apps` is considered DEAD; nothing reads from it.
3. **Vercel env update** — `DATABASE_URL` on `livinity.io` Vercel project must point to **Supabase Postgres connection string** (pooler URI for serverless). The fallback `127.0.0.1:5432/platform` literal in `platform/web/src/lib/drizzle.ts` must be removed (or made fail-loud) to prevent silent Server5 fallback during local dev. Phase 149 patches this.
4. **DNS / Caddy on Server5** — leave untouched; the cutover is purely "stop reading from Server5 in v37 code paths." Server5 VM can be destroyed on 2026-05-25 regardless.

### 0.3 Anti-regression rules (Phase 149–155)

- No new HTTP client in `platform/web` or `livos/` may point at `livinity.io/api/*` if "livinity.io" resolves to a Server5-backed endpoint. All `livinity.io` calls must terminate at Vercel.
- No new env var named `PLATFORM_API_URL`, `RELAY_URL`, or similar that could leak a Server5 hostname.
- Plugin install handler (Phase 153) **never** reaches Server5 — bundle URLs are GitHub `releases.githubusercontent.com`; signature pubkey URLs are `raw.githubusercontent.com`.
- Live verification at end of each phase: `grep -rE '45\.137\.194\.102|server5|platform-relay'` in changed code returns zero hits.

---

## 1. Section model

### 1.1 Enum values (DB-level, first-class)

```
section_enum := 'app' | 'webapp' | 'native' | 'ai' | 'plugin'
```

| Enum | UI label | Install handler | Catalog source |
|---|---|---|---|
| `app` | "Apps" | livinityd Docker compose runner (existing) | Supabase `apps` table |
| `webapp` | "Web Apps" | livinityd `webapps-repository.create` (existing) | Supabase `apps` table + Custom URL form |
| `native` | "Native" | livinityd `native-app-config` store + apt/AppImage installer (new in P150) | Supabase `apps` table |
| `ai` | "AI" | livinityd MCP/agent registry (existing core + new store wiring in P152) | Supabase `apps` table |
| `plugin` | "Plugins" | livinityd plugin loader (new in P153) | Supabase `apps` table + signed `.livpkg.tgz` URL |

### 1.2 Migration decision — ADD COLUMN (not rename)

**Decision:** Add `section section_enum NOT NULL DEFAULT 'app'`. Leave `category` column untouched. Existing 27 rows get backfilled to `'app'`.

**Rejected alternatives:**

- Renaming `category` to `section` — `category` is a sub-classifier ("automation", "media", "monitoring", etc.) used by the existing UI sidebar. Killing it loses information.
- Reusing the OSS-as-`'oss'` enum value — operator approved the rename to "Apps" with `'app'` enum value for clarity. Old DB rows had no enum at all; this is a fresh column.
- Adding `section TEXT` instead of ENUM — first-class enum gives Drizzle + tRPC + Vercel API type safety with zero runtime cost. The set is small and frozen for v37.

### 1.3 Migration file — `0013_phase_148_add_section_enum.sql`

```sql
-- Phase 148 — section enum + apps.section column
BEGIN;

CREATE TYPE section_enum AS ENUM ('app', 'webapp', 'native', 'ai', 'plugin');

ALTER TABLE apps
  ADD COLUMN section section_enum NOT NULL DEFAULT 'app';

CREATE INDEX apps_section_idx ON apps (section);

-- All 27 existing rows are Docker-compose apps → keep as 'app'. No backfill needed
-- because DEFAULT already covered them at ADD COLUMN time. Confirm with:
-- SELECT section, count(*) FROM apps GROUP BY 1;

COMMIT;
```

**Rollback** (`0013_phase_148_add_section_enum_rollback.sql`):

```sql
BEGIN;
DROP INDEX IF EXISTS apps_section_idx;
ALTER TABLE apps DROP COLUMN IF EXISTS section;
DROP TYPE IF EXISTS section_enum;
COMMIT;
```

### 1.4 Drizzle schema patch

```ts
// platform/web/src/db/schema.ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const sectionEnum = pgEnum('section_enum', [
  'app', 'webapp', 'native', 'ai', 'plugin',
]);

export const apps = pgTable('apps', {
  // ...existing columns...
  section: sectionEnum('section').notNull().default('app'),
});
```

### 1.5 Catalog API patch — `/api/apps`

- Add `?section=` query param. Unknown values → 400.
- Response row gains `section: 'app' | 'webapp' | 'native' | 'ai' | 'plugin'`.
- Auth: keep `X-Api-Key` requirement for v37. Public-browse anonymous access deferred to v38.

```ts
// platform/web/src/app/store/types.ts (additive)
export type Section = 'app' | 'webapp' | 'native' | 'ai' | 'plugin';

export interface AppSummary {
  id: string;
  name: string;
  tagline: string;
  category: string;
  section: Section;        // NEW
  icon_url: string;
  featured: boolean;
  version: string;
}
```

---

## 2. Per-section manifest schemas

Every row in `apps` carries a JSONB `manifest` column. v37 introduces **per-section variants** — same column, different shape based on `section`. Zod discriminated unions at the install-handler boundary keep this honest.

### 2.1 `app` section (Docker compose — unchanged from v36)

Same shape as today; documented here for completeness. Keys persisted in `manifest` JSONB:

```jsonc
{
  "port": 5678,                          // optional, primary HTTP port
  "subdomain": "n8n",                    // optional, override auto-derived subdomain
  "env": [                               // optional, install-time prompts
    {
      "name": "N8N_BASIC_AUTH_USER",
      "label": "Admin Username",
      "type": "string" | "password",
      "default": "admin",
      "required": true
    }
  ],
  "requiresAiProvider": false            // optional, inject broker env
}
```

The compose YAML lives in the separate `apps.docker_compose` column.

### 2.2 `webapp` section (curated WebApp)

```jsonc
{
  "url": "https://app.notion.so",        // required
  "defaultTitle": "Notion",              // optional, overrides OpenGraph fetch
  "iconOverride": "https://.../icon.png" // optional, overrides favicon scrape
}
```

Custom URL submissions (the right-click "Add WebApp" parallel) do **not** create a `apps` row — they only call `webapp.create` against the user's local livinityd. The store's WebApp section is a curated discovery layer on top, not a registry of every WebApp ever created.

### 2.3 `native` section (NEW — Phase 150 installs)

```jsonc
{
  "install": {
    "primary": "apt" | "appimage",       // required, install path
    "aptPackages": ["code"],             // required if primary='apt'
    "appimageUrl": "https://...AppImage",// required if primary='appimage'
    "appimageSha256": "abc123..."        // required if primary='appimage'
  },
  "launch": {
    "binaryPath": "/usr/bin/code",       // required, absolute path (must match nativeAppConfigSchema ABSOLUTE_PATH_RE)
    "args": ["--new-window"],            // optional, max 32, no shell metachars
    "env": {},                           // optional, no LD_*/DYLD_* keys
    "wmClassHint": "Code"                // optional, matches /^[\w-]{1,64}$/, helps X11 window discovery
  },
  "desktopEntry": {
    "name": "Visual Studio Code",        // required, .desktop Name=
    "comment": "Code editing",           // optional, .desktop Comment=
    "icon": "/usr/share/icons/.../vscode.png",  // optional, .desktop Icon=
    "categories": ["Development", "IDE"]  // optional, .desktop Categories=
  },
  "windowing": {
    "vncMode": "x11vnc",                 // 'x11vnc' (default) — reuse Phase 95 pattern
    "geometry": { "w": 1280, "h": 800 } // optional, initial X11 window size
  }
}
```

**Security gate:** install handler re-parses `manifest.launch` through `nativeAppConfigSchema` (`livos/packages/livinityd/source/modules/apps/native-app-config.ts`) — the same schema the existing tRPC route uses. No new trust boundary.

### 2.4 `ai` section (NEW — Phase 152)

Two sub-types discriminated by `kind`:

```jsonc
// kind = 'mcp'
{
  "kind": "mcp",
  "mcp": {
    "name": "github",                    // unique within user's mcpConfigManager
    "transport": "stdio" | "streamableHttp",
    "command": "npx",                    // required if transport='stdio'
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "url": "https://...",                // required if transport='streamableHttp'
    "envSchema": [                       // install-time prompts mapped to env
      { "name": "GITHUB_TOKEN", "label": "GitHub PAT", "type": "password", "required": true }
    ]
  }
}

// kind = 'agent'
{
  "kind": "agent",
  "agent": {
    "templateId": "code-reviewer",       // unique within user's agent_templates
    "systemPrompt": "You are...",
    "model": "claude-opus-4-7",          // default model, user can override post-install
    "tools": ["filesystem", "github"],   // MCP server names this agent uses
    "icon": "https://..."
  }
}

// kind = 'gsd'
{
  "kind": "gsd",
  "gsd": {
    "skillSet": "core",                  // 'core' | 'full' — which gsd-* skills to install
    "version": "1.0.0"
  }
}
```

Install handler dispatch by `manifest.kind` → routes to existing MCP/agent registry code paths. No new persistence layer.

### 2.5 `plugin` section (NEW — Phase 153, see §3)

`manifest` JSONB stores a **pointer** to the signed plugin bundle. The plugin's own manifest ships INSIDE the `.livpkg.tgz`. This separation lets the store catalog stay lightweight while the plugin internals are operator-signed and verified at install time.

```jsonc
{
  "kind": "plugin",
  "bundleUrl": "https://github.com/utopusc/livinity-apps/releases/download/v1.0.0/hello-world.livpkg.tgz",
  "bundleSha256": "abc123...",           // matches signature payload inside bundle
  "signingTier": "operator",             // 'operator' (v37) | 'verified' (v38) | 'community' (v38)
  "minLivosVersion": "37.0.0",           // refuses install if running older livinityd
  "summary": {
    "exposesRoutes": ["/p/hello-world/*"],
    "exposesWidgets": ["dock", "settings"],
    "declaresCommands": ["/hello"],
    "declaresMcps": []
  }
}
```

`summary` is a denormalized hint for the catalog UI (so /store can show "Adds dock widget + slash command" without unpacking the bundle). Authoritative truth still comes from the bundle's `plugin-manifest.json` at install time.

---

## 3. Plugin manifest spec (`plugin-manifest.json` inside `.livpkg.tgz`)

### 3.1 Bundle layout

```
hello-world.livpkg.tgz
├── plugin-manifest.json          # this spec
├── plugin-manifest.sig           # Ed25519 detached signature over plugin-manifest.json
├── backend/                      # livinityd-loadable ES modules
│   └── index.mjs                 # default export = PluginBackendModule
├── ui/                           # compiled UI assets
│   ├── bundle.umd.js             # pre-compiled UMD, mounted via plugin UI loader
│   └── styles.css                # optional, scoped via Shadow DOM by default
├── migrations/                   # optional, run at install time
│   └── 0001_init.sql
└── assets/                       # optional, static files served at /p/<id>/_assets/
    └── icon.svg
```

### 3.2 `plugin-manifest.json` schema (zod)

```ts
import { z } from 'zod';

export const PluginManifestSchema = z.object({
  manifestVersion: z.literal('1.0.0'),
  id: z.string().regex(/^[a-z0-9-]{3,64}$/),    // url-safe slug, mounts at /p/<id>/
  version: z.string().regex(/^\d+\.\d+\.\d+$/),  // strict semver
  name: z.string().min(1).max(128),
  tagline: z.string().min(1).max(160),
  description: z.string().max(4096),
  author: z.string().min(1).max(128),
  icon: z.string().url().optional(),
  website: z.string().url().optional(),
  signing: z.object({
    tier: z.enum(['operator', 'verified', 'community']),
    publicKeyId: z.string(),                     // matches a key in operator pubkey registry
    signedAt: z.string().datetime(),             // ISO-8601
  }),
  hooks: z.object({
    routes: z.array(z.object({
      path: z.string().regex(/^\/[a-zA-Z0-9_\-/]*$/),  // path relative to /p/<id>
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', '*']),
      handler: z.string(),                       // named export in backend/index.mjs
    })).optional(),
    widgets: z.array(z.object({
      mount: z.enum(['dock', 'settings', 'ai-chat', 'window-titlebar']),
      component: z.string(),                     // named export in ui bundle
      props: z.record(z.unknown()).optional(),
    })).optional(),
    commands: z.array(z.object({
      slash: z.string().regex(/^\/[a-z0-9-]+$/),  // AI Chat slash command
      handler: z.string(),                       // named export in backend
      description: z.string().max(256),
    })).optional(),
    mcps: z.array(z.object({
      name: z.string(),                          // adds to user's mcpConfigManager
      transport: z.enum(['stdio', 'streamableHttp']),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      url: z.string().url().optional(),
    })).optional(),
  }),
  capabilities: z.object({
    redis: z.array(z.object({
      keyPattern: z.string(),                    // e.g. 'liv:plugin:hello:*'
      access: z.enum(['read', 'write', 'readwrite']),
    })).optional(),
    postgres: z.array(z.object({
      table: z.string(),                         // 'plugin_hello_world.notes' fully-qualified
      access: z.enum(['read', 'write', 'readwrite']),
    })).optional(),
    filesystem: z.array(z.object({
      path: z.string(),                          // absolute, must start with '/home/<user>/' or '/opt/livos/plugins/<id>/'
      access: z.enum(['read', 'write', 'readwrite']),
    })).optional(),
    network: z.object({
      outbound: z.array(z.string()).optional(),  // hostnames or 'any'
      inbound: z.boolean().default(false),       // whether plugin accepts external webhooks
    }).optional(),
  }),
  minLivosVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  uiBundle: z.object({
    entry: z.string().default('ui/bundle.umd.js'),
    format: z.enum(['umd', 'esm']).default('umd'),
    shadowDom: z.boolean().default(true),        // CSS isolation (D-37-04)
  }).optional(),
  migrations: z.array(z.object({
    file: z.string().regex(/^migrations\/\d{4}_[a-z0-9_]+\.sql$/),
    appliedAtKey: z.string(),                    // Redis key livinityd marks as applied
  })).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
```

### 3.3 Signature verification (Ed25519)

- **Signing payload:** the raw bytes of `plugin-manifest.json` (NOT the .tgz — manifest is the trust root).
- **Signature file:** `plugin-manifest.sig` = 64-byte Ed25519 signature, hex-encoded.
- **Pubkey registry:** maintained at `livinity-apps/.signing/pubkeys.json`:

  ```jsonc
  {
    "operator-v1": {
      "tier": "operator",
      "publicKey": "ed25519:<base64-32-bytes>",
      "addedAt": "2026-05-18T00:00:00Z"
    }
  }
  ```

  v37 ships with exactly one key under tier `operator`. Phase 155 (developer portal) adds the `verified`/`community` flow.

- **Install-time check:** livinityd plugin loader downloads bundle → extracts manifest + sig → looks up `signing.publicKeyId` in local pubkey cache (synced from livinity-apps repo daily) → verifies signature → checks `signing.tier` is allowed for this LivOS install. v37 default: only `operator` allowed.

### 3.4 Capability gate (`capabilities` block)

- Plugin declares the surface it needs; livinityd enforces.
- **Redis:** wrap plugin's Redis access in a key-prefix-checking proxy. Reject `SET liv:cap:*` if plugin only declared `liv:plugin:hello:*`.
- **Postgres:** spawn a per-plugin PG role at install time, `GRANT` only on declared tables.
- **Filesystem:** plugin gets a Node `fs` proxy that rejects paths outside declared roots.
- **Network outbound:** v37 enforces via documentation/review only (operator-signed-only means trust is high). v38 adds runtime DNS filtering.

Capability violations at runtime → log + reject the operation. Plugins **must not** be killed for cap violations (one bad call shouldn't take down the whole module).

---

## 4. Install handler contracts (TypeScript interfaces)

These are the contracts every install handler implements. Phases 150–154 each provide one implementation. The dispatcher at install time uses `app.section` (+ `manifest.kind` for AI) to route to the right handler.

### 4.1 Common types

```ts
// livos/packages/livinityd/source/modules/apps/install-contracts.ts (NEW)

export type Section = 'app' | 'webapp' | 'native' | 'ai' | 'plugin';

export interface InstallContext {
  userId: string;                          // livos DB users.id
  apiKey: string;                          // user's liv_k_* key (for marketplace callbacks)
  redis: RedisLike;                        // scoped to user's namespace
  pg: pg.Pool;                             // user's local livos DB
  logger: Logger;
}

export interface InstallProgressEvent {
  appId: string;
  section: Section;
  pct: number;                             // 0–100
  message: string;
  done: boolean;
  error?: string;
}

export type ProgressEmitter = (e: InstallProgressEvent) => void;

export interface InstallResult {
  appId: string;
  section: Section;
  ok: true;
  details: {
    // section-specific install confirmations
    composeProjectName?: string;          // section='app'
    webappId?: string;                    // section='webapp'
    desktopEntryPath?: string;            // section='native'
    mcpServerName?: string;               // section='ai', kind='mcp'
    agentTemplateId?: string;             // section='ai', kind='agent'
    pluginId?: string;                    // section='plugin'
    pluginMountPath?: string;             // section='plugin', e.g. '/p/hello-world'
  };
}

export interface InstallError {
  appId: string;
  section: Section;
  ok: false;
  code:
    | 'manifest_invalid'
    | 'signature_invalid'
    | 'capability_denied'
    | 'dependency_missing'
    | 'network_failed'
    | 'disk_full'
    | 'apt_failed'
    | 'sudo_denied'
    | 'docker_failed'
    | 'plugin_load_failed'
    | 'unknown';
  message: string;
  cause?: unknown;
}

export type InstallOutcome = InstallResult | InstallError;
```

### 4.2 Handler interface

```ts
export interface InstallHandler<Section extends 'app' | 'webapp' | 'native' | 'ai' | 'plugin'> {
  readonly section: Section;
  install(
    app: AppCatalogRow,
    ctx: InstallContext,
    progress: ProgressEmitter,
  ): Promise<InstallOutcome>;
  uninstall(
    appId: string,
    ctx: InstallContext,
    progress: ProgressEmitter,
  ): Promise<InstallOutcome>;
}
```

### 4.3 Per-section handlers (one implementation per phase)

| Section | Phase | Module | Notes |
|---|---|---|---|
| `app` | (existing) | `apps.ts` | Wrap existing `installForUser` to conform to InstallHandler interface |
| `webapp` | 151 | `webapps-installer.ts` (NEW) | Delegates to `webappsRepository.create` |
| `native` | 150 | `native-installer.ts` (NEW) | apt path needs sudoers entry `bruce ALL=(root) NOPASSWD: /usr/bin/apt-get install -y *` (Phase 150 secures the wildcard) |
| `ai` | 152 | `ai-installer.ts` (NEW) | Dispatches on `manifest.kind` |
| `plugin` | 153 | `plugin-installer.ts` (NEW) | Most complex — see §5 |

### 4.4 Dispatcher

```ts
// livos/packages/livinityd/source/modules/apps/install-dispatcher.ts (NEW in P150)
export class InstallDispatcher {
  constructor(private handlers: Map<Section, InstallHandler<Section>>) {}

  async install(app: AppCatalogRow, ctx: InstallContext, emit: ProgressEmitter): Promise<InstallOutcome> {
    const h = this.handlers.get(app.section);
    if (!h) {
      return {
        appId: app.id,
        section: app.section,
        ok: false,
        code: 'unknown',
        message: `no handler registered for section=${app.section}`,
      };
    }
    return h.install(app, ctx, emit);
  }
}
```

### 4.5 Vercel-side install callback contract

When a user clicks "Install" in /store, the flow is:

1. Browser → livinityd `POST /api/marketplace/install` `{ appId, section }`
2. livinityd calls the section handler → emits progress via existing postMessage bridge → finalizes
3. livinityd → Vercel `POST /api/install-events` `{ appId, action: 'install', apiKey, instanceName }` (existing path)
4. Vercel writes to `install_history` on **Supabase Postgres** (table moved off Server5 per §0)

No protocol changes — section is opaque to the install-events API. Vercel just records the event. The endpoint MUST be `livinity.io/api/install-events` (Vercel apex) — there is no `relay.livinity.io` or Server5 callback URL in v37.

---

## 5. Plugin runtime contracts (sneak peek for §148, locks the surface Phase 153 implements)

### 5.1 Backend module contract

```ts
// What `backend/index.mjs` default-exports
export interface PluginBackendModule {
  // Called once on install (after migrations) and on every livinityd boot.
  onActivate(api: PluginRuntimeApi): Promise<void> | void;

  // Called on uninstall and on livinityd shutdown.
  onDeactivate(api: PluginRuntimeApi): Promise<void> | void;

  // Named handlers referenced by manifest.hooks.routes[].handler
  handlers: Record<string, ExpressHandler>;

  // Named slash-command handlers referenced by manifest.hooks.commands[].handler
  commands: Record<string, SlashCommandHandler>;
}

export interface PluginRuntimeApi {
  pluginId: string;
  redis: RedisLike;                        // namespaced + cap-checked
  pg: pg.Pool;                             // role-scoped to declared tables
  fs: PluginFsApi;                         // path-checked proxy
  log: Logger;
  emitEvent(name: string, payload: unknown): void;  // for inter-plugin messaging (v38)
}

export type SlashCommandHandler = (
  args: string,
  ctx: { userId: string; sessionId: string },
) => Promise<string>;  // returns string injected into AI chat as tool result
```

### 5.2 UI bundle contract (UMD)

```js
// ui/bundle.umd.js — UMD wrapper, registers components on window.LivinityPlugin
(function (factory) { /* UMD prelude */ })(function () {
  return {
    // Named exports must match manifest.hooks.widgets[].component values
    DockWidget: function DockWidget(props) { /* React component */ },
    SettingsPanel: function SettingsPanel(props) { /* React component */ },
  };
});
```

The UI plugin loader reads the bundle, mounts components into the registered hook points (dock, settings, etc.) using `React.createPortal` into a per-plugin mount node. Shadow DOM is enabled by default for CSS isolation.

### 5.3 Hot-reload protocol

- **Install:** livinityd dynamic-imports `backend/index.mjs?v=<install-ts>` → calls `onActivate` → mounts Express subrouter under `/p/<id>/`. Broadcasts `plugin:installed` over the existing WebSocket. UI clients fetch new bundle URL, inject without reload.
- **Uninstall:** livinityd calls `onDeactivate` → unmounts subrouter (using a wrapping dispatcher middleware that filters by plugin-id; Express has no direct route removal). UI broadcasts `plugin:uninstalled`. Clients tear down mount nodes.
- **Version bump:** treated as uninstall-then-install. Old module's memory leak is acceptable in v37 (operator-signed, low install frequency); v38 may add full module cache eviction.

---

## 6. Reference manifests (one per section)

These five JSON blobs are the canonical install-time examples. Phase 149's UI design uses them as fixtures; Phases 150–154 use them as the smoke test.

### 6.1 `app` — n8n (existing in DB, no change)

```jsonc
{
  "section": "app",
  "id": "n8n",
  "name": "n8n",
  "tagline": "Workflow automation for technical people",
  "category": "automation",
  "version": "1.76.1",
  "manifest": {
    "port": 5678,
    "subdomain": "n8n",
    "env": [
      { "name": "N8N_BASIC_AUTH_USER", "label": "Admin Username", "type": "string", "default": "admin", "required": true },
      { "name": "N8N_BASIC_AUTH_PASSWORD", "label": "Admin Password", "type": "password", "required": true }
    ]
  }
}
```

### 6.2 `webapp` — Notion

```jsonc
{
  "section": "webapp",
  "id": "notion",
  "name": "Notion",
  "tagline": "Your wiki, docs, and projects in one place",
  "category": "productivity",
  "version": "1.0.0",
  "manifest": {
    "url": "https://www.notion.so",
    "defaultTitle": "Notion",
    "iconOverride": "https://www.notion.so/images/favicon.ico"
  }
}
```

### 6.3 `native` — VSCode (apt path)

```jsonc
{
  "section": "native",
  "id": "vscode",
  "name": "Visual Studio Code",
  "tagline": "Code editing. Redefined.",
  "category": "development",
  "version": "1.95.0",
  "manifest": {
    "install": {
      "primary": "apt",
      "aptPackages": ["code"]
    },
    "launch": {
      "binaryPath": "/usr/bin/code",
      "args": ["--new-window"],
      "wmClassHint": "Code"
    },
    "desktopEntry": {
      "name": "Visual Studio Code",
      "comment": "Code editing. Redefined.",
      "icon": "/usr/share/icons/vscode.png",
      "categories": ["Development", "IDE"]
    },
    "windowing": {
      "vncMode": "x11vnc",
      "geometry": { "w": 1440, "h": 900 }
    }
  }
}
```

### 6.4 `ai` — GitHub MCP

```jsonc
{
  "section": "ai",
  "id": "mcp-github",
  "name": "GitHub MCP",
  "tagline": "Repos, issues, PRs and code search from Claude",
  "category": "developer-tools",
  "version": "0.6.0",
  "manifest": {
    "kind": "mcp",
    "mcp": {
      "name": "github",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "envSchema": [
        { "name": "GITHUB_TOKEN", "label": "GitHub Personal Access Token", "type": "password", "required": true }
      ]
    }
  }
}
```

### 6.5 `plugin` — hello-world (Phase 153 reference)

```jsonc
{
  "section": "plugin",
  "id": "hello-world",
  "name": "Hello World",
  "tagline": "Reference plugin for the LivOS plugin SDK",
  "category": "developer-tools",
  "version": "1.0.0",
  "manifest": {
    "kind": "plugin",
    "bundleUrl": "https://github.com/utopusc/livinity-apps/releases/download/hello-world-1.0.0/hello-world.livpkg.tgz",
    "bundleSha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "signingTier": "operator",
    "minLivosVersion": "37.0.0",
    "summary": {
      "exposesRoutes": ["/p/hello-world/ping"],
      "exposesWidgets": ["dock"],
      "declaresCommands": ["/hello"],
      "declaresMcps": []
    }
  }
}
```

Corresponding `plugin-manifest.json` (inside the bundle):

```jsonc
{
  "manifestVersion": "1.0.0",
  "id": "hello-world",
  "version": "1.0.0",
  "name": "Hello World",
  "tagline": "Reference plugin",
  "description": "Demonstrates routes + dock widget + slash command.",
  "author": "Livinity",
  "signing": {
    "tier": "operator",
    "publicKeyId": "operator-v1",
    "signedAt": "2026-05-18T00:00:00Z"
  },
  "hooks": {
    "routes": [
      { "path": "/ping", "method": "GET", "handler": "pingHandler" }
    ],
    "widgets": [
      { "mount": "dock", "component": "DockWidget" }
    ],
    "commands": [
      { "slash": "/hello", "handler": "helloCommand", "description": "Say hello" }
    ]
  },
  "capabilities": {
    "redis": [{ "keyPattern": "liv:plugin:hello-world:*", "access": "readwrite" }]
  },
  "minLivosVersion": "37.0.0",
  "uiBundle": { "entry": "ui/bundle.umd.js", "format": "umd", "shadowDom": true }
}
```

---

## 7. What this spec does NOT cover (defer to next phases)

- **Phase 149**: visual design of section nav, grid cards, detail modal. SPEC.md only fixes the data contract; layout is a UI phase decision.
- **Phase 150**: sudoers entry exact path + cleanup-on-uninstall behavior for apt packages (uninstall is best-effort; we never apt-remove shared packages).
- **Phase 151**: Custom URL phishing mitigations (CSP, URL allow-list). Mentioned in v37-DRAFT risks.
- **Phase 152**: which 10 MCPs ship pre-seeded (list locked in v37-DRAFT §"MCP Market initial seed").
- **Phase 153**: hot-reload edge cases (in-flight WebSocket connections during uninstall, plugin migrations on rollback).
- **Phase 154**: how the broker plugin's per-plugin Postgres tables migrate from the current livinityd-owned schema.
- **Phase 155**: developer portal submission flow — PR template, signature review tooling.

These are intentional gaps: each downstream phase owns its own DISCUSS/PLAN cycle and can amend SPEC.md if implementation reality contradicts the contract here.

---

## 8. Acceptance checklist (Phase 148)

- [x] Zero-Server5 constraint locked + component placement table (§0)
- [x] Section enum decision: ADD COLUMN with default 'app' (§1.2)
- [x] Migration SQL drafted — targets **Supabase Postgres** (§1.3)
- [x] Drizzle schema patch documented (§1.4)
- [x] 5 reference manifests written (§6.1–6.5)
- [x] Plugin manifest schema written (§3.2)
- [x] Plugin bundle + pubkey hosting on **GitHub only** (§0.1, §3.3, §6.5)
- [x] Install handler TypeScript interfaces drafted (§4.1–4.4)
- [x] Plugin runtime contracts sneak-peeked (§5)
- [x] Operator review PASS — 2026-05-18 via `/gsd-autonomous` kickoff after §0 Zero-Server5 amendment
- [x] Commit SPEC.md — see [SUMMARY.md](SUMMARY.md)

---

## 9. Resume after /clear

If returning fresh:

1. Open `.planning/v37-DRAFT.md` for milestone context
2. Open this file (SPEC.md) for the data contract lockfile
3. Operator says "148 onayla" → commit with sacred SHA footer, push, then `/gsd-plan-phase 149`
4. Operator says "X bölümünü değiştir" → amend SPEC.md, re-show diff, await re-approval

See also: [[project-v37-draft]], [[project-broker-plugin-direction]].
