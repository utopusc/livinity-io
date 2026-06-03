# LivOS Security Remediation — Design Proposal (Findings #2 & #3)

**Date:** 2026-06-03
**Status:** Design for decision (no code changed yet)
**Method:** Grounded in real-world industry implementations (cited). No invented mechanisms — every recommendation maps to a shipped product or published standard.
**Companion:** `SECURITY-AUDIT.md` (full 40-finding audit)

> Finding **#1 (LIVOS-003, docker.sock on OpenHands)** is accepted as operator-curated risk per the operator's decision. The residual item — restricting *new-app install of arbitrary compose* to admin-only — is folded into #3's pipeline hardening below, not re-argued here.

---

## Finding #2 — Autonomous agent runs shell/files/docker on the host with no containment

### The decision the operator made
> "I want to leave this to AI control — but I want to go **beyond** this problem."

Correct instinct, and it matches where the whole industry landed. **Nobody who ships a serious autonomous agent keeps a manual per-action approval gate** — it defeats autonomy. Instead they keep the agent autonomous and **move the safety boundary off the LLM and onto the OS/network**. The LLM is assumed to be fallible (and prompt-injectable); the *blast radius* is what gets contained.

### What the LLM-judgment gate cannot fix (why "go beyond" is the right framing)
Simon Willison's **"lethal trifecta"** (cited): an agent is unconditionally exploitable when it simultaneously has (1) access to private data, (2) exposure to untrusted content, (3) an exfiltration path. LivOS's agent has all three today (host filesystem + user/file task input + shell-with-network). No prompt, no model alignment, and no "are you sure?" gate closes this — only **removing one leg of the trifecta** does. That is exactly the "beyond" the operator is asking for.

### How the named products actually do it

| Product | Isolation boundary | Egress | Human gate kept? |
|---|---|---|---|
| **Claude Code** | bubblewrap (Linux) / Seatbelt (mac): writes confined to workspace, network via proxy allowlist | default-deny + hostname allowlist; env credential scrub | Only for *irreversible* ops (force-push, prod deploy, IAM, exfil) — decided by a **classifier that never sees tool output** (injection-proof) |
| **OpenAI Codex** | bubblewrap+seccomp / Seatbelt; `workspace-write` default | network OFF by default | Only on boundary-crossing (out-of-workspace, network) |
| **Devin / E2B / Modal** | microVM (Firecracker) or gVisor — separate kernel per session | VM-level firewall | None — the VM boundary *is* the gate |
| **OpenHands** | Docker runtime container + risk-scored confirmation | Docker default (weak) | Only HIGH/UNKNOWN risk auto-paused |
| **Replit / Aider** | none — git/snapshot rollback is the whole safety model | none | none; after-the-fact rollback |

**The dominant pattern (Claude Code / Codex) = OS sandbox + egress allowlist + classifier-for-irreversible-only.** It is autonomous, runs locally (no microVM/KVM needed), and is deployable on the Mini PC today.

### Where LivOS is now
`liv/packages/core/src/sdk-agent-runner.ts:216,384` — every Nexus tool (shell, files, docker_exec, pm2) is wildcard-allowlisted and run with `permissionMode:'dontAsk'`; `:91` literally comments *"skip Nexus approval gate."* The `ApprovalManager` subsystem is unreachable. The agent runs **directly on the host as `bruce`**, can read `/opt/livos/.env`, `/opt/livos/data/secrets/jwt`, every user's files, and the Docker socket.

### Proposed LivOS design — "Contained Autonomy" (mirrors Claude Code Tier 2)

Keep `dontAsk` autonomy. Add three OS/network layers + one reversibility layer. **No manual approval gate is reintroduced** except for a tiny, injection-proof set of irreversible ops.

1. **Sandbox the agent's `shell`/`files` execution in `bubblewrap`** (already `apt`-installable on the Mini PC's Ubuntu 24.04 — same primitive Claude Code uses).
   - Write access: only the agent workspace (per-user scratch) + the project dir it's tasked on.
   - Read: deny-list `/opt/livos/.env`, `/opt/livos/data/secrets/`, `~/.ssh`, `~/.claude`, `~/.gemini`, every other user's `/home/*`.
   - No `/var/run/docker.sock` inside the sandbox. `docker_*` tools, if kept, go through a **scoped daemon API** (only the calling user's containers), never the raw socket.
2. **Egress allowlist via a local proxy** (socat/tinyproxy, Claude Code's model): allow only the LLM endpoint, GitHub, npm/pnpm registries. Deny everything else → **breaks the trifecta's exfiltration leg**, so even a fully prompt-injected agent cannot phone home.
3. **Subprocess credential scrub** (Claude Code's `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`): strip `LIV_API_KEY`, `DATABASE_URL`, JWT secret, Redis/PG creds from the agent's child-process environment before exec.
4. **Reversibility (Replit/Aider model):** auto-commit every agent file change to a per-session git ref so any run is one `git revert` from undo, independent of the sandbox.

**Optional later (multi-user scale):** if LivOS runs agents for multiple tenants, graduate from bubblewrap to a **Firecracker microVM or gVisor per session** (E2B/Modal model) for kernel-level cross-tenant isolation. Mini PC has 16 cores/32 GB and KVM is likely available (`ls /dev/kvm`) — but this is heavier and not needed for the single-operator case.

**The only retained human gate** (Claude Code auto-mode model): a *stripped-context* classifier — it sees the tool call but **not** tool output, so injected file/web content can't manipulate it — that blocks just: force-push/push-to-main, prod deploy/migration, mass-delete of pre-session files, IAM/secret grants, sending data off-box. Everything else stays fully autonomous.

---

## Finding #3 — Operator's Claude/Gemini OAuth tokens bind-mounted RW into third-party app containers

### The decision the operator made
> "Not sure about this one — think creatively, don't assume, follow how other companies solved it."

### The good news: LivOS already ships the industry-standard pattern — for the *other* path
`livos/.../apps/inject-ai-provider.ts` + `plugins/livinity-broker` is a textbook **LLM-gateway / credential-broker** (Pattern 1A): the broker holds the credential, the container gets only a base-URL + a sentinel key (`ANTHROPIC_API_KEY:'livinity-broker-managed'`), and auth is enforced by **source-IP + URL path**, not by anything the container holds. This is exactly how **LiteLLM Proxy**, **Cloudflare AI Gateway**, **OpenRouter BYOK**, **Portkey**, and **Helicone Vault** work (all cited). The container never sees a real key. ✅

### The problem: `requiresLocalAiClis` is a *second* path that bypasses the broker
`inject-local-ai-clis.ts:35-40` explains *why* it exists: the operator's `claude`/`gemini` CLIs authenticate with **OAuth subscription tokens** (Claude Pro/Max, Gemini OAuth) that the CLIs *refresh in place* — not metered API keys the broker can mint. So to let an app run the real CLIs "with the operator's own auth," the code bind-mounts `~/.claude` and `~/.gemini` **read-write** into the container and ACLs the container uid in. Any code in that container can read `.credentials.json` / `oauth_creds.json` and steal/overwrite the operator's subscription tokens. The schema comment claims a UI consent gate that **does not exist in the codebase**.

### How other companies solve *exactly this* (untrusted workload needs a CLI/account, must not hold the token)

Real, shipped products — this is a solved problem:

- **Infisical `agent-vault`** (GitHub, cited): a TLS-intercepting **egress credential proxy** built for AI agents. The agent's `HTTPS_PROXY` points at it; it mints per-host leaf certs, terminates TLS, and **injects the real `Authorization` header at the wire**. The workload holds only a placeholder `ANTHROPIC_API_KEY=__anthropic_api_key__`. Optional `--isolation=container` adds iptables egress enforcement. **This is purpose-built for the LivOS CLI case.**
- **Cloudflare Sandboxes "secure credential injection"** (changelog 2026-04-13, cited): outbound requests from a sandbox get credentials injected by the platform; sandbox code never sees them; egress is policy-controlled.
- **BerriAI `litellm-agent-platform`** (cited): runs coding agents in isolated sandboxes behind a vault proxy.
- The generic principle across **Vault response-wrapping**, **AWS STS / IMDSv2**, **GCP downscoped tokens**, **SPIFFE/SPIRE**: *the workload gets a short-lived, scoped, or wire-injected credential — never the long-lived secret on disk.*

### Two grounded options for LivOS (pick one)

**Option A — Egress auth proxy (Infisical agent-vault / Cloudflare model). Recommended.**
Mount the CLI binaries + glibc as today, but **do NOT mount `~/.claude` / `~/.gemini`**. Instead:
- Run a host-side **credential-injecting proxy** that holds the OAuth tokens.
- Container env: `HTTPS_PROXY=http://livinity-credproxy:PORT`, `ANTHROPIC_API_KEY=__managed__` (placeholder).
- The CLI makes its normal HTTPS calls; the proxy injects the real bearer for `api.anthropic.com` / Gemini hosts only; the **token file never enters the container**. Token theft and token overwrite both become impossible.
- Reuses the broker philosophy you already trust; the new piece is wire-level injection for OAuth (which the API-key broker can't do).

**Option B — Extend the existing `livinity-broker` to also serve the CLIs.**
Point `ANTHROPIC_BASE_URL` at the broker (Claude Code/`OPENCODE_CONFIG_JSON` already read base-URL — your broker already sets these). The broker terminates and re-auths upstream with the operator's session. Cleanest conceptually (one trust boundary), but needs the broker to bridge OAuth-subscription auth, more work than A.

**For genuinely untrusted marketplace apps (either option):** mint a **per-app metered API key** (real provider key or a broker virtual-key with a budget/model allowlist) instead of lending the operator's personal subscription at all — the LiteLLM/OpenRouter "virtual key per workload" model. Per-workload identity beats sharing a human's account (SPIFFE/Aembit principle, cited).

### ⚠️ Honest caveat the operator must weigh (not an assumption — a cited fact)
Anthropic has **publicly moved to restrict third-party tools driving a personal Claude subscription** ([The Register, Feb 2026](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/)). Option A/B technically protect the *token* from theft, but routing a third-party app's inference through the operator's *personal subscription* may violate provider ToS regardless of mechanism. The clean, ToS-safe answer for untrusted apps is the **per-app metered key** path above. The egress-proxy is the right call for *first-party / operator-trusted* apps (OpenDesign etc.); metered keys for the open marketplace.

### Pipeline hardening (closes the residual from #1, cheap)
Independent of A/B: gate `requiresLocalAiClis`, `requiresAiProvider`-with-creds, `addRepository`, and **install-of-new-non-builtin-apps** to **admin/verified-only**, and strip `privileged` / `docker.sock` / arbitrary host-path mounts from any non-builtin compose. This is the single highest-leverage change and unblocks nothing the operator currently does (curated installs are admin anyway).

---

## Sources (selected — full lists in the two research briefs)
- Claude Code sandboxing & auto-mode classifier — code.claude.com/docs/en/sandboxing ; anthropic.com/engineering/claude-code-auto-mode
- OpenAI Codex sandboxing — developers.openai.com/codex/concepts/sandboxing
- Lethal trifecta / dual-LLM / CaMeL — simonwillison.net/2025/Jun/16/the-lethal-trifecta/ ; arxiv.org/abs/2503.18813
- E2B/Firecracker, gVisor, Modal — modal.com/blog/top-code-agent-sandbox-products
- Infisical agent-vault — github.com/Infisical/agent-vault
- Cloudflare sandbox credential injection — developers.cloudflare.com/changelog/post/2026-04-13-sandbox-outbound-workers-tls-auth/
- LiteLLM virtual keys — docs.litellm.ai ; OpenRouter BYOK — openrouter.ai/docs ; Helicone Vault — docs.helicone.ai/features/advanced-usage/vault
- OAuth Token Exchange RFC 8693 ; GCP downscoped tokens ; AWS IMDSv2 ; HashiCorp Vault dynamic secrets ; SPIFFE/SPIRE
- Anthropic third-party access restriction — theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/
