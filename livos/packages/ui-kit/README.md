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

## Using LivKit in plain HTML (UMD)

Landing HTML pages (e.g. `dashboard.html`, marketing pages, the Phase 118
public site) consume `@livinity/ui-kit` via the UMD bundle. Copy-paste this
recipe into any static page — no bundler, no build step.

### Recipe

```html
<!-- 1. Design tokens + fonts (must come first so var(--*) resolves) -->
<link rel="stylesheet" href="https://unpkg.com/@livinity/design-tokens@1/tokens.css">
<link rel="stylesheet" href="https://unpkg.com/@livinity/design-tokens@1/fonts.css">

<!-- 2. LivKit bundled stylesheet (atoms.css + composites.css) -->
<link rel="stylesheet" href="https://unpkg.com/@livinity/ui-kit@0/dist/umd/style.css">

<!-- 3. React UMD (pinned to 18.2.0 to match the LivKit peer range) -->
<script crossorigin src="https://unpkg.com/react@18.2.0/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"></script>

<!-- 4. LivKit UMD — exposes window.LivKit -->
<script src="https://unpkg.com/@livinity/ui-kit@0/dist/umd/livkit.umd.js"></script>

<!-- 5. Mount components -->
<div id="root"></div>
<script>
  const e = React.createElement;
  ReactDOM.createRoot(document.getElementById("root")).render(
    e(LivKit.Card, null,
      e(LivKit.NavBar, { brand: "Livinity", actions: e(LivKit.ThemeToggle, null) }),
      e(LivKit.Button, { variant: "solid" }, "Get started"),
    ),
  );
</script>
```

### `window.LivKit` surface

The UMD bundle exposes exactly the same API as the ESM/CJS builds via a
single `window.LivKit` global. The Phase 119-04 verifier (`smoke-test/verify-umd.cjs`)
asserts every member below is present on every release.

**Components (11)** — React components, mount via `React.createElement(LivKit.<Name>, props, ...children)`:

| Name             | Notes                                                          |
| ---------------- | -------------------------------------------------------------- |
| `Button`         | `variant: 'solid' \| 'ghost' \| 'danger'`, `size`, `loading`   |
| `Card`           | `padding: 'default' \| 'tight'`, `radius: 'default' \| 'tight'`|
| `Pill`           | `tone: 'ok' \| 'warn' \| 'err' \| 'neutral'`                   |
| `Input`          | `label`, `hint`, `error`; auto-`id` via `React.useId()`        |
| `PasswordInput`  | Inherits Input + visibility toggle with `aria-pressed`         |
| `Stepper`        | `steps: [{label}]`, `current: number`                          |
| `CommandBox`     | `text`, optional `copyButton: true` (clipboard write)          |
| `Modal`          | Controlled (`open`, `onClose`, `title`); portal to `document.body` |
| `NavBar`         | `brand`, `actions` slot — typically wraps `<ThemeToggle/>`     |
| `ThemeToggle`    | Cycles `light -> dark -> iridescent`, persists to `localStorage` |
| `ToastProvider`  | Wrap your app once; pairs with `useToast()`                    |

**Functions (4)**:

- `useToast()` — imperative API `{ success, warn, error, info, dismiss }`. **Must be called from a component rendered inside `<ToastProvider>`**.
- `cn(...args)` — `clsx`-style className merger.
- `applyLivTheme(theme)` — toggles `body.dark` / `body.iridescent` classes.
- `readLivTheme()` — returns the persisted theme from `localStorage['liv_theme']`, defaults to `light` (or `dark` if `prefers-color-scheme: dark`).

**Values (3)**:

- `LIV_THEME_STORAGE_KEY` — the `localStorage` key, `"liv_theme"`.
- `LIV_THEMES` — readonly `['light', 'dark', 'iridescent']`.
- `__ui_kit_version__` — version stamp (currently `"0.1.0"`).

### Important loading order

1. **Design tokens CSS first.** Components reference `var(--accent-blue)`,
   `var(--card-bg)`, `var(--dash-radius)` etc. — they render unstyled
   (transparent backgrounds, system fonts) if `tokens.css` is missing.
2. **`@livinity/ui-kit/dist/umd/style.css` second.** Contains the
   `.h-btn`, `.b-card`, `.pill`, `.i-text`, `.stepper`, `.modal-*`,
   `.toast-*`, `.navbar`, `.theme-toggle` class definitions.
3. **React + ReactDOM UMD before LivKit.** The UMD bundle externalizes
   `react` + `react-dom` — `window.React` and `window.ReactDOM` must be
   set before `livkit.umd.js` evaluates.
4. **Pin React to 18.2.0** — matches the peerDependency range. Pinning
   avoids minor upgrades breaking the bundle (React 19 will require a
   new ui-kit major).

### Browser support

Any modern evergreen browser supporting ES2020 + CSS Custom Properties +
`color-mix(in srgb, ...)` (Chrome ≥111, Firefox ≥113, Safari ≥16.2). The
bundle is shipped as production-minified UMD with `process.env.NODE_ENV`
inlined to `"production"` so no `process` shim is required.

### Toast in UMD pages

`useToast()` is a hook and cannot be called from plain `<script>`. Wrap
your mount in a function component nested inside `ToastProvider`:

```html
<div id="root"></div>
<script>
  const e = React.createElement;

  function App() {
    return e(LivKit.ToastProvider, null, e(Body, null));
  }

  function Body() {
    const toast = LivKit.useToast();
    return e(LivKit.Button, {
      variant: "solid",
      onClick: () => toast.success("Saved!"),
    }, "Save");
  }

  ReactDOM.createRoot(document.getElementById("root")).render(e(App, null));
</script>
```

### Worked example

A fully runnable reference page lives at
[`smoke-test/landing-umd.html`](./smoke-test/landing-umd.html). It is what
the Phase 119-04 verifier captures via headless Chrome
(`smoke-test/landing-umd.png`) and mounts every shipped component group
through `window.LivKit`. Phase 118 (landing HTML polish) and Phase 120
(Mini PC livinityd migration) consume this recipe verbatim.

> **Phase 121 cleanup note:** `nav.jsx` operators on landing pages can
> drop their hand-rolled nav markup for `LivKit.NavBar` once Phase 121
> retrofits the static HTML surfaces.

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
