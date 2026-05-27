# Livinity brand overlay — Phase 232

Repo source for the brand assets that are served at `/liv/branding/*` on the
Mini PC, overriding AionUi's default visual identity WITHOUT forking the
upstream tarball (per `D-V42-SACRED` in `.planning/milestones/v42/PROJECT.md`).

## File inventory

| File | Purpose | Approx. size |
|------|---------|--------------|
| `livinity-overlay.css` | Space Grotesk font + `#1d1d1f` accent + body font-family override | ~700 B |
| `favicon.svg` | 32x32 Livinity `L` mark, `#1d1d1f` on transparent | ~330 B |
| `manifest.json` | PWA manifest overlay with Livinity `theme_color` | ~220 B |

## How these reach the Mini PC

1. `scripts/install-liv-assistant.sh` (Phase 232 step) copies each file from
   `${repo}/caddy/branding/<name>` → `/etc/liv-assistant/branding/<name>` via
   `cmp -s` + `install -m 0644 -o root -g root`. Idempotent — files are only
   re-written when content differs.
2. `livos/packages/livinityd/source/modules/domain/caddy.ts` emits a
   `handle /liv/branding/* { root * /etc/liv-assistant/branding; file_server }`
   block inside every `bruce.livinity.io { ... }` site block it generates
   (apex + multi-user subdomain + fallback `:80`).
3. The same caddy.ts file also patches the existing `LIV_ASSISTANT_HANDLE`
   (Phase 226-04) to add a Caddy `replace` directive that injects
   `<link rel="stylesheet" href="/liv/branding/livinity-overlay.css">`
   immediately before `</head>` in every `text/html` response from AionUi.

## Caddy directive emitted

```
handle /liv/branding/* {
	uri strip_prefix /liv/branding
	root * /etc/liv-assistant/branding
	file_server
}
@liv path /liv /liv/*
handle @liv {
	uri strip_prefix /liv
	reverse_proxy 127.0.0.1:3020 {
		header_down -X-Frame-Options
		header_down -Content-Security-Policy
	}
	header Content-Security-Policy "frame-ancestors 'self' https://bruce.livinity.io"
	replace "</head>" "<link rel=\"stylesheet\" href=\"/liv/branding/livinity-overlay.css\"></head>"
}
```

## Update flow

1. Edit any file under `caddy/branding/` in this repo.
2. `git commit && git push origin master`.
3. On Mini PC: `bash /opt/livos/update.sh` — the rsync copies the new asset
   into `/opt/livos/caddy/branding/`, and `install-liv-assistant.sh`'s Phase
   232 step detects the content delta via `cmp -s` and re-installs only
   changed files.
4. `systemctl reload caddy` is triggered by update.sh's restart sequence —
   no manual intervention needed.

## D-V42-NO-PHONE-HOME caveat

`livinity-overlay.css` loads Space Grotesk from `fonts.googleapis.com`. This
is a CLIENT-side font fetch (the user's browser, not livinityd). livinityd
itself makes zero outbound calls for branding. Acceptable for v42; if/when
v43 needs zero-egress fonts, self-host woff2 next to the CSS file and replace
the `@import` with `@font-face { src: url('/liv/branding/space-grotesk-*.woff2') }`.

## Related plans

- `.planning/phases/232-livinity-brand-overlay/232-01-PLAN.md` — repo-side scaffold (this).
- `.planning/phases/232-livinity-brand-overlay/232-02-PLAN.md` — Mini PC deploy + smoke.
- `.planning/phases/226-caddy-liv-proxy-iframe-headers/226-04-PLAN.md` — regen-survivable Caddy emission pattern (the reason brand overlay lives in caddy.ts, not in a separate snippet).
- `.planning/milestones/v42/PROJECT.md` — `D-V42-LIVINITY-BRAND` locked invariant.
