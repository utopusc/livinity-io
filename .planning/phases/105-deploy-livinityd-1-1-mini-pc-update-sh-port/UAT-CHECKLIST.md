# Phase 105 — Live VPS UAT Checklist

**Plan:** 105-04 (autonomous: false — operator walk)
**Phase:** 105 deploy-livinityd 1:1 Mini-PC update.sh Port
**Gate:** GO/NO-GO — all 5 criteria must PASS for Phase 105 to ship

## Preparation

1. **Pick a target VPS:**
   - **Option A (Preferred):** Rent a fresh Ubuntu 24.04 VPS (~$5/mo Hetzner / DO / Contabo). Records assume this path.
   - **Option B:** Reuse cleaned `mainserver 154.53.56.75` per the cleanup commands in 105-04-PLAN.md `<interfaces>` section. Per RESEARCH §8 R8: verify state from previous 104-* runs is fully purged BEFORE running install.sh — failure to clean leaves stale `/opt/livos/` and `/opt/liv/` that masks deploy-livinityd's first-install path.

2. **Prepare CF credentials:**
   - DNS zone you control (your own domain — NOT livinity.io)
   - CF API token with `Zone:DNS:Edit` permission for that zone
   - Zone ID for that domain

3. **Pre-flight on VPS:** `lsb_release -a` returns Ubuntu 24.04. `which apt-get && which systemctl` both succeed. Root access via SSH.

## GO/NO-GO Criteria

### GO-NO-GO-1: Services active (4×)

After `bash scripts/install.sh --mode hybrid --domain <DOMAIN> --cf-token <TOKEN> --cf-zone-id <ZONE>` completes:

```bash
systemctl is-active livos liv-core liv-worker liv-memory
```

**PASS:** Returns `active` 4 times (one per line).
**FAIL:** Any output ≠ `active` (most commonly `failed` or `inactive`).

Evidence: save output to `UAT-EVIDENCE/uat-systemctl-active.txt` AND `systemctl status ... --no-pager -l > UAT-EVIDENCE/uat-systemctl-status.txt`.

### GO-NO-GO-2: HTTPS returns LivOS HTML

```bash
curl -sk -I https://<DOMAIN>     # HTTPS headers
curl -sk https://<DOMAIN> | head -50    # First 50 lines of HTML
```

**PASS:**
- `curl -sk -I` returns `HTTP/2 200` (or `HTTP/1.1 200`)
- Body contains `LivOS`, `livinityd`, OR a `<title>` tag referencing LivOS
- Body is NOT the Caddy default placeholder ("Caddy 2 default page" or similar)
- Body is NOT a 502 Bad Gateway HTML
- Body is NOT a vite/webpack build-error page

**FAIL:** Caddy placeholder, 502, build-error page, or `Connection refused`.

Evidence: save to `UAT-EVIDENCE/uat-curl-headers.txt` + `UAT-EVIDENCE/uat-curl-body-head.txt`.

### GO-NO-GO-3: Browser renders (green padlock + LivOS UI)

Open `https://<DOMAIN>` in a desktop browser (Chrome or Firefox or Safari).

**PASS:**
- Address bar shows `https://` + green padlock icon (no TLS warning)
- Page renders the LivOS login screen (avatar grid OR password prompt, NOT a blank page or text-only error)

**FAIL:** TLS warning ("Not Secure"), blank white page, browser error page, or backend error message.

Evidence: save screenshot as `UAT-EVIDENCE/uat-screenshot.png`. Screenshot MUST include both the URL bar (showing the padlock) AND the rendered page content.

### GO-NO-GO-4: Sacred SHA preserved

On the live VPS:

```bash
git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts
```

**PASS:** Exact output `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
**FAIL:** Any other SHA — STOP IMMEDIATELY and investigate. Sacred constraint violated.

Evidence: save output to `UAT-EVIDENCE/uat-sacred-sha.txt`. Diff against the expected SHA: `diff UAT-EVIDENCE/uat-sacred-sha.txt <(echo "f3538e1d811992b782a9bb057d1b7f0a0189f95f")` — empty diff = PASS.

### GO-NO-GO-5: update.sh re-run idempotency

After the initial install + GO-NO-GO-1-4 are PASS, run:

```bash
bash /opt/livos/update.sh 2>&1 | tee /root/uat-update-rerun.log
```

**PASS:**
- Script exits 0
- Final banner reads `LivOS updated successfully!`
- After update.sh completes, all 4 services still `active`: `systemctl is-active livos liv-core liv-worker liv-memory` → 4× active
- Browser-reload still shows the LivOS UI with green padlock

**FAIL:** Any exit code ≠ 0, any service drops out of `active`, browser shows error.

Evidence: copy `/root/uat-update-rerun.log` to `UAT-EVIDENCE/uat-update-rerun.log` + capture `UAT-EVIDENCE/uat-systemctl-active-post-update.txt` showing 4× active.

## Final disposition

**ALL 5 PASS:** Phase 105 ships. Update `.planning/STATE.md` + `.planning/ROADMAP.md` to mark Phase 105 as `[x]` complete. Orchestrator opens `/gsd-cleanup` or moves to next phase.

**ANY 1 FAIL:** Phase 105 partial-ship. Capture failure mode in `UAT-EVIDENCE/uat-failure-report.md` (commands run, exit codes, journalctl excerpts). Orchestrator opens Plan `105-05` as gap-closure per the failure category.

## Cleanup (post-UAT)

If running on a shared host (NOT a dedicated UAT VPS that you keep), run the cleanup block from 105-04-PLAN.md `<interfaces>` after evidence is captured. Revoke the CF API token used for this UAT through Cloudflare dashboard.

## Notes on caveats

- **ZeroTier link to Mini PC is unstable** (per memory `reference_zerotier_unstable.md`) — if running UAT against any host reached over ZT, always detach long operations with `nohup ... &` and tail the log instead of holding foreground SSH.
- **Mini PC is NOT a Phase 105 UAT target.** Mini PC already runs `update.sh` (NOT deploy-livinityd). Phase 105's goal is for fresh-VPS installs to match Mini PC's state — running deploy-livinityd ON Mini PC would corrupt the bruce-owned layout.
- **Server4 is NOT a UAT target.** Per HARD RULE in memory `feedback_full_autonomous_no_questions.md` — Server4 is off-limits.
- **Streaming subsystem caveat:** On a fresh VPS without a desktop user (UID≥1000), the ydotoold systemd unit is NOT written (105-02 G2 conditional logic). This is acceptable for the UAT — log it as a known caveat in the evidence directory. WebApp Launcher streaming requires a non-system user to be added post-install before first WebApp launch.
- **block-exotic-subdeps caveat:** 104-13's `block-exotic-subdeps=false` security tradeoff is preserved by Phase 105 (no change). Documented in `104-13-SUMMARY.md` deferred audit checklist.
