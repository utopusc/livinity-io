<!-- source-sha: c89e8da3d644a2d7424fd76995115701f549f18e14dbde8a31f3af1ce1e6f59e -->
<!-- AUTO-GENERATED FROM docs/luse/KNOWN-LIMITS.md — DO NOT EDIT. -->

# Luse Known Limits

Documented platform and runtime limits the agent must plan around.
None of these have workarounds inside the Luse tool surface — each
either demands a different approach (landmark-anchored coordinates,
per-output screenshots) or is genuinely unsupported and must surface
as an error rather than a silent retry.

## Limit: DPI / scaling

Pixel coordinates returned by `computer_screenshot` are reported in
the X server's logical pixel space, which scales with the display's
configured fractional scaling factor. Memorised coordinates from one
DPI setting do not survive a switch to another.

| Scale factor | Effective behaviour                                                              | Recommended approach                                                  |
| ------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 100%         | Reported coordinates match physical pixels 1:1.                                  | Landmark-anchored clicks; coordinates from current screenshot only.   |
| 125%         | UI elements shift down/right relative to 100% layout; some labels wrap.          | Re-derive every coordinate from a fresh screenshot. Never reuse.      |
| 150%         | Major layout reflow; some panels split across more rows; click targets resize.   | Re-derive every coordinate from a fresh screenshot. Never reuse.      |

The corrective pattern is PATTERNS.md#pattern-2-landmark-anchored-clicks-not-pixel-coords.
Never paste raw coordinates from a previous session into a new
workflow.

## Limit: Multi-monitor

The X coordinate space is per-DISPLAY screen. `computer_screenshot`
returns the active X screen — typically the primary output — and does
not span multiple physical monitors in a single image. A workflow that
needs to verify state on a secondary monitor must issue a separate
screenshot call after switching focus to that output, or query each
output with its own `region` parameter if it is mapped into the same
logical screen.

Spanning monitors carries an additional gotcha: a click at
`{ x: 2200, y: 400 }` may land outside the primary output's bounds —
`computer_click_mouse` returns `out_of_bounds` rather than silently
routing the click to the secondary monitor. Always confirm the active
DISPLAY value before issuing cross-monitor clicks. See also
TROUBLESHOOTING.md#failure-wrong-display-env.

## Limit: Wayland gaps

Luse is X11-only. The Phase 242 LUSE.md prerequisites declare the
stack as `xdotool` / `scrot` based; neither tool talks Wayland's
display protocol. A Wayland-native session returns
`display_unavailable` on every Luse call — no fallback path exists
inside the MCP server.

Two partial mitigations exist outside Luse:

1. **XWayland session.** If the user's Wayland compositor exposes
   XWayland, Luse can attach to the XWayland display but only sees
   XWayland clients (not native Wayland clients). Mixed-protocol
   compositors hide some windows from xdotool entirely.
2. **Switch the user session to X11.** Most distros expose this
   choice on the login screen. This is an operator decision, not an
   agent one.

If neither mitigation applies, Luse is genuinely unsupported on the
host. Surface the error rather than retrying.

## Limit: Snap / Flatpak isolation

Snap and Flatpak applications run in sandboxes with their own input
groups. `computer_press_keys` chords issued at the X server level may
be intercepted at the sandbox boundary before reaching the sandboxed
application — common with shortcuts the sandbox steals for its own
shell (e.g. portals dialogs).

`computer_type_text` works against sandboxed apps because individual
key events are forwarded by the portal; chord events are the unreliable
case.

Workaround: prefer in-app menus accessed via `computer_click_mouse`
when targeting a sandboxed app. The menu equivalent of a keyboard
shortcut is always available and bypasses the sandbox input
interception.

## Limit: Root-only apps

`computer_application` cannot launch applications that require root
privileges (`pkexec`, `sudo`, `polkit`-gated launchers). The Luse MCP
runs as the seat user — no privilege escalation path is exposed at the
tool layer, by design. Attempting to launch a root-only app surfaces
either an authentication prompt the user must complete out-of-band, or
a hard failure depending on the launcher.

Gate this at the MCP layer: surface the error
(`application_requires_privilege`) rather than retrying the launch.
The operator decides whether to grant a one-shot privilege escalation
through the host's policy mechanism, after which the agent can retry.
Do not loop on the launch attempt — the second attempt fails
identically.