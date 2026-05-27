# Phase 222 — Spike: AionUi feasibility on Mini PC

**Status:** READY
**Mode:** RESEARCH SPIKE — no production code commits, only docs + Mini PC scratch container
**Effort:** 4–6h
**Gate:** Phase 223+ start ONLY IF this spike returns PASS on all 4 questions
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — untouched (no source code touched in this phase)

## The 4 questions this spike must answer

| # | Question | PASS criterion | FAIL fallback |
|---|---|---|---|
| Q1 | Does AionUi headless WebUI build + run on Mini PC (Ubuntu 24.04, bruce user, Docker available)? | Container starts, `/api/health` returns 200, browser hits port and sees login | Try bare-metal node service instead of Docker |
| Q2 | Are the response headers iframe-compatible? (X-Frame-Options absent or SAMEORIGIN; CSP frame-ancestors allows bruce.livinity.io) | Browser embeds `<iframe src="http://10.69.31.68:PORT/">` from a test page WITHOUT browser refusing it | Patch AionUi to strip the headers — record patch line count |
| Q3 | Does the local `claude` CLI subscription path work transparently? (Liv reads `~/.claude/.credentials.json` → no separate Claude key entry needed) | Add `claude-cli` provider in AionUi UI; first message succeeds using subscription token | Bridge via Phase 228: Liv wraps `claude` spawn with explicit auth pass-through |
| Q4 | Apache-2.0 NOTICE preservation feasible? (License compatible with our rebrand+ship; no GPL contamination from deps) | NOTICE file scanned; LICENSE compatible; deps audited via `npm ls --prod` for restricted licenses | Carry: file license-compat audit report; decide per-dep |

## Tasks

### T1 — Clone + build AionUi locally (Mini PC scratch container)
```bash
ssh bruce@10.69.31.68 <<'EOF'
mkdir -p /tmp/v42-spike && cd /tmp/v42-spike
git clone --depth=1 https://github.com/iOfficeAI/AionUi.git
cd AionUi
# Inspect: package.json scripts, Dockerfile, web mode entry
ls -la
cat package.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('scripts',{}), indent=2))"
ls Dockerfile* docker-compose* webui* 2>&1
EOF
```
**Acceptance:** README + package.json + Dockerfile understood. We know `bun run web` (or equiv) exists.

### T2 — Run headless WebUI mode (Docker if available, else node)
- If Dockerfile present: `docker build -t aionui-spike .` + `docker run -p 9099:PORT aionui-spike`
- If only Electron: try `bun run start --headless` (AionUi readme claims headless mode)
- Verify port responds: `curl -sSI http://127.0.0.1:9099/`
**Acceptance:** HTTP 200 from a known port. Log evidence in 222-SPIKE.md.

### T3 — Iframe embedding probe
Write a 10-line HTML page on Mini PC:
```html
<!doctype html>
<title>iframe test</title>
<iframe src="http://127.0.0.1:9099/" width="100%" height="100%"></iframe>
```
Open in browser. **Open DevTools Console** → record any errors:
- `Refused to display ... in a frame because it set 'X-Frame-Options' to 'DENY'.` → FAIL Q2
- `Refused to frame ... because an ancestor violates ... 'frame-ancestors'.` → FAIL Q2
- Renders cleanly → PASS Q2

Also `curl -sSI http://127.0.0.1:9099/` and grep for `x-frame-options` / `content-security-policy`.

**Acceptance:** Either passes embed cleanly, or we know exactly which header source files need patching in T7.

### T4 — Claude CLI subscription test
- In AionUi UI: navigate to provider config
- Add "Claude CLI" backend pointing at `/usr/bin/claude`
- Send a message "say hi"
- Observe: does it spawn `claude -p ...`? Does it use the subscription credentials at `/home/bruce/.claude/.credentials.json`?
- Check `ps -ef | grep claude` while message sends

**Acceptance:** Subscription chat works end-to-end with no extra API key. OR: clearly documented what needs to bridge in Phase 228.

### T5 — License + dependency audit
```bash
cd /tmp/v42-spike/AionUi
ls LICENSE NOTICE 2>&1
cat LICENSE | head -3
npm ls --prod --json 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
def walk(node, depth=0):
    for name, child in (node.get('dependencies', {}) or {}).items():
        print(f'{name}@{child.get(\"version\",\"?\")}')
        walk(child, depth+1)
walk(d)
" | sort -u | head -30
# Spot-check for GPL / AGPL deps
```
**Acceptance:** No GPL/AGPL deps in the production tree (we ship modifications). NOTICE file plan documented.

### T6 — Lifecycle integration sketch (no code, just doc)
Write to `222-SPIKE.md`:
- Where AionUi stores its config (SQLite file at ~?)
- Where AionUi reads provider config from
- How AionUi auto-detects CLI backends
- Multi-user posture (single-user assumption confirmed)

### T7 — Decision matrix
Write `222-SPIKE.md` ending with a 5-row matrix:
```
Q1 (build):         PASS / PARTIAL / FAIL  +  evidence
Q2 (iframe):        PASS / PARTIAL / FAIL  +  evidence + patch effort
Q3 (claude CLI):    PASS / PARTIAL / FAIL  +  evidence
Q4 (license):       PASS / PARTIAL / FAIL  +  evidence
OVERALL VERDICT:    PROCEED to Phase 223 / RE-PLAN / ABANDON
```

**Commit:** `spike(222): AionUi feasibility on Mini PC — verdict in 222-SPIKE.md`

## Out of scope (deferred to later phases)

- Forking AionUi (Phase 223)
- Modifying LivOS source (Phases 224+)
- Caddy config changes (Phase 226)
- Deleting OpenClawOS (Phase 231)
- Production deployment (Phase 225+)

## Rollback path

This phase is **fully reversible**: only writes to `/tmp/v42-spike/` on Mini PC and a single markdown doc + one commit in the planning repo. To rollback: `rm -rf /tmp/v42-spike` on Mini PC; revert the commit.
