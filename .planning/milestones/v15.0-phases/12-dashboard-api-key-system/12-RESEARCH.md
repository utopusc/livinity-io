# Phase 12 Research: Dashboard & API Key System

## Domain
Enhance the dashboard with API key generation, server connection status, bandwidth monitoring, install command display, and subdomain URLs. This completes the user flow: register → generate API key → install LivOS → connect tunnel → see server online.

## Requirements
| ID | Requirement |
|----|-------------|
| DASH-01 | API key generation (display once, store bcrypt hash) |
| DASH-02 | Server connection status (online/offline via relay health) |
| DASH-03 | Bandwidth usage progress bar (monthly, color at 80/95/100%) |
| DASH-04 | Personalized install command with API key |
| DASH-05 | Subdomain URL with copy button |
| DASH-06 | Installed apps list with subdomain URLs |
| DASH-07 | Regenerate API key (invalidates old, disconnects tunnel) |

## Architecture

### API Key Flow (DASH-01, DASH-07)
1. User clicks "Generate API Key" on dashboard
2. Server generates `liv_k_{nanoid(20)}` full key
3. Store bcrypt hash + prefix (first 14 chars) in `api_keys` table
4. Return full key ONCE to user (display in modal with copy button)
5. Key is never shown again — user must regenerate if lost
6. Regenerate: delete old key, create new one, relay's Redis auth cache invalidated

### Connection Status (DASH-02)
- Dashboard polls relay health: `GET http://localhost:4000/internal/user-status?username={username}`
- Relay checks registry: if tunnel exists and ws OPEN → online, else offline
- Need to add `/internal/user-status` endpoint to relay (localhost only)
- Dashboard shows green dot when online, grey when offline

### Bandwidth (DASH-03)
- Query `bandwidth_usage` table for current month
- Also check Redis for real-time counters (not yet flushed)
- Progress bar: bytes_in + bytes_out / 50GB limit
- Colors: green < 80%, yellow 80-95%, red > 95%

### Install Command (DASH-04)
- Display after API key generation: `curl -sSL https://livinity.io/install.sh | sudo bash -s -- --api-key {key}`
- Copy button for easy pasting

### Subdomain URL (DASH-05)
- Show `https://{username}.livinity.io` with copy button
- Link opens in new tab

### Apps List (DASH-06)
- When server connected, query through relay tunnel for installed apps
- Or: relay tracks app list per user (simpler for v8.0 — skip for now, show placeholder)
- For v8.0: show "Connect your server to see installed apps" when offline

### API Routes Needed
1. `POST /api/dashboard/generate-key` — Generate API key (requires email verified)
2. `GET /api/dashboard/status` — Get connection status + bandwidth + key info
3. `POST /api/dashboard/regenerate-key` — Delete old key, generate new

## Implementation

### Plan 1: API Routes + Relay Endpoint + Dashboard UI
Single plan — this is all closely connected:
1. Add `/internal/user-status` to relay server.ts
2. Add dashboard API routes to Next.js
3. Rebuild dashboard page with all components
4. Deploy and test
