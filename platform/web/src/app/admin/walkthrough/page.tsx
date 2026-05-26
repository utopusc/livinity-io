import { AdminShell } from '../admin-shell';

export default function AdminWalkthroughPlaceholderPage() {
  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Walkthrough</h1>
          <p className="admin-page-sub">
            How to add a new app or MCP server from scratch. Real content lands in Phase 215.
          </p>
        </header>

        <div className="admin-empty">
          <strong>Coming in Phase 215.</strong>
          <p>
            This page will host step-by-step walkthrough docs for one-click install wiring +
            adding a new app/MCP from scratch. Tracked as <code>CARRY-P213-WALKTHROUGH-PAGE</code>.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
