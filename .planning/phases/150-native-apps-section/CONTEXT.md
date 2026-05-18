# Phase 150 — Native Linux Apps Section — CONTEXT

**Milestone:** v37.0 Store Reimagining + Plugin Platform
**Status:** IN PROGRESS — Wave A (catalog seed) inline; Wave B (livinityd handler) operator-walk
**Depends on:** Phase 148 ✅ (SPEC), Phase 149 ✅ (5-section UI + DS port)

## Phase split for autonomous execution

v37-DRAFT.md Phase 150 has two halves. They have different operator-presence requirements:

- **Wave A — Catalog (Vercel + Supabase, this session):** seed 10 native app rows in Supabase `apps` table with `section='native'` and full manifest per SPEC §2.3 (apt/AppImage install, desktop_entry, launch, windowing). The Native tab on localhost:3001 will populate immediately, replacing the "Coming in Phase 150" placeholder. No livinityd changes; no Mini PC SSH required.
- **Wave B — Installer (livinityd, operator-walk):** ship `native-installer.ts` implementing `InstallHandler<'native'>` per SPEC §4. apt path + AppImage path + .desktop file gen + sudoers entry + integration with Phase 33 dock pattern + Phase 95 x11vnc window. Requires Mini PC SSH + deploy + UAT.

Wave B is split out because: (a) `feedback_ssh_rate_limit` says batch SSH only when needed, (b) the install handler needs live Mini PC to verify "install VSCode → see on dock → window opens" UAT criterion, (c) autonomous Mini PC operations are gated by operator presence.

## Wave A scope (this session)

1. Generate 10 native app rows with manifests:
   - Visual Studio Code (apt: `code`, binary `/usr/bin/code`)
   - Cursor (AppImage from `cursor.so`)
   - IntelliJ Community (AppImage or apt `intellij-idea-community`)
   - GIMP (apt: `gimp`)
   - Krita (apt: `krita`)
   - Inkscape (apt: `inkscape`)
   - Blender (apt: `blender`)
   - Audacity (apt: `audacity`)
   - OBS Studio (apt: `obs-studio`)
   - LibreOffice (apt: `libreoffice`)
2. Each manifest follows SPEC §2.3 JSON shape: `{ install, launch, desktopEntry, windowing }`
3. Apply migration to Supabase via `mcp__supabase__apply_migration`
4. Verify localhost:3001 Native tab shows 10 apps with their gradient tiles

## Wave B scope (deferred, operator-walk)

1. `livos/packages/livinityd/source/modules/apps/native-installer.ts` (NEW)
2. apt sudoers entry: `bruce ALL=(root) NOPASSWD: /usr/bin/apt-get install -y <allowlist>`
3. .desktop file generator → `/home/bruce/.local/share/applications/`
4. Integration with `installForUser` dispatcher
5. Dock-item creation reusing Phase 33 pattern
6. Window-open behavior: spawn binary inside Xvfb + x11vnc proxy (Phase 95)
7. UAT: install VSCode from /store → dock icon → click → window opens with VSCode

## Implementation Decisions (Wave A, Claude's discretion)

- **Icon URLs:** use upstream project icon assets via `raw.githubusercontent.com` mirrors where stable; fall back to derived monogram (already implemented in P149.1 `app-visual.ts`) if no good icon URL.
- **Categories** for Native rows: mostly `development` (VSCode, Cursor, IntelliJ), `photography` (GIMP, Krita), `media` (Inkscape, Blender, Audacity, OBS), `productivity` (LibreOffice).
- **`apps.section`** = `'native'` for all 10.
- **No featured rows** in Wave A — featured = curator decision, defer to operator review post-localhost.
- **Verified flag** = `true` — these are operator-curated mainstream apps.
- **`docker_compose`** column is `NOT NULL` per existing schema; native rows put a stub `# native app — no compose` string. Future-cleanup: make column nullable in v38, but breaks Drizzle types so deferred.

## Acceptance (Wave A)

- [ ] Supabase migration applied: 10 INSERT statements with valid section='native' manifests
- [ ] `SELECT name FROM apps WHERE section='native' ORDER BY sort_order` returns 10 rows
- [ ] localhost:3001/store, Native tab → shows 10 app cards (no placeholder)
- [ ] Card icons render gradient monograms (VS Code = blue, GIMP = brown, etc.)
- [ ] Operator localhost UAT PASS

## What this does NOT do

- Native apps cannot be installed yet (no livinityd handler) — clicking Install will fail or pass through to existing Docker installer which doesn't know about native manifests. That's Wave B.
- No .desktop file generation, no dock integration, no x11vnc window — all Wave B.

See also: [[148-SPEC]], [[project-v37-draft]].
