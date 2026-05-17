# How to Add an App to the Livinity Marketplace

**Audience:** Bruce + future ops team
**Target system:** Server5 (`45.137.194.102`, `apps.livinity.io` / `livinity.io/store`)
**Updated:** 2026-05-17 (Phase 141)

The marketplace at `apps.livinity.io` reads from a single PostgreSQL table —
`platform.apps` on Server5. To publish a new app you insert one row. There is
no auto-sync from a GitHub repo (the `livinity-apps` repo on disk is reference
material only — the DB is the source of truth).

This walk-through uses **n8n** as the worked example because it's already
shipping (`featured=true`, `sort_order=2`) and exercises every field.

---

## 1. The schema (read-only reference)

```
                       Table "public.apps"
     Column     |  Type   | Nullable |       Default
----------------+---------+----------+---------------------
 id             | uuid    | not null | gen_random_uuid()
 slug           | text    | not null |          (UNIQUE)
 name           | text    | not null |
 tagline        | text    | not null |
 description    | text    | not null |
 category       | text    | not null |
 version        | text    | not null | '1.0.0'
 docker_compose | text    | not null |
 manifest       | jsonb   | not null |
 icon_url       | text    | not null |
 featured       | boolean | not null | false
 verified       | boolean | not null | false
 sort_order     | integer |          | 100
 created_at     | timestamptz |      | now()
 updated_at     | timestamptz |      | now()

Indexes:
  PRIMARY KEY (id)
  UNIQUE (slug)             ← the slug is the public identifier
  INDEX  (category)
  PARTIAL INDEX (featured) WHERE featured = true
```

**Foreign key:** `install_history.app_id → apps.id`. Don't delete an app row
without first cleaning install_history (or rely on cascade — currently no
cascade is set, so deletes will fail when the app has any history).

---

## 2. Fields explained

| Field | Type | Purpose | n8n value |
|---|---|---|---|
| `slug` | text (UNIQUE) | Public identifier used in URLs (`/store/n8n`), API calls (`POST /api/me/app-subdomain {app_slug: "n8n"}`), and on the Mini PC livinityd side. Must be lowercase, dash-separated, no dots, valid as a Cloudflare DNS label fragment (it becomes part of `{slug}-{user}.livinity.io`). | `n8n` |
| `name` | text | Display name shown in the store card and on the install screen. | `n8n` |
| `tagline` | text | One-line subtitle under the name on the store card. Keep under 60 chars. | `Workflow automation for technical people` |
| `description` | text | Long description on the app detail page. Plain text or markdown. | (paragraph) |
| `category` | text | Free-text bucket for the filter sidebar. Existing categories (use one unless you have a strong reason to add a new one): `developer-tools`, `productivity`, `media`, `cloud-storage`, `management`, `ai`, `privacy`, `development`, `networking`, `automation`, `communication`, `photography`, `security`, `dashboards`, `monitoring`. | `automation` |
| `version` | text | Pinned upstream version. Update on each curated bump. Display-only — the actual image tag lives in `docker_compose`. | `1.76.1` |
| `docker_compose` | text | Full `docker-compose.yml` content as a single string. See §3. | (see below) |
| `manifest` | jsonb | LivOS app manifest (port, subdomain, env). See §4. | `{"port":5678,"subdomain":"n8n","env":[...]}` |
| `icon_url` | text | HTTPS URL to a square PNG/SVG. Prefer the project's official asset URL on GitHub. Fall back to a self-hosted file under `apps.livinity.io/icons/{slug}.png` if upstream doesn't serve one. | `https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png` |
| `featured` | boolean | If `true`, the app shows in the "Featured" rail on the store homepage. Use sparingly — currently 7 apps. | `true` |
| `verified` | boolean | Trust badge on the store card. Set `true` only after you have run the app on a test box end-to-end (install, login, basic feature works, uninstall clean). | `true` |
| `sort_order` | integer | Ordering within the featured rail and category lists. Lower wins. Featured-rail current order: chrome=1, n8n=2, ollama=3, open-webui=4, jellyfin=5, immich=6, bolt-diy=100. Pick a value that puts your app where you want it. | `2` |

---

## 3. `docker_compose` field — what to put in it

This field is the literal contents of the app's `docker-compose.yml`. The
Mini PC livinityd reads this string, writes it to disk as
`/opt/livos/data/app-data/{slug}/docker-compose.yml`, then runs
`docker compose up -d` against it.

**n8n example (the production string in Server5's DB right now):**

```yaml
version: "3.8"
services:
  n8n:
    image: n8nio/n8n:1.76.1
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
    volumes:
      - n8n_data:/home/node/.n8n
volumes:
  n8n_data:
```

**Rules:**

1. **Pin the image tag.** Never use `:latest` — install behavior must be
   reproducible. Bump the tag when you bump `version`.
2. **Expose the app on `127.0.0.1:{manifest.port}`.** The `ports:` mapping
   must match `manifest.port`. Caddy on the Mini PC reverse-proxies
   `{slug}-{user}.livinity.io → 127.0.0.1:{manifest.port}`.
3. **`container_name: {slug}`** — keeps `docker ps` readable and lets the
   single-user uninstall path target the container by name.
4. **`restart: unless-stopped`** — survives reboots without resurrecting
   after `docker rm`.
5. **Named volume per app** — pattern is `{slug}_data`. Lives on the Mini PC
   at `/var/lib/docker/volumes/{slug}_data/_data`.
6. **No host-network mode, no `privileged: true`, no bind-mounting `/`.**
   Apps run unprivileged.
7. **No env vars that hardcode the public URL.** The Mini PC's URL is
   `{slug}-{user}.livinity.io` — minted per-user. Use `localhost`/internal
   hostnames in the compose; let Caddy + CF Tunnel handle the public layer.
   (n8n's `WEBHOOK_URL=http://localhost:5678/` is an exception — n8n needs
   it but webhooks from third parties hit the public URL through the tunnel.
   If a future webhook-heavy app needs the public URL, the manifest needs to
   declare that and livinityd has to interpolate at install time; that
   plumbing isn't built yet.)

For multi-service apps (database + app, etc.) include all services in the same
compose. Example pattern:

```yaml
version: "3.8"
services:
  app:
    image: vendor/app:v1.2.3
    ports:
      - "9000:9000"
    depends_on:
      - db
  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_PASSWORD=changeme
    volumes:
      - {slug}_db:/var/lib/postgresql/data
volumes:
  {slug}_db:
```

---

## 4. `manifest` field — what to put in it

The manifest is a small JSON blob livinityd reads to know how to wire the app
into Caddy + the LivOS UI. Three top-level keys today:

```json
{
  "port": 5678,
  "subdomain": "n8n",
  "env": [
    {
      "name": "N8N_BASIC_AUTH_USER",
      "type": "string",
      "label": "Admin Username",
      "default": "admin",
      "required": true
    },
    {
      "name": "N8N_BASIC_AUTH_PASSWORD",
      "type": "password",
      "label": "Admin Password",
      "required": true
    }
  ]
}
```

| Key | Purpose |
|---|---|
| `port` | The port your app listens on inside the container. Must match the host-side `ports:` mapping in `docker_compose`. Caddy proxies `{slug}-{user}.livinity.io → 127.0.0.1:{port}`. |
| `subdomain` | Default LivOS subdomain label. Phase 140 minted hosts override this (the canonical FQDN is `{slug}-{user}.livinity.io`, not `{subdomain}.{user.livinity.io}`), so for new apps this can usually equal `slug`. Kept for legacy/local-LAN modes that still compute `${subdomain}.${mainDomain}`. |
| `env` | List of env-var prompts shown in the LivOS install dialog. Each entry: `{name, type, label, default?, required}`. `type` is `string` or `password`. Values get injected into the running container as environment variables. |

**If your app has no required prompts, send `"env": []`** (don't omit the
key — the LivOS install UI handles the empty array, but other code paths
assume the key is present).

---

## 5. Insert SQL — the template

Save as `scripts/add-marketplace-app.sql` and run on Server5 against the
`platform` DB. Replace placeholders with your app's values.

```sql
-- scripts/add-marketplace-app.sql
-- Template for adding a new app to the Livinity Marketplace.
-- Adapt the placeholders, then:
--   sudo -u postgres psql -d platform -f scripts/add-marketplace-app.sql

INSERT INTO apps (
    slug,
    name,
    tagline,
    description,
    category,
    version,
    docker_compose,
    manifest,
    icon_url,
    featured,
    verified,
    sort_order
) VALUES (
    'myapp',                                    -- slug (unique, lowercase, dash-separated)
    'MyApp',                                    -- name
    'One-line tagline shown on the store card', -- tagline
    'A longer description for the detail page. Plain text or markdown.',
    'productivity',                             -- category (existing bucket preferred)
    '1.0.0',                                    -- version (display-only; compose pins the image)
    $compose$
version: "3.8"
services:
  myapp:
    image: vendor/myapp:1.0.0
    container_name: myapp
    restart: unless-stopped
    ports:
      - "9000:9000"
    volumes:
      - myapp_data:/data
volumes:
  myapp_data:
$compose$,
    '{
        "port": 9000,
        "subdomain": "myapp",
        "env": []
    }'::jsonb,
    'https://example.com/icons/myapp.png',      -- icon_url
    false,                                      -- featured
    false,                                      -- verified (set true AFTER you smoke-test it end-to-end)
    100                                         -- sort_order (lower wins)
);
```

Dollar-quoted strings (`$compose$...$compose$`) keep the YAML readable
without escaping every quote. They also dodge shell-side `$$` expansion when
this file is piped from the command line.

---

## 6. End-to-end checklist for shipping a new app

Run through every step. Don't set `verified=true` until step 6 passes.

1. **Pick a slug.** Lowercase, dash-separated, no dots, ≤30 chars. Make sure
   it doesn't collide with any Phase 140 reserved word (username validator
   blocks app-slug collisions, see `platform/web/src/lib/username-validator.ts`).
2. **Test the docker-compose locally first.** On any Linux box:
   `docker compose -f docker-compose.yml up -d` → curl
   `http://127.0.0.1:{port}` → confirms it works in isolation.
3. **Write the manifest.** Decide env prompts, port, default subdomain.
4. **Compose the INSERT SQL.** Use the template in §5.
5. **Run the INSERT on Server5.**
   ```bash
   ssh -i .../pem/contabo_master root@45.137.194.102 \
     "sudo -u postgres psql -d platform -f /tmp/add-myapp.sql"
   ```
   (scp the SQL first, or pipe inline.) Confirm with:
   ```sql
   SELECT slug, name, featured, verified, sort_order FROM apps WHERE slug='myapp';
   ```
6. **End-to-end smoke test on a fresh Mini PC:**
   - Open `apps.livinity.io/store` in a browser → the new app appears in
     the correct category.
   - On a logged-in Mini PC dashboard at `https://{user}.livinity.io`, open
     the App Store → click the app → click Install.
   - Fill in any env prompts → submit. Wait for the install spinner.
   - Open `https://{slug}-{user}.livinity.io` in a new tab → the app loads.
   - Use one core feature (n8n: create a workflow; ollama: pull a model;
     jellyfin: scan a library). Doesn't need to be exhaustive — just proves
     the container has the volume + env it needs.
   - Right-click the app on the Mini PC desktop → Uninstall → confirm the
     container and the CF subdomain both disappear (Server5 logs should
     show `DELETE /api/me/app-subdomain/{slug}`).
7. **Promote to verified:**
   ```sql
   UPDATE apps SET verified=true WHERE slug='myapp';
   ```
8. **(Optional) Promote to featured + pick sort_order:**
   ```sql
   UPDATE apps SET featured=true, sort_order=20 WHERE slug='myapp';
   ```
   Current featured-rail order: chrome=1, n8n=2, ollama=3, open-webui=4,
   jellyfin=5, immich=6, bolt-diy=100. Slot your app where it makes sense.

---

## 7. Updating an existing app

Most updates are an image tag bump:

```sql
UPDATE apps
SET version = '1.77.0',
    docker_compose = REPLACE(docker_compose, 'n8nio/n8n:1.76.1', 'n8nio/n8n:1.77.0'),
    updated_at = now()
WHERE slug = 'n8n';
```

Already-installed users keep running the old image until they uninstall +
reinstall (livinityd doesn't auto-pull on each restart). Document the
upgrade path on the store description if the new version has breaking
schema changes.

---

## 8. Removing an app

Apps with install history can't be deleted (FK constraint). Two paths:

**Soft-remove** (recommended — hides from store, preserves history):

```sql
UPDATE apps SET featured=false, verified=false, sort_order=9999 WHERE slug='myapp';
-- and add a TBD: store UI should also have a `published` flag eventually
```

**Hard-remove** (irreversible — destroys install history):

```sql
DELETE FROM install_history WHERE app_id IN (SELECT id FROM apps WHERE slug='myapp');
DELETE FROM apps WHERE slug='myapp';
```

Don't hard-remove unless the app is broken or insecure.

---

## 9. Where the marketplace surface lives

| Component | Path on Server5 | What it does |
|---|---|---|
| Store web UI | `/opt/platform/web/` (Next.js, port 3000) | Renders the public store at `apps.livinity.io` and `livinity.io/store`. Reads `apps` table via Drizzle ORM. |
| App-subdomain API | `/opt/platform/web/src/app/api/me/app-subdomain/route.ts` (POST + DELETE) | Mints CF DNS + tunnel ingress when a Mini PC installs/uninstalls an app. |
| Mini PC App Store iframe | `livos/packages/ui/src/modules/app-store/` | Reads from the same Server5 endpoints via the per-user `liv_k_*` api key. |
| livinity-apps repo on Server5 | `/opt/livos/data/app-stores/` | 304 manifests on disk — **reference material only**, not auto-synced to the DB. Useful for crib-noting docker-compose patterns. |

---

## 10. Common mistakes

- **Using `:latest` in the image tag.** Reproducibility lost. Always pin.
- **Mismatched port between `docker_compose` and `manifest.port`.** Caddy
  proxies the wrong port → app loads as 502.
- **`subdomain` field containing a dot or uppercase.** It's a single DNS
  label — `myapp`, not `my.app` or `MyApp`. Phase 140's canonical FQDN
  overrides it for tunnel-mode hosts, but local-LAN mode still uses it.
- **`icon_url` returning HTML.** Always check the URL resolves to an image
  with `curl -I` before inserting. Broken icons render as a placeholder.
- **Forgetting `verified=true` after smoke-test.** Apps without the verified
  badge look unfinished.
- **Hard-removing without cleaning install_history.** The DELETE fails on
  FK constraint. Either soft-remove or clean history first.

---

## 11. Sample: full n8n entry verbatim (for cribbing)

```sql
INSERT INTO apps (slug, name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified, sort_order) VALUES (
    'n8n',
    'n8n',
    'Workflow automation for technical people',
    'n8n is a free and source-available workflow automation tool. Connect 400+ integrations, build powerful workflows with a visual editor, and self-host on your own infrastructure.',
    'automation',
    '1.76.1',
    $compose$
version: "3.8"
services:
  n8n:
    image: n8nio/n8n:1.76.1
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
    volumes:
      - n8n_data:/home/node/.n8n
volumes:
  n8n_data:
$compose$,
    '{
        "port": 5678,
        "subdomain": "n8n",
        "env": [
            {"name": "N8N_BASIC_AUTH_USER", "type": "string", "label": "Admin Username", "default": "admin", "required": true},
            {"name": "N8N_BASIC_AUTH_PASSWORD", "type": "password", "label": "Admin Password", "required": true}
        ]
    }'::jsonb,
    'https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png',
    true,
    true,
    2
);
```

This is the actual production row at the time of writing (2026-05-17). When
n8n bumps versions, only `version` + the image tag in `docker_compose` need
to change.
