# Requirements: v7.0 — Multi-User Support

**Milestone:** v7.0
**Created:** 2026-03-13
**Status:** Active
**Core Value:** Multiple users share one server with isolated apps, files, and AI — admin retains full control.

---

## v1 Requirements

### Database & Auth (DB)

- [ ] **DB-01**: PostgreSQL running as Docker container on production server
- [ ] **DB-02**: Users table with id (UUID), username, display_name, hashed_password, role (admin/member/guest), created_at
- [ ] **DB-03**: Sessions table with token_hash, user_id, device_name, ip_address, expires_at, revoked
- [ ] **DB-04**: User preferences table (key-value per user)
- [ ] **DB-05**: System settings table (global, admin-only)
- [ ] **DB-06**: YAML FileStore data auto-migrated to PostgreSQL on first boot (existing user becomes admin)
- [ ] **DB-07**: JWT payload extended to {userId, role, sessionId} with backward-compatible dual-format verification
- [ ] **DB-08**: Domain-wide SSO cookie (.livinity.cloud) set on login, shared across all subdomains
- [ ] **DB-09**: tRPC context extended with currentUser {id, username, role}
- [ ] **DB-10**: requireRole middleware for admin-only procedures

### Login & Registration (LOGIN)

- [ ] **LOGIN-01**: Login screen shows circular user avatars with names below
- [ ] **LOGIN-02**: User clicks avatar, enters password to sign in
- [ ] **LOGIN-03**: Admin can invite new users (generates invite link with 48h expiry)
- [ ] **LOGIN-04**: Invited user sets username + password via invite link
- [ ] **LOGIN-05**: Login screen accessible on both main domain and app subdomains

### User Management (USER)

- [ ] **USER-01**: Settings > Users section showing all users with roles
- [ ] **USER-02**: Admin can change user roles (member/guest)
- [ ] **USER-03**: Admin can disable/delete users
- [ ] **USER-04**: Admin can view active sessions per user
- [ ] **USER-05**: User can change own password and display name

### File Isolation (FILE)

- [ ] **FILE-01**: Per-user directory structure at /opt/livos/data/users/{username}/files/
- [ ] **FILE-02**: virtualToSystemPath resolves to current user's directory
- [ ] **FILE-03**: Path traversal prevention (canonicalize + startsWith check)
- [ ] **FILE-04**: Existing files migrated to admin user's directory

### AI Isolation (AI)

- [ ] **AI-01**: Redis keys scoped per user (nexus:u:{userId}:session:, nexus:u:{userId}:history:)
- [ ] **AI-02**: Each user has own AI conversations (web UI shows only own chats)
- [ ] **AI-03**: Shared Kimi API auth (system-level), per-user data isolation
- [ ] **AI-04**: Agent context includes userId for tool scoping (file tools access own files only)

### App Gateway (GW)

- [ ] **GW-01**: Caddy wildcard config (*.livinity.cloud → LivOS)
- [ ] **GW-02**: App Gateway Express middleware resolves subdomain + checks session
- [ ] **GW-03**: Same subdomain routes to different containers based on authenticated user
- [ ] **GW-04**: Unauthenticated subdomain access shows login page
- [ ] **GW-05**: http-proxy-middleware for dynamic upstream routing

### Docker Isolation (DOCKER)

- [ ] **DOCKER-01**: user_app_instances table (user_id, app_id, container_name, port, volume_path, status)
- [ ] **DOCKER-02**: Docker compose templating per user (unique container name, port, volume, network)
- [ ] **DOCKER-03**: Auto port allocation for per-user containers (10000+ range)
- [ ] **DOCKER-04**: App manifest multiUserMode field (shared/isolated)
- [ ] **DOCKER-05**: Shared apps use single container with access control via user_app_access table

### App Sharing (SHARE)

- [ ] **SHARE-01**: Right-click on app shows context menu with "Share" option
- [ ] **SHARE-02**: Share dialog shows list of users to share with (checkboxes)
- [ ] **SHARE-03**: Shared app auto-appears in target user's Apps section
- [ ] **SHARE-04**: Admin can revoke shared access from user management
- [ ] **SHARE-05**: Shared isolated apps grant access to sharer's container instance

---

## Future Requirements (Deferred)

- Per-user storage quotas with disk tracking
- Docker cgroup memory limits per user
- Passkey/WebAuthn authentication
- Guest link sharing with time-limited tokens
- Per-user AI token usage quotas
- Audit logging for admin cross-user access
- Per-user Docker network isolation with iptables rules

## Out of Scope

| Feature | Reason |
|---------|--------|
| Open self-registration | Security risk for home servers; invite-only |
| Per-user billing | Free open source, no payment system |
| Dark theme | Light theme only (existing constraint) |
| Mobile app | Web-first approach |
| Self-hosted LLM per user | Kimi only, shared auth |
| Active Directory/LDAP | Home server, not enterprise |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01..DB-10 | Phase 1 | Pending |
| LOGIN-01..LOGIN-05 | Phase 2 | Pending |
| USER-01..USER-05 | Phase 2 | Pending |
| FILE-01..FILE-04 | Phase 3 | Pending |
| AI-01..AI-04 | Phase 3 | Pending |
| GW-01..GW-05 | Phase 4 | Pending |
| DOCKER-01..DOCKER-05 | Phase 4 | Pending |
| SHARE-01..SHARE-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*39 requirements across 8 categories, mapped to 5 phases*
