# LivOS Docker Images — Local Retag Reference (Mini PC Pattern Adopted)

**As of 2026-05-12 (Plan 105-05 Bug #6 fix):** The canonical bootstrap path is now
the **Mini PC pattern** — `deploy-livinityd.sh` auto-pulls `getumbrel/auth-server:1.0.5`
and `getumbrel/tor:0.4.7.8` and re-tags them locally as `livos/auth-server:1.0.5` and
`livos/tor:0.4.7.8` (+ `:latest` alias) during install via the new
`_dld_setup_docker_images` helper. **No Docker Hub push is required for normal
operation.** livinityd's legacy-compat docker-compose finds the local re-tags
automatically.

This directory still contains the same images as `.tar.gz` archives for **offline /
airgapped install** scenarios (Option C below). The `push-to-dockerhub.sh` helper is
preserved as an optional backup path for organizations that want to publish images
under their own Docker Hub namespace (e.g., for CI/CD, mirroring, or to avoid
runtime egress to docker.io).

## Provenance

Both images are byte-identical re-tags of the official `getumbrel/*` images on Docker Hub
(Umbrel project, MIT licensed):

| LivOS retag | Source image | Source digest |
|---|---|---|
| `livos/auth-server:1.0.5` | `getumbrel/auth-server:1.0.5` | `sha256:b4a4b37896911a85fb74fa159e010129abd9dff751a40ef82f724ae066db3c2a` |
| `livos/tor:0.4.7.8` | `getumbrel/tor:0.4.7.8` | `sha256:2ace83f22501f58857fa9b403009f595137fa2e7986c4fda79d82a8119072b6a` |
| `livos/tor:latest` | same as 0.4.7.8 (alias) | same digest |

These tags match what Mini PC has installed and what
`livos/packages/livinityd/source/modules/apps/legacy-compat/docker-compose.yml`
references by `image:` field.

## Local tar archives

The two `.tar.gz` files in this directory contain the retagged images:

- `livos-auth-server-1.0.5.tar.gz` — 122 MB compressed
- `livos-tor.tar.gz` — 108 MB compressed (contains both `livos/tor:0.4.7.8` and `livos/tor:latest`)

**These archives are gitignored** (each is over GitHub's 100 MB single-file push limit).
They live in your local working tree only. If you nuke `node_modules/` or this directory,
regenerate them with `regenerate-from-source.sh` below.

## Push to Docker Hub (recommended path)

### Option A: push as `livos/*` (if you own the namespace)

```bash
# 1. Log in to Docker Hub as the user that owns the `livos` namespace
docker login

# 2. Push auth-server (1.0.5 only — no `latest` needed for auth-server)
docker push livos/auth-server:1.0.5

# 3. Push tor (both tags so old `image: livos/tor` references still resolve)
docker push livos/tor:0.4.7.8
docker push livos/tor:latest

# 4. Verify pulls work from a fresh Docker Desktop:
docker rmi livos/auth-server:1.0.5 livos/tor:0.4.7.8 livos/tor:latest
docker pull livos/auth-server:1.0.5
docker pull livos/tor:latest
```

After successful push, the Phase 105 UAT Bug #6 is **resolved** — `docker compose up`
in livinityd's Apps module will pull these images from Docker Hub instead of failing.

### Option B: push under a different namespace (e.g. `livinity` or `utopusc`)

If `livos` is taken by someone else on Docker Hub:

```bash
# 1. Re-tag under your namespace
NS=utopusc   # or 'livinity' or whatever you own
docker tag livos/auth-server:1.0.5 ${NS}/livos-auth-server:1.0.5
docker tag livos/tor:0.4.7.8       ${NS}/livos-tor:0.4.7.8
docker tag livos/tor:latest        ${NS}/livos-tor:latest

# 2. Push
docker push ${NS}/livos-auth-server:1.0.5
docker push ${NS}/livos-tor:0.4.7.8
docker push ${NS}/livos-tor:latest

# 3. Update the compose file to point at your namespace
# Edit: livos/packages/livinityd/source/modules/apps/legacy-compat/docker-compose.yml
#   image: livos/auth-server:1.0.5  →  image: utopusc/livos-auth-server:1.0.5
#   image: livos/tor:0.4.7.8        →  image: utopusc/livos-tor:0.4.7.8
```

This namespace switch is a **one-line code change** per service in the compose file.
Recommend Option A (`livos` namespace) if available because it requires zero code edits.

### Option C: ship from tar archives (offline / private use)

If you don't want to push to Docker Hub at all (e.g. UAT on a single VPS without
internet egress to a public registry):

```bash
# 1. Copy the tar.gz files to the target host
scp docker-images/livos-*.tar.gz root@<vps>:/tmp/

# 2. On the target host, load both:
ssh root@<vps> '
  gunzip -c /tmp/livos-auth-server-1.0.5.tar.gz | docker load
  gunzip -c /tmp/livos-tor.tar.gz                | docker load
  docker images | grep livos/
'

# 3. Run install.sh — Apps module will find the images locally and skip pull.
```

This is the right path for Phase 105 re-UAT on mainserver 154.53.56.75 **before**
the public-registry push lands.

## Regenerate the tar.gz archives from upstream

If you delete the `.tar.gz` files (or want to verify provenance):

```bash
docker pull getumbrel/auth-server:1.0.5
docker pull getumbrel/tor:0.4.7.8

docker tag getumbrel/auth-server:1.0.5 livos/auth-server:1.0.5
docker tag getumbrel/tor:0.4.7.8       livos/tor:0.4.7.8
docker tag getumbrel/tor:0.4.7.8       livos/tor:latest

docker save livos/auth-server:1.0.5         -o docker-images/livos-auth-server-1.0.5.tar
docker save livos/tor:0.4.7.8 livos/tor:latest -o docker-images/livos-tor.tar
gzip -9 docker-images/livos-auth-server-1.0.5.tar
gzip -9 docker-images/livos-tor.tar
```

## License + attribution

`getumbrel/auth-server` is MIT-licensed by Umbrel (https://github.com/getumbrel/umbrel-os).
`getumbrel/tor` is MIT-licensed by Umbrel (https://github.com/getumbrel/docker-tor).
Both retagged images carry the same upstream license; retagging does not modify image
contents (verified via image digest sha256 — see Provenance table above).

When publishing to a public registry, add an attribution note in the image description.

## Open question: future upstream sync

The upstream `getumbrel/auth-server` has newer tags (1.7.0 as of 2026-04). Decision
deferred — Mini PC is locked to 1.0.5 + livinityd's `legacy-compat` compose pins
that version. Upgrading would require a Phase 105.x or v34 phase to validate
compatibility with the bundled tor + AUTH_PORT/AUTH_IP env contracts.

`getumbrel/tor` upstream hasn't been touched since 2022-07 (0.4.7.8) — that version
is locked-in and stable.
