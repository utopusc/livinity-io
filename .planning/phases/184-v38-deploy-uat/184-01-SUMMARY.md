---
phase: 184-v38-deploy-uat
plan: "01"
subsystem: deploy-ops
tags: [deploy, pre-deploy, ssh, snapshot, mini-pc]
dependency_graph:
  requires: []
  provides: [pre-deploy-snapshot, service-health-baseline]
  affects: [184-02]
tech_stack:
  added: []
  patterns: [ssh-minipc-ed25519, detached-ssh-poll]
key_files:
  created:
    - .planning/phases/184-v38-deploy-uat/184-01-deploy-log.md
  modified: []
decisions:
  - "SSH key for Mini PC is minipc (ED25519), NOT contabo_master (RSA) — contabo_master not in bruce authorized_keys"
  - "Pre-deploy state: v35 SHA 8310beb1, 4/4 services active, NRestarts=0"
  - "check-sacred.sh not deployed yet (v35 server) — will deploy as part of update.sh"
metrics:
  duration: "8 minutes"
  completed_date: "2026-05-20"
---

# Phase 184 Plan 01: Pre-Deploy Snapshot Summary

**One-liner:** Mini PC SSH confirmed reachable via minipc ED25519 key; all 4 services active on v35 SHA pre-deploy; deploy log captured.

## What Was Done

Ran pre-deploy snapshot against Mini PC (bruce@10.69.31.68) via SSH. Captured service health, deployed SHA, disk/RAM metrics, runtime versions.

## Key Findings

- **SSH key**: `contabo_master` (RSA) was NOT working — Mini PC's `bruce` user only has the `minipc` (ED25519) key in authorized_keys. All future SSH calls must use `-i C:/Users/hello/Desktop/Projects/contabo/pem/minipc`
- **Pre-deploy SHA**: `8310beb1f51fd69e52b113a961efaea92241b197` (v35.0 state)
- **All 4 services**: ACTIVE, NRestarts=0
- **Vault dirs**: all ABSENT (clean state, migration will create on first boot)
- **Sacred SHA check**: not possible pre-deploy (check-sacred.sh not deployed yet — v35 server)
- **Disk**: 801GB free, RAM: 26Gi available

## Deviations from Plan

**[Rule 3 - Blocking] SSH key mismatch discovered**
- **Found during:** Task 1 (SSH connectivity)
- **Issue:** Plan specified `contabo_master` key but Mini PC `bruce` user only accepts `minipc` ED25519 key. `contabo_master` RSA is not in bruce's authorized_keys.
- **Fix:** Used `minipc` key for all SSH commands
- **Impact:** All subsequent plans in 184 use `-i C:/Users/hello/Desktop/Projects/contabo/pem/minipc`

## Self-Check

- [x] 184-01-deploy-log.md exists at .planning/phases/184-v38-deploy-uat/184-01-deploy-log.md
- [x] Commit `docs(184-01)` in git log (a0d26c65)
- [x] File contains § 1 Pre-Deploy Snapshot section
