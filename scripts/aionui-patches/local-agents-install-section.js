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
    // Wave C (install-only / authHidden)
    'kimi-cli', 'mistral-vibe', 'hermes-agent', 'nanobot', 'snow-cli', 'kiro'
  ];

  // CLI display metadata. authHidden:true => no Auth button rendered (Plan
  // 240-01 AUTH_UNSUPPORTED short-circuit). aion-cli + the 6 Wave C CLIs are
  // authHidden (null CLI_AUTH_COMMANDS in auth.ts).
  // GC-D — each CLI gets a brand-coloured monogram avatar (offline-safe, no
  // external logo fetch that could 404 on the box) + a card row. `color` is the
  // avatar background; `icon` is the 1-2 char monogram.
  var CLI_META = {
    'claude-code':    { label: 'Claude Code',    icon: 'CC', color: '#d97757' },
    'opencode':       { label: 'OpenCode',       icon: 'OC', color: '#0f766e' },
    'gemini':         { label: 'Gemini',         icon: 'G',  color: '#4285f4' },
    'openclaw':       { label: 'OpenClaw',       icon: 'CL', color: '#f59e0b' },
    'aion-cli':       { label: 'Aion CLI',       icon: 'AI', color: '#7c3aed', authHidden: true },
    // Wave A
    'codex':          { label: 'Codex',          icon: 'CX', color: '#10a37f' },
    'qwen-code':      { label: 'Qwen Code',      icon: 'QW', color: '#6d28d9' },
    'augment':        { label: 'Augment',        icon: 'AG', color: '#0ea5e9' },
    'github-copilot': { label: 'GitHub Copilot', icon: 'GH', color: '#24292f' },
    'codebuddy':      { label: 'CodeBuddy',      icon: 'CB', color: '#e11d48' },
    'qoder-cli':      { label: 'Qoder',          icon: 'QO', color: '#2563eb' },
    // Wave B
    'goose':          { label: 'Goose',          icon: 'GS', color: '#16a34a' },
    'factory-droid':  { label: 'Factory Droid',  icon: 'FD', color: '#db2777' },
    'cursor-agent':   { label: 'Cursor Agent',   icon: 'CA', color: '#334155' },
    // Wave C (install-only / authHidden)
    'kimi-cli':       { label: 'Kimi CLI',       icon: 'KM', color: '#4f46e5', authHidden: true },
    'mistral-vibe':   { label: 'Mistral Vibe',   icon: 'MV', color: '#f97316', authHidden: true },
    'hermes-agent':   { label: 'Hermes Agent',   icon: 'HM', color: '#0d9488', authHidden: true },
    'nanobot':        { label: 'Nanobot',        icon: 'NB', color: '#475569', authHidden: true },
    'snow-cli':       { label: 'Snow CLI',       icon: 'SN', color: '#0891b2', authHidden: true },
    'kiro':           { label: 'Kiro',           icon: 'KI', color: '#9333ea', authHidden: true }
  };

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

  function renderRow(name) {
    var meta = CLI_META[name];
    var icon = el('div', { className: 'liv-240-icon', textContent: meta.icon });
    if (meta.color) {
      icon.style.background = meta.color;
      icon.style.color = '#fff';
    }
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
        }, ['Re-detect'])
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
      if (errEl) errEl.style.display = 'none';
    } else if (state === 'undetected') {
      if (statusEl) statusEl.textContent = 'Not installed';
      if (installBtn) installBtn.style.display = '';
      if (authBtn) authBtn.style.display = 'none';
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

  // Show the "running in Terminal — finish there, then Re-detect" affordance.
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

  function hydrate(section) {
    for (var i = 0; i < SUPPORTED_CLIS.length; i++) {
      (function (name) {
        var row = section.querySelector('[data-cli="' + name + '"]');
        if (!row) return;

        function reDetect() {
          var st = row.querySelector('.liv-240-status');
          if (st) st.textContent = 'checking…';
          detectCli(name).then(function (out) {
            setRowState(row, out && out.detected ? 'detected' : 'undetected');
          }).catch(function (e) {
            setRowState(row, 'failed', e && e.message);
          });
        }

        // Initial detect
        reDetect();

        // Install handler — GC-B: run the install SCRIPT in the LivOS Terminal
        // (a fresh tab) instead of the old headless livinityd spawn, so the
        // operator SEES and can answer interactive install prompts. The shell
        // maps the name → `bash /opt/livos/scripts/install/cli/<name>.sh`.
        var installBtn = row.querySelector('.liv-240-btn-install');
        if (installBtn) {
          installBtn.addEventListener('click', function () {
            if (postToShell('cli-install', name)) {
              setTerminalPending(row, 'Installing in Terminal — finish there, then Re-detect');
              installBtn.textContent = 'Open Terminal again';
            } else {
              setRowState(row, 'failed', 'Could not open Terminal');
            }
          });
        }

        // Auth handler (skipped for authHidden CLIs). G17 — interactive CLI
        // login (OAuth / device-code) needs a real TTY; open the Terminal and
        // run the whitelisted login command there.
        var authBtn = row.querySelector('.liv-240-btn-auth');
        if (authBtn) {
          authBtn.addEventListener('click', function () {
            if (postToShell('cli-auth', name)) {
              setTerminalPending(row, 'Login opened in Terminal — finish there, then Re-detect');
              authBtn.textContent = 'Open Terminal again';
              authBtn.disabled = false;
            } else {
              setRowState(row, 'failed', 'Could not open Terminal');
            }
          });
        }

        // Re-detect handler — refresh row status after a terminal install/auth.
        var redetectBtn = row.querySelector('.liv-240-btn-redetect');
        if (redetectBtn) {
          redetectBtn.addEventListener('click', function () { reDetect(); });
        }
      })(SUPPORTED_CLIS[i]);
    }
  }

  // -------------------------------------------------------------------------
  // Mount: locate Local Agents tab panel + sibling-append the section
  // -------------------------------------------------------------------------
  function renderSection() {
    var section = el('section', { id: SENTINEL_ID, className: 'liv-240-section' });
    section.appendChild(el('h3', { className: 'liv-240-heading' }, ['Available to Install']));
    section.appendChild(el('p', { className: 'liv-240-hint' }, [
      'One-click install for the 20 supported CLI agents. Install and Auth both open the LivOS Terminal so you can answer any interactive prompts; click Re-detect when you are done.'
    ]));
    for (var i = 0; i < SUPPORTED_CLIS.length; i++) {
      section.appendChild(renderRow(SUPPORTED_CLIS[i]));
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

  function mount() {
    if (document.getElementById(SENTINEL_ID)) return true;
    var panel = findTabPanel();
    if (!panel) return false;
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
