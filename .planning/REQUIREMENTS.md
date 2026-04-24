# Requirements: Livinity v26.0 — Device Security & User Isolation

**Defined:** 2026-04-24
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v26.0 Requirements

### Device Ownership (OWN)

- [x] **OWN-01**: Every device record in PostgreSQL has a non-null user_id linking it to its owner
- [x] **OWN-02**: Device registration binds the new device to the authenticated user creating it (no orphan devices)
- [x] **OWN-03**: Device list endpoint returns only devices owned by the calling user (no cross-user device visibility)

### Device Access Authorization (AUTHZ)

- [x] **AUTHZ-01**: All device-routed tools (shell, files, screenshot, processes, etc.) verify the caller owns the target device before invoking it
- [x] **AUTHZ-02**: Device authorization failures return a clear error and are written to the audit log
- [x] **AUTHZ-03**: The Nexus REST /api/devices/* endpoints enforce per-request ownership checks (defense in depth, not only tRPC)

### Shell Tool Isolation (SHELL)

- [x] **SHELL-01**: User's terminal shell tool cannot specify a device ID outside the user's owned set — cross-user device IDs are rejected
- [x] **SHELL-02**: When no device is specified, the shell tool defaults to the user's local session (never accidentally routes to another user's device)

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
| OWN-01 | Phase 11 | Complete |
| OWN-02 | Phase 11 | Complete |
| OWN-03 | Phase 11 | Complete |
| AUTHZ-01 | Phase 12 | Complete |
| AUTHZ-02 | Phase 12 | Complete |
| AUTHZ-03 | Phase 12 | Complete |
| SHELL-01 | Phase 13 | Complete |
| SHELL-02 | Phase 13 | Complete |
| SESS-01 | Phase 14 | Pending |
| SESS-02 | Phase 14 | Pending |
| SESS-03 | Phase 14 | Pending |
| AUDIT-01 | Phase 15 | Pending |
| AUDIT-02 | Phase 15 | Pending |
| ADMIN-01 | Phase 16 | Pending |
| ADMIN-02 | Phase 16 | Pending |

**Coverage:**
- v26.0 requirements: 15 total
- Mapped to phases: 15 (100%)
- Unmapped: 0

**Phase Distribution:**
- Phase 11 (Device Ownership Foundation): 3 requirements (OWN-01, OWN-02, OWN-03)
- Phase 12 (Device Access Authorization): 3 requirements (AUTHZ-01, AUTHZ-02, AUTHZ-03)
- Phase 13 (Shell Tool Isolation): 2 requirements (SHELL-01, SHELL-02)
- Phase 14 (Device Session Binding): 3 requirements (SESS-01, SESS-02, SESS-03)
- Phase 15 (Device Audit Log): 2 requirements (AUDIT-01, AUDIT-02)
- Phase 16 (Admin Override & Emergency Disconnect): 2 requirements (ADMIN-01, ADMIN-02)

---
*Requirements defined: 2026-04-24*
*Roadmap mapped: 2026-04-24*
