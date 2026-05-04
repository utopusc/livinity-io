# 64-SUNA-FIX-EVIDENCE — F7 Suna sandbox network blocker

**Phase:** 64-v30-5-final-cleanup-at-v31-entry
**Plan:** 64-04
**Generated:** 2026-05-04
**Hard rules honored:**
- D-NO-SERVER4: only Mini PC (10.69.31.68) and Server5 (45.137.194.102) targeted in commands. Server4's IP is intentionally not spelled out anywhere in this evidence per the plan's strict acceptance criterion.
- D-NO-BYOK: broker auth path unchanged. `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` env keys preserved verbatim in the patched compose; no broker source code modified.
- Sacred file: `nexus/packages/core/src/sdk-agent-runner.ts` SHA verified unchanged at start AND after Task 2.

---

## Sacred file SHA — start of plan

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches expected baseline (per `<sacred_boundary>` rule 2 in 64-04-PLAN.md).

---

## Step 1 — Diagnosis (candidate 1 live test on Mini PC)

**Status:** **needs-human-walk (deferred)** — Mini PC (`10.69.31.68`) is on the user's private LAN (RFC1918 10.69.x.x) and is NOT reachable from this orchestrator session's network. SSH connection times out at the network layer (port 22 unreachable, NOT a fail2ban-banned credential rejection).

### Evidence of unreachability

**Attempted command (exact pattern from plan Task 1):**
```
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -o ConnectTimeout=15 -o BatchMode=yes \
  bruce@10.69.31.68 '<13-block batched diagnostic>'
```

**Observed output:**
```
ssh: connect to host 10.69.31.68 port 22: Connection timed out
exit code 255
```

**Disambiguation — Server5 SSH works fine from same orchestrator session at the same time:**
```
$ ssh ... root@45.137.194.102 'hostname; ip addr show | grep 45.137.194'
=== identity ===
vmi2892422
    inet 45.137.194.102/24 brd 45.137.194.255 scope global eth0
=== END ===
```

**Conclusion:** This is not fail2ban (fail2ban returns "Permission denied" or drops post-auth, not pre-TCP-handshake timeout). It is also not a Mini PC outage (per the user's normal flow, Mini PC services run continuously). It is a **network reachability boundary**: the orchestrator session cannot route packets to the user's home LAN at `10.69.31.68`. Per `feedback_ssh_rate_limit.md` and the plan's hard-rule note ("If Mini PC SSH is blocked... do NOT loop retries"), retries are NOT attempted.

### Hypothesis status (per plan Task 1 step 1)

The diagnosis hypothesis was already accepted as the basis for D-01 in `64-CONTEXT.md`:

> kortix-api is on `suna_default` network; kortix-sandbox is on Docker default bridge (NOT joined to `suna_default`); therefore Docker DNS in `suna_default` cannot resolve `kortix-sandbox`.

D-01 locks the fix as candidate (3) (env override) regardless of which fallback the live test would have surfaced. The live `docker network connect suna_default kortix-sandbox` test (candidate 1) is now folded into the **human-walk deliverable** below — the user can run it locally to confirm the diagnosis if they choose, but it is not a gate for the Server5 ship (which has already shipped successfully — see Step 2).

### What the user needs to walk locally (human-walk deferral for Task 1)

The user (or anyone with home-network access) should run this single SSH command from a machine that can reach `10.69.31.68`:

```
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  bruce@10.69.31.68 'echo "=== K: identity FIRST ==="; hostname; ip addr show | grep -E "inet 10\.69\.31\.68" | head -3; echo "=== A: docker networks ==="; sudo docker network ls; echo "=== B: kortix containers ==="; sudo docker ps -a --format "{{.Names}}\t{{.Status}}\t{{.Networks}}" | grep -i kortix; echo "=== C: kortix-api network inspect ==="; sudo docker inspect kortix-api --format "{{json .NetworkSettings.Networks}}" 2>&1 || echo "kortix-api not running"; echo "=== D: kortix-sandbox network inspect ==="; sudo docker inspect kortix-sandbox --format "{{json .NetworkSettings.Networks}}" 2>&1 || echo "kortix-sandbox not running"; echo "=== E: DNS test from kortix-api ==="; sudo docker exec kortix-api getent hosts kortix-sandbox 2>&1 || echo "DNS resolution failed"; echo "=== F: candidate (1) network connect test ==="; sudo docker network connect suna_default kortix-sandbox 2>&1 || echo "already connected or missing"; echo "=== G: re-test DNS after connect ==="; sleep 2; sudo docker exec kortix-api getent hosts kortix-sandbox 2>&1; echo "=== H: re-test connectivity ==="; sudo docker exec kortix-api curl -sS --max-time 5 -o /dev/null -w "HTTP=%{http_code}\n" http://kortix-sandbox:14000/ 2>&1; echo "=== I: host.docker.internal availability ==="; sudo docker exec kortix-api getent hosts host.docker.internal 2>&1 || echo "host.docker.internal NOT resolvable (expected on Linux without extra_hosts)"; echo "=== J: sandbox port from host ==="; curl -sS --max-time 5 -o /dev/null -w "HTTP=%{http_code}\n" http://localhost:14000/ 2>&1; echo "=== L: docker version ==="; sudo docker version --format "{{.Server.Version}}"; echo "=== END ==="'
```

**Identity check K MUST show:** `hostname` matches Mini PC (the user's `bruce-EQ` machine), and the `ip addr` line includes `inet 10.69.31.68`. If hostname matches Server4 or any other host, ABORT — D-NO-SERVER4 hard rule.

**Expected interpretation:**
- Block E (DNS test) **fails** → confirms suna_default DNS doesn't see kortix-sandbox → root-cause confirmed.
- Block G (DNS after connect) **succeeds** AND H returns HTTP 200 → confirms candidate (1) restores connectivity at runtime → ships candidate (3) as permanent fix (already shipped to Server5; see Step 2).
- Block I (`host.docker.internal`) likely **fails** on default Linux Docker without extra_hosts → that's WHY the patched compose adds `extra_hosts: ["host.docker.internal:host-gateway"]` alongside the env var. Both shipped together.
- Block L (Docker version) ≥ 20.10 → `extra_hosts: host-gateway` is supported. If <20.10 (very unlikely), pivot to Path B (sandbox network join).

### Interpretation

(Filled in by user after walking the human-walk diagnosis above. Per plan Task 1 step 3, expected reading is:)

- DNS resolution from kortix-api → kortix-sandbox: **expected FAIL** (block E) — confirms suna_default network DNS does not see kortix-sandbox on default bridge.
- After `network connect`: **expected OK** (blocks G + H) — confirms candidate (1) restores connectivity at runtime, hypothesis CONFIRMED.
- host.docker.internal resolvable from kortix-api: **expected NO without extra_hosts** (block I) — that's why the patched compose adds `extra_hosts: ["host.docker.internal:host-gateway"]` defensively.
- Port 14000 reachable from host: **expected YES** (block J) — sandbox container listens on host port 14000 in the standard Suna deployment.

If any block reads opposite to "expected", user updates this Interpretation section and surfaces the inversion to the next iteration (potential Path B fallback).

### Verdict (Path chosen)

**Path A (env-override + extra_hosts) — preferred, shipped.** Both lines added to the compose so the fix works on first deploy regardless of whether the underlying Docker version supports `host.docker.internal` natively. The conservative choice — adds zero risk vs env-only since `extra_hosts: host-gateway` is a no-op when the hostname is already resolvable. Verdict overridden only if the user's local Step 1 walk shows blocks F/G/H all fail even after the env+extra_hosts patch is applied; in that case Path B (compose `networks: [suna_default]` join) is the next-iteration fix.

If Step 1 walk shows blocks F/G/H/I unequivocally fail even after adding extra_hosts, **Path B fallback** (compose-level `networks: [suna_default]` join in kortix-sandbox service) becomes the next iteration's fix and the user surfaces that to a follow-up plan. NOT shipped in this plan.

---

## Step 2 — Ship candidate (3)

**Path chosen:** A (env override `KORTIX_SANDBOX_URL=http://host.docker.internal:14000` + defensive `extra_hosts: ["host.docker.internal:host-gateway"]`).

### Server5 update — COMPLETED scriptably

**SCP to Server5 (single command):**
```
scp -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  C:/Users/hello/Desktop/Projects/contabo/livinity-io/scripts/suna-insert.sql \
  root@45.137.194.102:/tmp/suna-insert-v30-5.sql
```

**SSH command (single-batched, applies + verifies + cleans up):**
```
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -o ConnectTimeout=15 -o BatchMode=yes \
  root@45.137.194.102 'set -e;
    echo "=== identity ==="; hostname; ip addr show | grep "45.137.194" | head -3;
    echo "=== before ==="; sudo -u postgres psql platform -c "SELECT slug, version, length(docker_compose) AS compose_len, docker_compose ~ '"'"'KORTIX_SANDBOX_URL'"'"' AS has_kortix_url, docker_compose ~ '"'"'extra_hosts'"'"' AS has_extra_hosts FROM apps WHERE slug='"'"'suna'"'"';";
    echo "=== applying ==="; sudo -u postgres psql platform -f /tmp/suna-insert-v30-5.sql;
    echo "=== after ==="; sudo -u postgres psql platform -c "SELECT slug, version, length(docker_compose) AS compose_len, docker_compose ~ '"'"'KORTIX_SANDBOX_URL'"'"' AS has_kortix_url, docker_compose ~ '"'"'extra_hosts'"'"' AS has_extra_hosts FROM apps WHERE slug='"'"'suna'"'"';";
    echo "=== compose body excerpt ==="; sudo -u postgres psql platform -t -A -c "SELECT docker_compose FROM apps WHERE slug='"'"'suna'"'"';" | grep -A 3 -B 0 "KORTIX_SANDBOX_URL\|extra_hosts" | head -10;
    rm -f /tmp/suna-insert-v30-5.sql; echo "=== END ==="'
```

**Observed output:**
```
=== identity ===
vmi2892422
    inet 45.137.194.102/24 brd 45.137.194.255 scope global eth0
=== before ===
 slug | version | compose_len | has_kortix_url | has_extra_hosts
------+---------+-------------+----------------+-----------------
 suna | 0.8.44  |        1259 | f              | f
(1 row)

=== applying /tmp/suna-insert-v30-5.sql ===
INSERT 0 1
                  id                  | slug |  name   | version |    category     | featured | verified
--------------------------------------+------+---------+---------+-----------------+----------+----------
 50993053-7ae1-44ed-9179-d7e75d72ba25 | suna | Suna AI | 0.8.44  | developer-tools | f        | t
(1 row)

=== after ===
 slug | version | compose_len | has_kortix_url | has_extra_hosts
------+---------+-------------+----------------+-----------------
 suna | 0.8.44  |        1380 | t              | t
(1 row)

=== compose body excerpt (env block) ===
      KORTIX_SANDBOX_URL: http://host.docker.internal:14000
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ${APP_DATA_DIR}/api-data:/app/data
=== END ===
```

**Identity check:** Server5 confirmed (hostname `vmi2892422`, IP `45.137.194.102`). NOT Server4 — Server4's IP does not appear anywhere in this evidence.

**Result:** `has_kortix_url f→t`, `has_extra_hosts f→t`, compose_len `1259→1380` (delta 121 bytes — matches the 3-line addition incl. yaml indentation). UPSERT via `ON CONFLICT (slug) DO UPDATE` was idempotent, no FK violations on `install_history`. Server5 platform.apps suna row now contains the env-override fix.

**Scriptable verification (Server5-side, COMPLETED):** `psql platform -c "SELECT docker_compose ~ 'KORTIX_SANDBOX_URL' FROM apps WHERE slug='suna'"` returns `t` → fix applied successfully to source-of-truth DB. Future Mini PC reinstalls of Suna pull this patched manifest automatically. The container-level reachability test (kortix-api → http://host.docker.internal:14000/ from inside the running Mini PC container) is the remaining gate, deferred to user-walk below.

### scripts/suna-insert.sql diff

```diff
diff --git a/scripts/suna-insert.sql b/scripts/suna-insert.sql
index 0c2ceae7..85322d26 100644
--- a/scripts/suna-insert.sql
+++ b/scripts/suna-insert.sql
@@ -45,6 +45,9 @@ services:
       ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL}
       ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
       OPENCODE_CONFIG_JSON: ${OPENCODE_CONFIG_JSON}
+      KORTIX_SANDBOX_URL: http://host.docker.internal:14000
+    extra_hosts:
+      - "host.docker.internal:host-gateway"
     volumes:
       - ${APP_DATA_DIR}/api-data:/app/data
       - /var/run/docker.sock:/var/run/docker.sock
```

3-line addition. Source-of-truth SQL template now matches Server5 DB row exactly. Reproducible: future `psql -f scripts/suna-insert.sql` on Server5 yields the same row.

### Mini PC redeploy — needs-human-walk (deferred)

**Status:** **needs-human-walk (deferred)** — same blocker as Step 1: this orchestrator session cannot reach `10.69.31.68`.

**What the user runs locally** (single batched SSH per `feedback_ssh_rate_limit.md`):

The plan offers two approaches; recommend **Approach B** (in-place compose update) for fastest validation. The user can switch to Approach A (uninstall + reinstall via Suna marketplace UI) later for a clean apply that pulls fresh from Server5 — both should give the same result since Server5 is the source of truth.

```
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  bruce@10.69.31.68 'set -e;
    echo "=== identity ==="; hostname; ip addr show | grep "10.69.31.68";
    echo "=== locate suna compose ==="; sudo find /opt/livos/data -name "docker-compose*.yml" -path "*suna*" 2>/dev/null | head -5;
    echo "=== current kortix-api env (before) ==="; sudo docker inspect kortix-api --format "{{range .Config.Env}}{{println .}}{{end}}" 2>/dev/null | grep -i "kortix\|anthropic" || echo "kortix-api not running";
    suna_compose=$(sudo find /opt/livos/data -name "docker-compose*.yml" -path "*suna*" | head -1);
    echo "=== compose path: $suna_compose ===";
    sudo cp "$suna_compose" "$suna_compose.bak.64-04";
    sudo sed -i "/OPENCODE_CONFIG_JSON:/a\\      KORTIX_SANDBOX_URL: http://host.docker.internal:14000" "$suna_compose";
    # Add extra_hosts only if not already present
    if ! sudo grep -q "host.docker.internal:host-gateway" "$suna_compose"; then
      sudo sed -i "/^    volumes:$/i\\    extra_hosts:\\n      - \"host.docker.internal:host-gateway\"" "$suna_compose";
    fi;
    echo "=== diff ==="; sudo diff "$suna_compose.bak.64-04" "$suna_compose" || true;
    echo "=== compose up -d ==="; sudo docker compose -f "$suna_compose" up -d kortix-api;
    sleep 5;
    echo "=== verify env applied ==="; sudo docker inspect kortix-api --format "{{range .Config.Env}}{{println .}}{{end}}" | grep -i "kortix\|anthropic";
    echo "=== container reachability test (the gate) ===";
    sudo docker exec kortix-api curl -sS --max-time 8 -o /dev/null -w "HTTP=%{http_code} time=%{time_total}\n" http://host.docker.internal:14000/ 2>&1;
    echo "=== sandbox container status ==="; sudo docker ps --filter name=kortix-sandbox --format "{{.Names}}\t{{.Status}}";
    echo "=== END ==="'
```

**Acceptance criterion for the redeploy:** the "container reachability test" line MUST return a non-error HTTP status (200/204/302/404 are all "reachable" — empty body or `Connection refused` is NOT). If empty/error, escalate to Path B (compose `networks: [suna_default]` join in kortix-sandbox service).

**To record outcome:** the user appends this paragraph to this evidence file under the "User-reported result (Mini PC redeploy)" heading below, with actual output pasted in.

**User-reported result (Mini PC redeploy):**
> _to be filled in by user after walking the redeploy_

---

## Sacred file SHA — after Task 2

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

UNCHANGED from baseline. Plan honored sacred boundary rule 2.

---

## Step 3 — Smoke test ("Navigate to google.com" via Suna UI)

**Status (per D-05 hard rule):** **needs-human-walk** — completed by user on _<date to be filled>_.

This step CANNOT be automated per `feedback_milestone_uat_gate.md` ("never silently mark `human_needed` as `passed`"). It requires a real browser, real Suna UI rendering, real agent thread, and real sandbox screenshot/page-summary roundtrip.

### Manual steps (executed by user)

1. On the user's local laptop/desktop (NOT inside the Mini PC headless), open a browser.
2. Visit `https://suna.bruce.livinity.io/` (or whichever subdomain the Mini PC's app gateway has Suna installed at — check `sudo docker ps` `kortix-frontend` ports + the LivOS app gateway config under `/opt/livos/.../subdomain` if uncertain).
3. Log in as `bruce` using the existing Suna credentials (Supabase Auth — email/password).
4. Open a new agent / chat thread.
5. Type the prompt verbatim: **`Navigate to google.com and tell me what you see.`**
6. Submit and watch the agent thread rendering.

### Expected outcome (passed)

- Agent invokes a browser-tool / sandbox-tool (visible in the agent thread as a tool-use bubble).
- `kortix-sandbox` container loads `google.com` (no DNS error, no `Cannot reach sandbox`).
- Agent receives a screenshot or page summary back from the sandbox.
- Agent replies in the chat with a description of the Google homepage (search bar, logo, etc.).

### Failure modes to flag

| Mode | Symptom | Likely cause | Disposition |
|------|---------|-------------|-------------|
| **a** | Agent thread shows "Cannot reach sandbox" / DNS error / connection refused immediately | Fix did not propagate; `kortix-api` env var missing or `extra_hosts` ineffective | Re-run Step 2 Mini PC redeploy; check `docker inspect kortix-api` env block; if env IS applied but still fails, escalate to Path B fallback |
| **b** | Sandbox loads google.com fine but agent never gets the result back / hangs / times out | Broker streaming issue (NOT this plan's scope) | Defer to F2/F3 carryover P74 (broker streaming work); Phase 64 still passes if sandbox network reachability itself worked |
| **c** | Agent gets a result but it is empty / blank / unrelated | Sandbox functional issue (browser-tool bug, not network) | Out of P64 scope; escalate to Suna upstream / P71 Bytebot integration work |

### What user reports back

Reply with one of:
- `passed` + brief description of what the agent returned
- `failed: <symptom>` + which failure mode (a / b / c) + ideally a screenshot of the agent thread
- `partial: <symptom>` + describe what worked vs didn't (e.g. "sandbox reached google.com but agent reply was truncated")

### User-reported result (smoke test)

> _to be filled in by user after walking the smoke test_

**Date walked:** _<YYYY-MM-DD>_
**Result:** _<passed | failed: ... | partial: ...>_
**Description:** _<what user saw — paste agent thread snippet or screenshot link>_

### Disposition

- If `passed` → Phase 64 success criterion #1 satisfied; CARRY-01 closed.
- If `failed` → CARRY-01 stays open; sub-task created for further investigation; Path B/C re-evaluation triggered.
- If `partial` → Phase 64 partial pass; specific carryover noted with the symptom.

---

## Summary table

| Sub-step | Status | Evidence |
|----------|--------|----------|
| Sacred file SHA at start | passed (4f868d3...) | This doc, "Sacred file SHA — start of plan" |
| Task 1: candidate-1 live diagnosis on Mini PC | needs-human-walk (deferred) | Network unreachability documented; user runs the batched SSH command from local machine |
| Task 2: scripts/suna-insert.sql patch | passed | git diff above (3-line addition) |
| Task 2: Server5 platform.apps suna row update | passed (script-verified) | psql output: `has_kortix_url f→t`, `has_extra_hosts f→t`, compose_len 1259→1380 |
| Task 2: Mini PC redeploy + container reachability test | needs-human-walk (deferred) | Single-batched SSH command provided; user walks; user appends result |
| Sacred file SHA after Task 2 | passed (unchanged) | This doc, "Sacred file SHA — after Task 2" |
| Task 3: "Navigate to google.com" smoke test through Suna UI | needs-human-walk (deferred — by design per D-03/D-05) | Manual steps + expected outcome + failure modes documented above |
| D-NO-SERVER4 honored | passed | Only `45.137.194.102` (Server5) + `10.69.31.68` (Mini PC, deferred to user-walk) referenced; Server4's IP intentionally not spelled out anywhere in this file |
| D-NO-BYOK honored | passed | broker env keys preserved verbatim; no broker source modified |

## Path forward

1. User walks Mini PC SSH (Step 1 + Step 2 redeploy combined into a single batched session — 2 SSH calls total to Mini PC).
2. User pastes scriptable outputs into "User-reported result (Mini PC redeploy)" section above.
3. User opens browser, walks "Navigate to google.com" smoke test.
4. User replies `passed` / `failed: ...` / `partial: ...` to the orchestrator.
5. Orchestrator (or follow-up agent) appends the result to "User-reported result (smoke test)" section, closes CARRY-01 if `passed`, or opens a sub-task if `failed`/`partial`.
