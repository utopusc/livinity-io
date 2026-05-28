# Phase 240: Local Agents — install-from-UI — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss; user invoked /gsd-autonomous --from 240)

<domain>
## Phase Boundary

Extend AionUi's Local Agents tab inside Liv AI with an "Available to Install" section for undetected CLIs + one-click install + auth flow. Surface the 5 supported CLI agents (claude-code / opencode / gemini / openclaw / aion-cli) shipped in Phase 239 — for the ones not yet installed, show an Install button; after install, show an Auth button that launches the per-agent auth flow.

</domain>

<decisions>
## Implementation Decisions

### Locked from prior phases (do NOT re-decide)
- **L-240-A:** Reuse `cliInstaller.install` and `cliInstaller.detect` tRPC procedures shipped in Phase 239 (D-239-07 RCE-bounded whitelist already enforced server-side). Do NOT invent a parallel install API.
- **L-240-B:** SUPPORTED_CLIS contract is the 5-tuple `['claude-code','opencode','gemini','openclaw','aion-cli']` exported from `livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts` (D-239-10).
- **L-240-C:** Phase 241 already registers MCP tools (luse / docker / shell + 2 system MCPs) but does NOT expose a CLI-install MCP tool. Phase 240 uses the existing **tRPC** path, not MCP. Direction-row "install scripts injected via MCP tool" is OBSOLETED by 239's tRPC surface.
- **L-240-D:** AionUi is a vendored 3rd-party React app served by `liv-assistant.service` on Mini PC port 3020 via Caddy `/liv` proxy (Phase 223 + 226). The Local Agents tab lives INSIDE that vendored React tree. UI changes happen via vendor-patch (`/opt/liv-assistant/current/` or its source-tree mirror) + redeploy through `liv-assistant` systemd, NOT inside `livos/packages/ui/`.
- **L-240-E:** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) UNCHANGED. Pre-commit hook enforces.
- **L-240-F:** Mini PC `bruce@10.69.31.68` is the only target. Server4 + Server5 hard-rule applies.

### Claude's Discretion
- HTTP transport from AionUi → livinityd: pick the simplest working path (direct fetch to `https://<host>/trpc/cliInstaller.install` from the iframe, with the existing CORS / auth-bypass posture from Phase 234-04). If CORS blocks the iframe call, route via Caddy reverse proxy.
- Auth flow per CLI: each of the 5 CLIs has its own auth idiom (`claude code login`, `opencode auth`, etc.). For the v43 first cut, the "Auth" button shells out via a NEW livinityd tRPC mutation `cliInstaller.auth(name)` that spawns the agent's canonical login command in a detached PTY and reports back via Redis status key `liv:cli:auth:<name>`. Aion CLI may ship without a working auth command (unverified per 239); button can be hidden for aion-cli.
- UI shape inside AionUi's Local Agents tab: append "Available to Install" subsection BELOW the existing detected-agents list. Each row = card with name + icon + Install button (or Installed ✓ pill + Auth button after install). Reuse AionUi's existing button styles — no new design tokens.
- `device_audit_log` reuse: write one row per install attempt + one row per auth attempt, action="cli_install" / "cli_auth".

</decisions>

<code_context>
## Existing Code Insights

- Phase 239 shipped: `livos/packages/livinityd/source/modules/cli-installer/{installer,detector,types,index,install-scripts}.ts` + `server/trpc/cli-installer-router.ts` (2 adminProcedures: install + detect). All HTTP-routed (httpOnlyPaths entries `cliInstaller.install` + `cliInstaller.detect` in `common.ts`).
- Phase 241 shipped: `livos/packages/livinityd/source/modules/mcp-registrar/` (registrar + transform + redis-catalog + seed orchestrator). NOT used here, but pattern shows how livinityd exposes modules to the AionUi iframe.
- Phase 223 vendored AionUi tarball: lives at `/opt/liv-assistant/current/` on Mini PC. The source mirror that gets deployed lives elsewhere (per Phase 223 vendor-and-wrap decision — likely tarballed at deploy time).
- Phase 226 Caddy `/liv` block: routes `https://bruce.livinity.io/liv*` → `localhost:3020` (the liv-assistant React app). To call livinityd from inside AionUi, use absolute path `/trpc/cliInstaller.*` which Caddy proxies to livinityd at `localhost:8080`.
- `device_audit_log` table: defined in livos PostgreSQL schema, used by Phase 178+. Schema: `id, ts, action, actor, detail jsonb`.

</code_context>

<specifics>
## Specific Ideas

- Default acceptance behavior: 3 UAT probes — (1) Open Liv AI → Local Agents → "Available to Install" shows 3 undetected CLIs (gemini/openclaw/aion-cli since claude-code+opencode are pre-installed on Mini PC per Phase 239 UAT). (2) Click Install on one → spinner → success → row converts to "Installed ✓ + Auth". (3) Click Auth → detached process launches → status reports back.
- Plan estimate: 3 plans — (240-01) livinityd `cliInstaller.auth` tRPC + `liv:cli:auth:*` Redis status keys + audit-log writes. (240-02) AionUi vendor-patch — Local Agents tab gains "Available to Install" subsection, calls cliInstaller.detect on mount, cliInstaller.install + .auth on click. (240-03) Deploy to Mini PC + 3 UAT probes.

</specifics>

<deferred>
## Deferred Ideas

- Uninstall button (out of v43 scope — Phase 246+ if requested).
- Per-CLI version pinning UI (out of scope).
- Auth-status realtime updates beyond Redis poll (websocket — Phase 247+).

</deferred>

<canonical_refs>
## Canonical References

- `.planning/phases/239-onboarding-cli-tools/239-01-SUMMARY.md` — cliInstaller tRPC + scripts contract
- `.planning/phases/239-onboarding-cli-tools/239-CONTEXT.md` — D-239-07 RCE boundary
- `.planning/phases/241-mcp-auto-add-liv-tools/241-04-SUMMARY.md` — Mini PC deploy pattern
- `.planning/phases/223-aionui-systemd-service-and-deploy/` — vendored AionUi layout
- `.planning/phases/226-caddy-liv-proxy/` — `/liv` proxy + absolute API path
- `livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts` — SUPPORTED_CLIS source of truth
- `livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts` — adminProcedure shape to extend with `auth`

</canonical_refs>
