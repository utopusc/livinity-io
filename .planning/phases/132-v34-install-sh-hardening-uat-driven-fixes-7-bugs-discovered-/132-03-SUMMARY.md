# 132-03 — install.sh self-bootstrap (Bug #4)

**Status:** CODE-COMPLETE 2026-05-17

## Bug #4 reproduction (UAT 2026-05-16)

Customer pastes the canonical install one-liner from the wizard into a
fresh VPS root shell:

```
$ curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
    --mode hybrid --domain x.example.com --cf-token X --cf-zone-id Y --api-key Z
ERROR: helper directory not found: /root/scripts/install
Run from the livinity-io repo root: bash scripts/install.sh ...
```

`install.sh` resolves helpers relative to `$PWD/scripts/install/`.
When piped via `curl|bash` from `/root`, no such directory exists →
`exit 2`. The wizard's one-liner does NOT include a `git clone`, so
the install path is BROKEN for every customer.

## Self-bootstrap design — 3-mode resolution

The fix adds a **Mode 3** that activates only when Modes 1 and 2 both
fail (i.e. the script is not in a cloned repo AND CWD is not a repo
root). Mode 3 downloads helpers from GitHub raw into a temp dir.

| Mode | Trigger | `SCRIPT_DIR` |
|------|---------|--------------|
| 1 | `BASH_SOURCE[0]` is a real file path (not `/dev/*`) | `$(dirname BASH_SOURCE)/install` |
| 2 | `BASH_SOURCE[0]` is `/dev/*` or empty AND `$PWD/scripts/install/` exists | `$PWD/scripts/install` |
| 3 | Neither — piped via curl from arbitrary dir | `$(mktemp -d)` + download helpers from `$GH_RAW_BASE` |

A final sanity loop verifies every required helper landed (catches
partial downloads, fork mismatches, etc.).

## HELPERS_REQUIRED list

Explicit enumeration with rationale:

| Helper | Why |
|--------|-----|
| `_logging.sh` | `info/ok/warn/fail/step` functions used by every other helper |
| `parse-cli.sh` | Validates and exports `MODE`, `DOMAIN`, `CF_TOKEN`, etc. |
| `detect-platform.sh` | OS/arch detection + CGNAT warn (104-08) |
| `common-deps.sh` | apt + Node + pnpm install |
| `show-banner.sh` | Final OK banner |
| `mode-cloud.sh` | Cloud (CF-tunnel) provisioning |
| `mode-local-lan.sh` | LAN-only deployment |
| `mode-hybrid.sh` | Default — wildcard DNS-01 + LE cert + Caddy |
| `mode-tunnel.sh` | CF Tunnel device-pairing flow |
| `deploy-livinityd.sh` | systemd unit + service start + DB seed |

Verified against `ls scripts/install/`: matches byte-for-byte (the
`__tests__/` and `seeds/` dirs are not part of the runtime helper set).

## Override hook

`LIVOS_INSTALL_BOOTSTRAP_BASE` env var overrides the GitHub raw base
URL — useful for staging/testing against a fork or a private mirror:

```bash
LIVOS_INSTALL_BOOTSTRAP_BASE=https://raw.githubusercontent.com/myfork/livinity-io/feature-branch/scripts/install \
  curl -fsSL https://livinity.io/install.sh | bash -s -- --help
```

## Network-failure UX

If `curl -fsSL` fails for any required helper (no DNS, no network, raw
URL 404), the script exits 3 with a clear error message and an override
hint:

```
ERROR: failed to download _logging.sh from https://raw.githubusercontent.com/utopusc/livinity-io/master/scripts/install
Check network connectivity OR set LIVOS_INSTALL_BOOTSTRAP_BASE env var to override.
```

Distinct from exit 2 (missing-helper-after-resolution) so operators can
debug "downloaded but corrupt" vs "couldn't reach GH" separately.

## INSTALL_SH_PIPE_BASH_VERIFIED

Static checks pass:

```
$ bash -n scripts/install.sh
(no output — syntax OK)

$ grep -c "Self-bootstrap" scripts/install.sh
1   (Mode 3 marker block present)

$ grep -c "HELPERS_REQUIRED=" scripts/install.sh
1   (allowlist present)
```

Modes 1 and 2 are preserved unchanged (visual confirm in diff). Mode 3
will exercise on the operator-walked Plan 132-07 fresh-VPS UAT — the
wizard's one-liner will hit it and the self-bootstrap log lines will
be visible in install output.

## Backward compatibility

- **Mode 1** (cloned repo `bash scripts/install.sh ...`): unchanged.
- **Mode 2** (curl|bash from repo root): unchanged.
- **Mode 3** (curl|bash from anywhere else): NEW — previously exited 2,
  now self-bootstraps.

No existing call site regresses.

## What the wizard serves

`https://livinity.io/install.sh` is served by Server5's Caddy reverse-
proxy block (`@authproxy` rewrite to `/install.sh` route) that hits
the Next.js platform route at `/opt/platform/web/src/app/install.sh/`.
The route serves the file dynamically — likely fetched live from
GitHub raw or via a cached read of the platform's own copy of the
install script.

**Deployment verification** (deferred to Plan 132-07): after this
commit pushes to `master`, `curl -fsSL https://livinity.io/install.sh
| head -50` should show the new "Self-bootstrap" comment block.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
`liv/packages/core/src/sdk-agent-runner.ts` — preserved (this plan
only edits `scripts/install.sh`).
