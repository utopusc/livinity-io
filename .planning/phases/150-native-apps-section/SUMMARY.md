# Phase 150 — Native Linux Apps Section — 🟡 WAVE A SHIPPED 2026-05-18

**Milestone:** v37.0 Store Reimagining + Plugin Platform
**Status:** Wave A (catalog seed) ✅ shipped; Wave B (livinityd installer) deferred to operator-walk session
**Effort:** Wave A ~15 min (single Supabase migration); Wave B ~1 day (Mini PC backend + UAT)
**Commits:** 1 (Wave A migration committed in P149.1 wave; Wave B = future)
**Sacred SHA footer:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## Wave A — Catalog seed (shipped)

Applied Supabase migration `phase_150_seed_native_apps` via `mcp__supabase__apply_migration`. 10 INSERT rows with `section='native'` and per-row SPEC §2.3 manifests. Native tab on localhost:3001 now populates with these instead of the "Coming in Phase 150" placeholder.

### Seeded apps (10)

| Slug | Name | Install path | Category | Sort |
|---|---|---|---|---|
| vscode | Visual Studio Code | apt: `code` | development | 10 |
| cursor | Cursor | AppImage from `downloader.cursor.sh` | development | 20 |
| intellij-ce | IntelliJ IDEA Community | apt: `intellij-idea-community` | development | 30 |
| gimp | GIMP | apt: `gimp` | photography | 40 |
| krita | Krita | apt: `krita` | photography | 50 |
| inkscape | Inkscape | apt: `inkscape` | photography | 60 |
| blender | Blender | apt: `blender` | media | 70 |
| audacity | Audacity | apt: `audacity` | media | 80 |
| obs-studio | OBS Studio | apt: `obs-studio` | media | 90 |
| libreoffice | LibreOffice | apt: `libreoffice` | productivity | 100 |

### Each manifest includes (SPEC §2.3 shape)

```json
{
  "install": { "primary": "apt|appimage", ... },
  "launch": { "binaryPath": "/usr/bin/...", "wmClassHint": "..." },
  "desktopEntry": { "name": "...", "comment": "...", "icon": "...", "categories": [...] },
  "windowing": { "vncMode": "x11vnc", "geometry": { "w": 1440, "h": 900 } }
}
```

Each launch block satisfies `nativeAppConfigSchema` ABSOLUTE_PATH_RE / SHELL_METACHAR_RE / wmClassHint regex (livinityd-side validation already in place).

### Smoke verified

- `SELECT section, count(*) FROM apps GROUP BY section` → `app: 27, native: 10`
- `curl /api/apps?section=native` → 10 rows, each with `section: "native"` and valid icon_url
- localhost:3001 Native tab will render 10 monogram-tile cards (gradients synthesized via `app-visual.ts` — VSCode = sky blue (override), Cursor = palette-derived, etc.)

## Wave B — livinityd install handler (deferred, operator-walk)

This is the work that requires Mini PC SSH + deploy + live UAT. Documented as a follow-up phase artifact, not executed here.

### Wave B scope

1. `livos/packages/livinityd/source/modules/apps/native-installer.ts` (NEW)
   - Implements `InstallHandler<'native'>` from SPEC §4.2
   - Dispatch on `manifest.install.primary`: apt path vs. AppImage path
   - apt path: `sudo apt-get install -y <pkgs>` (sudoers entry below)
   - AppImage path: `curl -L <url> | sha256sum -c <sha>`, chmod +x, place in `/home/bruce/.local/bin/`
2. Sudoers entry (deploy script change):
   ```
   bruce ALL=(root) NOPASSWD: /usr/bin/apt-get install -y <allowlist>
   ```
   Allowlist = the 10 apt packages above. Anything outside the list bounces.
3. `.desktop` file generator → `/home/bruce/.local/share/applications/<slug>.desktop`
4. Dock-item creation reusing Phase 33 pattern (livinityd `dock` module)
5. Window-open behavior: spawn binary inside per-user Xvfb + x11vnc proxy (Phase 95 pattern)
6. Wire native handler into existing `installForUser` dispatcher (per SPEC §4.4)

### Wave B UAT criteria

- Operator clicks "Install" on VS Code in /store
- apt install runs on Mini PC; .desktop file created; dock-item appears
- Operator clicks dock item → Xvfb window spawns → VS Code UI streams to LivOS window
- Uninstall removes apt package (or skips if shared) + .desktop file + dock-item

### Wave B blockers

- Memory `feedback_ssh_rate_limit`: Mini PC SSH must be batched. Wave B is a multi-step deploy + verify cycle.
- Operator must approve sudoers entry (security-sensitive — root apt access for a single user).
- Live UAT requires operator to drive the install button in /store and verify the window opens.

## Acceptance (Wave A)

- [x] Supabase migration applied with 10 native rows
- [x] `SELECT section, count(*)` returns `native: 10`
- [x] `/api/apps?section=native` returns 10 rows with valid section + manifest
- [ ] Operator localhost UAT: Native tab shows 10 cards (replaces placeholder)
- [ ] Operator approval to advance to Phase 151

## Acceptance (Wave B, future session)

- [ ] `native-installer.ts` shipped + Mini PC deployed
- [ ] Sudoers entry committed to `scripts/install/`
- [ ] Operator UAT: install VS Code from /store → dock → window opens

## What this unblocks

Phase 151 (WebApp section + Custom URL form) — same catalog-seed pattern. Then Phase 152 (AI section), then the gate phases 153-155.

## Carryover

- Wave B livinityd implementation (own phase scope)
- AppImage sha256 hashes blank for cursor.so URL (no published hash — fetch + compute at deploy time)
- IntelliJ Community is apt-available on Ubuntu 24.04 (snap by default, but `apt install intellij-idea-community` works with snap-backed package); double-check at Wave B
- LibreOffice version 25.2 is the in-development release as of writing — apt typically pins to 24.x; adjust manifest if Wave B reveals divergence

See also: [[148-SPEC]], [[149-store-ui-redesign]], [[project-v37-draft]].
