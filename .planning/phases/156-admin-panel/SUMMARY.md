# Phase 156 — Admin Panel for Apps CRUD — ✅ SHIPPED 2026-05-18

**Milestone:** v37.0 Store Reimagining + Plugin Platform (post-148 series)
**Status:** ✅ CODE-COMPLETE — operator-only catalog management UI
**Trigger:** Operator request 2026-05-18 — "kolayca uygulamaları yükleyebileceğim bir admin paneli olustur"
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## What ships

A full CRUD admin panel at `/admin/apps` on the Vercel-hosted platform. Operator manages the Supabase `apps` catalog without touching SQL.

### Routes

- `GET /admin` → redirects to `/admin/apps`
- `GET /admin/apps` — list view with section pill filter (All / app / webapp / native / ai / plugin)
- `GET /admin/apps/new` — create form
- `GET /admin/apps/[slug]` — edit form

### API endpoints (operator-only, X-Api-Key auth)

- `GET /api/admin/apps` — list all rows
- `GET /api/admin/apps/[slug]` — fetch one
- `POST /api/admin/apps` — create
- `PUT /api/admin/apps/[slug]` — update
- `DELETE /api/admin/apps/[slug]` — delete
- `POST /api/admin/icon-upload` — multipart upload to Supabase Storage

### Auth

`AdminGate` accepts an operator api-key via `?token=...` URL param OR a manual paste form. Persists into `sessionStorage` and strips from the visible URL. Same key the /store uses (`liv_k_*`). No new credential.

### Features

- **Per-section dynamic form** — switching section swaps the manifest JSON template to match SPEC §2 (app/webapp/native/ai/plugin). Won't clobber user edits if they've already diverged from the template.
- **Manifest JSON validation** — parses on every keystroke; submit button disables on invalid JSON with inline error message.
- **`docker_compose` field** only renders for `section=app` (required there, hidden elsewhere).
- **Icon upload** — drag-or-pick file → POST to `/api/admin/icon-upload` → Supabase Storage `app-icons/{slug}/{timestamp}-{name}` → public URL auto-populated into `icon_url`. 2 MB cap, PNG/JPEG/WebP/SVG only.
- **Icon URL fallback** — operators can also paste an external URL directly (existing rows use that pattern).
- **Featured + Verified flags** — checkboxes.
- **Section filter pills** with counts (live re-derived from row list).
- **Slug lock on edit** — slug is the URL-stable handle; locked after creation. All other fields editable.
- **Delete with confirm** — `window.confirm` with copy noting install_history FK constraint risk.
- **Toast notifications** — success/error feedback on all mutations.
- **Italic serif accents** — DS-native typography (Manage the *catalog*, Add a new *app*, Edit *<name>*).
- **Monogram gradient avatars** in the table — same `app-visual.ts` helper the /store uses.

### Supabase changes

- **Storage bucket `app-icons`** created via MCP migration `phase_156_create_app_icons_bucket`:
  - Public read
  - 2 MB file size limit
  - Allowed MIME: image/png, image/jpeg, image/webp, image/svg+xml
  - Writes only via service-role (gated by API route auth)
- RLS policy `Public read app icons` on `storage.objects` for SELECT.

### Files added

- `platform/web/src/app/admin/layout.tsx` — fonts + DS-tokens bridge
- `platform/web/src/app/admin/admin.css` — admin-specific table/form CSS (reuses store.css tokens)
- `platform/web/src/app/admin/admin-gate.tsx` — api-key auth gate
- `platform/web/src/app/admin/admin-shell.tsx` — sidebar shell
- `platform/web/src/app/admin/page.tsx` — redirect to /admin/apps
- `platform/web/src/app/admin/apps/page.tsx` — list view
- `platform/web/src/app/admin/apps/new/page.tsx` — create form
- `platform/web/src/app/admin/apps/[id]/page.tsx` — edit form
- `platform/web/src/app/admin/components/app-form.tsx` — shared form (create + edit)
- `platform/web/src/app/admin/components/toast.tsx` — toast primitive
- `platform/web/src/app/admin/lib/admin-api.ts` — fetch client + manifest templates + category options
- `platform/web/src/app/api/admin/apps/route.ts` — list + create
- `platform/web/src/app/api/admin/apps/[id]/route.ts` — get + update + delete
- `platform/web/src/app/api/admin/icon-upload/route.ts` — multipart icon upload

### Side change

- `platform/web/src/app/store/types.ts` AppSummary gained `verified: boolean` field (the badge logic needs it)
- `platform/web/src/app/api/apps/route.ts` returns `apps.verified` column in the list response

### Smoke verified

- `tsc --noEmit` clean
- `http://localhost:3001/admin/apps` → list renders all 62 rows with section filter chips, gradient monograms, Edit/Delete actions
- `http://localhost:3001/admin/apps/new` → form renders with section selector, manifest template, icon upload, all fields
- Screenshots in `.planning/phases/156-admin-panel/screenshots/`

## Operator usage

```
http://localhost:3001/admin/apps?token=liv_k_rX_G7vqBrT8w_eovQdjf
```

Token persists into sessionStorage after first load — subsequent `/admin/*` visits in the same tab don't need it.

Production: Vercel deploy auto-publishes `/admin/apps` to `https://livinity.io/admin/apps`.

## Acceptance

- [x] List view with all 62 catalog rows
- [x] Section pill filter (All / app / webapp / native / ai / plugin) with counts
- [x] Create form per-section manifest template
- [x] Edit form pre-populated
- [x] Delete with confirm
- [x] Icon upload to Supabase Storage
- [x] Icon URL paste fallback
- [x] Manifest JSON validation
- [x] docker_compose field only shown for section=app
- [x] Toast feedback on mutations
- [x] tsc clean
- [x] Localhost smoke pass on /admin/apps + /admin/apps/new

## Carryover (not done, low priority)

- Search input on list page (filter by name/slug)
- Bulk operations (delete multiple, change section)
- Manifest schema validation against zod (currently only JSON parse + section enum)
- Audit log of admin actions
- Multiple operator accounts (today: single api-key)
- Drag-to-reorder for `sort_order`

See also: [[148-SPEC]], [[149-store-ui-redesign]].
