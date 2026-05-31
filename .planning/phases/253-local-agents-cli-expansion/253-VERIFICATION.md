---
status: gaps_found
phase: 253-local-agents-cli-expansion
verified: 2026-05-31
source: operator browser walk (plan 06, two passes)
gates:
  mechanical_deploy: passed   # 20 CLIs registered + deployed + served (plans 01-05)
  operator_walk: gaps_found   # plan 06 — two passes, defects below
---

# Phase 253 — Verification (operator walk, 2 passes)

## Mechanical deploy (plans 01-05) — PASSED
- 15 new install scripts present by glob (G21 fix), 20 total, executable.
- Served panel JS contains all 15 new ids; deployed SHA matched master.

## Walk pass 1 → 6 gap-closure fixes shipped + verified
| ID | Fix | Status |
|----|-----|--------|
| GC-A | Auth opens a fresh Terminal tab (no collision with running claude) | ✅ deployed |
| GC-B | Install runs in Terminal (interactive prompts) + Re-detect | ✅ deployed |
| GC-D | Panel card redesign + brand-colour avatars | ✅ deployed |
| GC-E | Gemini folder-trust → GEMINI_CLI_TRUST_WORKSPACE=true + unit sync | ✅ unit verified |
| GC-F | LivOS MCP servers seeded into ~/.claude.json (import under source=claude) | ✅ verified (5 servers) |
| GC-G | xterm auto-focus on active+live tab (paste on first try) | ✅ deployed |

## Walk pass 2 → OPEN GAPS (this is the gap-closure plan input)

### Blockers NOT fixable in code
- **B1 — Anthropic subscription out of usage (USER ACTION).** Console: `HTTP 400:
  You're out of extra usage. Add more at claude.ai/settings/usage`. claude + hermes
  UI chat 400s because the Anthropic account hit its usage cap. This explains much of
  "chat çalışmıyor" for Anthropic-backed agents. **Operator must add usage** —
  no code fix possible. Verify chat AFTER topping up.

### Code/infra gaps (ordered)
| ID | Symptom | Confirmed root cause | Fix owner |
|----|---------|----------------------|-----------|
| W1 | "Liv CLI … Failed / CLI_NOT_SUPPORTED: 'Liv-cli'" row in Available-to-Install | install-liv-assistant.sh rebrand `s/\b(Aion\|aion)\b/Liv/g` corrupts the `aion-cli` id + label in the deployed liv-240-install-section.js | code — exempt liv-240-* from the aion→Liv rebrand (id must stay `aion-cli`) |
| W2 | Chat realtime dead; warmup/messages 502; `wss://hello.livinity.io/ws` fails | The AionUi realtime WebSocket `/ws` (rewritten to `/liv/ws`) is not proxied by Caddy to :3020 | infra — add `/liv/ws` (websocket) route to the liv-assistant Caddy snippet |
| W3 | Paste still fails inside terminal-claude AND in the "google yayını"/webapp-stream window | (a) terminal: focus fix may not have rebuilt/taken; (b) webapp-stream (RFB/VNC canvas) is a SEPARATE paste path, not covered by GC-G | code — re-verify GC-G deploy; add paste handling to webapp-stream-window |
| W4 | MCP import shows "MCP sunucusu bulunamadı" when GEMINI agent selected; manual MCP config empty | GC-F seeded only ~/.claude.json (source=claude); gemini source has none. Import filters by selected agent | code — seed gemini (and others) too, or guide operator to pick Claude; clarify UX |
| W5 | "Available to Install" panel intermittently appears/disappears | MutationObserver mount race re-mounts/loses the section on AionUi re-renders | code — make mount idempotent + re-mount on removal |
| W6 | "Liv CLI yerleşik ajandır…" built-in description still shows (native panel) | Static rebranded built-in-agent description in the vendored bundle (separate from the hidden picker entry 632f31d2) | code — patch/hide the built-in description block (or accept) |
| W7 | "Algılanan kısmında indirdiklerim çalışmıyor" — detected downloaded agents don't run | Likely B1 (out of usage) and/or W2 (/ws). Re-assess after B1+W2 | reassess after B1+W2 |
| W8 | Hermes oauth done but errors | Hermes routes through Anthropic → B1 (out of usage). Not a separate bug | depends on B1 |

## Recommended execution order
1. **B1** — operator tops up Anthropic usage (unblocks chat assessment).
2. **W2** — Caddy `/liv/ws` route (unblocks ALL realtime chat).
3. **W1** — rebrand exemption (removes the broken "Liv CLI Failed" row).
4. **W5** — panel mount stability.
5. **W3** — paste (terminal re-verify + webapp-stream).
6. **W4** — MCP import for gemini/others.
7. **W6/W7/W8** — reassess after the above.
