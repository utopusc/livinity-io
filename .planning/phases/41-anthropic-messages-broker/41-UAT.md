# Phase 41: Anthropic Messages Broker — Manual UAT

**Run after deploying Phase 41 (`bash /opt/livos/update.sh`) on the Mini PC.**

## Prerequisites

- Mini PC has Phase 39 + 40 + 41 commits deployed via `bash /opt/livos/update.sh`.
- Multi-user mode enabled (`livos:system:multi_user` = `'true'`).
- At least 2 users created (admin + 1 non-admin member).
- Each user has completed `claude login` per Phase 40 UAT (their `.credentials.json` exists at `/opt/livos/data/users/<id>/.claude/.credentials.json`).
- A test Docker container running on the Mini PC bridge network (e.g., `docker run -it --rm alpine sh`).
- Verify Docker bridge subnet: `docker network inspect bridge | grep Subnet` → expected `172.17.0.0/16`. If different, the broker IP guard must be expanded (currently allowlists 172.17.0.0/16 only).

## Section A: Sync POST end-to-end (FR-BROKER-A-01, FR-BROKER-A-03)

1. SSH to Mini PC: `ssh -i .../minipc bruce@10.69.31.68`
2. Get the admin user's id:
   ```
   sudo -u livos psql livos -c "SELECT id FROM users WHERE role = 'admin' LIMIT 1;"
   ```
   Note as `<ADMIN_ID>`.
3. From host loopback shell, sync request:
   ```bash
   curl -s -X POST http://127.0.0.1:8080/u/<ADMIN_ID>/v1/messages \
     -H 'content-type: application/json' \
     -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Reply with the single word: ok"}]}' | jq .
   ```
4. Expected: JSON with `type: "message"`, `role: "assistant"`, `content: [{type: "text", text: "ok"}]` (or close), `stop_reason: "end_turn"`, `usage: {input_tokens: N, output_tokens: N}`. PASS if shape matches.
5. PASS / FAIL: ___

## Section B: SSE streaming end-to-end (FR-BROKER-A-02)

6. Same shell, streaming request:
   ```bash
   curl -N -s -X POST http://127.0.0.1:8080/u/<ADMIN_ID>/v1/messages \
     -H 'content-type: application/json' \
     -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Count to 5 in words"}],"stream":true}'
   ```
7. Expected: stream of SSE chunks. First line: `event: message_start`. Then `content_block_start`, `ping`, multiple `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`. PASS if order matches Anthropic spec exactly.
8. PASS / FAIL: ___

## Section C: Per-user HOME isolation — admin (FR-BROKER-A-04)

9. While step 6 is running, in another SSH terminal:
   ```bash
   ps -ef | grep '[c]laude' | head -5
   ```
10. Find the spawned `claude` CLI subprocess PID, then:
    ```bash
    cat /proc/<PID>/environ | tr '\0' '\n' | grep '^HOME='
    ```
11. Expected: `HOME=/opt/livos/data/users/<ADMIN_ID>/.claude` — NOT `/root` or `/home/bruce`. PASS if HOME points to the calling user's per-user dir.
12. PASS / FAIL: ___

## Section D: Cross-user isolation (FR-BROKER-A-04)

13. Get a non-admin user id similarly:
    ```
    sudo -u livos psql livos -c "SELECT id FROM users WHERE role != 'admin' LIMIT 1;"
    ```
    Note as `<USER2_ID>`.
14. From host shell:
    ```bash
    curl -s -X POST http://127.0.0.1:8080/u/<USER2_ID>/v1/messages \
      -H 'content-type: application/json' \
      -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"hi"}]}'
    ```
15. While running, capture HOME of spawned `claude` PID as in step 10. Expected: `HOME=/opt/livos/data/users/<USER2_ID>/.claude`. NOT the admin's dir. NOT root.
16. PASS / FAIL: ___

## Section E: Container-network reachability (FR-BROKER-A-01 from container side)

17. Run a test container on host network bridge:
    ```bash
    docker run --rm --add-host=livinity-broker:host-gateway alpine sh -c \
      "apk add --no-cache curl >/dev/null && curl -s -X POST http://livinity-broker:8080/u/<ADMIN_ID>/v1/messages -H 'content-type: application/json' -d '{\"model\":\"claude-sonnet-4-6\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}'"
    ```
18. Expected: Anthropic Messages JSON returned. NOTE: Phase 43 will inject the `--add-host` automatically into per-user marketplace compose files; in Phase 41 we're manually testing the contract.
19. PASS / FAIL: ___

## Section F: IP guard rejects external traffic

20. From a non-loopback / non-Docker-bridge host (e.g., the user's laptop):
    ```bash
    curl -s -X POST http://<MINI_PC_PUBLIC>:8080/u/<ADMIN_ID>/v1/messages -d '{}' -i | head -1
    ```
21. Expected: `HTTP/1.1 401 Unauthorized` body `{"type":"error","error":{"type":"authentication_error",...}}`. NOTE: this only succeeds if port 8080 is reachable externally (typically NOT in production; if accidentally exposed, the IP guard catches it).
22. PASS / FAIL or N/A (if port not externally exposed): ___

## Section G: AI Chat carry-forward (Phase 40's deferred gap, now closed)

23. Open `https://<user2-subdomain>.livinity.io/` (or local equivalent) as User 2 — log in with User 2's credentials.
24. Trigger any AI Chat message (any prompt, e.g., "hello").
25. While running, capture HOME of `claude` PID (step 10 method).
26. Expected: `HOME=/opt/livos/data/users/<USER2_ID>/.claude`. This is what closes Phase 40's "Honest Deferred Work" item #1.
27. PASS / FAIL: ___

## Section H: Single-user mode regression

28. Disable multi-user mode:
    ```bash
    redis-cli SET livos:system:multi_user false
    sudo systemctl restart livos
    ```
29. As admin, trigger any AI Chat message in the LivOS web UI.
30. Capture HOME of `claude` PID. Expected: `HOME=/root` (or `/home/bruce` depending on livinityd UID) — NOT a per-user dir, since multi-user mode is off.
31. Re-enable multi-user mode for further testing:
    ```bash
    redis-cli SET livos:system:multi_user true
    sudo systemctl restart livos
    ```
32. PASS / FAIL: ___

## Section I: Sacred file integrity

33. On Mini PC, verify the sacred file SHA matches the Phase 40 baseline:
    ```bash
    cd /opt/livos && git hash-object packages/core/src/sdk-agent-runner.ts
    ```
    Expected: `623a65b9a50a89887d36f770dcd015b691793a7f`
    NOTE: `/opt/livos` is rsync-deployed (not a git checkout); use the source repo for the canonical hash check or a sha256 comparison against a known good copy.
34. PASS / FAIL: ___

## Result

All sections PASS → Phase 41 deployed cleanly.
Any FAIL → file issue + STATE.md note. Re-deploy or roll back as appropriate (`livos-rollback.sh`).

## Notes / Honest Deferrals (NOT regressions)

- **OpenAI-compat broker endpoint** (`POST /v1/chat/completions`) is **Phase 42** scope, not Phase 41. Skip any UAT step asking for OpenAI-format requests.
- **Marketplace `requires_ai_provider` manifest auto-injection** is **Phase 43** scope. In Phase 41, the `--add-host=livinity-broker:host-gateway` must be added manually for container tests (Section E step 17).
- **Per-user usage dashboard** is **Phase 44** scope. Token counts in broker responses come from the SdkAgentRunner result, but no persistent dashboard UI exists yet.
- **POSIX-enforced cross-user isolation** remains Phase 40's deferred item — synthetic dirs (livinityd-application-layer enforced) are still the model.
