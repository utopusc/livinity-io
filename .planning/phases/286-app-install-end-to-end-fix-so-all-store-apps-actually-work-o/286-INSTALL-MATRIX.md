# Phase 286 — Representative Install Matrix + Ship Notes

**Purpose:** end-to-end proof that each app crash-class installs Up+healthy+reachable+persistent, uid-agnostically.
**Constraint:** walk on a CLEAN/test box or when the operator opts in — **NEVER on the operator's live box** (it self-heals only via the operator's own next Update).

## Section 1 — Representative install matrix

| App | Source | uid class exercised | Reconcile path |
|-----|--------|---------------------|----------------|
| `n8n` | catalog (named volume `n8n_data`, no `user:` → image `node`) | image-inspect → 1000 | named-volume chown 1000 |
| `activepieces` | catalog (postgres `user:1000` + named volumes) | `user:1000` directive on a root-owned empty named volume (THE crash class) | named-volume chown 1000 |
| `campfire` | catalog (redis `user:1000`) | `user:1000` directive | named-volume chown 1000 |
| a PUID app (e.g. `calibre-web` / any catalog app with `PUID/PGID`) | catalog | image starts root, reads PUID, self-heals | pre-chown 1000 harmless/aligned |
| a non-1000 app (catalog app with `user: 927` / `user: 5001`) | catalog | chown to the DECLARED uid, NOT 1000 | named/bind chown 927 |

### Per-app checks (run on the test box; substitute `<container>`/`<port>`/`<sub>`)

**1. Container Up + healthy (no EACCES):**
```bash
docker ps --filter name=<container> --format '{{.Names}}\t{{.Status}}'
docker inspect -f '{{.State.Status}}' <container>          # == running
docker inspect -f '{{.State.Health.Status}}' <container>   # == healthy (or "<no value>" if no healthcheck)
docker logs <container> --tail 40 2>&1 | grep -i eacces || echo "no EACCES ✓"
```

**2. Caddy block present:**
```bash
grep -A3 '<sub>' /etc/caddy/Caddyfile        # shows: reverse_proxy 127.0.0.1:<port>
```

**3. HTTP reachable (not connection-refused):**
```bash
curl -sI http://127.0.0.1:<port>/ | head -1   # 2xx/3xx
```

**4. Data persists across restart:**
```bash
docker restart <container>                     # or app stop+start from the UI
# then re-check: n8n workflow still present / postgres table still there / app data intact
docker inspect -f '{{.State.Status}}' <container>   # == running (no crash after restart)
```

## Section 2 — Backfill self-heal check (existing boxes)
After a livinityd restart (or Update), the 4 known crash-loopers must be Up and none restarting:
```bash
docker ps -a --filter status=restarting --format '{{.Names}}\t{{.Status}}'   # EXPECT: empty
for c in n8n_server_1 activepieces_db_1 campfire_redis_1 syncthing_server_1; do
  docker inspect -f '{{.Name}} {{.State.Status}}' "$c" 2>/dev/null
done   # EXPECT: all "running"
# Confirm the boot backfill ran:
journalctl -u livos --no-pager | grep '\[reconcile\] boot backfill done'
```

## Section 3 — uid-agnostic proof
Walk the matrix on a box whose desktop user is **uid 1001** (the live-box class: `everything`=1001). The reconciler chowns each volume to the service's DECLARED uid (or image default, or 1000) via a root alpine container through the `docker` group — so it works regardless of the host uid (1000 or 1001) or whether livinityd is root. Do this on a clean/test box, never the operator's live box.

## Section 4 — Ship notes
- **Source-only change.** No plan modifies the operator's live box. New modules: `reconcile-volume-ownership.ts`, `health-poll.ts`, `builtin-precedence.ts`; plus reordered/retried calls in `app.ts` / `apps.ts` / `app-environment.ts` / `app-script`.
- **Ship = version bump + release tag → `bash /opt/livos/update.sh`** (rsyncs source, restarts livinityd via **tsx — no compile step**).
- **Existing boxes self-heal automatically:** on the next livinityd start after Update, the boot backfill (286-01) reconciles ALL installed apps → the operator's 4 crash-loopers recover without any manual box action.
- **tsc baseline 305 preserved**; full unit suite green (reconcile 19 / health 9 / builtin-precedence 6 = 34).
- **Rollback:** additive change — reverting the phase commit restores prior behavior (new modules unused, old call order restored).
- **Caddy compatibility:** reconciler touches only data-volume ownership; networking/Caddy/forward_auth untouched. 286-04 additionally hardens Caddy registration (pRetry + surfaced failure) + port-match verify + network-create error surfacing.

## Section 5 — Checkpoint (operator action)
The end-to-end walk requires real container installs (Docker), which cannot run in the dev environment and must not run on the operator's live box. Operator (or a clean/test box) ships the tag, installs the 5 representative apps, runs the 4 checks each, and reports per-app pass/fail — OR replies "defer live-walk" to mark the phase **code-complete pending opt-in box walk**.
