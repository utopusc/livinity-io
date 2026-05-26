# Phase 212 / T5 — Heartbeat persistence audit

**Audited:** 2026-05-26
**Verdict:** Wiring gap. NOT just `CARRY-V41-RELAY-DOWN`. Even if Server5 relay were running today, `tunnel_connections` would still be empty.

## Method

Grep across `platform/`, `liv/`, `livos/` for any code that writes to the `tunnel_connections` table.

```
$ grep -rn "INSERT INTO tunnel_connections\|UPDATE tunnel_connections" platform/ liv/ livos/
(no matches)

$ grep -rn "tunnel_connections" platform/ liv/ livos/
platform/relay/src/schema.sql:48   (CREATE TABLE definition)
platform/web/src/app/api/admin/tunnels/route.ts          (READ, P212-T3)
platform/web/src/app/api/admin/metrics/summary/route.ts  (READ, P212-T3)
(no other matches)
```

## Findings

### F1 — Table exists, no writer code

`platform/relay/src/schema.sql:48` defines the `tunnel_connections` table. No source file in any package writes to it (verified across `platform/`, `liv/`, `livos/`). The two reads were added by Phase 212-T3 today.

### F2 — `tunnel-registry.ts` is in-memory only

The relay's tunnel-registry tracks `connectedAt` as a JavaScript `number` (epoch ms) on the `TunnelConnection` class (`platform/relay/src/tunnel-registry.ts:42`). It is never persisted. There is no `pg.Pool` / `pg.Client` import anywhere in `platform/relay/src/`. The registry exposes `register()` / `unregister()` / `getByUserId()` for in-memory lookups only.

### F3 — Relay DOWN is a real blocker but only the symptom-2

Per STATE.md `CARRY-V41-RELAY-DOWN`, the Server5 PM2 `relay` process has been STOPPED since 2026-05-18 (FK violations on `bandwidth_usage_user_id_fkey` exhausted PM2 restart budget). But the underlying schema gap (F1 + F2) means restarting the relay would not produce `tunnel_connections` rows. Both problems must be fixed.

### F4 — ADM-13 (`tunnel_connections count >0 when ≥1 Mini PC online`) cannot pass today

The P212 success criterion ADM-13 is impossible to satisfy with current code paths regardless of relay status. The query in `/api/admin/metrics/summary/route.ts` returns `tunnels_online: 0` always.

## Root cause

**Wiring gap in `platform/relay/src/tunnel-registry.ts`.** The relay was designed with `tunnel_connections` as a forward-compat schema slot, but the persistence hooks (INSERT on connect, UPDATE on disconnect) were never implemented. v37 cutover (Vercel + Supabase) moved the database but did not also wire the relay's persistence path.

## Remediation plan

### Option A — Wire persistence in relay (preferred, but out of P212 scope)

~50–80 LOC across `tunnel-registry.ts`:

1. Add `pg.Pool` import + connection (Supabase `DATABASE_URL` already provisioned for the relay box; verify via `printenv DATABASE_URL` on Server5 once restarted).
2. In `TunnelConnection` constructor, INSERT a row:
   ```sql
   INSERT INTO tunnel_connections
     (user_id, session_id, status, connected_at, client_version, client_ip)
   VALUES ($1, $2, 'connected', NOW(), $3, $4)
   ON CONFLICT (session_id) DO NOTHING;
   ```
   (Need to add `UNIQUE(session_id)` constraint OR check with `WHERE NOT EXISTS` — current schema has no unique on session_id; verify via `\d tunnel_connections` once relay is up.)
3. In `destroy()` or wherever `onClose` fires, UPDATE:
   ```sql
   UPDATE tunnel_connections
     SET status='disconnected', disconnected_at=NOW()
   WHERE session_id=$1 AND status='connected';
   ```
4. Wrap both in `try/catch` — persistence errors MUST NOT tear down the tunnel.

### Option B — Push from Mini PC via existing client → relay → DB indirection

Higher latency, more moving parts, and the relay is the obvious right home. Reject.

### Option C — Polling-style from Supabase via the existing `users.last_seen_at` (P212-T1)

Re-purpose `users.last_seen_at` to also signal "tunnel online within last 60s". Decouples from the relay entirely. Loses per-session granularity (no `session_id`, `client_version`, `client_ip`). Acceptable as a stop-gap for the admin dashboard summary card; not acceptable for the "tunnels" detail table.

## Decision (P212 boundary)

**Scope-bound action:** Document the gap (this file). Do NOT patch `tunnel-registry.ts` in P212 because:
- Patch exceeds the 30-LOC guidance from the T5 plan boundary.
- Live-verify requires the relay running (currently DOWN — `CARRY-V41-RELAY-DOWN`).
- Forward dependency: P217's E2E UAT can't validate ADM-13 either way until both relay restart + persistence wire-up land together.

**Carry-forward (filed):**
- **CARRY-P212-TUNNEL-PERSIST** — Wire INSERT/UPDATE on tunnel lifecycle in `platform/relay/src/tunnel-registry.ts`. ~50–80 LOC. Blocker chain: `CARRY-V41-RELAY-DOWN` must be cleared first (need relay running to verify the writes land).
- **CARRY-P212-TUNNEL-SESSION-UNIQUE** — Decide whether `tunnel_connections` needs `UNIQUE(session_id)` constraint. If yes, ship as part of CARRY-P212-TUNNEL-PERSIST migration.

## ADM-13 status

🔴 **NOT-YET-VERIFIABLE.** Re-test in P217 after both carries above land + relay is back online.
