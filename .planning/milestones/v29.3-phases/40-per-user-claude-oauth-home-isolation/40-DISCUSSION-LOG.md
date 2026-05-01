# Phase 40: Per-User Claude OAuth + HOME Isolation - Discussion Log

> **Audit trail only.** Decisions in 40-CONTEXT.md.

**Date:** 2026-04-30
**Phase:** 40-per-user-claude-oauth-home-isolation
**Mode:** `--chain` (interactive discuss for grey areas, then auto plan+execute)
**Areas discussed:** HOME isolation strategy, User HOME directory, Single-user mode, OAuth flow

---

## HOME Isolation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| A: Sacred-strict + mutex | process.env.HOME swap with mutex; serializes all subscription requests globally; sacred file byte-identical | |
| B: Sacred-flex one-line edit | Add optional homeOverride parameter to SdkAgentRunner.run() options; one-line modification at line 266; backward-compat | ✓ (Claude's professional recommendation, user-delegated) |
| C: Process-pool per user | worker_thread / child_process per user; full isolation; ~3 days impl + 100MB/user RAM | |
| D: Defer to Phase 41 broker | Push HOME logic to broker layer; Phase 40 becomes trivial | |

**User's choice:** "Hangisi profesyonelce bir secim olurdu bunu dusun" (You think — which is the professional choice?). Claude recommended Option B with this rationale:
1. "Sacred = behavior-preserving" is the right interpretation — additive optional parameter that defaults to current behavior IS behavior-preserving for all existing callers.
2. Mutex (Option A) adds new failure surface (deadlock on subprocess hang).
3. Worker pool (Option C) is over-engineered for Mini PC scale.
4. Industry pattern: Node.js `child_process.spawn` env is per-call, not global.

User accepted by delegation.

---

## User HOME Directory

| Option | Description | Selected |
|--------|-------------|----------|
| Synthetic: `/opt/livos/data/users/<user_id>/.claude/` | LivOS existing pattern (matches apps.ts) | ✓ |
| Real Linux users: `useradd` | POSIX-enforced isolation; heavy migration | |
| Hybrid: synthetic + ACL | Linux ACL on synthetic dirs; complex debug | |

**User's choice:** Synthetic dirs.
**Rationale:** Matches existing LivOS multi-user pattern; no install.sh / factory reset / multi-user-toggle changes needed.

---

## Single-User Mode Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Skip per-user logic, use `/root/.claude/` | Single-user = admin = root; current behavior preserved | ✓ |
| Always synthetic dir even in single-user | Tutarlılık, tek code path; migration of existing creds needed | |

**User's choice:** Skip per-user logic in single-user mode.
**Rationale:** Don't break working setup; keep multi-user logic gated behind toggle.

---

## OAuth Flow Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side `claude login` subprocess | Backend spawns claude CLI, captures device code, surfaces to UI | ✓ (de facto, current implementation) |
| Client-side PKCE in browser | Browser-side OAuth flow using existing claude.ts PKCE constants | |
| Hybrid: server kicks off, UI polls | Mid-ground; backend device flow + UI subscription polling | |

**User's clarification:** "Bu kisim zaten var Settings de AI configurations da Claude seciyorum Claude Account Connected to Claude Authenticated via sdk-subscription. Sign Out bu kisimda sign in with claude sub butonunda" — translation: This part already exists in Settings > AI Configurations > Claude. Shows "Connected to Claude / Authenticated via sdk-subscription / Sign Out" when logged in, with "Sign in with Claude sub" button when logged out.

**Implication:** OAuth UI is DONE. Phase 40's UI work narrows to:
- Make the existing button per-user-aware in multi-user mode
- Add backend route that respects `homeOverride` for the per-user `claude login` subprocess

## Claude's Discretion

- tRPC route name
- Device-code UI placement (modal vs inline)
- Subprocess library choice

## Deferred Ideas

- Real Linux users (`useradd`)
- Process pool per user (worker isolation)
- Periodic token expiry checks
- Cross-user audit trail (Phase 44 dashboard)
- OAuth push notifications
