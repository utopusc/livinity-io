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
# {detect|install-driver|install-toolkit|install-toolkit-wsl|install-amd-rocm} —
# it builds every command line ITSELF, so no caller-supplied flag or package
# name can ever reach apt/usermod/nvidia-ctk.
# To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the grant.
#
# The tRPC route (system.installNvidiaGpu, adminProcedure) additionally constrains
# its input to z.enum(['install-driver','install-toolkit']) before spawning sudo —
# defense-in-depth on top of this wrapper's own enum.
#
# Args (the enum is the ONLY input; anything else -> exit 2, nothing privileged runs):
#   $1  action — detect | install-driver | install-toolkit | install-toolkit-wsl | install-amd-rocm
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

	install-toolkit-wsl)
		# NVIDIA WSL2 — toolkit ONLY. Windows provides the display driver; installing
		# the Linux NVIDIA driver here would overwrite the /usr/lib/wsl/lib stubs and
		# break /dev/dxg passthrough (D-4). Byte-identical privileged steps to
		# install-toolkit (the WSL-vs-bare distinction is which action the UI picks,
		# not different commands); the distinct name is auditable and lets the tRPC
		# layer refuse install-driver on WSL2. Deliberately never touches the driver.
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
		nvidia-ctk --version || true
		echo "[livos-gpu-install] nvidia-container-toolkit installed + docker runtime configured (WSL2 — toolkit only, no Linux driver)"
		exit 0
		;;

	install-amd-rocm)
		# Bare-metal AMD only. Host needs the in-kernel amdgpu driver (default on
		# modern Ubuntu) + /dev/kfd,/dev/dri + render/video group membership;
		# ollama/ollama:rocm bundles the ROCm userspace runtime. The caller
		# (routes.ts) must never invoke this on WSL2 (no /dev/kfd there); this
		# wrapper trusts the closed enum and does not itself probe WSL2. The group
		# list is a FIXED literal (render,video) and the user is RESOLVED via
		# logname/SUDO_USER — never caller-supplied, never a hardcoded username.
		export DEBIAN_FRONTEND=noninteractive
		_GPU_USER="$(logname 2>/dev/null || echo "${SUDO_USER:-}")"
		if [[ -n "$_GPU_USER" ]]; then
			usermod -aG render,video "$_GPU_USER" || true
		fi
		echo "[livos-gpu-install] AMD render/video group access granted for '${_GPU_USER:-<none>}' — /dev/kfd + /dev/dri passthrough ready (bare-metal)"
		exit 0
		;;

	*)
		echo "[livos-gpu-install] invalid action: '${ACTION}' — expected one of: detect, install-driver, install-toolkit, install-toolkit-wsl, install-amd-rocm" >&2
		exit 2
		;;
esac
