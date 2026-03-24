---
phase: 09-relay-server-tunnel-client
plan: 06
status: complete
---

# 09-06 Summary: Server5 Deploy & E2E Verification

## What was done
- PostgreSQL 16 installed on Server5 (45.137.194.102)
- Platform database and user created (password: LivPlatform2024)
- Schema applied (users, api_keys, bandwidth_usage, tunnel_connections)
- tsx installed globally
- Relay deployed to /opt/platform/relay/ via scp
- PM2 running relay on port 4000 with auto-restart
- Test user "testuser" with API key "liv_k_testkey12345678" created
- Health endpoint verified: returns status OK, 0 connections

## Server5 Infrastructure State
- Node.js: v22.22.0
- PostgreSQL: 16.13
- Redis: 7.0.15 (password: 680542add448464d754a6303418580ecf678ab8be15e2625)
- PM2: installed, relay process saved
- Caddy: NOT installed (Phase 10 will handle)
- tsx: v4.21.0

## Database Credentials
- PostgreSQL: user=platform, password=LivPlatform2024, db=platform, host=127.0.0.1
- Redis: password=680542add448464d754a6303418580ecf678ab8be15e2625

## Deployment Notes
- ecosystem.config.cjs uses `--import tsx` for TypeScript execution
- DATABASE_URL uses 127.0.0.1 (not localhost) to avoid IPv6 resolution issues
- When updating relay code: scp files → pm2 delete relay → pm2 start ecosystem.config.cjs
