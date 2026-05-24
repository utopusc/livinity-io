"use client";

/**
 * Phase 205-02 — MCP Servers tab placeholder.
 *
 * Wave 2 (Plan 205-03) replaces this body with the full External MCP
 * servers CRUD UI (list + Add form + Delete) reusing the wire envelope
 * from `lib/livinityd-client.ts`. Until then, render a friendly stub so
 * the tab strip lays out correctly in the running build.
 */
export function McpServersTab() {
  return (
    <div className="space-y-3 p-m">
      <h2 className="text-base font-medium">MCP Servers</h2>
      <p className="text-xs text-muted-foreground/80">
        MCP server management will be available here. (Wave 2 — Phase 205-03.)
      </p>
    </div>
  );
}
