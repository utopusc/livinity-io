# Phase 219 — MCP Catalog Refresh + Skills System + Subdomain UX Polish

**Status:** READY (post-/clear activation)
**Created:** 2026-05-26
**Triggered by:** Operator Mini PC UAT after Phase 218 ship. Verbatim bug list:

> "Bazi mcp serverlari ekleyemiyorum! Sadece Filesystem ekli onuda sanirim sen ekledin lutfen fixle bu kisminda! sag tikla settings yapiyorum ... DNS PENDING diyor surekli ... Change domain diyorum ... `files.bruce.livinity.io` boyle gosteriyor ama files.bruce.livinity.io da yayimda degil ... `{filebrowser}-bruce.livinity.io` diye gostermesi lazim {} icindeki kismi degistirebilmeliyim sadece. Ayrica AI kisminda MCP leri guncelle a dan z ye ve bir kac tane yeni local mcp ekle! AI kisminda Skills bolumude olsun. OpenClaw icin yapilmis bir market varsa orayi kopyalayabilirsin"

**Goal:** Operator can (a) add ANY MCP server via UI without WRONGTYPE/silent-fail; (b) sees a usable subdomain change dialog (hyphen-pattern template, editable slug only); (c) DNS pending status either resolves or surfaces actionable error; (d) browses a rich MCP catalog (15+ servers) in /settings; (e) browses + installs Skills from an in-product market (OpenClaw/aitmpl-shaped).

**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST stay through every commit.

**Effort:** ~10-14 hours (2 long sessions).

**Atomic commits:** 9 (T1–T9). Wave-parallelisable as marked.

---

## Tasks

### T1 — Diagnose "can't add MCP" + fix the add-dialog flow [research → fix]

**Why:** Operator: "Bazi mcp serverlari ekleyemiyorum!". Filesystem went in (via my T6 inline migration), but other MCPs fail silently or with cryptic error. Need repro + root cause.

**Action:**
1. Read `livos/packages/ui/src/modules/window/app-contents/settings/SettingsMcp*.tsx` (or wherever the AddMcpServerDialog lives). Identify the tRPC call (likely `mcp.config.add`).
2. Read `livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts:add` — note the validation (`NameSchema`, `RESERVED_NAMES`, `MCP_NAME_TAKEN` conflict, `mirrorMcpEntryToOpenclawJson`).
3. Reproduce on Mini PC: try adding `git`, `github`, `sequential-thinking`, `everything`. Capture exact UI error + livinityd journal.
4. Common failure modes to check:
   - **Validation rejection** — names with capital letters, hyphens at edges, etc.
   - **Openclaw mirror failure** — `mirrorMcpEntryToOpenclawJson` throws when `/opt/livos/data/openclaw/openclaw.json` has bad perms.
   - **UI state desync** — dialog closes but list doesn't refresh (no `invalidate` after mutation).
   - **Required field UX** — operator may be leaving `command`/`args` empty for stdio transport.
5. Fix the root cause(s). If UI-side, patch the dialog + ensure tRPC `.invalidate()` on success. If server-side, fix validation + error surfacing.

**Acceptance:**
- Operator adds `git`, `github`, `everything`, `sequential-thinking` via UI in succession.
- All appear in HKEYS list. No WRONGTYPE. No silent fail.
- Removing then re-adding any of them succeeds (Phase 218 T6 regression check).

**Commit:** `fix(219-T1): MCP add dialog — surface errors + invalidate list on success`

---

### T2 — MCP catalog refresh A-Z [research]

**Why:** Operator: "MCP leri guncelle a dan z ye". `scripts/install/seeds/mcp-servers.json` currently has 2 entries (`sequential-thinking`, `luse`). The published MCP ecosystem has ~30+ mature stdio servers worth shipping by default.

**Action:**
1. Research current canonical MCP servers from `modelcontextprotocol/servers` GitHub repo, Smithery registry, plus operator-likely picks. Target ≥15 entries.
2. Seed catalog — alphabetical, each entry: `name, transport, command, args, env (with placeholder tokens), description, category, enabled: false by default`. Categories: `files`, `dev`, `search`, `productivity`, `database`, `system`, `web`, `ai`.
3. Update `scripts/install/seeds/mcp-servers.json` so new installs land with the full catalog seeded (enabled=false for everything except `luse` + `sequential-thinking`).
4. Add a tRPC procedure `mcp.config.catalog` that returns the catalog (read-only, all fields). UI's "Add MCP" dialog grows a "Browse catalog" panel that lets operator pick from the list and pre-fill the form.
5. **NEVER auto-enable** any non-default server — that's an explicit operator action via the UI toggle. INV.

**Suggested catalog seeds (researcher refines):**
- `brave-search`, `everything`, `fetch`, `filesystem`, `git`, `github`, `gitlab`, `gmail`, `google-calendar`, `google-drive`, `google-maps`, `kubernetes`, `memory`, `postgres`, `puppeteer`, `sequential-thinking`, `slack`, `sqlite`, `time`

**Acceptance:**
- `scripts/install/seeds/mcp-servers.json` has ≥15 entries, alphabetized, all `enabled: false` (except 2 system defaults).
- `mcp.config.catalog` returns the list; `/settings → MCP → Add → Browse` shows category-grouped picker.
- Selecting `git` pre-fills name + command + args. Operator confirms → entry lands in HASH.

**Commit:** `feat(219-T2): MCP catalog refresh — 15+ curated servers + Browse picker`

---

### T3 — New local LivOS MCP servers [parallel with T2]

**Why:** Operator: "bir kac tane yeni local mcp ekle". LivOS's strength is on-box state — file system, docker, system metrics, agents. New local MCPs surface those to chat without operator wiring custom tools.

**Action:**
1. Scaffold 4 new local stdio MCP servers under `livos/packages/livinityd/source/modules/mcp/local/`:
   - **`liv-docker`** — wraps `docker ps`, `docker logs`, `docker restart`. Read-only by default; mutation gated by approval.
   - **`liv-system`** — CPU/memory/disk/uptime snapshots. Wraps `system` module's existing primitives.
   - **`liv-apps`** — list user_app_instances, query subdomain, query port. Read-only.
   - **`liv-vault`** — note CRUD over `~bruce/livinity/<agent>/notes/` (matches feedback_v38_3_drop_vault_concept — single dir under livinity/, no separate vault/).
2. Each server: `index.ts` + `manifest.json` (declares tools list with schema), entry point `tsx <path>/index.ts`.
3. Seed entries in `mcp-servers.json` (enabled=false by default; operator opts in).
4. Manifest must declare `system: true` so they don't show Delete button (matches `luse` pattern in mcp-config-router.ts).

**Acceptance:**
- All 4 spawn cleanly via McpBridge reconciler on enable toggle.
- `liv-docker.containers.list` returns the same set as `docker ps --format json`.
- `liv-system.usage` returns valid CPU/mem snapshot.
- All 4 visible in `/settings → MCP` list with `system: true` (no Delete button).

**Commit:** `feat(219-T3): 4 local LivOS MCP servers — docker, system, apps, vault`

---

### T4 — DNS-pending bug: diagnose Phase 140 mint flow

**Why:** Operator: "DNS PENDING diyor surekli". The "Public Access" surface on File Browser shows DNS pending forever. Phase 140 was supposed to mint a CF DNS record via Server5 then mark the subdomain ready; either the mint isn't happening or the status read isn't updating.

**Action:**
1. Read `livos/packages/livinityd/source/modules/domain/routes.ts:setAppSubdomain` + the Server5 mint helper (Phase 140-08 area).
2. Reproduce by triggering the public-access toggle on File Browser. Capture:
   - The Server5 mint request payload + response (curl reproduction from Mini PC).
   - The local cache update (`user_app_subdomains` row write?).
   - The UI poll endpoint that returns "pending" — what does it actually check?
3. Three plausible root causes:
   - **Server5 returns 200 but UI reads stale local cache** — fix: invalidate after mint OR change UI to read live.
   - **Server5 mint silently fails** — fix: surface error UI-side + retry button.
   - **DNS propagation poll never completes** — fix: poll CF DNS via `dig` or trust the Server5 response.
4. Fix the actual root cause. Add ≥3 unit tests covering the now-known failure modes.

**Acceptance:**
- File Browser → Public Access → toggle on → status transitions `pending → ready` within ≤30s.
- Status stays accurate after page refresh (no false "pending" on a working subdomain).
- An error on the Server5 side surfaces with operator-readable text + retry button, NOT a stuck "pending".

**Commit:** `fix(219-T4): DNS pending status — actually transition to ready (or error)`

---

### T5 — Subdomain change dialog UX [parallel with T4]

**Why:** Operator: "files.bruce.livinity.io boyle gosteriyor ama files.bruce.livinity.io da yayimda degil … `{filebrowser}-bruce.livinity.io` diye gostermesi lazim {} icindeki kismi degistirebilmeliyim sadece". The dialog still emits the legacy dot pattern AND shows the full FQDN as a single editable field. Phase 210 minted the hyphen contract; this dialog never got updated.

**Action:**
1. Find `ChangeSubdomainDialog` (or similar) in `livos/packages/ui/src/modules/window/...`. Identify the input field shape.
2. Redesign per operator spec — render as:
   ```
   [filebrowser]-bruce.livinity.io
   ^^^^^^^^^^^^^
   (editable text input)
   ```
   The user-prefix and apex are gray, non-editable text (CSS `<span>`). The slug is the only `<input>`.
3. Validation:
   - Slug: `^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$` (DNS label rules).
   - No duplicates across the operator's other subdomains (preflight check via `domain.list`).
4. Submit → tRPC `domain.setAppSubdomain` with the hyphen-shape FQDN as the `host` field (Phase 141-03 contract). The slug-only `subdomain` field gets the slug for back-compat.
5. Show a "Saving… → DNS propagating… → Live ✓" status badge below the input. Read from T4's resolved status.

**Acceptance:**
- Dialog shows `[<input>]-bruce.livinity.io` template — only the slug input is editable.
- Typing `photos` → preview shows `photos-bruce.livinity.io`. Submit → DNS minted → status transitions to "Live ✓".
- Invalid slug (`Photos`, `-foo`, `foo!`) shows inline validation error, submit disabled.
- Existing subdomain collision is rejected with `MCP_NAME_TAKEN`-style error.

**Commit:** `feat(219-T5): subdomain change dialog — hyphen-pattern template, slug-only editable`

---

### T6 — Skills infrastructure (storage + agent runtime loading)

**Why:** Operator: "AI kisminda Skills bolumude olsun". Skills are markdown-with-frontmatter agent capabilities (claude-code's `~/.claude/skills/` model). Lets operators install pre-built behaviors per agent without touching agent code.

**Action:**
1. Filesystem contract: `~bruce/livinity/<agent-slug>/skills/<skill-slug>/SKILL.md`. Frontmatter:
   ```yaml
   ---
   name: <slug>
   description: <one-liner — used by agent to decide relevance>
   tools: [<optional list of MCP tool names this skill needs>]
   ---
   <markdown body — the skill's actual instructions>
   ```
2. Schema validation module `livos/packages/livinityd/source/modules/skills/schema.ts` — Zod, mirrors the Claude Code skill format. Reject on invalid frontmatter.
3. Skill loader in the agent runtime — when an agent starts, walks its skills dir, indexes `name + description` into a system-prompt-injectable manifest. When the user message contains a topic match (substring of description's keywords), the skill body gets prepended to the agent's working context.
4. tRPC routes (admin-gated): `skills.list({agentSlug})`, `skills.get({agentSlug, skillSlug})`, `skills.delete({agentSlug, skillSlug})`. Install lands via T7 marketplace; CRUD is read+delete only here.
5. Per-skill audit log: every time a skill body gets injected, log to `device_audit_log` so the operator can later see "agent X used skill Y on message Z".

**Acceptance:**
- Drop a hand-written `SKILL.md` under `~bruce/livinity/liv-ai/skills/test-skill/` → agent picks it up on next chat.
- `skills.list` returns the row.
- `skills.delete` removes it (live agents reload manifest on the change).
- Invalid frontmatter is rejected at load time with a journal log.

**Commit:** `feat(219-T6): skills infrastructure — filesystem contract + agent loader`

---

### T7 — Skills marketplace UI + curated registry [depends on T6]

**Why:** Operator: "OpenClaw icin yapilmis bir market varsa orayi kopyalayabilirsin". aitmpl.com + claude-code-templates is the reference UX — categorized cards, one-click install. LivOS surface is a new `Skills` tab inside `/settings → AI`.

**Action:**
1. Curated registry: new GitHub repo `utopusc/livinity-skills` with `registry.json` at root listing all skills (slug, name, description, category, agent compatibility, GitHub raw URL of SKILL.md). Researcher seeds 10-15 skills covering: code review, frontend design, devops, prompt engineering, brainstorming, web research, debugging.
2. Backend: tRPC `skills.market.list({category?})` fetches `registry.json` (cached 1h), returns shaped catalog. `skills.market.install({agentSlug, skillSlug})` fetches the SKILL.md raw and writes it into the agent's skills dir.
3. UI: new tab in `/settings → AI` titled "Skills". Layout: category sidebar (10 categories) + card grid. Each card: mascot emoji + name + description + Install / Installed badge / Open button. Matches aitmpl.com visual language but uses LivOS Design System tokens.
4. Per-skill page: opens in a slide-over panel with full markdown rendering + "Install on liv-ai" / "Install on …" buttons (lists agents the skill is compatible with).
5. Telemetry-free: NO download counters phoned home — purely operator-visible install state.

**Acceptance:**
- `/settings → AI → Skills` renders 10+ cards across categories.
- Clicking Install on a skill writes `SKILL.md` to the agent's skills dir within 5s.
- Re-opening Skills tab shows Installed badge for installed skills.
- Liv AI agent picks up the new skill on next chat (validated via T6's loader).
- Operator can uninstall via the per-skill panel → file removed → badge flips.

**Commit:** `feat(219-T7): skills marketplace — Settings → AI → Skills tab + registry`

---

### T8 — OpenClaw / openui-market reference research [parallel with T7 — informs UI]

**Why:** Operator: "OpenClaw icin yapilmis bir market varsa orayi kopyalayabilirsin". Before T7's UI lands, scan the OpenClaw ecosystem for an existing market we can crib from. Better to import an existing shape than invent.

**Action:**
1. WebSearch + WebFetch:
   - `openclaw-os` GitHub for plugins / marketplace
   - `aitmpl.com` (claude-code-templates) source + visual language
   - `cursor.directory`, `smithery.ai`, `mcp.so` for adjacent inspirations
2. Document the 2-3 closest matches in `.planning/phases/219-mcp-skills-subdomain-ux/RESEARCH-skills-market.md` — screenshots, file structure, JSON registry shape, install primitive.
3. T7's UI cribs visual language + registry JSON shape from the closest match. T7 PR references this research file.
4. **Out of scope:** building a public-facing market (livinity.io/skills) — that's a v42 surface. T7 is in-product only.

**Acceptance:**
- RESEARCH-skills-market.md exists with ≥3 reference points, screenshots, registry shape examples, decision matrix.
- T7 commit message references this file in its body.

**Commit:** `docs(219-T8): research — OpenClaw / aitmpl / claude-code-templates reference`

---

### T9 — E2E smoke + SUMMARY [final]

**Action:**
1. After T1-T8 deployed to Mini PC, walk:
   - Add `git` MCP via UI → appears in HKEYS → Liv AI sees git tools after restart.
   - Click File Browser → Public Access → toggle on → DNS resolves within 30s, "Live ✓" badge.
   - Click Change subdomain → `[<editable>]-bruce.livinity.io` template renders → change → DNS re-mint succeeds.
   - Settings → AI → Skills → install "code-reviewer" skill on Liv AI → ask Liv AI "review my latest commit" → skill body injected into context (verify via journal).
   - Browse 4 new local MCPs (`liv-docker`, `liv-system`, `liv-apps`, `liv-vault`) → enable `liv-system` → ask "what's my disk usage" → answer includes percentages.
2. SUMMARY.md with curl + screenshot evidence for each.
3. Update `feedback_caddyfile_must_be_bruce_owned.md` memory with any new learnings.

**Commit:** `ship(219): MCP/Skills/Subdomain UX — END-TO-END WORKING`

---

## Out of scope (defer to 220+)

- **Public-facing skills marketplace at `livinity.io/skills`** — Vercel/Supabase work. T7 is in-product only.
- **Skill versioning + auto-update** — skills are MD files; operator manages by re-installing.
- **Per-skill telemetry** — D-219-NO-PHONE-HOME constraint. Maybe v44.
- **Multi-agent skill copy-from-agent-X-to-agent-Y** — manual cp for now.
- **OpenClaw plugin SDK refresh** — separate phase.

## Dependencies + ordering

```
T1 ─ standalone (UI mutation fix)
T2 ─┐ parallel
T3 ─┘
T4 ─┐ parallel
T5 ─┘ (T5 reads T4's status field)
T8 ─ parallel (research, informs T7)
T6 ─ standalone (skills infra)
T7 ─ depends on T6 + T8
T9 ─ final, depends on T1..T8
```

Wave parallelisable as: **Wave A** = T1 + T2 + T3 + T4 + T8 (5 parallel), **Wave B** = T5 + T6 (after A), **Wave C** = T7 (after B), **Wave D** = T9 (final).

---

## Activation instructions (post-/clear)

After `/clear`:

```
Continue executing Phase 219 from .planning/phases/219-mcp-skills-subdomain-ux/219-PLAN.md.
Start at Wave A (T1+T2+T3+T4+T8 in parallel). Each task = atomic commit, push, Mini PC update.sh, verify, next.
Sacred SHA preserved across all commits.
```

Or via GSD orchestrator:

```
/gsd-execute-phase 219
```
