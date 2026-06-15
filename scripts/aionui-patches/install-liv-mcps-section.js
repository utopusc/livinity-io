/**
 * AionUi vendor-bundle patch — "One-Click: Install Liv MCPs"
 *
 * Injects a single card+button into Liv AI's "MCP Tools Configuration" /
 * "Import MCP configurations" dialog that registers Liv's 5 system MCPs
 * (luse, liv-system, liv-vault, liv-apps, liv-docker) into Liv AI in ONE click
 * and distributes them to every installed CLI agent — so users don't have to
 * add each tool by hand.
 *
 * Calls livinityd's `mcp.config.installLivTools` tRPC procedure via the Phase 226
 * Caddy `/liv` proxy. That procedure reuses the Phase-241 boot seed in FORCE
 * mode (idempotent GET-and-skip per server), so re-clicks never duplicate.
 *
 * Standalone asset — no build step, no React import, no module loader. Shipped
 * by scripts/install-liv-assistant.sh exactly like local-agents-install-section.js.
 * Mount strategy = MutationObserver text-anchor: the dialog is AionUi-native, so
 * we locate it by a visible heading string and sibling-inject our card, then
 * self-heal on re-render. Fail-safe: if no anchor is found, nothing is injected
 * (never throws into the AionUi page).
 *
 * Sacred SHA preserved: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */
(function () {
  'use strict';

  var SENTINEL_ID = 'liv-mcp-oneclick';
  // tRPC: the MCP config router is mounted NESTED as mcp → config in
  // createAppRouter (server/trpc/index.ts: `mcp: mergeRouters(mcpRouter,
  // router({config: mcpConfigRouter}))`), so the real procedure path is
  // mcp.config.installLivTools — NOT the flat mcpConfig.* (that 404s with
  // "No procedure found"). The LivOS UI McpTab reaches mcp.config.list the same
  // way. Raw httpLink (no transformer): POST body is the input ({} = no input);
  // response is {result:{data}}|{error}.
  var TRPC_URL = '/liv/trpc/mcp.config.installLivTools';

  // Visible heading/label strings of AionUi's MCP config + CLI-agent import
  // dialog — the anchor we hang the card off. Substring match (locale-light;
  // these are the English strings the operator sees).
  var ANCHORS = [
    'MCP Tools Configuration',
    'Import MCP configurations',
    'detected from your CLI agents'
  ];
  var LIV_MCPS = 'liv-system, liv-vault, liv-apps, liv-docker, luse';

  // -------------------------------------------------------------------------
  function trpcInstall() {
    return fetch(TRPC_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error) throw new Error((j.error && j.error.message) || 'install failed');
      return (j && j.result && j.result.data) || {};
    });
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

  function buildCard() {
    var wrap = document.createElement('div');
    wrap.id = SENTINEL_ID;
    wrap.setAttribute('style',
      'display:flex;flex-direction:column;gap:8px;margin:12px 0;padding:12px 14px;' +
      'border:1px solid rgba(124,58,237,0.35);border-radius:10px;background:rgba(124,58,237,0.06);');

    var title = document.createElement('div');
    title.setAttribute('style', 'font-weight:600;font-size:13px;');
    title.textContent = 'Livinity MCP tools';
    wrap.appendChild(title);

    var hint = document.createElement('div');
    hint.setAttribute('style', 'font-size:12px;opacity:0.72;line-height:1.4;');
    hint.textContent =
      'One-click install of Liv’s built-in tools (' + LIV_MCPS +
      ') into Liv AI and your installed CLI agents — no need to add each one by hand.';
    wrap.appendChild(hint);

    var row = document.createElement('div');
    row.setAttribute('style', 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'One-Click: Install Liv MCPs';
    btn.setAttribute('style',
      'padding:8px 14px;border-radius:8px;border:0;background:#7c3aed;color:#fff;' +
      'font-weight:600;font-size:13px;cursor:pointer;');

    var status = document.createElement('span');
    status.setAttribute('style', 'font-size:12px;opacity:0.9;');

    row.appendChild(btn);
    row.appendChild(status);
    wrap.appendChild(row);

    btn.addEventListener('click', function () {
      btn.disabled = true;
      var old = btn.textContent;
      btn.textContent = 'Installing…';
      status.textContent = '';
      status.style.color = '';
      trpcInstall().then(function (d) {
        if (d && d.emptyCatalog) {
          status.style.color = '#d97706';
          status.textContent =
            'No Liv MCPs found in config (liv:mcp:config empty) — reinstall LivOS to seed them.';
        } else {
          var created = (d && d.created) || 0;
          var skipped = (d && d.skipped) || 0;
          var errored = (d && d.errored) || 0;
          status.style.color = errored ? '#d97706' : '#16a34a';
          status.textContent =
            'Done — ' + created + ' installed, ' + skipped + ' already present' +
            (errored ? ', ' + errored + ' failed' : '') + '. Reload Liv AI to use them.';
        }
      }).catch(function (e) {
        status.style.color = '#dc2626';
        status.textContent = 'Failed: ' + ((e && e.message) || 'unknown error');
      }).then(function () {
        btn.disabled = false;
        btn.textContent = old;
      });
    });

    return wrap;
  }

  function mount() {
    if (document.getElementById(SENTINEL_ID)) return true;
    var anchor = findAnchorEl();
    if (!anchor) return false;
    // Walk up to a container with real height so the card sits inside the
    // dialog body rather than next to a bare heading text node.
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
