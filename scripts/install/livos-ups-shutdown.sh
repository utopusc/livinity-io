#!/usr/bin/env bash
# scripts/install/livos-ups-shutdown.sh
# Phase 326 (HW-01, D-15) — root SHUTDOWNCMD for upsmon's forced-shutdown (FSD) flow.
#
# Deployed to /usr/local/lib/livos/livos-ups-shutdown.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a-ups) + update.sh (Step 7.10e). Referenced by
# upsmon.conf as:
#   SHUTDOWNCMD "/usr/local/lib/livos/livos-ups-shutdown.sh"
#
# WHY (D-15): upsmon runs THIS script AS ROOT when the UPS battery hits the critical
# threshold (its native POLLFREQ-5s FSD decision — the authoritative power-loss
# signal, NOT the 1-min scheduler poll). It is NOT invoked via sudo, so it needs NO
# sudoers grant — only to be deployed root-owned 0755.
#
# It reaches the daemon's CLEAN teardown (the exact `system.shutdown` route semantics:
# dispatch the critical UPS ALERT -> livinityd.stop() stops apps cleanly + closes the
# DB -> poweroff) by sending SIGUSR2 to the running livinityd MainPID. SIGUSR2 is a
# DISTINCT signal from SIGTERM (which the daemon uses for an immediate port-releasing
# exit — the contract update.sh/systemd-restart rely on, left unchanged). If the
# daemon is dead or wedged and never powers off, this script FAIL-SAFE force-poweroffs
# after a grace window so the box still comes down before the UPS battery is exhausted.
#
# Exit: normally the box powers off before this returns; otherwise the poweroff status.

set -euo pipefail

# Resolve the running livinityd main PID (systemd unit livos.service) and signal a
# CLEAN shutdown. `|| echo 0` keeps `set -e` from aborting if the unit is unknown.
_PID="$(systemctl show -p MainPID --value livos.service 2>/dev/null || echo 0)"
if [[ "${_PID:-0}" =~ ^[0-9]+$ && "${_PID}" -gt 0 ]]; then
	kill -SIGUSR2 "${_PID}" 2>/dev/null || true
	# Give the daemon up to 60s to dispatch the ALERT + stop apps + poweroff itself.
	# If it succeeds, the system goes down mid-loop and this script never returns.
	for _i in $(seq 1 60); do sleep 1; done
fi

# Fail-safe: still running => the daemon is dead/wedged. Force the poweroff so the box
# comes down before the UPS battery dies. Try the most forceful path first, degrade.
/usr/sbin/poweroff -f || poweroff -f || systemctl poweroff -i
