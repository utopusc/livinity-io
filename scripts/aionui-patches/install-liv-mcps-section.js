/**
 * AionUi vendor-bundle patch — "One-Click: Install Liv MCPs" (CLI picker).
 *
 * Injects a card into Liv AI's "MCP Tools Configuration" / "Import MCP
 * configurations" dialog. Clicking "One-Click: Install Liv MCPs" opens a PICKER
 * asking WHERE to install Liv's 5 system MCPs (luse, liv-system, liv-vault,
 * liv-apps, liv-docker):
 *
 *   • "Liv AI (this assistant) + all installed agents" → mcp.config.installLivTools
 *     (the original behaviour — seeds AionUi + distributes to every agent CLI).
 *   • a SPECIFIC CLI (claude, codex, gemini, opencode, …) → mcp.config.installLivMcpsToCli
 *     ({cli}) — writes the Liv MCPs into THAT CLI's OWN config file (e.g. claude →
 *     ~/.claude.json mcpServers) so running that CLI in a terminal sees the tools.
 *
 * Each /liv/trpc/* call rides the Phase-226/262 Caddy `@liv_cli_installer`
 * EXACT-path carve-out (cliInstaller.detect + mcp.config.installLivTools +
 * mcp.config.installLivMcpsToCli). The procs are adminProcedure-gated and the
 * `cli` is re-validated against SUPPORTED_CLIS server-side (D-239-07 RCE boundary).
 *
 * Standalone asset — no build step, no React, no module loader. Shipped by
 * scripts/install-liv-assistant.sh as liv-mcp-install-section.js. Mount strategy =
 * MutationObserver text-anchor: locate AionUi's dialog by a visible heading and
 * sibling-inject the card, self-healing on re-render. Fail-safe: no anchor → no
 * injection (never throws into the AionUi page).
 *
 * Sacred SHA preserved: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */
(function () {
  'use strict';

  var SENTINEL_ID = 'liv-mcp-oneclick';

  // tRPC endpoints — RAW v11 wire (no transformer): queries are GET
  // ?input=<urlencoded JSON>, mutations are POST with the JSON input as the body;
  // response is {result:{data}} | {error}. (mcp.config router is mounted nested as
  // mcp → config, so the real path is mcp.config.<proc>, NOT the flat mcpConfig.*.)
  var TRPC_INSTALL_ALL = '/liv/trpc/mcp.config.installLivTools';
  var TRPC_INSTALL_CLI = '/liv/trpc/mcp.config.installLivMcpsToCli';
  var TRPC_DETECT = '/liv/trpc/cliInstaller.detect';

  var ANCHORS = [
    'MCP Tools Configuration',
    'Import MCP configurations',
    'detected from your CLI agents'
  ];
  var LIV_MCPS = 'liv-system, liv-vault, liv-apps, liv-docker, luse';

  // The CLIs we can write a Liv MCP config for. MUST stay in sync with the
  // MCP_TARGETS keys in livinityd cli-installer/mcp-writer.ts. aion-cli (AionUi
  // REST-driven — covered by the "Liv AI" option) and nanobot (no per-user config
  // scope) are intentionally omitted. [CliName, display label].
  var TARGET_CLIS = [
    ['claude-code', 'Claude Code'],
    ['codex', 'Codex'],
    ['gemini', 'Gemini CLI'],
    ['qwen-code', 'Qwen Code'],
    ['opencode', 'opencode'],
    ['cursor-agent', 'Cursor Agent'],
    ['github-copilot', 'GitHub Copilot'],
    ['augment', 'Augment'],
    ['codebuddy', 'CodeBuddy'],
    ['factory-droid', 'Factory Droid'],
    ['kimi-cli', 'Kimi'],
    ['snow-cli', 'Snow'],
    ['kiro', 'Kiro'],
    ['qoder-cli', 'Qoder'],
    ['openclaw', 'OpenClaw'],
    ['goose', 'goose'],
    ['hermes-agent', 'Hermes'],
    ['mistral-vibe', 'Mistral Vibe']
  ];

  // -------------------------------------------------------------------------
  // tRPC wire helpers
  // -------------------------------------------------------------------------
  function postTrpc(url, input) {
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input || {})
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error) throw new Error((j.error && j.error.message) || 'request failed');
      return (j && j.result && j.result.data) || {};
    });
  }
  function getTrpc(url, input) {
    var u = url + '?input=' + encodeURIComponent(JSON.stringify(input || {}));
    return fetch(u, {
      credentials: 'include',
      headers: { 'content-type': 'application/json' }
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error) throw new Error((j.error && j.error.message) || 'request failed');
      return j && j.result && j.result.data;
    });
  }
  function installAll() { return postTrpc(TRPC_INSTALL_ALL, {}); }
  function installToCli(cli) { return postTrpc(TRPC_INSTALL_CLI, { cli: cli }); }
  function detectCli(name) { return getTrpc(TRPC_DETECT, { name: name }); }

  // -------------------------------------------------------------------------
  // tiny DOM helper
  // -------------------------------------------------------------------------
  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.setAttribute('style', style);
    if (text != null) n.textContent = text;
    return n;
  }

  // First element whose trimmed text contains one of the anchor strings.
  function findAnchorEl() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = w.nextNode())) {
      var t = node.textContent && node.textContent.trim();
      if (!t || t.length > 200) continue;
      for (var i = 0; i < ANCHORS.length; i++) {
        if (t.indexOf(ANCHORS[i]) !== -1) return node.parentElement;
      }
    }
    return null;
  }

  // ≤4-in-flight pool so opening the picker doesn't fire 18 detects at once.
  function runPool(items, limit, worker) {
    var i = 0, active = 0;
    function pump() {
      while (active < limit && i < items.length) {
        var item = items[i++];
        active++;
        Promise.resolve()
          .then(function () { return worker(item); })
          .catch(function () {})
          .then(function () { active--; pump(); });
      }
    }
    pump();
  }

  // -------------------------------------------------------------------------
  // Picker UI
  // -------------------------------------------------------------------------
  function monogram(label) {
    var box = el('span',
      'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;' +
      'border-radius:6px;background:rgba(124,58,237,0.18);color:#7c3aed;font-weight:700;font-size:12px;flex:0 0 auto;');
    box.textContent = (label || '?').charAt(0).toUpperCase();
    return box;
  }

  function rowButton() {
    var b = el('button',
      'display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;' +
      'border:1px solid rgba(127,127,127,0.22);border-radius:8px;background:transparent;color:inherit;' +
      'cursor:pointer;font-size:13px;');
    b.type = 'button';
    b.onmouseenter = function () { b.style.background = 'rgba(124,58,237,0.08)'; };
    b.onmouseleave = function () { b.style.background = 'transparent'; };
    return b;
  }

  // Render the result of an install into a row's status span.
  function renderCliResult(statusEl, label, d) {
    if (d && d.emptyCatalog) {
      statusEl.style.color = '#d97706';
      statusEl.textContent = 'No Liv MCPs in config — reinstall LivOS to seed them.';
      return;
    }
    if (d && d.supported === false) {
      statusEl.style.color = '#d97706';
      statusEl.textContent = label + ' has no file-based MCP config — use the “Liv AI” option.';
      return;
    }
    var n = (d && d.written && d.written.length) || 0;
    statusEl.style.color = '#16a34a';
    statusEl.textContent = '✓ ' + n + ' Liv MCP(s) written. Start a new ' + label + ' session to use them.';
  }

  function buildPicker(closeFn) {
    var panel = el('div', 'display:flex;flex-direction:column;gap:8px;');

    var head = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px;');
    head.appendChild(el('div', 'font-weight:600;font-size:13px;', 'Install Liv MCPs into…'));
    var back = el('button',
      'border:0;background:transparent;color:inherit;opacity:0.7;cursor:pointer;font-size:12px;', '← back');
    back.type = 'button';
    back.addEventListener('click', closeFn);
    head.appendChild(back);
    panel.appendChild(head);

    var listStatus = el('div', 'font-size:12px;min-height:16px;');
    panel.appendChild(listStatus);

    var list = el('div',
      'display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto;padding-right:2px;');
    panel.appendChild(list);

    // Generic install handler for a row.
    function wireRow(btn, statusEl, label, doInstall, onResult) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.style.opacity = '0.6';
        statusEl.style.color = '';
        statusEl.textContent = 'Installing…';
        doInstall().then(function (d) {
          onResult(statusEl, label, d);
        }).catch(function (e) {
          statusEl.style.color = '#dc2626';
          statusEl.textContent = 'Failed: ' + ((e && e.message) || 'unknown error');
        }).then(function () {
          btn.disabled = false;
          btn.style.opacity = '1';
        });
      });
    }

    // ── Row 0: Liv AI + all agents (recommended) ──
    var allBtn = rowButton();
    allBtn.style.border = '1px solid rgba(124,58,237,0.45)';
    allBtn.style.background = 'rgba(124,58,237,0.06)';
    var allIcon = el('span',
      'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:0 0 auto;font-size:15px;', '⚡');
    var allText = el('div', 'flex:1 1 auto;display:flex;flex-direction:column;gap:1px;');
    allText.appendChild(el('div', 'font-weight:600;', 'Liv AI (this assistant) + all installed agents'));
    allText.appendChild(el('div', 'font-size:11px;opacity:0.7;', 'Recommended — install everywhere in one click'));
    var allStatus = el('span', 'font-size:11px;');
    allText.appendChild(allStatus);
    allBtn.appendChild(allIcon);
    allBtn.appendChild(allText);
    wireRow(allBtn, allStatus, 'Liv AI', installAll, function (statusEl, label, d) {
      if (d && d.emptyCatalog) {
        statusEl.style.color = '#d97706';
        statusEl.textContent = 'No Liv MCPs in config — reinstall LivOS to seed them.';
        return;
      }
      var created = (d && d.created) || 0, skipped = (d && d.skipped) || 0, errored = (d && d.errored) || 0;
      statusEl.style.color = errored ? '#d97706' : '#16a34a';
      statusEl.textContent = '✓ ' + created + ' installed, ' + skipped + ' already present' +
        (errored ? ', ' + errored + ' failed' : '') + '. Reload Liv AI to use them.';
    });
    list.appendChild(allBtn);

    list.appendChild(el('div', 'height:1px;background:rgba(127,127,127,0.18);margin:2px 0;'));

    // ── Per-CLI rows ──
    var badges = {}; // cli → badge span (updated by background detection)
    TARGET_CLIS.forEach(function (pair) {
      var cli = pair[0], label = pair[1];
      var btn = rowButton();
      var text = el('div', 'flex:1 1 auto;display:flex;flex-direction:column;gap:1px;min-width:0;');
      var titleRow = el('div', 'display:flex;align-items:center;gap:6px;');
      titleRow.appendChild(el('span', 'font-weight:600;', label));
      var badge = el('span', 'font-size:10px;opacity:0.6;', 'checking…');
      titleRow.appendChild(badge);
      badges[cli] = badge;
      var status = el('div', 'font-size:11px;opacity:0.85;');
      text.appendChild(titleRow);
      text.appendChild(status);
      btn.appendChild(monogram(label));
      btn.appendChild(text);
      wireRow(btn, status, label, function () { return installToCli(cli); }, renderCliResult);
      list.appendChild(btn);
    });

    // Background detection — badge installed CLIs (rows stay clickable either way:
    // writing the config preemptively is harmless and ready for first run).
    runPool(TARGET_CLIS, 4, function (pair) {
      var cli = pair[0], badge = badges[cli];
      return detectCli(cli).then(function (d) {
        if (!badge) return;
        if (d && d.detected) {
          badge.textContent = '● installed';
          badge.style.color = '#16a34a';
          badge.style.opacity = '1';
        } else {
          badge.textContent = 'not detected';
          badge.style.color = '';
          badge.style.opacity = '0.5';
        }
      }).catch(function () {
        if (badge) { badge.textContent = ''; }
      });
    });

    return panel;
  }

  function buildCard() {
    var wrap = el('div', null);
    wrap.id = SENTINEL_ID;
    wrap.setAttribute('style',
      'display:flex;flex-direction:column;gap:8px;margin:12px 0;padding:12px 14px;' +
      'border:1px solid rgba(124,58,237,0.35);border-radius:10px;background:rgba(124,58,237,0.06);');

    function renderDefault() {
      wrap.textContent = '';
      wrap.appendChild(el('div', 'font-weight:600;font-size:13px;', 'Livinity MCP tools'));
      wrap.appendChild(el('div', 'font-size:12px;opacity:0.72;line-height:1.4;',
        'One-click install of Liv’s built-in tools (' + LIV_MCPS +
        ') — choose Liv AI or a specific CLI agent (Claude, Codex, …) and we write them into its MCP config.'));
      var row = el('div', 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;');
      var btn = el('button',
        'padding:8px 14px;border-radius:8px;border:0;background:#7c3aed;color:#fff;' +
        'font-weight:600;font-size:13px;cursor:pointer;', 'One-Click: Install Liv MCPs');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        wrap.textContent = '';
        wrap.appendChild(buildPicker(renderDefault));
      });
      row.appendChild(btn);
      wrap.appendChild(row);
    }

    renderDefault();
    return wrap;
  }

  function mount() {
    if (document.getElementById(SENTINEL_ID)) return true;
    var anchor = findAnchorEl();
    if (!anchor) return false;
    var container = anchor;
    for (var i = 0; i < 4 && container.parentElement; i++) {
      if (container.clientHeight && container.clientHeight > 80) break;
      container = container.parentElement;
    }
    try {
      container.insertBefore(buildCard(), container.firstChild);
    } catch (e) {
      return false;
    }
    return true;
  }

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
