# Phase 11 Research: Platform Auth & Registration

## Domain
Build the livinity.io web application with user registration, email verification, login, sessions, and password reset. This is a Next.js app running on Server5 alongside the relay.

## Requirements
| ID | Requirement |
|----|-------------|
| AUTH-01 | Register with email + password |
| AUTH-02 | Email verification via Resend |
| AUTH-03 | Unverified users cannot generate API keys |
| AUTH-04 | Login with session (30d httpOnly secure cookie) |
| AUTH-05 | Password reset via email link |
| AUTH-06 | Username validation (3-30, alphanumeric + hyphens, no reserved words) |

## Tech Stack Decision

### Next.js App Router
- **Location**: `platform/web/` (alongside `platform/relay/`)
- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS + shadcn/ui (consistent with LivOS)
- **Auth**: Custom (bcrypt + sessions in PostgreSQL — no external auth libraries needed for this scope)
- **Email**: Resend SDK (`resend` npm package)
- **Database**: Same PostgreSQL `platform` DB, new tables

### Why custom auth (not NextAuth/Lucia)
- Simple email/password flow only (no OAuth providers)
- Full control over session table schema
- Reuses existing platform PostgreSQL with bcrypt (same pattern as relay API keys)
- Fewer dependencies, easier to understand

## Database Schema Additions

The relay's `platform` DB already has `users` and `api_keys` tables. Need to add:

```sql
-- Add columns to existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
```

## Authentication Flow

### Registration (AUTH-01, AUTH-02, AUTH-06)
1. User submits: email, password, username
2. Server validates: username rules, email format, password min 8 chars
3. Hash password with bcrypt
4. Insert into users table (email_verified = false)
5. Generate verification token (nanoid), store with 24h expiry
6. Send verification email via Resend
7. Return success

### Email Verification (AUTH-02, AUTH-03)
1. User clicks link: `/verify?token=xxx`
2. Server finds user by token, checks expiry
3. Set email_verified = true, clear token
4. Redirect to login

### Login (AUTH-04)
1. User submits: email + password
2. Server finds user by email, bcrypt.compare
3. If verified: create session (nanoid token, 30d expiry)
4. Set httpOnly secure cookie: `session=token; path=/; max-age=2592000; secure; httpOnly; sameSite=lax`
5. Return user info

### Password Reset (AUTH-05)
1. User submits email on `/forgot-password`
2. Generate reset token (nanoid), store with 1h expiry
3. Send reset email via Resend
4. User clicks link → `/reset-password?token=xxx`
5. User submits new password
6. Verify token, hash new password, update, clear token
7. Redirect to login

### Reserved Usernames (AUTH-06)
```
admin, www, api, app, relay, status, help, support, billing,
dashboard, login, register, signup, signin, auth, account,
settings, profile, mail, ftp, ssh, root, test, demo
```

## Implementation Plan

### Plan 1: Next.js Project Scaffold + Database Schema
- Create `platform/web/` with Next.js 15, Tailwind, shadcn/ui
- Add auth schema migration to relay's schema.sql
- Configure for Server5 deployment

### Plan 2: Auth API Routes + Session Management
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me (session check)
- POST /api/auth/verify-email
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- Session middleware

### Plan 3: Auth UI Pages
- /register page
- /login page
- /verify page
- /forgot-password page
- /reset-password page
- Redirect logic (authenticated → dashboard, unauthenticated → login)

### Plan 4: Deploy to Server5
- Build Next.js
- PM2 config
- Caddy routing (livinity.io → Next.js, *.livinity.io → relay)
- Resend API key setup
- E2E test

## Key Decisions
- **Resend**: Need API key (user must provide or we use a test key)
- **Cookie domain**: `.livinity.io` (shared across subdomains)
- **Session storage**: PostgreSQL (not Redis — sessions are long-lived, need persistence)
- **Caddy routing**: bare `livinity.io` → Next.js :3000, `*.livinity.io` → relay :4000
