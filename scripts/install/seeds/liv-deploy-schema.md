# Liv — Custom App Deploy (`deploy_app`) Reference

This is a technical reference for the `deploy_app` tool (the `liv-deploy` MCP server).
Use it to deploy a user's Docker image, full `docker-compose`, or Next.js project to
**this** LivOS box and hand back a public URL. Author every compose/manifest in
**English/YAML**, but reply to the user in **their** language (Turkish if they write
Turkish).

## 1. When to use `deploy_app`

Use it when the user asks to **deploy / host / run / publish** their own app, Docker
image, or Next.js project and wants a **public URL** (e.g. "bunu yayınla", "deploy my
app", "host this image", "run my Next.js site"). For opening an already-installed app or
a website, use `luse` `computer_application` instead — `deploy_app` is for **new** custom
deployments, not for launching existing ones.

## 2. Tool input

`deploy_app` accepts:

```ts
{
  slug: string,            // REQUIRED. lowercase alnum + hyphen, <= 63 chars. /^[a-z0-9][a-z0-9-]{0,62}$/
  image?: string,          // EITHER an image ref (bare-image mode) ...
  dockerCompose?: string,  // ... OR a full docker-compose.yml as a YAML string (full-compose mode)
  port: number,            // REQUIRED. the CONTAINER port the web UI listens on (1-65535)
  manifest?: { name: string, icon?: string }  // optional display metadata
}
```

- **Pass ONLY the slug.** The username is appended **server-side** — the final public URL
  becomes `{slug}-{user}.livinity.io`. NEVER put the username in the slug yourself.
  Example: `slug: "my-blog"` → `my-blog-alice.livinity.io`.
- `port` is the **container** port the web UI listens on (Next.js standalone = `3000`,
  nginx = `80`, etc.). The platform publishes it as `127.0.0.1:<port>:<port>`.
- The deploy is **DESTRUCTIVE** — the user is prompted to approve before the container
  launches. Author a correct compose first time so the approval is meaningful.

## 3. Two modes

### Bare image
Pass an image ref + the port; a one-service compose is synthesized for you:

```jsonc
{ "slug": "hello-nginx", "image": "nginx:latest", "port": 80 }
```

### Full compose
Pass `dockerCompose` as a YAML string. Rules:
- **Publish the web port** as `127.0.0.1:<port>:<port>` (loopback only — the platform
  tunnel reaches it; the box does not expose it to the LAN directly).
- Use **named volumes** or **binds UNDER the app data dir only**. Do NOT bind host paths.

```yaml
services:
  web:
    image: ghcr.io/acme/site:1.4.0
    restart: on-failure
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      - NODE_ENV=production
    volumes:
      - app_data:/data
volumes:
  app_data:
```

## 4. Manifest fields

`manifest` (the tool input) is optional and only needs `{name, icon?}`. For reference,
the canonical full app manifest LivOS understands has these fields (you usually only need
`name`/`icon`/`port`):

| Field             | Required | Notes                                             |
| ----------------- | :------: | ------------------------------------------------- |
| `manifestVersion` |    —     | `'1.0.0'`                                          |
| `id`              |    —     | the slug                                          |
| `name`            |    ✓     | human-readable display name                       |
| `port`            |    ✓     | the container web port (same as the tool `port`)  |
| `icon`            |    —     | absolute https URL to a square PNG/SVG icon       |
| `category`        |    —     | e.g. `developer-tools`, `media`                   |
| `version`         |    —     | app version string                                |
| `description`     |    —     | one-paragraph description                         |
| `website`         |    —     | upstream project URL                              |
| `developer`       |    —     | author / org name                                 |

## 5. SECURITY — what is REJECTED or STRIPPED

Custom composes are **untrusted** and run through a forced sanitizer. Author a valid
compose first time so the deploy succeeds:

- **REJECTED — the deploy ABORTS** (you must remove these and retry):
  - any `/var/run/docker.sock` mount,
  - any host-path bind whose host side is **outside the app data dir** (`/`, `~`,
    another user's data, `/proc`, `/sys`, `~/.claude`, …).
- **STRIPPED automatically** (silently removed — do not rely on them):
  - `privileged`, `network_mode: host`, `pid: host`, `userns_mode: host`,
    `cap_add`, and any `security_opt` containing `unconfined`.
- **ENFORCED:** `no-new-privileges:true` is merged into every service.
- **DESTRUCTIVE approval:** the user is prompted before the container launches.

Net rule: no `docker.sock`, no host binds outside the app data dir, no privileged / host
networking. If you need persistence, use a **named volume**.

## 6. Next.js recipe (image-wrap)

There is **no on-box source builder yet** — you must wrap a Next.js project into a Docker
image first, then deploy that image:

1. Tell the user to set `output: 'standalone'` in `next.config.js`.
2. Wrap the project with the canned multi-stage Dockerfile at
   `scripts/install/seeds/nextjs.Dockerfile` (port 3000, non-root, standalone runner).
3. Build the image (e.g. `docker build -t my-app:latest .` using that Dockerfile).
4. Deploy the built image:

```jsonc
{ "slug": "my-blog", "image": "my-app:latest", "port": 3000 }
```

Result: `my-blog-{user}.livinity.io`, served live (Phase-287 verify-live ensures the URL
is only surfaced once the record resolves).

## Notes

- Reply in the user's language; author all composes/manifests in English/YAML.
- One deploy → one public `{slug}-{user}.livinity.io` URL. Pick a short, descriptive slug.
- If a deploy is REJECTED, read the rejection, remove the offending directive
  (docker.sock / host bind), and retry — do not try to work around the sanitizer.
