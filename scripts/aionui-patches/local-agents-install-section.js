/**
 * Phase 240-02 — AionUi vendor-bundle patch
 *
 * Injects an "Available to Install" subsection into Liv AI's Local Agents tab.
 * Calls livinityd's cliInstaller.{detect,install,auth} tRPC procedures via the
 * Phase 226 Caddy /liv proxy.
 *
 * DRIFT-LOCK: SUPPORTED_CLIS must match
 *   livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts
 *
 * This file is shipped by scripts/install-liv-assistant.sh as a STANDALONE asset
 * — no build step, no React import, no module loader required.
 *
 * Mount strategy = option-a (sibling-mount via MutationObserver) per
 *   .planning/phases/240-local-agents-install-from-ui/240-02-INVESTIGATION.md
 *
 * Sacred SHA preserved: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */
(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // DRIFT-LOCK: must match livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts SUPPORTED_CLIS
  // Fixed tuple order matching D-239-10 (Plan 240 contract).
  // -------------------------------------------------------------------------
  // Phase 253-04: expanded 5 -> 20 (15 Local Agents CLIs). Canonical tuple
  // order mirrors install-scripts.ts SUPPORTED_CLIS exactly.
  var SUPPORTED_CLIS = [
    'claude-code', 'opencode', 'gemini', 'openclaw', 'aion-cli',
    // Wave A (npm-global)
    'codex', 'qwen-code', 'augment', 'github-copilot', 'codebuddy', 'qoder-cli',
    // Wave B (curl-installer)
    'goose', 'factory-droid', 'cursor-agent',
    // Wave C — Phase 267-02: now auth-able via the no-terminal dialog
    'kimi-cli', 'mistral-vibe', 'hermes-agent', 'nanobot', 'snow-cli', 'kiro'
  ];

  // -------------------------------------------------------------------------
  // Phase 270 — Aion CLI is hidden in the panel, byte-consistent with the
  // 269.1 picker overlay (agents-overlay.ts:47,113 → AION_BINARY_NAME='aion';
  // drift-lock CLI_BIN_NAMES['aion-cli']==='aion'). aion-cli STAYS in the
  // canonical SUPPORTED_CLIS 20-tuple (drift-lock with install-scripts.ts);
  // we exclude it ONLY at render/hydrate time so no row is built or wired.
  // -------------------------------------------------------------------------
  var HIDDEN_CLIS = { 'aion-cli': true };
  var VISIBLE_CLIS = SUPPORTED_CLIS.filter(function (c) { return !HIDDEN_CLIS[c]; });

  // CLI display metadata. authHidden:true => no Auth button rendered.
  // Phase 267-02: the Wave-C CLIs now have a real auth method (the dialog
  // branches on cliInstaller.getAuthMethod — device for kimi-cli/kiro, apikey
  // for mistral-vibe/nanobot/hermes-agent/snow-cli via setApiKey), so their
  // Auth button is RENDERED and routes to the no-terminal CliAuthDialog. Only
  // aion-cli stays authHidden — it is genuinely not auth-able (n/a branch,
  // AionUi's embedded backend, no install/auth path).
  // GC-D — each CLI gets a brand-coloured monogram avatar (offline-safe, no
  // external logo fetch that could 404 on the box) + a card row. `color` is the
  // avatar background; `icon` is the 1-2 char monogram.
  //
  // Phase 267-04 — `logo` is the filename (sans .svg) of a STATIC brand SVG
  // shipped under the LivOS UI `public/agent-logos/` dir (served at
  // `/agent-logos/<logo>.svg`). The row renders that brand <img> when present;
  // an `onerror` flips back to the monogram avatar so a missing/renamed asset
  // (or an offline box) NEVER shows a broken image. CLIs without a `logo`
  // render the monogram directly — same graceful-degradation contract as the
  // React <AgentLogo> in features/liv-ai/agent-logos.tsx.
  //
  // Phase 269-04 — `aionuiLogo` is the `{category}/{name}.{svg,png}` path into
  // AionUi's AUTHORITATIVE embedded logo set, served at
  // `/liv/api/assets/logos/<aionuiLogo>` (the panel runs inside the AionUi
  // iframe, same-origin with the LivOS shell, so BOTH `/liv/api/assets/...` and
  // the root `/agent-logos/...` resolve). renderIcon tries it FIRST; on a 404 the
  // onerror cascade falls through to the 267 `/agent-logos/<logo>.svg`, then to
  // the monogram. Several AionUi assets are 404 (qwen/copilot/goose/kimi) and
  // some are unprobed guesses — adding a candidate is SAFE because the cascade
  // covers every miss (assumption A4). `<name>` is the AionUi backend short-name
  // (copilot not github-copilot, qwen not qwen-code, cursor not cursor-agent).
  var CLI_META = {
    'claude-code':    { label: 'Claude Code',    icon: 'CC', color: '#d97757', logo: 'claude',         aionuiLogo: 'ai-major/claude.svg' },
    'opencode':       { label: 'OpenCode',       icon: 'OC', color: '#0f766e', logo: 'opencode',       aionuiLogo: 'tools/coding/opencode.svg' },
    'gemini':         { label: 'Gemini',         icon: 'G',  color: '#4285f4', logo: 'gemini',         aionuiLogo: 'ai-major/gemini.svg' },
    'openclaw':       { label: 'OpenClaw',       icon: 'CL', color: '#f59e0b',                         aionuiLogo: 'tools/coding/openclaw.svg' },
    'aion-cli':       { label: 'Aion CLI',       icon: 'AI', color: '#7c3aed', authHidden: true,       aionuiLogo: 'brand/aion.svg' },
    // Wave A
    'codex':          { label: 'Codex',          icon: 'CX', color: '#10a37f', logo: 'codex',          aionuiLogo: 'tools/coding/codex.svg' },
    'qwen-code':      { label: 'Qwen Code',      icon: 'QW', color: '#6d28d9', logo: 'qwen',           aionuiLogo: 'tools/coding/qwen.svg' },
    'augment':        { label: 'Augment',        icon: 'AG', color: '#0ea5e9',                         aionuiLogo: 'tools/coding/auggie.svg' },
    'github-copilot': { label: 'GitHub Copilot', icon: 'GH', color: '#24292f', logo: 'github-copilot', aionuiLogo: 'tools/coding/copilot.svg' },
    'codebuddy':      { label: 'CodeBuddy',      icon: 'CB', color: '#e11d48',                         aionuiLogo: 'tools/coding/codebuddy.svg' },
    'qoder-cli':      { label: 'Qoder',          icon: 'QO', color: '#2563eb',                         aionuiLogo: 'tools/coding/qodercli.svg' },
    // Wave B
    'goose':          { label: 'Goose',          icon: 'GS', color: '#16a34a', logo: 'goose',          aionuiLogo: 'tools/coding/goose.svg' },
    'factory-droid':  { label: 'Factory Droid',  icon: 'FD', color: '#db2777',                         aionuiLogo: 'tools/coding/droid.svg' },
    'cursor-agent':   { label: 'Cursor Agent',   icon: 'CA', color: '#334155', logo: 'cursor',         aionuiLogo: 'tools/coding/cursor.png' },
    // Wave C — Phase 267-02: real auth method via the no-terminal dialog
    // (device for kimi-cli/kiro; apikey via setApiKey for the rest). Auth
    // button now RENDERED (authHidden removed). aion-cli above stays hidden.
    'kimi-cli':       { label: 'Kimi CLI',       icon: 'KM', color: '#4f46e5', logo: 'kimi',           aionuiLogo: 'brand/kimi.svg' },
    'mistral-vibe':   { label: 'Mistral Vibe',   icon: 'MV', color: '#f97316', logo: 'mistral',        aionuiLogo: 'tools/coding/vibe.svg' },
    'hermes-agent':   { label: 'Hermes Agent',   icon: 'HM', color: '#0d9488',                         aionuiLogo: 'tools/coding/hermes.svg' },
    'nanobot':        { label: 'Nanobot',        icon: 'NB', color: '#475569',                         aionuiLogo: 'tools/coding/nanobot.svg' },
    'snow-cli':       { label: 'Snow CLI',       icon: 'SN', color: '#0891b2',                         aionuiLogo: 'tools/coding/snow.svg' },
    'kiro':           { label: 'Kiro',           icon: 'KI', color: '#9333ea',                         aionuiLogo: 'tools/coding/kiro.svg' }
  };

  // Phase 267-04 — base path of the static brand SVGs. They live in the LivOS
  // UI `public/agent-logos/` dir and are served at the LivOS origin root
  // (NOT under /liv — that prefix is the AionUi reverse-proxy). The panel runs
  // inside the AionUi iframe which is same-origin with the LivOS shell, so a
  // root-relative `/agent-logos/...` resolves against the LivOS host.
  var LOGO_BASE = '/agent-logos/';

  // Phase 269-04 — base path of AionUi's AUTHORITATIVE embedded logo set,
  // served by aioncore at `/api/assets/logos/...` and reachable from the LivOS
  // shell under the `/liv` prefix (Caddy `@aionui_assets` / `@liv_api_subresource`
  // both route `/liv/api/assets/*` → :3020). renderIcon tries `<aionuiLogo>` here
  // FIRST; on a 404 the onerror cascade falls through to LOGO_BASE then to the
  // monogram, so a guessed/missing AionUi asset NEVER shows a broken image.
  var AIONUI_LOGO_BASE = '/liv/api/assets/logos/';

  // Locale-aware Local Agents label fallbacks (5 most common locales in
  // AionUi's i18n maps per 240-02-INVESTIGATION.md Section E).
  var LOCALE_LABELS = [
    'Local Agents',
    'Yerel Ajanlar',
    '本地 Agents',        // 本地 Agents
    'ローカルエージェント', // ローカルエージェント
    '로컬 에이전트'                          // 로컬 에이전트
  ];

  var SENTINEL_ID = 'liv-240-install-section';
  var TRPC_BASE = '/liv/trpc/cliInstaller';
  var OUTPUT_CAP_CHARS = 400;
  var OUTPUT_CAP_LINES = 3;

  // -------------------------------------------------------------------------
  // Utility: text/error truncation (T-239-02-02 precedent — no info leakage)
  // -------------------------------------------------------------------------
  function truncate(s) {
    if (s == null) return '';
    s = String(s);
    var lines = s.split(/\r?\n/);
    if (lines.length > OUTPUT_CAP_LINES) {
      s = lines.slice(0, OUTPUT_CAP_LINES).join('\n') + '\n…';
    }
    if (s.length > OUTPUT_CAP_CHARS) {
      s = s.slice(0, OUTPUT_CAP_CHARS) + '…';
    }
    return s;
  }

  // -------------------------------------------------------------------------
  // tRPC HTTP wire helpers
  // G13b — livinityd's tRPC server is v11 with NO data transformer (trpc.ts uses
  // httpLink, no superjson), so the wire shape is RAW (no {json:...} wrapper):
  //   GET  /trpc/<proc>?input=<urlencoded JSON input>      (queries)
  //   POST /trpc/<proc>   body: <input>                    (mutations)
  // Response: {result:{data: <output>}} | {error:{message,...}}
  // The old {json:input} / result.data.json shape (tRPC v10 / with-transformer)
  // made livinityd see input.name === undefined → "invalid_type … Required".
  // -------------------------------------------------------------------------
  function trpcQuery(proc, input) {
    var url = TRPC_BASE + '.' + proc + '?input=' + encodeURIComponent(JSON.stringify(input));
    return fetch(url, {
      credentials: 'include',
      headers: { 'content-type': 'application/json' }
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error) throw new Error(j.error.message || ('trpc error: ' + proc));
      return j && j.result && j.result.data;
    });
  }

  function trpcMutate(proc, input) {
    return fetch(TRPC_BASE + '.' + proc, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error) throw new Error(j.error.message || ('trpc error: ' + proc));
      return j && j.result && j.result.data;
    });
  }

  // -------------------------------------------------------------------------
  // tRPC contract wrappers
  //   cliInstaller.detect   — GET   /liv/trpc/cliInstaller.detect?input=...
  //   cliInstaller.install  — POST  /liv/trpc/cliInstaller.install
  //   cliInstaller.auth     — POST  /liv/trpc/cliInstaller.auth
  // -------------------------------------------------------------------------
  function detectCli(name)  { return trpcQuery('detect',   { name: name }); } // cliInstaller.detect
  function installCli(name) { return trpcMutate('install', { name: name }); } // cliInstaller.install
  function authCli(name)    { return trpcMutate('auth',    { name: name }); } // cliInstaller.auth

  // Phase 269-01 — manual apply (kill the restart storm). hasPendingAgentChanges
  // (no input → {} body) reports whether any auth/setApiKey/uninstall happened
  // since the last apply; applyAgentChanges (no input → {} body) fires the SINGLE
  // debounced liv-assistant restart + clears the flag. Both ride /liv/trpc via the
  // Phase 269-01 Caddy EXACT-path carve-out (no wildcard — LIVOS-054).
  function hasPendingAgentChanges() { return trpcQuery('hasPendingAgentChanges', {}); } // cliInstaller.hasPendingAgentChanges
  function applyAgentChanges()      { return trpcMutate('applyAgentChanges', {}); }      // cliInstaller.applyAgentChanges

  // -------------------------------------------------------------------------
  // DOM rendering
  // -------------------------------------------------------------------------
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          if (k === 'className') e.className = attrs[k];
          else if (k === 'textContent') e.textContent = attrs[k];
          else e.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null) continue;
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else e.appendChild(c);
      }
    }
    return e;
  }

  // Phase 267-04 — build the row avatar: a brand <img> (static SVG from
  // public/agent-logos/) when the CLI has a `logo`, with an `onerror` that
  // swaps in the monogram avatar so a missing/renamed asset (or an offline
  // box) NEVER shows a broken image. CLIs without a `logo` get the monogram
  // directly. Mirrors the React <AgentLogo> graceful-degradation contract.
  function monogramIcon(meta) {
    var icon = el('div', { className: 'liv-240-icon liv-240-icon-monogram', textContent: meta.icon });
    if (meta.color) {
      icon.style.background = meta.color;
      icon.style.color = '#fff';
    }
    return icon;
  }

  // Phase 269-04 — build the ordered candidate-URL list for a CLI's icon. The
  // cascade is AionUi-first, then the 267 static SVG, then (exhausted ⇒) the
  // monogram. A CLI may have neither field — then the list is empty and
  // renderIcon draws the monogram directly.
  //   1. `/liv/api/assets/logos/<aionuiLogo>` — AionUi's authoritative asset.
  //   2. `/agent-logos/<logo>.svg`            — the 267 static fallback SVG.
  function logoCandidates(meta) {
    var urls = [];
    // Phase 272 — LivOS static SVG FIRST and ONLY (we ship + control these under
    // public/agent-logos/). The previous AionUi-first order requested
    // /liv/api/assets/logos/tools/coding/<name>.svg, but on the box AionUi only
    // ships `ai-major/*` — so EVERY tools/coding/* + most brand/* requests 404'd
    // and spammed the console (13 per render) before the onerror cascade fell
    // back here anyway. A CLI WITHOUT a bundled static SVG falls straight to its
    // monogram (no broken-image network request). To give one of those a real
    // logo, drop a <name>.svg into public/agent-logos/ and add `logo:'<name>'`.
    if (meta.logo) urls.push(LOGO_BASE + meta.logo + '.svg');
    return urls;
  }

  // Phase 269-04 — a 3-tier <img> cascade driven by the candidate-URL list.
  // The FIRST candidate is rendered as a STATIC <img src> (sandboxed — never
  // inline/untrusted SVG, 267-04 threat model); each `error` event advances the
  // src to the NEXT candidate, and when the list is exhausted the <img> is
  // replaced by the monogram avatar — so a 404 (the expected qwen/copilot/goose/
  // kimi misses + the unprobed guesses) NEVER renders a broken-image glyph.
  function renderIcon(meta) {
    var candidates = logoCandidates(meta);
    if (candidates.length === 0) return monogramIcon(meta);

    var idx = 0;
    var img = el('img', {
      className: 'liv-240-icon liv-240-icon-logo',
      src: candidates[idx],
      alt: meta.label,
      width: '32',
      height: '32',
      loading: 'lazy',
      decoding: 'async'
    });
    img.addEventListener('error', function () {
      idx += 1;
      if (idx < candidates.length) {
        // Advance to the next tier (e.g. AionUi 404 → 267 static SVG).
        img.src = candidates[idx];
      } else {
        // List exhausted → the monogram is the terminal tier (no broken image).
        var mono = monogramIcon(meta);
        if (img.parentNode) img.parentNode.replaceChild(mono, img);
      }
    });
    return img;
  }

  function renderRow(name) {
    var meta = CLI_META[name];
    var icon = renderIcon(meta);
    var row = el('div', { className: 'liv-240-row', 'data-cli': name }, [
      icon,
      el('div', { className: 'liv-240-label' }, [
        el('div', { className: 'liv-240-name', textContent: meta.label }),
        el('div', { className: 'liv-240-status', textContent: 'checking…' })
      ]),
      el('div', { className: 'liv-240-actions' }, [
        el('button', { className: 'liv-240-btn liv-240-btn-install', type: 'button' }, ['Install']),
        meta.authHidden ? null : el('button', {
          className: 'liv-240-btn liv-240-btn-auth',
          type: 'button',
          style: 'display:none'
        }, ['Auth']),
        // GC-B — after a terminal install/auth the operator clicks Re-detect to
        // refresh the row status (hidden until the row is in a terminal-driven
        // state so it doesn't clutter the initial card).
        el('button', {
          className: 'liv-240-btn liv-240-btn-redetect',
          type: 'button',
          title: 'Re-check whether this CLI is installed',
          style: 'display:none'
        }, ['Re-detect']),
        // Phase 268-04 — Remove button: posts cli-uninstall (NAME only) to the
        // shell, which opens the CliAuthDialog's Uninstall confirm. Hidden until
        // the row is detected/installed (like the Auth button). Gated on
        // !authHidden so aion-cli — which is genuinely not auth-able AND not
        // uninstallable (its UninstallSpec is kind:'none' -> UNINSTALL_REFUSED
        // server-side) — never renders a Remove affordance (operator hard rule:
        // aion-cli is not uninstallable).
        meta.authHidden ? null : el('button', {
          className: 'liv-240-btn liv-240-btn-uninstall',
          type: 'button',
          title: 'Remove this CLI from the server',
          style: 'display:none'
        }, ['Remove'])
      ])
    ]);
    var err = el('div', { className: 'liv-240-error' });
    err.style.display = 'none';
    row.appendChild(err);
    return row;
  }

  function setRowState(row, state, message) {
    var statusEl = row.querySelector('.liv-240-status');
    var installBtn = row.querySelector('.liv-240-btn-install');
    var authBtn = row.querySelector('.liv-240-btn-auth');
    var redetectBtn = row.querySelector('.liv-240-btn-redetect');
    // Phase 268-04 — Remove button (absent on aion-cli's row).
    var uninstallBtn = row.querySelector('.liv-240-btn-uninstall');
    var errEl = row.querySelector('.liv-240-error');
    row.classList.remove('detected', 'installing', 'installed', 'failed', 'authing', 'authed', 'terminal');
    // GC-B — Re-detect is only meaningful after a terminal-driven install/auth;
    // hide it for every standard state, then the terminal flow re-shows it.
    if (redetectBtn) redetectBtn.style.display = 'none';
    if (state === 'detected' || state === 'installed') {
      row.classList.add(state);
      if (statusEl) statusEl.textContent = 'Installed ✓';
      if (installBtn) installBtn.style.display = 'none';
      if (authBtn) authBtn.style.display = '';
      // 268-04 — a detected/installed CLI can be removed.
      if (uninstallBtn) uninstallBtn.style.display = '';
      if (errEl) errEl.style.display = 'none';
    } else if (state === 'undetected') {
      if (statusEl) statusEl.textContent = 'Not installed';
      if (installBtn) installBtn.style.display = '';
      if (authBtn) authBtn.style.display = 'none';
      // 268-04 — nothing to remove when it's not installed.
      if (uninstallBtn) uninstallBtn.style.display = 'none';
      if (errEl) errEl.style.display = 'none';
    } else if (state === 'installing') {
      row.classList.add('installing');
      if (statusEl) statusEl.textContent = 'Installing…';
      if (installBtn) { installBtn.disabled = true; installBtn.textContent = 'Installing…'; }
      if (errEl) errEl.style.display = 'none';
    } else if (state === 'authing') {
      row.classList.add('authing');
      if (statusEl) statusEl.textContent = 'Authenticating…';
      if (authBtn) { authBtn.disabled = true; authBtn.textContent = 'Authenticating…'; }
      if (errEl) errEl.style.display = 'none';
    } else if (state === 'authed') {
      row.classList.add('authed');
      if (statusEl) statusEl.textContent = 'Authenticated ✓';
      if (authBtn) { authBtn.disabled = false; authBtn.textContent = 'Re-auth'; }
      if (errEl) errEl.style.display = 'none';
    } else if (state === 'failed') {
      row.classList.add('failed');
      if (statusEl) statusEl.textContent = 'Failed';
      if (installBtn) { installBtn.disabled = false; installBtn.textContent = 'Retry Install'; }
      if (authBtn) { authBtn.disabled = false; authBtn.textContent = 'Retry Auth'; }
      if (errEl) {
        errEl.textContent = truncate(message || '');
        errEl.style.display = errEl.textContent ? '' : 'none';
      }
    }
  }

  // -------------------------------------------------------------------------
  // Hydration: detect each CLI in parallel; wire Install + Auth click handlers
  // -------------------------------------------------------------------------
  // Post a CLI NAME (never a raw command) to the LivOS shell, which maps it to
  // a whitelisted command and runs it in a FRESH Terminal tab (RCE boundary +
  // GC-A/GC-B no-collision-with-running-CLI). Returns false on failure.
  function postToShell(type, name) {
    try {
      window.parent.postMessage(
        { source: 'liv-240-local-agents', type: type, cli: name },
        window.location.origin
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  // Phase 267-02 — show the "opened in the setup dialog — finish there, then
  // Re-detect" affordance. The shell now opens the no-terminal CliAuthDialog
  // (NOT the Terminal) in response to our postMessage; the Re-detect button
  // lets the operator refresh the row once the dialog flow completes.
  function setTerminalPending(row, message) {
    row.classList.remove('installing', 'authing', 'failed');
    row.classList.add('terminal');
    var st = row.querySelector('.liv-240-status');
    if (st) st.textContent = message;
    var errEl = row.querySelector('.liv-240-error');
    if (errEl) errEl.style.display = 'none';
    var redetectBtn = row.querySelector('.liv-240-btn-redetect');
    if (redetectBtn) { redetectBtn.style.display = ''; redetectBtn.disabled = false; }
  }

  // Phase 269-01 — show/hide the panel-level Apply bar based on the server
  // pending flag. Called on hydration AND after any install/auth/uninstall
  // round-trip (the postMessage opens the dialog where the actual action runs,
  // so we also re-check on a short delay + when the window regains focus).
  // Fail-safe: on any error leave the bar in its current state (never throw into
  // the panel; a missing flag just means "nothing to apply").
  function refreshApplyBar(section) {
    var bar = section.querySelector('#liv-269-apply-bar');
    if (!bar) return;
    // Phase 272 — the bar is ALWAYS visible now; we only change its emphasis +
    // copy based on whether the server has pending changes queued.
    bar.style.display = '';
    var status = bar.querySelector('#liv-269-apply-status');
    hasPendingAgentChanges().then(function (out) {
      var pending = !!(out && out.pending);
      if (bar.classList) bar.classList.toggle('liv-240-apply-pending', pending);
      if (status) {
        status.textContent = pending
          ? 'New install/sign-in queued — click Refresh so Liv AI picks it up.'
          : 'Installed or signed in via the Terminal? Click Refresh so Liv AI detects it.';
      }
    }).catch(function () { /* leave copy as-is on error */ });
  }

  function wireApplyBar(section) {
    var bar = section.querySelector('#liv-269-apply-bar');
    if (!bar) return;
    var btn = bar.querySelector('#liv-269-apply-btn');
    var status = bar.querySelector('#liv-269-apply-status');
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Refreshing…';
      if (status) status.textContent = 'Refreshing… Liv AI is re-scanning your CLIs (a few seconds).';
      applyAgentChanges().then(function () {
        // Phase 272 — the restart fired; AionUi needs ~3-5s to re-scan + come back.
        // Re-detect the rows after a short delay so installed CLIs flip to "ready"
        // and re-sync the bar copy. The bar stays visible (always-on refresh).
        if (status) status.textContent = 'Refreshed — Liv AI is re-scanning. New agents appear in the picker shortly.';
        setTimeout(function () {
          btn.disabled = false;
          btn.textContent = 'Refresh agents';
          refreshApplyBar(section);
        }, 5000);
      }).catch(function () {
        // Best-effort: re-enable so the operator can retry. Re-sync the bar with
        // the real server state (WR-04).
        btn.disabled = false;
        btn.textContent = 'Refresh agents';
        if (status) status.textContent = 'Could not refresh — try again.';
        refreshApplyBar(section);
      });
    });
  }

  // Phase 272 — bounded-concurrency runner. The old hydrate fired ALL 20 rows'
  // detectCli() in PARALLEL on mount → 20×2 `bash -lc`/`--version` subprocess
  // probes hit livinityd at once. Under that contention some probes exceeded the
  // 5s detector timeout → returned detected:false → the row flipped to "Not
  // installed", and a re-mount (AionUi re-renders the tab) re-rolled WHICH rows
  // timed out → the operator's "Installed one refresh, Not-installed the next"
  // flicker. Running detections through a small pool (≤3 in flight) keeps the
  // probe load low + consistent, so a row's state stops flapping. Each task is a
  // function returning a promise; failures advance the pool (never wedge it).
  function runPool(tasks, concurrency) {
    var i = 0;
    function worker() {
      if (i >= tasks.length) return Promise.resolve();
      var t = tasks[i++];
      var p;
      try { p = t(); } catch (e) { p = Promise.resolve(); }
      return Promise.resolve(p).then(worker, worker);
    }
    var workers = [];
    for (var w = 0; w < concurrency && w < tasks.length; w++) workers.push(worker());
    return Promise.all(workers);
  }

  function hydrate(section) {
    // Phase 269-01 — wire + prime the panel-level Apply bar, then re-check the
    // pending flag whenever the operator returns to this tab (after finishing an
    // action in the dialog the flag is now set server-side).
    wireApplyBar(section);
    refreshApplyBar(section);
    window.addEventListener('focus', function () { refreshApplyBar(section); });
    var detectTasks = [];
    for (var i = 0; i < VISIBLE_CLIS.length; i++) {
      (function (name) {
        var row = section.querySelector('[data-cli="' + name + '"]');
        if (!row) return;

        // Returns the detect promise so the pool can chain on it (Phase 272).
        function reDetect() {
          var st = row.querySelector('.liv-240-status');
          if (st) st.textContent = 'checking…';
          return detectCli(name).then(function (out) {
            setRowState(row, out && out.detected ? 'detected' : 'undetected');
          }).catch(function (e) {
            setRowState(row, 'failed', e && e.message);
          });
        }

        // Phase 272 — defer the initial detect into the bounded pool instead of
        // firing it inline (parallel). The manual Re-detect button still calls
        // reDetect() directly (a single probe is fine).
        detectTasks.push(reDetect);

        // Install handler — Phase 267-02: posts the CLI NAME to the shell,
        // which opens the no-terminal CliAuthDialog (install + auth in one
        // flow). No Terminal, no headless livinityd spawn. RCE boundary
        // unchanged: we send only the NAME.
        var installBtn = row.querySelector('.liv-240-btn-install');
        if (installBtn) {
          installBtn.addEventListener('click', function () {
            if (postToShell('cli-install', name)) {
              setTerminalPending(row, 'Setup opened — finish in the dialog, then Re-detect');
              installBtn.textContent = 'Open setup again';
              // Phase 269-01 — the dialog's install/auth may mark changes pending;
              // re-check the Apply bar shortly after (the focus listener also covers it).
              setTimeout(function () { refreshApplyBar(section); }, 4000);
            } else {
              setRowState(row, 'failed', 'Could not open the setup dialog');
            }
          });
        }

        // Auth handler (skipped only for authHidden = aion-cli). Phase 267-02:
        // posts the CLI NAME to the shell, which opens the no-terminal
        // CliAuthDialog. The dialog branches on cliInstaller.getAuthMethod
        // (device shows the verification URL+code; apikey shows a paste field)
        // — no real TTY required.
        var authBtn = row.querySelector('.liv-240-btn-auth');
        if (authBtn) {
          authBtn.addEventListener('click', function () {
            if (postToShell('cli-auth', name)) {
              setTerminalPending(row, 'Sign-in opened — finish in the dialog, then Re-detect');
              authBtn.textContent = 'Open setup again';
              authBtn.disabled = false;
              // Phase 269-01 — re-check the Apply bar after the dialog's auth runs.
              setTimeout(function () { refreshApplyBar(section); }, 4000);
            } else {
              setRowState(row, 'failed', 'Could not open the setup dialog');
            }
          });
        }

        // Remove handler — Phase 268-04: posts the CLI NAME to the shell, which
        // opens the no-terminal CliAuthDialog where the operator confirms the
        // uninstall (two-step confirm -> cliInstaller.uninstall). RCE boundary
        // unchanged: we post ONLY the NAME, exactly like the Auth button.
        var uninstallBtn = row.querySelector('.liv-240-btn-uninstall');
        if (uninstallBtn) {
          uninstallBtn.addEventListener('click', function () {
            if (postToShell('cli-uninstall', name)) {
              setTerminalPending(row, 'Remove opened — confirm in the dialog, then Re-detect');
              // Phase 269-01 — a confirmed uninstall marks changes pending; re-check.
              setTimeout(function () { refreshApplyBar(section); }, 4000);
            } else {
              setRowState(row, 'failed', 'Could not open the remove dialog');
            }
          });
        }

        // Re-detect handler — refresh row status after the dialog flow.
        var redetectBtn = row.querySelector('.liv-240-btn-redetect');
        if (redetectBtn) {
          redetectBtn.addEventListener('click', function () { reDetect(); });
        }
      })(VISIBLE_CLIS[i]);
    }
    // Phase 272 — drain the initial detections through a ≤3-in-flight pool so the
    // 20 rows no longer hammer livinityd with 40 simultaneous probes (the flicker
    // cause). Rows show "checking…" until the pool reaches them; state is then
    // stable across re-mounts.
    runPool(detectTasks, 3);
  }

  // -------------------------------------------------------------------------
  // Mount: locate Local Agents tab panel + sibling-append the section
  // -------------------------------------------------------------------------
  function renderSection() {
    var section = el('section', { id: SENTINEL_ID, className: 'liv-240-section' });
    section.appendChild(el('h3', { className: 'liv-240-heading' }, ['Agents']));
    section.appendChild(el('p', { className: 'liv-240-hint' }, [
      'Install or sign in to any of the 20 supported CLI agents. After installing or signing in — here OR in the Terminal — click "Refresh agents" so Liv AI re-scans and the agent appears in the chat picker. (AionUi only re-detects CLIs when it restarts, so a fresh install stays invisible until you refresh.)'
    ]));
    // Phase 269-01 — panel-level "Apply changes" bar (NOT per-row). Auth /
    // install-dialog / uninstall actions no longer auto-restart Liv AI (that
    // caused the 502 storm); instead the operator batches them and clicks Apply
    // ONCE here. Hidden until hasPendingAgentChanges reports true; clicking it
    // fires the single debounced restart, then the bar shows a brief "Applying…"
    // status and re-checks the flag to hide itself when cleared.
    // Phase 272 — ALWAYS-visible "Refresh agents" bar (was hidden until a
    // LivOS-flow change set the pending flag — so a Terminal install/auth, which
    // never sets that flag, left the operator with no way to make AionUi re-scan,
    // and the freshly-installed agent never showed in chat). Now the refresh is
    // always one click away. refreshApplyBar() just emphasises it when the server
    // reports pending changes; the underlying applyAgentChanges restart fires
    // unconditionally either way (cli-installer-router applyAgentChanges).
    var applyBar = el('div', { className: 'liv-240-apply-bar', id: 'liv-269-apply-bar' }, [
      el('span', { className: 'liv-240-apply-status', id: 'liv-269-apply-status' }, [
        'Installed or signed in via the Terminal? Click Refresh so Liv AI detects it.'
      ]),
      el('button', {
        className: 'liv-240-btn liv-240-btn-apply',
        id: 'liv-269-apply-btn',
        type: 'button',
        title: 'Restart Liv AI once so it re-scans installed CLIs — newly installed/signed-in agents then appear in the chat picker'
      }, ['Refresh agents'])
    ]);
    section.appendChild(applyBar);
    for (var i = 0; i < VISIBLE_CLIS.length; i++) {
      section.appendChild(renderRow(VISIBLE_CLIS[i]));
    }
    return section;
  }

  function findTabPanel() {
    // Find a text node matching any locale label
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = w.nextNode())) {
      var t = node.textContent && node.textContent.trim();
      if (!t) continue;
      if (LOCALE_LABELS.indexOf(t) === -1) continue;
      // Walk up looking for tabpanel container
      var pe = node.parentElement;
      for (var i = 0; i < 8 && pe; i++, pe = pe.parentElement) {
        if (!pe.getAttribute) continue;
        var role = pe.getAttribute('role');
        var cls = pe.className && pe.className.toString ? pe.className.toString() : '';
        if (role === 'tabpanel' || /arco-tabs-(content|pane|content-item)/.test(cls)) {
          return pe;
        }
      }
      // Heuristic fallback: tall ancestor
      var h = node.parentElement;
      while (h && h.parentElement && h.clientHeight < 200) h = h.parentElement;
      if (h) return h;
    }
    return null;
  }

  // Phase 270 — hide AionUi's OWN native Local Agents agent cards so the LivOS
  // #liv-240-install-section grid is the SOLE list (operator: "one place").
  // Resilient + fail-safe (R3/R9): we mark every DIRECT child of the located
  // tabpanel that is NOT our section (and not already marked) with the
  // CSS-hide class. Our sentinel section is always skipped, so re-mounts and
  // the MutationObserver self-heal stay safe. If the panel has no other
  // children, nothing is hidden and our grid still renders correctly.
  function hideNativeStrip(panel) {
    if (!panel || !panel.children) return;
    var kids = panel.children;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (!k || k.id === SENTINEL_ID) continue;            // never our own grid
      if (k.classList && !k.classList.contains('liv-270-native-hidden')) {
        k.classList.add('liv-270-native-hidden');
      }
    }
  }

  function mount() {
    var existing = document.getElementById(SENTINEL_ID);
    var panel = existing ? existing.parentElement : findTabPanel();
    if (!panel) return false;
    hideNativeStrip(panel);
    if (existing) return true;
    var section = renderSection();
    panel.appendChild(section);
    hydrate(section);
    return true;
  }

  // W5 (Phase 253 gap closure) — the old observer disconnected on first mount
  // (and after a 60 s safety timeout). But AionUi RE-RENDERS the Local Agents
  // tab on every tab switch, ripping our injected section out of the DOM; once
  // the observer was disconnected the panel never came back until a full reload
  // — the operator saw it "sometimes there, sometimes gone". Keep observing for
  // the life of the page and self-heal: re-mount whenever our section is absent.
  // mount() is idempotent (no-ops when the section already exists), so the
  // steady-state cost is a single getElementById per mutation batch.
  function observe() {
    mount();
    var obs = new MutationObserver(function () {
      if (!document.getElementById(SENTINEL_ID)) mount();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe);
  } else {
    observe();
  }
})();
