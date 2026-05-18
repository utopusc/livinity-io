# Resume prompt — paste after /clear

Copy the block below as the first message of a fresh Claude Code session.

---

```
v37 Phase 157 — Install Action Wiring. Plan written, ready to execute.

Read first:
- .planning/phases/157-install-action-wiring/CONTEXT.md (the bug + scope)
- .planning/phases/157-install-action-wiring/PLAN.md (3 waves: V/U/L + UAT)
- Memory entries auto-load via MEMORY.md — feedback_nextjs_reserved_filenames is the latest.

State at session start:
- v37 P148–P156 SHIPPED on master, Vercel building cleanly.
- /store live with DS port, real icons, detail page, custom URL form, admin /admin/apps.
- /developers SDK reference live.
- Wave B livinityd handlers (native/ai/plugin/broker) in repo but NOT wired into trpc yet.
- Install button BROKEN for new sections (webapp/native/ai/plugin) because LivOS UI bridge in livos/packages/ui/src/hooks/use-app-store-bridge.ts doesn't know about them.

Approach:
1. Ship Wave V (Vercel only) immediately — section-aware postMessage + inline Install button on AppCard. Push + Vercel deploys. Done in one commit, ~30 min.
2. Wave U (LivOS UI bridge protocol sync + section dispatch) — needs operator + Mini PC.
3. Wave L (livinityd trpc procedures wrapping InstallDispatcher + Express /p/:id middleware + sudoers deploy) — same Mini PC session as Wave U.
4. UAT-01..10 by operator (10-step section-by-section walkthrough in PLAN.md).
5. v37 milestone audit + complete + cleanup.

Start with Wave V Task V-01 (extend StoreToLivOSMessage.install with section field). All file paths in PLAN.md.

Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

---

## Quick refs after /clear

| Item | Where |
|---|---|
| Phase 157 context | `.planning/phases/157-install-action-wiring/CONTEXT.md` |
| Phase 157 plan | `.planning/phases/157-install-action-wiring/PLAN.md` |
| Install handlers code | `livos/packages/livinityd/source/modules/apps/{install-contracts,native-installer,ai-installer}.ts` |
| Plugin runtime code | `livos/packages/livinityd/source/modules/plugins/*.ts` |
| Broker plugin package | `plugins/livinity-broker/` |
| LivOS UI bridge | `livos/packages/ui/src/hooks/use-app-store-bridge.ts` |
| Vercel store types | `platform/web/src/app/store/types.ts` |
| Vercel postMessage hook | `platform/web/src/app/store/hooks/use-post-message.ts` |
| AppCard | `platform/web/src/app/store/components/app-card.tsx` |
| Detail page client | `platform/web/src/app/store/[id]/app-detail-client.tsx` |
| Bruce api-key | `liv_k_rX_G7vqBrT8w_eovQdjf` |
| Sacred SHA | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

## Pre-/clear master tip

```
29e7c0de fix(deploy): rename store/components/icon.tsx → icons.tsx (Next.js reserved filename)
76291f08 docs(v37-state): all 8 phases CODE-COMPLETE — Wave B done
5a262880 feat(v37 Wave B): livinityd install handlers + plugin runtime + broker
28b0f5a6 feat(v37-P151-B): Custom URL form + Vercel OG preview API
5e5fc446 feat(v37-P155): /developers portal
```
