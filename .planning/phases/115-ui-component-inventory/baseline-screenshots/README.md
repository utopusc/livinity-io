# Phase 115-03 Baseline Screenshots

**Snapshot date:** 2026-05-14
**Capture method:** Headless Chrome (fallback) — see "MCP fallback" below.
**Count:** 48 PNGs (12 routes × 4 viewports).

## Filename pattern

```
<route-slug>-<viewport-width>-<theme>.png
```

- `<route-slug>` = lowercased path with `/` → `-` (e.g. `dashboard-install`, `forgot-password`, `minipc-login`)
- `<viewport-width>` = `1920` (1920×1080 desktop) or `375` (375×812 iPhone 13 mini)
- `<theme>` = `light` (default OS) or `dark` (Chrome `--force-dark-mode`)

## Routes captured (12)

| # | route-slug | URL | Surface |
|---|---|---|---|
| 1 | `index` | https://livinity.io/ | landing (`index.html`) |
| 2 | `dashboard` | https://livinity.io/dashboard | landing (`dashboard.html`) |
| 3 | `dashboard-install` | https://livinity.io/dashboard/install | landing (`dashboard-install.html`) |
| 4 | `login` | https://livinity.io/login | Server5 Next.js or `auth.html` (Caddy choice) |
| 5 | `register` | https://livinity.io/register | Server5 Next.js |
| 6 | `forgot-password` | https://livinity.io/forgot-password | landing (`forgot-password.html`) |
| 7 | `store` | https://livinity.io/store | Server5 Next.js |
| 8 | `download` | https://livinity.io/download | landing (`download.html`) |
| 9 | `profile` | https://livinity.io/profile | landing (`profile.html`) |
| 10 | `customize` | https://livinity.io/customize | landing (`customize.html`) |
| 11 | `minipc-root` | https://bruce.livinity.io/ | Mini PC livinityd via Server5 relay |
| 12 | `minipc-login` | https://bruce.livinity.io/login | Mini PC livinityd login |

Each captured at:
- 1920×1080 light
- 1920×1080 dark
- 375×812 light
- 375×812 dark

Total = 12 × 4 = 48 PNGs.

## MCP fallback (why headless Chrome, not chrome-devtools-mcp)

Plan 115-03 specified Chrome DevTools MCP at `http://127.0.0.1:9223`. During execution:

```
curl -v http://127.0.0.1:9223/json/version
> Failed to connect to 127.0.0.1 port 9223: Connection refused
```

The agent did NOT have `mcp__chrome-devtools__*` tools in its tool roster. Per the plan's fallback path
(`<action>` step "Pre-flight check"), the agent had two options:

1. Document the gap in `.work/screenshot-blocked.md` and ship zero captures.
2. Use an alternative capture method.

Option 2 was selected because the user's machine has Chrome installed at
`/c/Program Files/Google/Chrome/Application/chrome.exe` and supports the `--screenshot` flag in
headless mode. This produces equivalent PNG output for visual-diff purposes.

### Capture command (per PNG)

```
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
  --window-size=${width},${height} \
  --virtual-time-budget=4000 \
  [--force-dark-mode --enable-features=WebUIDarkMode] \
  --screenshot="$out" \
  "$url"
```

Driver script: `../.work/shoot.sh`. Run log: `../.work/shoot.log`.

### Caveats vs MCP capture

- **Dark theme:** headless Chrome `--force-dark-mode` triggers `prefers-color-scheme: dark` and the
  built-in auto-dark filter. Pages WITH explicit `body.dark` blocks may render dark via media-query;
  pages WITHOUT (most non-canonical landing HTMLs per `INVENTORY-LANDING.md`) will show Chrome's
  auto-inverted dark filter, which is a useful "broken dark" signal but not visually identical to
  what `body.dark` would produce. Phase 117/118 should replay dark captures with MCP `body.classList`
  injection once the MCP server is restored for pixel-true dark baselines.
- **Iridescent theme:** not captured (only `dashboard.html` defines `body.iridescent`; no flag
  triggers it without script injection). Phase 121 visual regression will need MCP for this theme.
- **Auth redirects:** `bruce.livinity.io/` and `bruce.livinity.io/login` were captured at whatever
  landing point the headless Chrome reached without an authed session. These are baseline-as-of-no-auth
  states; an authed-dashboard baseline requires session cookies (operator-walked or a future MCP run).

### Re-run with MCP later

When the chrome-devtools-mcp server is back up at `:9223`, replay this task to refresh dark/iridescent
captures with explicit `body.classList` injection:

```
mcp__chrome-devtools__navigate_page → set_viewport → evaluate_script(theme=dark|iridescent)
  → take_screenshot(full_page=true)
```

Replace the `*-dark.png` files in this directory and add `*-iridescent.png` variants.

## Phase consumption

These PNGs are the pre-migration baseline for:

- Phase 116 (design tokens) — diff against `:root` extraction
- Phase 117 (dashboard ports) — diff against canonical-token-applied pages
- Phase 118 (landing migration) — diff per-file against canonical
- Phase 121 (visual regression suite) — automated diff target for every subsequent design-system PR
