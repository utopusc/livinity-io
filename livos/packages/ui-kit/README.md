# @livinity/ui-kit

Reusable React component library for LivOS UI surfaces. Implements the
`dashboard.html` design language via [`@livinity/design-tokens`][tokens]. The
package ships three independent build outputs so that every LivOS consumer —
the Mini PC livinityd Vite app, Server5 Next.js, and the public landing
static HTML pages — can pick the loader that suits its environment.

> **Status:** v0.1.0 — scaffolding release. Phase 119-01 lands the chassis
> (build pipelines + Storybook + Vitest). Phase 119-02 / 119-03 populate the
> component exports.

## Install

```bash
pnpm add @livinity/ui-kit @livinity/design-tokens
```

You must also import the canonical design-tokens stylesheet **once** at your
app root. The components rely on the CSS variables (`--accent-blue`,
`--card-bg`, `--dash-radius`, …) and font-faces defined there:

```ts
import "@livinity/design-tokens/tokens.css";
import "@livinity/design-tokens/fonts.css";
```

## Consumer paths

### ESM (Vite / Next.js / modern bundlers)

```ts
import { Button } from "@livinity/ui-kit";

export function CallToAction() {
  return <Button variant="solid">Get started</Button>;
}
```

Resolves to `dist/index.mjs` + `dist/index.d.ts` via the package `exports`
field.

### CommonJS (legacy Node SSR / older toolchains)

```js
const { Button } = require("@livinity/ui-kit");
```

Resolves to `dist/index.cjs`.

### UMD (static HTML / no-bundler consumers)

The library also ships a UMD bundle that registers a single global,
`window.LivKit`, and externalizes React. Load React + ReactDOM UMD first
(matches the `dashboard.html` pattern), then load LivKit:

```html
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<link rel="stylesheet" href="/node_modules/@livinity/design-tokens/tokens.css" />
<link rel="stylesheet" href="/node_modules/@livinity/design-tokens/fonts.css" />
<script src="/node_modules/@livinity/ui-kit/dist/umd/livkit.umd.js"></script>

<div id="root"></div>
<script>
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(React.createElement(window.LivKit.Button, null, "Hello"));
</script>
```

## Themes

The package re-exports a small helper for toggling the canonical themes
(`light`, `dark`, `iridescent`):

```ts
import { applyLivTheme, readLivTheme } from "@livinity/ui-kit";

applyLivTheme(readLivTheme()); // hydrate from localStorage / prefers-color-scheme
```

The body class contract is locked: `body.dark` for dark theme,
`body.iridescent` for iridescent, no class for the default light theme.

## Development

```bash
pnpm install                                   # from repo root livos/
pnpm --filter @livinity/ui-kit build           # ESM + CJS + UMD
pnpm --filter @livinity/ui-kit test            # Vitest (jsdom)
pnpm --filter @livinity/ui-kit storybook       # Storybook on :6006
pnpm --filter @livinity/ui-kit storybook:build # static export to storybook-static/
pnpm --filter @livinity/ui-kit typecheck       # tsc --noEmit
```

## License

MIT.

[tokens]: ../design-tokens/README.md
