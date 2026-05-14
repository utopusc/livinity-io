# Design Tokens — Visual Smoke Test

Quick visual confirmation that `tokens.css` + `fonts.css` paint correctly
with the self-hosted `.woff2` files (no Google Fonts CDN required).

## Re-run the smoke test

```bash
# From the package root (livos/packages/design-tokens/):
chrome --headless=new \
       --screenshot=smoke-test/test-output.png \
       --window-size=900,720 \
       --hide-scrollbars \
       file:///$(pwd)/smoke-test/index.html
```

On Windows (PowerShell):

```powershell
chrome.exe --headless=new `
           --screenshot=smoke-test/test-output.png `
           --window-size=900,720 `
           --hide-scrollbars `
           "file:///$((Get-Location).Path)/smoke-test/index.html"
```

## What the output proves

- Geist (sans) loads from the self-hosted `.woff2` and paints at weight 500.
- Geist Mono renders the version string in uppercase with letter-spacing.
- Instrument Serif italic paints the hero line.
- All four accent colors (blue / green / amber / red) match the canonical
  CSS variables from `dashboard.html`.

If the PNG renders as system serif/sans fallback, the local `.woff2` paths
in `fonts.css` did not resolve — check the `fonts/` directory next to
`fonts.css`.

## Manual inspection

Open `smoke-test/index.html` in any browser. Online or offline — both
should paint identically because the `.woff2` files are bundled.
