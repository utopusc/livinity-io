# 184-01 Deploy Log — v38.0 Mini PC Deploy

**Phase:** 184-v38-deploy-uat
**Operator:** bruce@10.69.31.68
**Started:** 2026-05-20T12:09:25Z
**Key used:** `C:/Users/hello/Desktop/Projects/contabo/pem/minipc` (ED25519)

---

## § 1 Pre-Deploy Snapshot

**Timestamp:** 2026-05-20T12:10:28Z

### SSH Connectivity

- Status: **CONNECTED** (SSH via ZeroTier 10.69.31.68)
- Key note: `contabo_master` (RSA) is NOT in bruce's authorized_keys — only `minipc` (ED25519) key works
- Fingerprint: `SHA256:3fQV2SxI6KSZ5Cbk3rpEWrPwH7iO+ZZ8fAvD7tkmDOE`

### Deployed SHA (pre-deploy)

```
8310beb1f51fd69e52b113a961efaea92241b197
```

Note: This is the v35.0 SHA from master plan pre-flight verification. v38.0 HEAD to deploy is `22db8cf9` (latest local + pushed) which extends from `e1f44ce7` (Phase 183 complete).

### Service Health (pre-deploy)

| Service | Status | NRestarts |
|---------|--------|-----------|
| livos | active | 0 |
| liv-core | active | 0 |
| liv-worker | active | 0 |
| liv-memory | active | 0 |

All 4 services: **ACTIVE**. NRestarts=0 for all. System is stable pre-deploy.

### Disk + RAM

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme0n1p1  900G   54G  801G   7% /

               total        used        free      shared  buff/cache   available
Mem:            31Gi       4.8Gi       4.7Gi       250Mi        22Gi        26Gi
```

- Disk: 801GB free (ample for v38.0 deploy)
- RAM: 26Gi available (very healthy)

### Runtime Versions

```
Node: v22.22.1
Claude binary: /usr/bin/claude
tmux: 3.4
```

### Pre-Deploy Sacred SHA Check

```
sh: 0: cannot open /opt/livos/scripts/check-sacred.sh: No such file
```

**Note:** `check-sacred.sh` does not exist on Mini PC yet (it's in the repo and will be deployed via `update.sh`). This script was added in v38.0 Phase 171+. Pre-deploy SHA verification was not possible against the v38 registry — the server currently runs v35 code. This is expected and acceptable.

Manual pre-deploy SHA check not possible (would require git checkout, not rsync deploy). Accept: pre-deploy is confirmed clean (v35 SHA, all services active).

### Vault Directory State (pre-deploy)

```
/root/liv/          ABSENT  (migration will create after deploy)
/root/livinity-vault/ ABSENT  (no vault yet — clean state)
/root/.backups/     ABSENT  (no previous backups)
```

Migration will run on first boot after deploy (Phase 173 auto-migration hook).

### Pre-Deploy Gates

| Gate | Status | Notes |
|------|--------|-------|
| SSH reachable | PASS | ED25519 minipc key |
| All 4 services active | PASS | NRestarts=0 |
| Disk space adequate | PASS | 801GB free |
| Node v22 | PASS | v22.22.1 |
| Claude binary | PASS | /usr/bin/claude |
| tmux 3.4 | PASS | Phase 183 requires tmux |
| update.sh present | PASS | /opt/livos/update.sh exists |
| Sacred SHA check | NOTE | check-sacred.sh not deployed yet (v35 server) |

**Pre-deploy status: READY TO DEPLOY**

---

## § 2 update.sh Execution Log

*See below — populated after Plan 184-02 execution*

---

## § 3 Post-Deploy Verification

*See below — populated after Plan 184-02 execution*
