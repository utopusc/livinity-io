# MILESTONE-CONTEXT — v29.4 (Draft)

**Captured:** 2026-05-01 (post v29.3 hot-patch sweep, before /gsd-new-milestone runs)
**Source:** Live user testing on Mini PC after Phase 43.7-43.12 deploys (deployed-sha 9f1562b)

This file is consumed by `/gsd-new-milestone` per its workflow. Step 2 of the
workflow says: **"If MILESTONE-CONTEXT.md exists: Use features and scope from
discuss-milestone, present summary for confirmation."**

## Proposed Milestone Name

**v29.4 — Server Management Tooling + Bug Sweep**

## Goal (one sentence)

Restore Nexus AI's missing built-in tools (shell, Docker, files), add a
Server Management surface for Fail2ban / IP-ban administration so SSH
access stays operable, and clean up four lingering v29.3 bugs surfaced
during marketplace install testing.

## Why this milestone exists

User ran v29.3 marketplace install testing and surfaced four classes of
issues that aren't pure bugs (some are missing features, some are scope
creep, some are real regressions). Bundling them into one milestone is
cleaner than scattering them across hot-patches:

1. **Nexus AI tool registry regression** — built-in tools (shell, docker_list,
   docker_manage, docker_exec, files, pm2, web tools, messaging) are no longer
   exposed to Nexus chat. User can only access Google Drive, Notion, and the
   `livinity_*` marketplace tools. `tool-registry.ts:32-33` declares these
   tool names but capability-registry sync (Phase 22) appears to skip the
   built-in tier on init, OR the Redis-backed registry persistence dropped
   them at some point.

2. **Model identity hallucination — partial fix didn't stick** — Phase 43.10
   added a dynamic `You are powered by the model named X` line to the system
   prompt, and Phase 43.12 bumped tierToModel to current 4.X ids. Live test
   after deploy still shows: "Tam olarak hangi Claude versiyonu üzerinde
   çalıştığım hakkında kesin bir bilgiye sahip değilim — bu bilgi bana
   sağlanmıyor." Either the Phase 43.10 dist drift is still present, OR the
   identity line is being suppressed downstream (preset behavior, append
   ordering — see SDK research notes), OR the LLM is confabulating around
   the line when asked colloquially.

3. **Bolt.diy proxy error** — `bolt.bruce.livinity.io/` returns "Error
   occurred while trying to proxy". Sibling repo manifest pushed (e9e65cf9),
   builtin-apps.ts entry deployed (e7f34121), platform DB seeded
   (f4f208a7 + UPDATE on Server5). Root cause unconfirmed (Mini PC SSH
   inaccessible from main agent — NAT/private IP). Likely candidates:
   container still pulling 400MB image, container crashed, subdomain
   not registered in Caddy, or registered with wrong port.

4. **Marketplace ana sayfada Bolt.diy görünmedi** (kullanıcının önceki
   raporu) — could be CDN caching at livinity.io edge, service worker on
   user's browser, or the platform Next.js page render was stale even
   after PM2 restart. Category fix applied (developer-tools); needs
   re-test post service-worker clear.

User's quote (untranslated, captured for fidelity):
> "Onceden boyle degildi sen bisileri degistirmissin. Burasi icin bu butun
> sorunlar icin Gsd ile cok detayli bir milestone olustur ve Bu ssh bazen
> kapali oluyor Server Management kisminda ben gormek istiyorum failtoban
> kisiminda kullanicilari istersem UI dan ban acmak istiyorum bu sayede sen
> ssh ile baglanabilirsin."

Translation:
> "It wasn't like this before — you must have changed something. For all
> these problems, create a very detailed milestone with GSD. Also: SSH is
> sometimes closed. I want to see [this] in Server Management. In the
> Fail2ban section, if I want, I want to unban users from the UI — so
> that you [Claude] can connect via SSH."

**Important context — git log proves Claude did NOT modify the tool
registry**: `git log 781ebc95..HEAD` for `nexus/packages/core/src/`
shows only `sdk-agent-runner.ts` (3 surgical edits — Phase 40/43.8/43.10/43.12)
and one new line in 43.12 tierToModel. `tool-registry.ts` is byte-identical
to the v29.3 baseline. Tool list change must have come from an earlier
commit, a Redis state change (factory-reset wiped the registry?), or a
runtime init path that wasn't exercised.

## Target Features (8 candidates — discuss-milestone narrows)

### A. Bug fixes (carry from v29.3 hot-patches)

- **A1. Nexus tool registry diagnostic + restore.** Why are built-in tools
  (shell, docker_*, files, web, messaging) not exposed to Nexus chat? Two
  paths to investigate before fixing:
  - Capability-registry init flow (Phase 22) — does it auto-sync from
    ToolRegistry on livinityd boot, or is registration manual?
  - Redis state — is `nexus:capabilities:*` polluted by an old factory-reset
    or partial sync? Flush + re-init might be the simple fix.
  - Acceptance: Nexus chat can call `shell`, `docker_list`, `files_read`,
    `web_search` directly, and lists them via "what tools do you have?".

- **A2. Model identity stability.** Verify Phase 43.10 dist drift is gone
  on Mini PC (manual `grep` in pnpm-store @nexus+core* dirs). If drift
  persists, fix `update.sh` pnpm-store dist-copy step (BACKLOG 999.5b
  follow-up). Also: verify the identity line actually reaches the model
  by curl-testing the broker `/v1/messages` and inspecting the Claude
  Agent SDK transcript. Possible secondary fix: switch from raw
  systemPrompt to `{ type: 'preset', preset: 'claude_code' }` (the SDK
  research recommended this for identity parity with Claude Code CLI).
  - Acceptance: "Hangi modelsin?" reliably returns "Claude Sonnet 4.6" /
    "Claude Opus 4.7" across Nexus chat AND broker-routed apps.

- **A3. Bolt.diy proxy reachability.** Get to root cause of
  `bolt.bruce.livinity.io` returning 302/login (subdomain not registered)
  or proxy error (subdomain registered but backend down). Mini PC SSH
  diagnostic required — gated on A4 below if user wants Claude to
  self-diagnose.
  - Acceptance: `bolt.bruce.livinity.io` loads Bolt.diy UI; user picks
    "OpenAI-Like" provider, enters Claude model id, gets a working chat.

- **A4. Marketplace browse Bolt.diy visibility.** Post-Server5 web restart,
  Bolt.diy should be in Featured + Dev Tools section. If still missing
  after browser cache clear, investigate platform/web Next.js ISR cache,
  Vercel/CDN edge cache, or page-level revalidate intervals.
  - Acceptance: Marketplace home shows Bolt.diy without manual search.

### C. v29.3 Carry-Forward (from milestone audit, MiroFish dropped per user)

Audit report: `.planning/v29.3-MILESTONE-AUDIT.md` · Integration check: `.planning/v29.3-INTEGRATION-CHECK.md` · User decision 2026-05-01: "MiroFish'i siktir et" → FR-MARKET-02 dropped, NOT carried forward. Other gaps inherited:

- **C1. Broker error-path 429 forwarding (FR-DASH-03 closure).** `livos/packages/livinityd/source/modules/livinity-broker/router.ts:159` currently returns `res.status(500)` for ALL upstream errors — must forward upstream HTTP status (especially 429). `livos/.../livinity-broker/agent-runner-factory.ts:75-76` extracts only status text — must also extract `Retry-After` header and forward it. Until this lands, capture middleware's throttled-row guard `res.statusCode === 429` is structurally unreachable and the Phase 44 rate-limit banner only fires on synthetic INSERTs.
  - Acceptance: integration test mocking nexus 429 → broker returns 429 + Retry-After preserved + `broker_usage` throttled row written + UI banner shows critical state.
  - Scope: 2 files, ~10 lines, ~3 unit tests. Small surgical phase.

- **C2. Sacred file integrity test re-pin.** `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts:33` BASELINE_SHA = `623a65b9a50a89887d36f770dcd015b691793a7f` (Phase 40 baseline). Current `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` = `4f868d318abff71f8c8bfbcf443b2393a553018b`. Test will FAIL on next CI run. Drift is from accumulated v43.x surgical edits (43.8 `??` operator, 43.10 identity prepend, 43.12 tierToModel bump) per A2 above. Either follow Phase 40 D-40-01 ritual (verify behavior-preserving + re-pin BASELINE_SHA + commit) or revert any unintended drift. Couple this to A2 since identity work touches the same file.
  - Acceptance: `npm run test:phase39` (which chains the integrity test) passes; new BASELINE_SHA committed with documenting comment listing all surgical edits since `623a65b9...`.

- **C3. tRPC routes on `httpOnlyPaths`.** Five routes added in v29.3 are NOT registered in `livos/packages/livinityd/source/server/trpc/common.ts` `httpOnlyPaths`: `claudePerUserStartLogin` (sub), `usage.getMine` (q), `usage.getAll` (q). Per project pattern (e.g., `system.checkUpdate`), interactive subscriptions and dashboard queries belong on HTTP to survive WS reconnects. Hang risk after livinityd restart or WS reset.
  - Acceptance: routes added to `httpOnlyPaths`; manual test of livinityd restart → AI Configurations page renders usage immediately, claude-login subscription survives reconnect.

- **C4. OpenAI SSE `usage` chunk emission (FR-DASH-01/02 completeness).** `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts` does not emit a final `data:` chunk carrying `usage: {prompt_tokens, completion_tokens}` per OpenAI streaming spec. Result: `usage-tracking/parse-usage.ts:108-110` documents that ALL OpenAI streaming traffic produces zero `broker_usage` rows. Dashboard is blind to OpenAI-streaming marketplace apps.
  - Acceptance: integration test — OpenAI SSE stream from broker contains a `usage` chunk before `[DONE]`; capture middleware writes a row; dashboard surfaces it.

**Note:** C1 + C2 + C3 + C4 are all small surgical fixes that could roll into a single closing phase ("v29.3 carry-forward sweep") OR be distributed across the 7 v29.4 phases by topical fit. Roadmapper decides.

**Out of scope (explicitly dropped 2026-05-01):**
- FR-MARKET-02 (MiroFish marketplace anchor) — user closed: "MiroFish'i siktir et". Manifest draft + 43-UAT.md remain in `.planning/phases/43-.../` as historical artifacts. Future anchor app candidate is a v30+ conversation if at all.
- Live UAT execution of v29.3 phases (39 → 44) — all 6 UAT files un-executed. Operator-deferred to natural deploy cadence; not blocking v29.4.

### B. New features (user-requested in this conversation)

- **B1. Server Management → Fail2ban panel.** Sidebar entry under the
  existing Docker app (LIVINITY_docker, v28.0). Lists banned IPs, last
  ban time, attempted-service. Surfaces fail2ban-client jail status for
  sshd / nginx / generic.
  - Acceptance: User opens Server Management, clicks "Fail2ban", sees
    a table of currently-banned IPs.

- **B2. UI-driven IP unban.** From the Fail2ban panel, an "Unban" action
  per row that calls `fail2ban-client set <jail> unbanip <ip>` server-side.
  Admin-only (RBAC enforce — adminProcedure). Audit log entry per unban.
  - Acceptance: User unbans an IP from the UI; SSH from that IP succeeds
    immediately.

- **B3. Mini PC SSH gateway / reachability.** Two interpretations to
  surface in discuss-milestone:
  - **B3a — passive:** Just B1+B2 — when SSH fails because the IP got
    auto-banned, user unbans via UI, SSH works again. No new infra.
  - **B3b — active:** Tailscale / WireGuard / Cloudflare Tunnel install
    + auto-config so Claude can SSH from the cloud agent host (Server5,
    or the developer machine) without depending on the user's home
    network being reachable. Bigger scope; needs threat model review.

- **B4. Optional: SSH session viewer in Server Management.** Live tail of
  `journalctl -u ssh` filtered to recent connections, with geo-IP. Stretch
  goal — drop if discuss-milestone surfaces no demand.

## Locked Decisions (carry from v29.3)

- **D-NO-BYOK** preserved — no API key path, only Claude subscription via
  broker. Any new feature in v29.4 inherits this rule.
- **D-NO-SERVER4** preserved — Server4 off-limits. v29.4 only deploys to
  Mini PC (and Server5 for platform/web changes).
- **D-TOS-02** preserved — broker NEVER goes through raw `@anthropic-ai/sdk`,
  always through Agent SDK `query()`. Identity line fix in 43.10 stays.
- **Sacred file** `nexus/packages/core/src/sdk-agent-runner.ts` — three
  surgical edits accumulated (Phase 40 homeOverride, 43.8 `??`, 43.10
  identity prepend + 43.12 tierToModel bump). New milestone may need a
  fourth surgical edit if A2 requires switching to `{type: 'preset'}`
  systemPrompt — that's structurally bigger than prior edits and should
  go through discuss-phase explicitly.

## Scope Notes

- **NOT in v29.4:** new chat UIs, MiroFish fork (BACKLOG 999.7),
  multi-LLM routing, OAuth UI rework, mobile-specific work.
- **In scope but maybe deferred:** B4 (SSH session viewer) — let
  discuss-milestone decide.

## Suggested Phase Breakdown (rough — roadmapper will refine)

| Phase | Goal | Dependencies |
|---|---|---|
| 45 | Nexus tool registry diagnostic + restore (A1) | — |
| 46 | Model identity dist-drift + preset systemPrompt evaluation (A2) + sacred file SHA re-pin (C2) | — |
| 47 | Bolt.diy proxy + marketplace visibility live audit (A3 + A4) | needs 45 to surface SSH diagnostics |
| 48 | Fail2ban panel — backend (B1) | — |
| 49 | Fail2ban panel — frontend + RBAC unban (B2) | 48 |
| 50 | Mini PC SSH gateway decision (B3a vs B3b) — threat model + spike | 49 |
| 51 | v29.3 carry-forward sweep — broker 429 forwarding (C1) + httpOnlyPaths fix (C3) + OpenAI SSE usage chunk (C4) | — |
| 52 (optional) | SSH session viewer (B4) | 48-50 |

Phase numbering continues from v29.3's last phase (44).

## Open Questions for /gsd-discuss-milestone

1. Is **B3a (passive — just unban UI)** enough, or do you want **B3b
   (active — Tailscale/WG/CF Tunnel)** so Claude can SSH from anywhere?
2. Does the new "Server Management → Fail2ban" panel live inside
   LIVINITY_docker (v28.0 app) as a new sidebar entry, or as a
   standalone LIVINITY_security app? Naming + placement matters for
   the windowed-app pattern.
3. What's the Anti-fragile fallback if `fail2ban-client` is not
   installed on a fresh Mini PC? Detect-and-suggest, or auto-install
   during install.sh?
4. Phase 43.x sweep produced THREE iframes, THREE install handlers
   (BACKLOG 999.8). Do we consolidate them in v29.4 (preventive
   tech debt) or defer to v29.5+?
5. Identity bug A2 — if dist drift is the root cause, the right fix
   is upstream (`update.sh` pnpm-store handling). If preset systemPrompt
   is the right answer, the fix is in `sdk-agent-runner.ts`. We should
   diagnose before planning.

## How to use this file

After `/clear`, run:

```
/gsd-new-milestone v29.4
```

The workflow detects this MILESTONE-CONTEXT.md, presents a summary for
confirmation, then proceeds to research → requirements → roadmap.
Suggest answering the 5 open questions above interactively when discuss
prompts.
