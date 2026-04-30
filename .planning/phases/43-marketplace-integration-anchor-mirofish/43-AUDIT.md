# Phase 43 Audit — Marketplace Integration (Anchor: MiroFish)

**Plan:** 43-01
**Created:** 2026-04-30
**Mode:** Read-only discovery for Plans 43-02..05
**Sacred file pre-check:** PASSED
**Broker module pre-check:** PASSED

---

## Section 1 — Sacred File + Broker Freeze Re-Verification

### 1.1 Sacred file SHA

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
623a65b9a50a89887d36f770dcd015b691793a7f
```

**Result: MATCH.** This is the Phase 40 baseline SHA, preserved through Phases 41 and 42 (broker added externally; runner internals untouched).

### 1.2 Sacred file uncommitted-diff check

```
$ git diff HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l
0
```

**Result: ZERO.** No uncommitted edits to the sacred file.

### 1.3 Broker module uncommitted-diff check

```
$ git diff HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ | wc -l
0
```

**Result: ZERO.** Broker module is feature-frozen as of Phase 42 final commit.

### 1.4 Statement

Phase 43 baseline = `623a65b9a50a89887d36f770dcd015b691793a7f`; broker module byte-frozen at Phase 42 final commit. **Phase 43 makes ZERO modifications to either.** All injection logic lives in `livos/packages/livinityd/source/modules/apps/` (NEW `inject-ai-provider.ts` module + edits to `schema.ts` and `apps.ts`); broker contracts are CONSUMED, not changed.

---

## Section 2 — Integration Point Decision: compose-generator.ts vs installForUser()

### 2.1 What `compose-generator.ts` does

`livos/packages/livinityd/source/modules/apps/compose-generator.ts:13-127` exports a single function `generateAppTemplate(appId)`. Behavior:

- Calls `getBuiltinApp(appId)` (line 14)
- If null → returns null EARLY (`if (!app || !app.compose) return null`)
- Otherwise: builds a compose YAML from the in-memory built-in app definition, writes it to a temp directory, and returns the temp path

**Implication:** `generateAppTemplate` ONLY runs for built-in apps (Plex, Filebrowser, Sparkles Hello World, n8n, etc. — apps shipped IN the LivOS source tree). For marketplace apps like MiroFish (whose manifest comes from the sibling repo `utopusc/livinity-apps`), `getBuiltinApp` returns null, the function returns null, and the actual template is fetched from the cloned app-store repo via `appStore.getAppTemplateFilePath(appId)` instead.

### 2.2 What `installForUser()` does

`livos/packages/livinityd/source/modules/apps/apps.ts:852-991` is the ONE unified per-user install entry point. It runs THREE-tier template resolution then converges to a single compose-patch pipeline:

```
templateResolution:
  1. generateAppTemplate(appId)        ← built-in path
  2. fetchPlatformTemplate(appId)      ← legacy/platform-managed
  3. appStore.getAppTemplateFilePath() ← marketplace (MiroFish path)
```

After template resolution all three paths converge at line 906-967 where the compose YAML is loaded, patched per-service, and re-dumped:

- `apps.ts:906-910` — read compose, replace `${APP_DATA_DIR}` etc., load YAML
- `apps.ts:914` — `mainServiceName = Object.keys(composeData.services || {})[0]`
- `apps.ts:933-958` — per-service patch loop: container_name + volume remapping
- `apps.ts:961-964` — host-port mapping on main service
- `apps.ts:967-968` — yaml.dump + writeFile

### 2.3 Decision: pure function in NEW module, single call site in installForUser

Per CONTEXT decisions D-43-06 and D-43-07:

**Decision:** `injectAiProviderConfig(composeData, userId, manifest)` lives in a NEW module `livos/packages/livinityd/source/modules/apps/inject-ai-provider.ts`. It is a pure function that mutates the parsed `composeData` object. It is called ONCE in `installForUser` between the per-service patch loop end (apps.ts:958) and the host-port mapping block (apps.ts:961). The flag check (`manifest.requiresAiProvider === true`) lives INSIDE the function so the call site is unconditional and the function is a no-op when the flag is absent.

**Why NOT in compose-generator.ts:**
- `generateAppTemplate` only runs for built-in apps. MiroFish is a marketplace app, so `getBuiltinApp('mirofish')` returns null and `generateAppTemplate` returns null. Putting injection there would miss the entire marketplace path — exactly the path FR-MARKET-02 requires.

**Why between apps.ts:958 and apps.ts:961:**
- After per-service container_name/volume patches → `composeData` is fully transformed for per-user isolation
- Before host-port mapping → injection cannot accidentally clobber the port array
- All required variables (`composeData`, `userId`, `manifest`) are in scope at this exact line

### 2.4 Verbatim line context (apps.ts:955-970)

From `git show HEAD:livos/packages/livinityd/source/modules/apps/apps.ts | sed -n '955,970p'`:

```typescript
				return v
			})
		}
	}

	// Set the host port mapping on the main service
	if (mainServiceName && composeData.services[mainServiceName]) {
		const service = composeData.services[mainServiceName]
		service.ports = [`127.0.0.1:${port}:${internalPort}`]
	}

	// Write patched compose
	const yamlDump = (await import('js-yaml')).default.dump(composeData)
	await fse.writeFile(`${userDataDir}/docker-compose.yml`, yamlDump)
```

The injection call goes BETWEEN line 958 (`}`, end of `for (...services...)` loop) and line 960 (the `// Set the host port mapping on the main service` comment). Plan 43-02 inserts:

```typescript
		// Phase 43 (FR-MARKET-01, D-43-06/07): inject AI broker config when manifest opts in.
		// No-op when manifest.requiresAiProvider is absent or false.
		injectAiProviderConfig(composeData, userId, manifest)
```

---

## Section 3 — Manifest Store Path Decision

### 3.1 Default repo

From `livos/packages/livinityd/source/constants.ts:2`:

```typescript
export const LIVINITY_APP_STORE_REPO = 'https://github.com/utopusc/livinity-apps.git'
```

This is the official sibling repo for marketplace apps. Maintained separately from the LivOS source tree. Cloned at livinityd startup.

### 3.2 Local clone path

From `livos/packages/livinityd/source/modules/apps/app-repository.ts:42`:

```typescript
this.path = `${livinityd.dataDirectory}/app-stores/${this.cleanUrl()}`
```

So on Mini PC, the cloned manifests live at `/opt/livos/data/app-stores/utopusc-livinity-apps-<hash>/<app_id>/`. Each app directory contains:
- `livinity-app.yml` (manifest — parsed by `readManifestInDirectory` in app.ts)
- `docker-compose.yml` (compose stanza — read by `installForUser` at apps.ts:906)
- Optional `gallery/` (image assets)
- Optional `README.md` (human-readable documentation)

### 3.3 Auto-pull cadence

From the audit's CONTEXT links to Plan 43-03's README, `app-store.ts:56` runs `update()` every 5 minutes (`updateInterval: '5m'`). After a sibling-repo PR is merged into the default branch, the Mini PC pulls the new manifest within ≤ 5 minutes. No livinityd restart required (a force-pull happens via `sudo systemctl restart livos`).

### 3.4 Decision: sibling-repo PR is operator action; reviewable draft lives in this repo

**Decision:** MiroFish manifest authoring happens in the sibling repo `utopusc/livinity-apps`, NOT in the LivOS source tree. Plan 43-03 produces the manifest content as a DRAFT in `.planning/phases/43-marketplace-integration-anchor-mirofish/draft-mirofish-manifest/` so it is reviewable in this repo's PR. The operator separately commits + pushes to the sibling repo as the actual deployment step.

**Reasoning:**
- Respects existing two-repo architecture (community apps vs LivOS daemon)
- Avoids modifying LivOS source for marketplace content (cleaner separation of concerns)
- Reviewable in PR review (draft artifact is visible alongside code changes)
- Operator owns the actual deploy gate (sibling-repo PR merge → Mini PC auto-pull)

**Prerequisite for Plan 43-05 UAT:** the sibling-repo PR must be merged before Mini PC live test runs. Plan 43-05's UAT explicitly documents this and includes the force-pull command.

---

## Section 4 — MiroFish Image Publish State + Fallback Path

### 4.1 Image publish probe results

```
$ curl -sI https://ghcr.io/v2/666ghj/mirofish/manifests/latest
HTTP/1.1 401 Unauthorized
www-authenticate: Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:666ghj/mirofish:pull"
```

The 401 + `scope=repository:666ghj/mirofish:pull` indicates the registry namespace is RECOGNIZED but no public pull token is issued — meaning **the image is either NOT published or marked private**. A successfully-published public image would return 200 (or a 401 with an issued scope token leading to 200 after the auth flow). Empirically: GHCR routinely returns 401-without-issuable-token for non-existent or private images.

```
$ curl -s https://hub.docker.com/v2/repositories/666ghj/mirofish/
{"message":"object not found","errinfo":{}}
```

Docker Hub: **NOT published**. Object not found.

```
$ curl -s "https://api.github.com/repos/666ghj/MiroFish"
{... "name": "MiroFish", "full_name": "666ghj/MiroFish", "description": "A Simple and Universal Swarm Intelligence Engine, Predicting Anything." ...}
```

GitHub repo exists and is public.

```
$ curl -s "https://api.github.com/repos/666ghj/MiroFish/contents/Dockerfile"
{"name": "Dockerfile", "path": "Dockerfile", "size": 723, "type": "file" ...}
```

**Dockerfile is present in upstream MiroFish repo.** Build pipeline exists.

### 4.2 Dockerfile contents (from `https://raw.githubusercontent.com/666ghj/MiroFish/main/Dockerfile`)

```
FROM python:3.11
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
  && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /uvx /bin/
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN npm ci && npm ci --prefix frontend && cd backend && uv sync --frozen
COPY . .
EXPOSE 3000 5001
CMD ["npm", "run", "dev"]
```

**Port info:** EXPOSE 3000 (frontend) and 5001 (backend). The web-accessible port is **3000** (the frontend). Plan 43-03 must use `port: 3000` in the manifest.

### 4.3 Path Decision: Path B (fork+build)

**Path B chosen.** Image is not published upstream; the operator must fork+build+push.

### 4.4 Operator commands for Path B (Plan 43-03 documents these in its README)

```bash
# 1. Fork on GitHub: https://github.com/666ghj/MiroFish → https://github.com/utopusc/MiroFish
# 2. Clone + build + push (any machine with Docker):
git clone https://github.com/utopusc/MiroFish /tmp/mirofish
cd /tmp/mirofish
docker build -t ghcr.io/utopusc/mirofish:v29.3 .
echo "$GHCR_PAT" | docker login ghcr.io -u utopusc --password-stdin
docker push ghcr.io/utopusc/mirofish:v29.3

# Alternative: build on the Mini PC and use a local registry tag:
# docker build -t mirofish:local .
# (and point the manifest at mirofish:local instead — but this requires --add-host setup
#  for marketplace install; GHCR is the cleaner path)
```

### 4.5 Image string Plan 43-03 will use

`ghcr.io/utopusc/mirofish:v29.3`

This is the FUTURE image reference. The manifest is authored against this tag NOW; the operator publishes the actual image to GHCR BEFORE merging the sibling-repo PR (Plan 43-05 UAT prerequisite). If for any reason the operator chooses a different tag at build time, they must update the draft compose file to match.

### 4.6 Caveat for upstream Dockerfile

The upstream `CMD ["npm", "run", "dev"]` is a development command. For production deployment via the marketplace, the operator should consider replacing the CMD with a production-mode start command before building (e.g., `npm run build` then `npm start`). This is OUT OF SCOPE for Phase 43 — Plan 43-03 references the upstream Dockerfile as-is; if MiroFish dev-mode startup is too slow / fragile, the operator can patch the Dockerfile in the fork before publishing. Document this caveat in Plan 43-03 README.

---

## Section 5 — UI Badge Insertion Point

### 5.1 Where `RegistryApp` is defined

```
$ grep -rn "type RegistryApp\|interface RegistryApp" livos/packages/
livos/packages/ui/src/trpc/trpc.ts:135:export type RegistryApp = RouterOutput['appStore']['registry'][number]['apps'][number]
```

`RegistryApp` is INFERRED from a tRPC procedure return type:
```typescript
export type RegistryApp = RouterOutput['appStore']['registry'][number]['apps'][number]
```

This means the type AUTOMATICALLY picks up new fields IF the underlying procedure return value includes them.

### 5.2 Propagation path: schema → registry router → UI

The `appStore.registry` tRPC procedure (in `livos/packages/livinityd/source/modules/apps/routes.ts`) returns the parsed manifest. Since `validateManifest` (schema.ts:85-98) currently uses a permissive `return parsed as AppManifest` cast that does NOT strip unknown fields, the new `requiresAiProvider` will flow through to `RegistryApp` automatically once Plan 43-02 adds the field to `AppManifestSchema`. **Plan 43-04 does NOT need to manually patch the projection** unless the integration test reveals the field is being stripped — in which case Plan 43-04 owns the routes.ts fix.

### 5.3 UI surface for the Badge

The audit-recommended UI surface is `livos/packages/ui/src/modules/app-store/app-page/app-content.tsx`. Verbatim head of file:

```tsx
import {RegistryApp, UserApp} from '@/trpc/trpc'
// ...
export function AppContent({
	app,
	userApp,
	recommendedApps = [],
	showDependencies,
}: {
	app: RegistryApp
	// ...
}) {
	// ...
	return (
		<>
			{/* Desktop */}
			<div className={cn('hidden flex-row gap-5 lg:flex')}>
				<div className='flex flex-1 flex-col gap-5'>
					<AboutSection app={app} />
					<ReleaseNotesSection app={app} />
				</div>
				// ...
```

**Decision:** The Badge inserts at the top of the AboutSection container (or as a sibling above `<AboutSection>`). Plan 43-04 picks the exact JSX position; the recommended snippet:

```tsx
{app.requiresAiProvider && (
	<Badge variant='secondary' className='self-start'>
		Uses your Claude subscription
	</Badge>
)}
```

Add the Badge import at the top:
```tsx
import {Badge} from '@/shadcn-components/ui/badge'
```

**Variant note:** if `secondary` is not supported by this codebase's shadcn Badge, fall back to `outline` or default. Plan 43-04 verifies via grep on `livos/packages/ui/src/shadcn-components/ui/badge.tsx`.

### 5.4 Falsy short-circuit behavior

The conditional render `{app.requiresAiProvider && <Badge ...>}` short-circuits when the field is `undefined` (current state) or `false` — meaning:
- Legacy apps (no flag) render NO badge
- Apps with `requiresAiProvider: true` render the badge
- No additional wiring needed for the negative case (structurally guaranteed by JS truthiness)

This satisfies D-43-12 (cosmetic, non-blocking) without further plumbing.

---

## Section 6 — Test Infrastructure Pattern

### 6.1 Existing apps.ts test pattern (Vitest)

`livos/packages/livinityd/source/modules/apps/apps.integration.test.ts:3` pattern:
```typescript
import {expect, beforeAll, afterAll, test, vi} from 'vitest'
```

Run via: `pnpm --filter @livinity/livinityd test` (or `pnpm exec vitest run <file>`)
Mocks: `vi.mock`, `vi.fn`, `vi.spyOn`, `vi.doMock`
Test runner: vitest (configured in livinityd package)

### 6.2 Existing nexus broker test pattern (bare tsx)

Per Phase 41 + 42, broker tests use:
```typescript
import assert from 'node:assert/strict'
import {test} from 'node:test'
```

Run via: `npx tsx <file>.test.ts`
No mocking framework — tests are pure-function integration through real broker module imports.

### 6.3 Decision: pattern by test type

**Pure unit tests** (the `injectAiProviderConfig` function — Plan 43-02): use bare tsx + `node:test` + `node:assert/strict` to match the Phase 41/42 broker tests. Faster, no Vitest setup needed.
- File: `livos/packages/livinityd/source/modules/apps/inject-ai-provider.test.ts`
- Run: `npx tsx source/modules/apps/inject-ai-provider.test.ts`

**Integration tests** (Plan 43-04 — exercising `installForUser` end-to-end with mocked I/O): use `vitest` to match the existing `apps.integration.test.ts` pattern. Plan 43-04's tests need `vi.mock` for `findUserById`, `allocatePort`, `fse.writeFile` capture, etc.
- Files: `livos/packages/livinityd/source/modules/apps/install-for-user-injection.test.ts` and `manifest-mirofish.test.ts`
- Run: `pnpm exec vitest run source/modules/apps/install-for-user-injection.test.ts source/modules/apps/manifest-mirofish.test.ts`

### 6.4 npm script chain

Existing `nexus/packages/core/package.json` test scripts:
```json
"test:phase39": "tsx src/providers/claude.test.ts && tsx src/providers/no-authtoken-regression.test.ts && tsx src/providers/sdk-agent-runner-integrity.test.ts",
"test:phase40": "tsx src/providers/sdk-agent-runner-home-override.test.ts && npm run test:phase39",
"test:phase41": "tsx src/providers/api-home-override.test.ts && npm run test:phase40",
"test:phase42": "npm run test:phase41"
```

Plan 43-04 adds:
```json
"test:phase43": "npm run test:phase42"
```

Phase 43 itself adds NO nexus tests (all new tests live in livinityd). The chain preserves regression coverage on Phase 39+40+41+42 nexus assertions when the operator runs `npm run test:phase43`.

---

## Section 7 — Risks & Open Questions

### R1: validateManifest currently bypasses schema validation

`schema.ts:85-98` `validateManifest()` body:
```typescript
// TODO (apps refactor): enable schema validation
// return AppManifestSchema.parse(parsed)
return parsed as AppManifest
```

The TODO comment confirms schema validation is intentionally DISABLED at runtime. The new `requiresAiProvider` field will pass through unchanged (no stripping risk) because the cast accepts ANY object shape. **Plan 43-02 must verify** that the field survives `readManifestInDirectory(appTemplatePath)` → `installForUser` → `injectAiProviderConfig` and reaches the function with the original boolean value. If a future refactor turns on `AppManifestSchema.parse(parsed)`, the unit tests in Plan 43-02 already cover the schema's behavior on the new field.

### R2: Negative case is mandatory — no env injection when flag is absent

The integration test for the negative case (FR-MARKET-01 SC #2) is non-negotiable. Plan 43-04 owns this test. If a manifest WITHOUT `requiresAiProvider: true` produces a compose file containing any of the broker env vars, the regression has FAILED.

### R3: extra_hosts and environment object shapes

`composeData` from js-yaml gives parsed YAML where `services.<name>.environment` may be:
- An OBJECT (`{KEY: value, ...}`) — preferred form
- An ARRAY (`[KEY=value, ...]`) — alternative valid YAML form
- ABSENT entirely

`services.<name>.extra_hosts` may be:
- An ARRAY of `"hostname:ip"` or `"hostname:host-gateway"` strings
- ABSENT entirely

The injection function (Plan 43-02) must handle:
- Existing env as OBJECT — merge new keys without overwriting
- Existing env ABSENT — initialize as `{}`
- Existing env as ARRAY — Plan 43-02 may convert to OBJECT or assert array form unsupported (audit recommends: handle the OBJECT case only, since js-yaml.dump produces object form by default; if a manifest uses array form upstream, the test should fail loudly so we can decide). For Phase 43, OBJECT-form is sufficient — built-in app patterns and MiroFish both use object form.
- Existing extra_hosts as ARRAY — append `"livinity-broker:host-gateway"` only if absent
- Existing extra_hosts ABSENT — initialize as `[]` then push

### R4: UI test cannot run end-to-end without dev server

Plan 43-04 cannot truly verify the rendered UI — it can only assert that the component file contains the conditional render snippet. The runtime verification happens in Plan 43-05 UAT (operator opens marketplace UI, sees the badge). This is documented as an explicit limitation.

### R5: userId verbatim in URL

The broker URL pattern is `http://livinity-broker:8080/u/<user_id>/v1/...`. Plan 43-02 must use `userId` (the LivOS user UUID, the function parameter to `installForUser`) — NOT `user.username`. UUIDs are URL-safe; no encoding needed. Test cases in Plan 43-02 explicitly assert `userId` is used VERBATIM.

### R6: Byte-identical compose for legacy apps

When a manifest does NOT declare `requiresAiProvider: true`, the dumped compose YAML must be byte-identical to current behavior. Plan 43-04 owns the regression test that:
1. Installs an app with `requiresAiProvider: false` (or omitted)
2. Captures the dumped YAML
3. Compares against the pre-Phase-43 expected output (deep-equal)

---

## Section 8 — Deferred to Plans 43-02..05

| Plan | Deliverable |
|------|-------------|
| 43-02 | (a) Add `requiresAiProvider?: boolean` to AppManifestSchema with JSDoc. (b) Create `inject-ai-provider.ts` pure function module. (c) Create `inject-ai-provider.test.ts` with 14 unit test cases (TDD: write failing tests first). (d) Wire `injectAiProviderConfig` call into `apps.ts:installForUser` between line 958 and line 961. ATOMIC commit. |
| 43-03 | Create draft MiroFish manifest in `.planning/phases/43-marketplace-integration-anchor-mirofish/draft-mirofish-manifest/`: `livinity-app.yml` (with `requiresAiProvider: true`), `docker-compose.yml` (image `ghcr.io/utopusc/mirofish:v29.3`, port 3000, no env vars hardcoded), `README.md` (operator copy-and-PR flow + Path B build commands). NO source-tree edits. |
| 43-04 | (a) Integration test `install-for-user-injection.test.ts` (positive + negative + userId propagation). (b) Schema test `manifest-mirofish.test.ts` (validates Plan 43-03 draft against AppManifestSchema). (c) UI Badge wire in `app-content.tsx`. (d) `test:phase43` npm script. ATOMIC commit. |
| 43-05 | Write `43-UAT.md` operator-facing manual UAT with 9 sections. Documents Mini PC live test for FR-MARKET-02 acceptance gate. NO deploy attempts; documentation only. ATOMIC commit. |

---

## Audit complete

- Sacred file: `623a65b9a50a89887d36f770dcd015b691793a7f` (UNCHANGED)
- Broker module: untouched (UNCHANGED)
- Integration point: NEW `inject-ai-provider.ts`, called from `apps.ts:installForUser` between line 958 and line 961
- Manifest store: sibling repo `utopusc/livinity-apps` (operator deploys via PR)
- MiroFish image: Path B fork+build → `ghcr.io/utopusc/mirofish:v29.3`
- MiroFish web port: 3000 (per upstream Dockerfile EXPOSE)
- UI badge file: `livos/packages/ui/src/modules/app-store/app-page/app-content.tsx`
- Test patterns: tsx for pure unit (43-02), vitest for integration (43-04)

Plans 43-02..05 may proceed.
