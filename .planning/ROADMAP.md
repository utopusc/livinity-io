# Roadmap: LivOS v7.0 — Multi-User Support

## Overview

Transform LivOS from single-user to multi-user. Five phases: database foundation first, then login UI, then per-user data isolation, then Docker app routing, finally app sharing. Each phase builds on the previous. Existing single-user installations auto-migrate.

## Phases

- [ ] **Phase 1: Database & Auth Foundation** — PostgreSQL, users table, JWT overhaul, session management, tRPC context
- [ ] **Phase 2: Login Screen & User Management** — Avatar-based login page, invite system, Settings > Users section
- [ ] **Phase 3: File & AI Isolation** — Per-user directories, path security, Redis namespacing, AI data scoping
- [ ] **Phase 4: App Gateway & Docker Isolation** — Wildcard Caddy, dynamic proxy, per-user containers, compose templating
- [ ] **Phase 5: App Sharing** — Right-click share, user picker dialog, auto-access, shared app routing

## Phase Details

### Phase 1: Database & Auth Foundation
**Goal**: PostgreSQL running, users table populated, JWT includes userId, auth works for existing single user
**Requirements**: DB-01, DB-02, DB-03, DB-04, DB-05, DB-06, DB-07, DB-08, DB-09, DB-10
**Success Criteria**:
  1. PostgreSQL Docker container running and accessible from livinityd
  2. Existing YAML user auto-migrated to admin in users table
  3. JWT tokens contain {userId, role} and old {loggedIn: true} tokens still work during grace period
  4. tRPC context has currentUser on all private procedures
  5. Domain-wide cookie enables SSO across subdomains

### Phase 2: Login Screen & User Management
**Goal**: Beautiful login screen with user avatars, admin can invite users, manage users from Settings
**Requirements**: LOGIN-01, LOGIN-02, LOGIN-03, LOGIN-04, LOGIN-05, USER-01, USER-02, USER-03, USER-04, USER-05
**Success Criteria**:
  1. Visiting livinity.cloud when logged out shows login screen with user avatars
  2. Clicking avatar + entering password logs in and redirects to desktop
  3. Admin can create invite link from Settings > Users
  4. Invited user can register via invite link
  5. Admin can see all users, change roles, disable accounts

### Phase 3: File & AI Isolation
**Goal**: Each user has isolated files and AI conversations, no cross-user data leakage
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04, AI-01, AI-02, AI-03, AI-04
**Success Criteria**:
  1. Each user sees only their own files in the File Manager
  2. Path traversal attempts blocked (../../../etc/passwd returns 403)
  3. Each user sees only their own AI conversations
  4. AI agent tools (file read/write) scoped to current user's directory

### Phase 4: App Gateway & Docker Isolation
**Goal**: Same subdomain serves different containers per user, Caddy uses wildcard cert
**Requirements**: GW-01, GW-02, GW-03, GW-04, GW-05, DOCKER-01, DOCKER-02, DOCKER-03, DOCKER-04, DOCKER-05
**Success Criteria**:
  1. Caddy uses single wildcard block for all subdomains
  2. n8n.livinity.cloud routes admin to admin's container, member to member's container
  3. Unauthenticated subdomain access redirects to login
  4. Each user's app has its own Docker container, volume, and port
  5. Shared apps (Jellyfin) serve all authorized users from single container

### Phase 5: App Sharing
**Goal**: Admin can share apps with other users via right-click context menu
**Requirements**: SHARE-01, SHARE-02, SHARE-03, SHARE-04, SHARE-05
**Success Criteria**:
  1. Right-clicking app icon shows context menu with "Share" option
  2. Share dialog shows user list with checkboxes
  3. Shared app appears in target user's Apps section immediately
  4. Admin can revoke shared access from Settings > Users
  5. Accessing shared isolated app routes to sharer's container

## Progress

| Phase | Status | Requirements |
|-------|--------|-------------|
| 1. Database & Auth | Planned | DB-01..DB-10 |
| 2. Login & Users | Planned | LOGIN-01..05, USER-01..05 |
| 3. Files & AI | Planned | FILE-01..04, AI-01..04 |
| 4. Gateway & Docker | Planned | GW-01..05, DOCKER-01..05 |
| 5. App Sharing | Planned | SHARE-01..05 |
