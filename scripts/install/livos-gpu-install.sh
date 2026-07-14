#!/usr/bin/env bash
# scripts/install/livos-gpu-install.sh
# Phase 316 (GPU-01) — root-owned NVIDIA driver + container-toolkit install wrapper.
#
# Deployed to /usr/local/lib/livos/livos-gpu-install.sh (mode 0755, root-owned) by
# deploy-livinityd.sh + update.sh. Invoked by livinityd's system routes via the
# scoped sudoers grant (sudoers.d/livos-gpu):
#   sudo -n /usr/local/lib/livos/livos-gpu-install.sh <action>
#
# WHY A WRAPPER (clone of the Phase 313 livos-smartctl.sh HIGH-01 template): the
# privileged actions here are `apt-get install`, `ubuntu-drivers autoinstall`,
# `nvidia-ctk runtime configure`, and `systemctl restart docker` — all root-only.
# livinityd runs as the unprivileged desktop user. A raw NOPASSWD grant on
# apt-get/nvidia-ctk would let any process that can call `sudo` inject arbitrary
# flags/packages. Instead the sudoers grant is on THIS ONE binary path (no glob,
# no argument wildcard) and the wrapper accepts ONLY a fixed action enum
# {detect|install-driver|install-toolkit} — it builds every command line ITSELF,
# so no caller-supplied flag or package name can ever reach apt/nvidia-ctk.
# To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the grant.
#
# The tRPC route (system.installNvidiaGpu, adminProcedure) additionally constrains
# its input to z.enum(['install-driver','install-toolkit']) before spawning sudo —
# defense-in-depth on top of this wrapper's own enum.
#
# Args (the enum is the ONLY input; anything else -> exit 2, nothing privileged runs):
#   $1  action — detect | install-driver | install-toolkit
#
# Exit codes: 2 = bad usage / unknown action. Otherwise the underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-gpu-install] must run as root" >&2; exit 2; }

ACTION="${1:-}"

KEYRING='/etc/apt/keyrings/nvidia-container-toolkit-keyring.gpg'
SOURCES_LIST='/etc/apt/sources.list.d/nvidia-container-toolkit.list'
TOOLKIT_GPGKEY='https://nvidia.github.io/libnvidia-container/gpgkey'
TOOLKIT_REPO_LIST='https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list'

case "$ACTION" in
	detect)
		# Read-only host probes. No privilege is strictly required for these, but
		# they live in the wrapper for symmetry + a single audited entry point.
		# `set -e` is on, so every no-match/absent-tool path is guarded with `|| true`.
		echo "== livos-gpu-install detect =="
		if command -v lspci >/dev/null 2>&1; then
			echo "-- lspci NVIDIA controllers --"
			lspci -nnk 2>/dev/null | grep -i nvidia || echo "(none)"
		else
			echo "lspci: not installed"
		fi
		if command -v nvidia-smi >/dev/null 2>&1; then
			echo "nvidia-smi: present"
		else
			echo "nvidia-smi: absent"
		fi
		if command -v docker >/dev/null 2>&1; then
			echo "-- docker runtimes --"
			docker info --format '{{json .Runtimes}}' 2>/dev/null || echo "(docker info unavailable)"
		else
			echo "docker: not installed"
		fi
		exit 0
		;;

	install-driver)
		# Proprietary NVIDIA driver. `ubuntu-drivers autoinstall` picks the correct
		# driver package across GPU generations, avoiding a hand-maintained package
		# list. Typically requires a reboot before nvidia-smi reports a live device;
		# the reboot-confirm UX is handled UI-side via the existing reboot primitive.
		export DEBIAN_FRONTEND=noninteractive
		if ! command -v ubuntu-drivers >/dev/null 2>&1; then
			apt-get update -qq
			apt-get install -y -qq ubuntu-drivers-common
		fi
		ubuntu-drivers autoinstall
		echo "[livos-gpu-install] driver install complete — a reboot is required to load the kernel module"
		exit 0
		;;

	install-toolkit)
		# Official NVIDIA container-toolkit apt repo (dearmor + signed-by), cloning
		# the deploy-livinityd.sh NodeSource convention. The wrapper builds the exact
		# argv itself — no caller string enters any command line.
		export DEBIAN_FRONTEND=noninteractive
		mkdir -p /etc/apt/keyrings
		curl -fsSL "$TOOLKIT_GPGKEY" | gpg --dearmor --no-tty --batch --yes -o "$KEYRING"
		chmod 0644 "$KEYRING"
		curl -fsSL "$TOOLKIT_REPO_LIST" \
			| sed "s#deb https://#deb [signed-by=${KEYRING}] https://#g" \
			> "$SOURCES_LIST"
		apt-get update -qq
		apt-get install -y -qq nvidia-container-toolkit
		nvidia-ctk runtime configure --runtime=docker
		systemctl restart docker
		# Post-install sanity — surface the installed toolkit version (non-fatal).
		nvidia-ctk --version || true
		echo "[livos-gpu-install] nvidia-container-toolkit installed + docker runtime configured"
		exit 0
		;;

	*)
		echo "[livos-gpu-install] invalid action: '${ACTION}' — expected one of: detect, install-driver, install-toolkit" >&2
		exit 2
		;;
esac
