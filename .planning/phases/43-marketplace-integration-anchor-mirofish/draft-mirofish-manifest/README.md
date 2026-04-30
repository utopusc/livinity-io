# MiroFish Marketplace Manifest — Draft

**Phase:** 43 — Marketplace Integration (Anchor: MiroFish)
**Authored by:** Plan 43-03 (executor)
**Owner of next step:** Operator (user). Files in this directory are READY-TO-COPY into the sibling repo `https://github.com/utopusc/livinity-apps`.

## Why this lives here, not in the sibling repo

Per Plan 43-01 audit Section 3: marketplace manifests live in the sibling repo `utopusc/livinity-apps`, NOT in the LivOS source tree. This directory is a REVIEWABLE DRAFT so the manifest content is visible in this repo's PR; the operator separately commits + pushes to the sibling repo as the actual deployment step.

## Files in this directory

- `livinity-app.yml` — MiroFish manifest with `requiresAiProvider: true`
- `docker-compose.yml` — MiroFish compose stanza (broker env injection happens at install time, NOT here)
- `README.md` — this file

## Image reference chosen (Path B — fork+build)

| Attribute | Value | Source |
|-----------|-------|--------|
| Path | **B (fork+build)** — image not published upstream | Plan 43-01 audit Section 4 (GHCR returned 401-without-token; Docker Hub returned "object not found") |
| Image reference | `ghcr.io/utopusc/mirofish:v29.3` | Plan 43-01 audit Section 4.5 |
| Web port | `3000` (frontend) | Upstream Dockerfile `EXPOSE 3000 5001`; backend on 5001 is internal-only |

## What the operator does to deploy

### Step 1 — Build + publish image (Path B is mandatory)

The image is NOT published upstream. The operator must publish the rebuilt image BEFORE merging the sibling-repo PR.

```bash
# 1. Fork on GitHub: https://github.com/666ghj/MiroFish → https://github.com/utopusc/MiroFish
# 2. Clone + build + push (any machine with Docker):
git clone https://github.com/utopusc/MiroFish /tmp/mirofish
cd /tmp/mirofish

# (Optional) patch CMD from "npm run dev" to a production-mode start command
# before building. The upstream Dockerfile uses dev mode; for marketplace
# deployment a production build may be more reliable. This is operator discretion.

docker build -t ghcr.io/utopusc/mirofish:v29.3 .

# Authenticate to GHCR with a Personal Access Token (write:packages scope):
echo "$GHCR_PAT" | docker login ghcr.io -u utopusc --password-stdin

docker push ghcr.io/utopusc/mirofish:v29.3
```

**Caveat (Plan 43-01 audit Section 4.6):** the upstream Dockerfile's `CMD ["npm", "run", "dev"]` starts MiroFish in dev mode. For marketplace deployment, the operator may want to patch the CMD before building (e.g., `npm run build && npm start`) for a more production-ready start sequence. This is OUT OF SCOPE for Phase 43 — if MiroFish dev-mode startup is too slow or fragile, the operator can patch the Dockerfile in the fork before publishing.

### Step 2 — Sibling-repo PR

```bash
git clone https://github.com/utopusc/livinity-apps /tmp/livinity-apps
mkdir /tmp/livinity-apps/mirofish
cp .planning/phases/43-marketplace-integration-anchor-mirofish/draft-mirofish-manifest/livinity-app.yml /tmp/livinity-apps/mirofish/
cp .planning/phases/43-marketplace-integration-anchor-mirofish/draft-mirofish-manifest/docker-compose.yml /tmp/livinity-apps/mirofish/
cd /tmp/livinity-apps
git checkout -b add-mirofish-v29.3
git add mirofish/
git commit -m "feat: add MiroFish marketplace app (subscription-powered via livinity-broker)"
git push origin add-mirofish-v29.3
# Open PR on GitHub; merge to default branch
```

### Step 3 — Wait for Mini PC auto-pull (≤ 5 min)

The Mini PC's `app-store.ts:56` runs `update()` every 5 minutes (`updateInterval: '5m'`). After the sibling-repo PR is merged into the default branch, MiroFish appears in the marketplace UI within 5 minutes. No livinityd restart required.

To force-pull immediately (impatient operator path):
```bash
ssh -i .../minipc bruce@10.69.31.68
sudo systemctl restart livos
# Or trigger via tRPC: livinityd.client.appStore.update.mutate()
```

Verify the manifest landed:
```bash
sudo cat /opt/livos/data/app-stores/utopusc-livinity-apps-*/mirofish/livinity-app.yml | grep requiresAiProvider
# Expected output:
# requiresAiProvider: true
```

### Step 4 — Verify the manifest is live

In the LivOS UI, open the marketplace and confirm:
- MiroFish card appears
- The "Uses your Claude subscription" pill is rendered (Plan 43-04 wires this UI)
- "Install" button is functional

Then run `43-UAT.md` end-to-end (Plan 43-05).

## What is NOT in this directory

- The 3 broker env vars (`ANTHROPIC_BASE_URL`, `ANTHROPIC_REVERSE_PROXY`, `LLM_BASE_URL`) — these are added at install time by `livos/packages/livinityd/source/modules/apps/inject-ai-provider.ts` (Plan 43-02). Hardcoding them in compose would either duplicate (if `requiresAiProvider: true`) or break (if `<userId>` were hardcoded — userId is per-user-resolved at install time).
- `extra_hosts: ["livinity-broker:host-gateway"]` — same reason. Auto-injected at install time.
- `container_name:` — `installForUser` (apps.ts:936) generates the per-user name `mirofish_server_user_<username>_1` automatically.

## Sacred file integrity

This plan does NOT modify any source code. Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `623a65b9a50a89887d36f770dcd015b691793a7f` is byte-identical. Broker module `livos/packages/livinityd/source/modules/livinity-broker/` byte-identical. MiroFish UPSTREAM source code (per D-43-11) is NOT modified.

## Reference

- Audit: `../43-AUDIT.md` (Section 3 manifest store + Section 4 image discovery)
- Plan 43-02 SUMMARY: `../43-02-SUMMARY.md` (injection function contract)
- Phase 41 + 42 broker contract: `http://livinity-broker:8080/u/<user_id>/v1`
