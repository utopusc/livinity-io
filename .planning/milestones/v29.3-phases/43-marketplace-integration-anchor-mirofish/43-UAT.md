# Phase 43 UAT — Marketplace Integration (MiroFish Anchor)

**Status:** Operator-driven. Run on Mini PC AFTER deploying Phase 43 commits AND merging the MiroFish sibling-repo PR. Claude executor did NOT run any of this (out of scope per `<scope_boundaries>` — no Mini PC deploy, no live UI interaction).

**Phase under test:** 43 — Marketplace Integration (Anchor: MiroFish)
**Anchor requirement:** FR-MARKET-02 (MiroFish end-to-end install with subscription, zero BYOK prompts)
**Negative gate:** FR-MARKET-01 SC #2 (apps WITHOUT the flag receive NO broker env vars)

---

## Section A: Prerequisites

Phase 43 builds on Phases 41 + 42 (broker live) and Plans 43-01..04 (manifest schema + injection logic + UI badge).

### A.1 — Phase 41 + 42 prereqs (verbatim)

Run **Phase 41's UAT Sections A through D** (`.planning/phases/41-anthropic-messages-broker/41-UAT.md`) and confirm:
- [ ] livinityd is running on Mini PC port 8080
- [ ] `POST /u/<user_id>/v1/messages` works end-to-end (sync + SSE)
- [ ] At least ONE multi-user OAuth login is in place — REQUIRED for MiroFish to actually call Claude

Run **Phase 42's UAT Section B** (`.planning/phases/42-openai-compatible-broker/42-UAT.md`) and confirm:
- [ ] `POST /u/<user_id>/v1/chat/completions` works end-to-end

If ANY prior-phase UAT step is incomplete, STOP. Phase 43 cannot validate without Phases 41 + 42 being live.

### A.2 — Phase 43 deployment

Confirm:
- [ ] Phase 43 commits (43-01..05) are deployed to Mini PC via `bash /opt/livos/update.sh`
- [ ] MiroFish image is published. Per Plan 43-01 audit Section 4, **Path B (fork+build)** was chosen — the operator must publish `ghcr.io/utopusc/mirofish:v29.3` BEFORE this UAT proceeds. See `draft-mirofish-manifest/README.md` Step 1 for the verbatim build/push commands.
- [ ] MiroFish manifest is in the sibling repo `utopusc/livinity-apps`. Operator copies + commits + pushes per `draft-mirofish-manifest/README.md` Step 2. The sibling-repo PR must be MERGED into the default branch before this UAT can proceed.
- [ ] Mini PC has pulled the new manifest. Two paths to confirm:
  - **Wait path:** ≤ 5 minutes after sibling-repo PR merge (auto-pull interval per `app-store.ts:56` `updateInterval: '5m'`)
  - **Force path:** SSH to Mini PC and run `sudo systemctl restart livos` to trigger immediate pull
  - Verify with: `sudo cat /opt/livos/data/app-stores/utopusc-livinity-apps-*/mirofish/livinity-app.yml | grep requiresAiProvider`
  - Expected output: `requiresAiProvider: true`

### A.3 — Test user

You will need at least one multi-user account with completed `claude login` (Phase 40). Capture:
- Test user UUID: `<TEST_USER_UUID>` (from `sudo -u livos psql livos -c "SELECT id, username FROM users;"`)
- Test user username: `<TEST_USER_USERNAME>`

---

## Section B: Pre-flight — MiroFish appears in marketplace

1. Open the LivOS UI in a browser (logged in as the test user).
2. Open the App Store window.
3. Search for "MiroFish" or browse the `ai-agents` category.
4. Confirm:
   - [ ] MiroFish card visible in the marketplace
   - [ ] "Uses your Claude subscription" Badge rendered on the card or app detail page (Plan 43-04 wired this)
5. Capture screenshot 1: marketplace card with badge → `screenshots/43-uat-screenshot-B-1.png`

PASS / FAIL: ___

---

## Section C: POSITIVE — install MiroFish + inspect generated compose (FR-MARKET-01 SC #1)

6. From the MiroFish app detail page, click **Install**.
7. Wait for the install state to reach "ready" or "running" (typically 30s-2min depending on image pull).
8. SSH to Mini PC: `ssh -i .../minipc bruce@10.69.31.68`
9. Run:
   ```
   sudo cat /opt/livos/data/users/<TEST_USER_USERNAME>/apps/mirofish/docker-compose.yml
   ```
10. Capture the verbatim output. Then verify each of the 4 expected injections:

    ```bash
    sudo grep ANTHROPIC_BASE_URL /opt/livos/data/users/<TEST_USER_USERNAME>/apps/mirofish/docker-compose.yml
    # Expected: ANTHROPIC_BASE_URL: http://livinity-broker:8080/u/<TEST_USER_UUID>

    sudo grep ANTHROPIC_REVERSE_PROXY /opt/livos/data/users/<TEST_USER_USERNAME>/apps/mirofish/docker-compose.yml
    # Expected: ANTHROPIC_REVERSE_PROXY: http://livinity-broker:8080/u/<TEST_USER_UUID>

    sudo grep LLM_BASE_URL /opt/livos/data/users/<TEST_USER_USERNAME>/apps/mirofish/docker-compose.yml
    # Expected: LLM_BASE_URL: http://livinity-broker:8080/u/<TEST_USER_UUID>/v1

    sudo grep -A 1 extra_hosts /opt/livos/data/users/<TEST_USER_USERNAME>/apps/mirofish/docker-compose.yml
    # Expected: extra_hosts: with - livinity-broker:host-gateway on the next line
    ```

11. PASS criteria: all 4 grep commands return a matching line with the correct values. The `<TEST_USER_UUID>` substitution must match the user the install was performed as.

PASS / FAIL: ___

---

## Section D: POSITIVE — open MiroFish UI + type prompt + see Claude response (FR-MARKET-02 SC #3)

12. In the LivOS UI, click "Open" on the MiroFish app (or visit `http://mirofish-<TEST_USER_USERNAME>.livinity.io/` directly — the subdomain pattern is `<app_id>-<username>` per apps.ts:979).
13. The MiroFish UI loads. (Note any first-load setup wizards — they should NOT include "enter your API key" — Section F verifies this.)
14. Find the prompt input. Type the deterministic test prompt:
    ```
    Reply with exactly: SMOKE OK
    ```
15. Submit. Wait ≤ 30s for response.
16. Verify:
    - [ ] Response received in MiroFish UI
    - [ ] Response text contains "SMOKE OK" (or close — Claude may add prefix/suffix)
    - [ ] No error toast / "auth failed" / "no API key" messages
17. Capture screenshot 2: MiroFish UI at first load → `screenshots/43-uat-screenshot-D-1.png`
18. Capture screenshot 3: prompt + Claude response in MiroFish UI → `screenshots/43-uat-screenshot-D-2.png`

PASS / FAIL: ___

---

## Section E: NEGATIVE — install another marketplace app WITHOUT the flag → env vars absent (FR-MARKET-01 SC #2)

This is the live verification of Plan 43-04's negative integration test — the structural test mocks `installForUser`; this section runs the real install path.

19. From the marketplace, find a marketplace app that does NOT have `requiresAiProvider: true` in its manifest. Confirmed candidates:
    - `n8n` (built-in app — no `requiresAiProvider` field)
    - Any other Sparkles community-store app
20. Install the chosen app as the test user.
21. Wait for ready state.
22. SSH to Mini PC, then:
    ```bash
    sudo grep -E "ANTHROPIC_BASE_URL|ANTHROPIC_REVERSE_PROXY|LLM_BASE_URL|livinity-broker" /opt/livos/data/users/<TEST_USER_USERNAME>/apps/<OTHER_APP_ID>/docker-compose.yml
    ```
23. PASS criteria: command returns ZERO matches (exit code 1, no output). If ANY of those strings appears, the negative regression has FAILED — open a bug report.

PASS / FAIL: ___

---

## Section F: DOM-grep — zero "API key" inputs in MiroFish UI (FR-MARKET-02 SC #4)

24. With the MiroFish UI open from Section D, open browser DevTools (F12) → Console tab.
25. Run:
    ```javascript
    [...document.querySelectorAll('input,label,textarea,button')]
      .filter(el => /api[- ]?key|api_key|token/i.test(el.outerHTML))
      .length
    ```
26. Capture the result.
27. PASS criteria: result is **`0`** (zero). If non-zero, capture each matching element via:
    ```javascript
    [...document.querySelectorAll('input,label,textarea,button')]
      .filter(el => /api[- ]?key|api_key|token/i.test(el.outerHTML))
      .map(el => el.outerHTML)
    ```
    and document them in the failure report.
28. Capture screenshot 4: DevTools Console showing the result `0` → `screenshots/43-uat-screenshot-F-1.png`

NOTE: traverse any settings / options menus the MiroFish UI exposes — re-run the DOM-grep on EACH page you can navigate to. The PASS criterion holds across the full user-facing UI surface, not just the landing page.

PASS / FAIL: ___

---

## Section G: Broker access log evidence

29. SSH to Mini PC. Run:
    ```bash
    sudo journalctl -u livos --since "5 minutes ago" | grep -E "livinity-broker|/u/<TEST_USER_UUID>/v1" | tail -20
    ```
30. Verify at least ONE log line shows:
    - A `/u/<TEST_USER_UUID>/v1/chat/completions` request (if MiroFish uses OpenAI-compat path), OR
    - A `/u/<TEST_USER_UUID>/v1/messages` request (if MiroFish uses Anthropic SDK path)
31. PASS criteria: ≥ 1 matching log line within the last 5 minutes (correlates to Section D's smoke prompt).

PASS / FAIL: ___

---

## Section H: Screenshot evidence checklist

Confirm all 4 screenshots captured + saved to `.planning/phases/43-marketplace-integration-anchor-mirofish/screenshots/`:
- [ ] `43-uat-screenshot-B-1.png` — marketplace card with "Uses your Claude subscription" badge
- [ ] `43-uat-screenshot-D-1.png` — MiroFish UI at first load (no API key field)
- [ ] `43-uat-screenshot-D-2.png` — Claude response visible in MiroFish UI after smoke prompt
- [ ] `43-uat-screenshot-F-1.png` — DevTools Console showing DOM-grep result `0`

If any screenshot is missing, this UAT is INCOMPLETE — re-run the relevant section.

---

## Section I: Notes & deferred items

### Out of scope for Phase 43 UAT (deferred to later phases)

- **Multi-user concurrent installs** — verifying that User A's install of MiroFish doesn't pollute User B's compose. Phase 41 D-41-04 already enforces `userId` isolation in the broker; Plan 43-02 + 43-04 enforce per-user compose isolation. A multi-user concurrent test is good defense-in-depth but not on the FR-MARKET-02 critical path.
- **Rate-limit propagation under load** — Phase 44 owns the dashboard surface that visualizes 80% / 100% rate-limit warnings.
- **Image pull timing** — if MiroFish's image is large, install may take > 2min. Wait time is operator-tolerant; not a Phase 43 acceptance gate.

### Known caveats

- **Sibling-repo PR is operator gate.** Plan 43-03 produced a draft manifest; the actual marketplace listing requires the operator's separate PR to `utopusc/livinity-apps`. If the manifest is in the draft folder but NOT in the sibling repo, Mini PC will not see MiroFish in the marketplace.
- **5-min auto-pull window.** After sibling-repo merge, allow up to 5 minutes for the Mini PC to pull the new manifest. Force-restart livos if impatient.
- **MiroFish UI may have its own "Settings" page with placeholder API-key inputs from upstream code.** Section F's DOM-grep looks at the rendered DOM; if upstream MiroFish unconditionally renders an "API key" field that's blank-but-present in the DOM, this UAT fails. In that case, document the upstream issue and either (a) file a bug upstream, (b) override the UI label via env, or (c) carry-forward to a Phase 43.1 mini-followup.
- **Path B fork+build dependency.** The MiroFish image is NOT published upstream (Plan 43-01 audit). The operator MUST build + push `ghcr.io/utopusc/mirofish:v29.3` (or equivalent registry-published image) BEFORE the sibling-repo PR is merged AND BEFORE this UAT runs. Otherwise Section C step 6 install will fail with image-pull error.
- **Upstream Dockerfile uses dev-mode CMD.** `CMD ["npm", "run", "dev"]` is the upstream MiroFish startup. For a smoother UAT experience, the operator may want to patch the Dockerfile in their fork to use a production build before publishing the image. Out of scope for Phase 43 itself; pragmatic operator decision.

### Sign-off

Operator: _______________
Date: _______________
Result: PASS / FAIL
Failure notes (if any): _______________
