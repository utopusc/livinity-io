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
  var SUPPORTED_CLIS = ['claude-code', 'opencode', 'gemini', 'openclaw', 'aion-cli'];

  // CLI display metadata. authHidden:true => no Auth button rendered (Plan
  // 240-01 AUTH_UNSUPPORTED short-circuit for aion-cli).
  var CLI_META = {
    'claude-code': { label: 'Claude Code', icon: 'CC' },
    'opencode':    { label: 'OpenCode',    icon: 'OC' },
    'gemini':      { label: 'Gemini',      icon: 'G'  },
    'openclaw':    { label: 'OpenClaw',    icon: 'CL' },
    'aion-cli':    { label: 'Aion CLI',    icon: 'AI', authHidden: true }
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
    var row = el('div', { className: 'liv-240-row', 'data-cli': name }, [
      el('div', { className: 'liv-240-icon', textContent: meta.icon }),
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
        }, ['Auth'])
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
    var errEl = row.querySelector('.liv-240-error');
    row.classList.remove('detected', 'installing', 'installed', 'failed', 'authing', 'authed');
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
  function hydrate(section) {
    for (var i = 0; i < SUPPORTED_CLIS.length; i++) {
      (function (name) {
        var row = section.querySelector('[data-cli="' + name + '"]');
        if (!row) return;

        // Initial detect
        detectCli(name).then(function (out) {
          setRowState(row, out && out.detected ? 'detected' : 'undetected');
        }).catch(function (e) {
          setRowState(row, 'failed', e && e.message);
        });

        // Install handler
        var installBtn = row.querySelector('.liv-240-btn-install');
        if (installBtn) {
          installBtn.addEventListener('click', function () {
            setRowState(row, 'installing');
            installCli(name).then(function (out) {
              if (out && out.ok) setRowState(row, 'installed');
              else setRowState(row, 'failed', truncate((out && out.output) || 'Install failed'));
            }).catch(function (e) {
              setRowState(row, 'failed', e && e.message);
            });
          });
        }

        // Auth handler (skipped for aion-cli per authHidden meta)
        // G17 — interactive CLI login (OAuth / browser device-code) CANNOT complete
        // through a fire-and-forget livinityd spawn (the old cliInstaller.auth path).
        // Instead, ask the LivOS shell (the parent of this /liv iframe) to open its
        // Terminal and run the CLI's login command there, so the operator completes
        // the sign-in interactively. We post only the CLI NAME (not a raw command);
        // the shell maps it to a whitelisted command (RCE boundary preserved).
        var authBtn = row.querySelector('.liv-240-btn-auth');
        if (authBtn) {
          authBtn.addEventListener('click', function () {
            try {
              window.parent.postMessage(
                { source: 'liv-240-local-agents', type: 'cli-auth', cli: name },
                window.location.origin
              );
              var st = row.querySelector('.liv-240-status');
              if (st) st.textContent = 'Login opened in Terminal — finish there, then Re-detect';
              authBtn.textContent = 'Open Terminal again';
              authBtn.disabled = false;
              var errEl = row.querySelector('.liv-240-error');
              if (errEl) errEl.style.display = 'none';
            } catch (e) {
              setRowState(row, 'failed', 'Could not open Terminal: ' + (e && e.message));
            }
          });
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
      'One-click install for the 5 supported CLI agents. After install, click Auth to run the per-CLI login flow.'
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

  function observe() {
    // First pass — try immediate mount
    if (mount()) return;
    var obs = new MutationObserver(function () {
      if (mount()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Safety: stop observing after 60 s if still nothing found, to avoid
    // perpetual document-body mutation observation cost (T-240-02-07
    // accept disposition).
    setTimeout(function () { try { obs.disconnect(); } catch (e) {} }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe);
  } else {
    observe();
  }
})();
