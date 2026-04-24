# Requirements: Livinity v26.0 — Device Security & User Isolation

**Defined:** 2026-04-24
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v26.0 Requirements

### Device Ownership (OWN)

- [ ] **OWN-01**: Every device record in PostgreSQL has a non-null user_id linking it to its owner
- [ ] **OWN-02**: Device registration binds the new device to the authenticated user creating it (no orphan devices)
- [ ] **OWN-03**: Device list endpoint returns only devices owned by the calling user (no cross-user device visibility)

### Device Access Authorization (AUTHZ)

- [ ] **AUTHZ-01**: All device-routed tools (shell, files, screenshot, processes, etc.) verify the caller owns the target device before invoking it
- [ ] **AUTHZ-02**: Device authorization failures return a clear error and are written to the audit log
- [ ] **AUTHZ-03**: The Nexus REST /api/devices/* endpoints enforce per-request ownership checks (defense in depth, not only tRPC)

### Shell Tool Isolation (SHELL)

- [ ] **SHELL-01**: User's terminal shell tool cannot specify a device ID outside the user's owned set — cross-user device IDs are rejected
- [ ] **SHELL-02**: When no device is specified, the shell tool defaults to the user's local session (never accidentally routes to another user's device)

### Device Session Binding (SESS)

- [ ] **SESS-01**: Each DeviceBridge WebSocket connection is bound to a specific user session JWT at handshake
- [ ] **SESS-02**: Device session tokens expire and require refresh; expired tokens terminate the bridge connection
- [ ] **SESS-03**: When a user logs out or their session is revoked, all their active device bridges disconnect

### Audit Log (AUDIT)

- [ ] **AUDIT-01**: Every device tool invocation (shell, files, etc.) appends an immutable row to the device_audit_log PostgreSQL table with user_id, device_id, tool, params digest, timestamp, and success/error
- [ ] **AUDIT-02**: Audit log entries cannot be modified or deleted through any application API (append-only enforcement at DB level)

### Admin Override (ADMIN)

- [ ] **ADMIN-01**: Admin users can list all devices across all users in the Admin panel (normal users cannot)
- [ ] **ADMIN-02**: Admin users can emergency-disconnect any active device bridge, forcing the bridge to terminate

## v27.0 Requirements (Deferred)

### Smart Approval

- **APPROVE-01**: LLM pre-assessment of dangerous commands (APPROVE / DENY / ESCALATE) before escalating to human
- **APPROVE-02**: Session-level approved-command cache to avoid re-asking for the same command

### Per-Tool Fine-Grained Permissions

- **PERM-01**: Per-device permission matrix (screenshot / files / shell as separate toggles)
- **PERM-02**: Per-tool permission request UI in Settings
- **PERM-03**: Device sharing between users (user A grants user B access to a specific device)

### Advanced Memory (from v25.0)

- **MEM-05**: AI can generate conversation summaries and store as high-level memories
- **MEM-06**: Memory importance scoring with user feedback (thumbs up/down)

### WhatsApp Advanced (from v25.0)

- **WA-07**: WhatsApp group message support with mention activation
- **WA-08**: Pairing code fallback (alternative to QR code)
- **WA-09**: Media message support (images, voice notes)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Smart approval / LLM pre-assessment | Explicitly deferred to v27.0 — current auto-approve UX must be preserved |
| Per-tool permission granularity | Deferred to v27.0 — milestone focus is cross-user isolation, not in-user tool gating |
| Device sharing / collaboration | Deferred to v28.0 — requires v26.0 isolation first |
| Change to AI agent auto-approval behavior | User explicitly opted out — auto-approve stays as-is |
| PostgreSQL conversation backup | User explicitly excluded — Redis-only for now (carried from v25.0) |
| WhatsApp Business API | Defeats self-hosting philosophy, requires Meta approval (carried) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OWN-01 | TBD | Pending |
| OWN-02 | TBD | Pending |
| OWN-03 | TBD | Pending |
| AUTHZ-01 | TBD | Pending |
| AUTHZ-02 | TBD | Pending |
| AUTHZ-03 | TBD | Pending |
| SHELL-01 | TBD | Pending |
| SHELL-02 | TBD | Pending |
| SESS-01 | TBD | Pending |
| SESS-02 | TBD | Pending |
| SESS-03 | TBD | Pending |
| AUDIT-01 | TBD | Pending |
| AUDIT-02 | TBD | Pending |
| ADMIN-01 | TBD | Pending |
| ADMIN-02 | TBD | Pending |

**Coverage:**
- v26.0 requirements: 15 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 15

---
*Requirements defined: 2026-04-24*
