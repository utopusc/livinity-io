---
phase: 128
name: App Tile (Monogram) (Step 7 of 8)
milestone: v36.0
status: SHIPPED
shipped_at: 2026-05-15
visible_delta: NONE (component-only)
acceptance_criteria: 3/3 PASS
---

# Phase 128 — App Tile — SHIPPED

AppTile + AppTileGrid in `livos/packages/ui/src/components/app-tile.tsx`. Implements §09 — 34×34 monogram (fg/bg invert) over 14px semibold name + 11px mono category. Hover lifts -2px and rotates/scales the glyph via ease-out-v36 timing. iconUrl fallback for legacy callsites with image icons.

Proof: `.planning/phases/v36-batch-proof-126-129.png`.
