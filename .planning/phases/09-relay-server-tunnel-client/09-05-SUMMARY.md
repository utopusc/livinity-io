---
phase: 09-relay-server-tunnel-client
plan: 05
status: complete
---

# 09-05 Summary: Bandwidth Tracking & Quota Enforcement

## What was built
- Per-user bandwidth tracking via Redis INCRBY (atomic, lock-free)
- Quota enforcement: 429 Too Many Requests when 50GB/month exceeded
- Periodic flush from Redis to PostgreSQL (every 60s)
- Bidirectional tracking on both request send and response receive

## Files created/modified
- `platform/relay/src/bandwidth.ts` — trackBandwidth, checkQuota, startBandwidthFlush, stopBandwidthFlush
- `platform/relay/src/server.ts` — Quota check before proxying, 429 response with Retry-After
- `platform/relay/src/request-proxy.ts` — Fire-and-forget bandwidth tracking on send/receive
- `platform/relay/src/index.ts` — Bandwidth flush start/stop lifecycle

## Key decisions
- Redis INCRBY for atomic counting, MGET for efficient quota check
- DECRBY after flush (not DEL) to handle concurrent writes safely
- Fire-and-forget tracking (don't block request pipeline)
- 90-day TTL on Redis bandwidth keys to prevent unbounded growth
- Module-level setRedis() pattern to provide Redis to request-proxy without changing function signatures
