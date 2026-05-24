"use client";

/**
 * Phase 205-02 — Gateway tab placeholder.
 *
 * Wave 3 (Plan 205-04) replaces this body with the 3-section Gateway
 * CRUD UI (paired devices revoke + allowed origins + auth mode/rotate).
 * Until then, render a friendly stub so the tab strip lays out
 * correctly in the running build.
 */
export function GatewayTab() {
  return (
    <div className="space-y-3 p-m">
      <h2 className="text-base font-medium">Gateway</h2>
      <p className="text-xs text-muted-foreground/80">
        Gateway settings (paired devices, allowed origins, auth) will be available here. (Wave 3 —
        Phase 205-04.)
      </p>
    </div>
  );
}
