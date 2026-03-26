# Phase 4: Server Infrastructure - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Install x11vnc via install.sh with GUI detection, register as NativeApp in livinityd, and configure Caddy subdomain for `pc.{domain}` with JWT cookie gating. After this phase, VNC is running and testable with any standard VNC client via localhost.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from research:
- x11vnc MUST bind to `-localhost` (127.0.0.1 only) — no external exposure
- GUI detection: `systemctl get-default` for `graphical.target`, fallback to X11/Wayland socket check
- Headless servers: skip x11vnc entirely without error
- Caddy needs `stream_close_delay 5m` to prevent WebSocket drops during reload
- NativeApp port: 5900 (x11vnc default VNC port)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NativeApp` class in `native-app.ts` — full systemd lifecycle (start/stop/restart), port health-checking via `ss -tlnp`, idle timeout, state machine. `NATIVE_APP_CONFIGS` array is currently empty.
- `generateFullCaddyfile()` in `caddy.ts` — already has `nativeApps` parameter that generates JWT-gated subdomain blocks with `livinity_token` cookie check and login redirect. Pattern at line 88-104.
- `nativeAppSubdomains` in `apps.ts:763` — maps native instances to subdomain/port for Caddy generation. Uses `getBuiltinApp()` for subdomain lookup.
- `install.sh` — 1200+ line installer with main() wrapper, ERR trap, OS/arch detection, whiptail wizard, systemd service creation (`create_systemd_service()`). Has existing patterns for package install (`apt install`), service setup, and config.

### Established Patterns
- Systemd services created via `create_systemd_service()` in install.sh
- NativeApp uses `systemctl start/stop` via execa `$` template
- Caddy reload via `caddy reload --config /etc/caddy/Caddyfile`
- Port health-check: loop `ss -tlnp | grep :PORT` up to 20 times with 500ms sleep

### Integration Points
- `NATIVE_APP_CONFIGS` array — add x11vnc config here
- `generateFullCaddyfile()` nativeApps parameter — x11vnc subdomain added automatically when NativeApp is registered
- `install.sh` main function — add `install_desktop_streaming()` alongside other install functions
- Caddy nativeApps block needs `stream_close_delay` addition for WebSocket resilience

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Follow existing patterns exactly.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
