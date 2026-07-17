#!/usr/bin/env bash
# scripts/install/livos-webdav.sh
# Phase 329 (FILES-05) — root-owned SFTPGo (WebDAV) install/config wrapper.
#
# Deployed to /usr/local/lib/livos/livos-webdav.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-webdav) + update.sh (Step 7.10i). Invoked by
# livinityd's system routes (329-05) via the scoped sudoers grant
# (sudoers.d/livos-webdav):
#   sudo -n /usr/local/lib/livos/livos-webdav.sh <action>
#
# WHY A WRAPPER (clone of the Phase 326 livos-ups.sh + Phase 325 livos-tailscale.sh
# template): the privileged surface here is downloading + `apt-get install`-ing the
# SFTPGo .deb, writing /etc/sftpgo/sftpgo.json, and enabling the sftpgo systemd
# service — all root-only. livinityd runs as the unprivileged desktop user. A raw
# NOPASSWD grant on apt-get / dpkg / tee / systemctl would let any process that can
# call `sudo` inject arbitrary flags, package names, config bodies, or a poisoned
# .deb URL. Instead the sudoers grant is on THIS ONE binary path (no glob, no
# argument wildcard) and the wrapper accepts ONLY a fixed action enum
# {install|configure|status|remove}. It builds the exact SFTPGo download URL +
# filename, the sha256 pin, every apt argv, and the entire /etc/sftpgo config body
# ITSELF, so no caller-supplied string can ever reach a privileged command or the
# config file (T-329-12).
# To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the grant.
#
# SUPPLY-CHAIN PIN (T-329-11): `install` downloads the PINNED SFTPGo v2.7.4
# GitHub-Release .deb and sha256-verifies it against the vendor-published digest
# BEFORE `apt-get install`; a mismatch aborts (exit 2) and nothing is installed.
# The URL/filename/digest are all wrapper constants — never caller-supplied.
#
# BINDINGS (D-06/T-329-13 + Phase 338 PROTO-01/D-338-2): `configure` writes a
# wrapper-owned config that enables the `webdavd` service bound to 127.0.0.1 over
# plain HTTP (enable_https:false) — TLS + the public domain stay with the stock
# Caddy reverse_proxy, so webdavd is never reachable off-loopback directly. The
# `sftpd` service is now ENABLED (Phase 338): bound on 0.0.0.0:2022 for LAN clients
# (raw SFTP has no Caddy reverse-proxy path, so it binds all interfaces, unlike the
# loopback-only webdavd), with host keys PINNED under the persistent /var/lib/sftpgo
# state dir so a reinstall/update never rotates them. SFTP is LAN-ONLY and is NEVER
# added to any Cloudflare tunnel ingress (raw TCP, not HTTP — no tunnel path exists
# for it). The FTP binding stays DISABLED (port 0) and the httpd admin/REST binding
# is disabled too. Auth for BOTH webdavd and sftpd is delegated to livinityd via the
# shared `external_auth_hook` → the loopback endpoint (329-05) that validates against
# the existing PG bcrypt user table (D-07) — SFTPGo never stores a second copy of any
# password hash; per-user home dirs are auto-derived under the LivOS data root
# (users_base_dir + the %username% template), reused unchanged by the sftpd listener.
#
# Args (the enum is the ONLY input; anything else -> exit 2, nothing privileged runs):
#   $1  action — install | configure | status | remove
#
# Exit codes: 2 = bad usage / unknown action / sha256 mismatch. Otherwise the
# underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-webdav] must run as root" >&2; exit 2; }

ACTION="${1:-}"

# ── Wrapper-owned constants (no caller string ever reaches these) ──
# Pinned SFTPGo release + the vendor-published sha256 for the amd64 .deb
# (drakkan/sftpgo v2.7.4 GitHub Release asset digest, verified 2026-07-15).
readonly SFTPGO_VERSION="2.7.4"
readonly SFTPGO_DEB="sftpgo_${SFTPGO_VERSION}-1_amd64.deb"
readonly SFTPGO_URL="https://github.com/drakkan/sftpgo/releases/download/v${SFTPGO_VERSION}/${SFTPGO_DEB}"
readonly SFTPGO_SHA256="6b59559f3a465e89f332057a2bbe6256dacb08220ee9683f66ff5e1de9bc55ea"
# webdavd loopback port + the livinityd external-auth-hook endpoint (329-05).
readonly WEBDAV_PORT="9083"
# SFTP LAN binding (Phase 338 PROTO-01). Bound on all interfaces (0.0.0.0) so LAN
# clients reach it directly (raw SFTP has no Caddy reverse-proxy path); port 2022
# (SFTPGo's own default — avoids the OS sshd on :22). NEVER exposed through the
# Cloudflare tunnel (raw TCP, LAN-only). Host keys pin under the persistent
# /var/lib/sftpgo state dir (already mkdir -p'd below) so a reinstall/update never
# rotates them — SFTPGo auto-generates them at those paths on first start if absent,
# then they persist across remove+reinstall/update churn (no client MITM warnings).
readonly SFTP_PORT="2022"
readonly LIVINITYD_PORT="8080"
readonly AUTH_HOOK_URL="http://127.0.0.1:${LIVINITYD_PORT}/api/internal/webdav-auth"
# Per-user home dirs live under the LivOS data root (files.ts per-user isolation).
readonly USER_DATA_ROOT="/opt/livos/data/users"

case "$ACTION" in
	install)
		# Download the PINNED SFTPGo .deb to a scratch dir, sha256-verify it against
		# the vendor-published digest, and ONLY THEN apt-install it (pulls its own
		# deps + resolves them). The wrapper builds the exact URL + filename itself —
		# no caller string enters any command line (T-329-11). A digest mismatch is a
		# hard abort: never install an unverified .deb.
		export DEBIAN_FRONTEND=noninteractive
		_wd_tmp="$(mktemp -d)"
		trap 'rm -rf "$_wd_tmp"' EXIT
		_wd_deb="${_wd_tmp}/${SFTPGO_DEB}"
		curl -fsSL "$SFTPGO_URL" -o "$_wd_deb"
		# Verify BEFORE install. `sha256sum -c` reads "<hex>  <path>" from stdin.
		if ! printf '%s  %s\n' "$SFTPGO_SHA256" "$_wd_deb" | sha256sum -c - >/dev/null 2>&1; then
			echo "[livos-webdav] sha256 mismatch for ${SFTPGO_DEB} — refusing to install (supply-chain guard)" >&2
			exit 2
		fi
		apt-get update -qq
		apt-get install -y -qq "$_wd_deb"
		echo "installed"
		exit 0
		;;

	configure)
		# Write the wrapper-owned /etc/sftpgo/sftpgo.json. The body is fully
		# wrapper-generated (only the wrapper's own constants are interpolated — no
		# caller-supplied content). webdavd is enabled on 127.0.0.1 plain HTTP
		# (enable_https:false — TLS stays with Caddy); sftpd is enabled on
		# 0.0.0.0:${SFTP_PORT} (LAN-only, persistent host keys — Phase 338 PROTO-01).
		# The ftpd binding stays DISABLED (port 0); the httpd admin/REST binding is
		# disabled too. Auth for BOTH listeners is delegated to livinityd via the
		# shared external_auth_hook (scope 1 = password); SFTPGo keeps no second
		# password hash. Per-user home dirs auto-derive under users_base_dir via the
		# %username% template, reused unchanged by the sftpd listener.
		mkdir -p /etc/sftpgo /var/lib/sftpgo "$USER_DATA_ROOT"
		cat > /etc/sftpgo/sftpgo.json <<EOF
{
  "common": {
    "idle_timeout": 15,
    "upload_mode": 0
  },
  "data_provider": {
    "driver": "sqlite",
    "name": "/var/lib/sftpgo/sftpgo.db",
    "users_base_dir": "${USER_DATA_ROOT}",
    "external_auth_hook": "${AUTH_HOOK_URL}",
    "external_auth_scope": 1
  },
  "sftpd": {
    "bindings": [
      { "address": "0.0.0.0", "port": ${SFTP_PORT} }
    ],
    "host_keys": [
      "/var/lib/sftpgo/ssh_host_ed25519_key",
      "/var/lib/sftpgo/ssh_host_rsa_key",
      "/var/lib/sftpgo/ssh_host_ecdsa_key"
    ]
  },
  "ftpd": {
    "bindings": [
      { "address": "127.0.0.1", "port": 0 }
    ]
  },
  "httpd": {
    "bindings": [
      { "address": "127.0.0.1", "port": 0 }
    ]
  },
  "webdavd": {
    "bindings": [
      {
        "address": "127.0.0.1",
        "port": ${WEBDAV_PORT},
        "enable_https": false
      }
    ]
  }
}
EOF
		# root:sftpgo 0640 — the config carries the loopback auth-hook URL; keep it out
		# of world view but readable by the sftpgo daemon group (created by the .deb).
		chown root:sftpgo /etc/sftpgo/sftpgo.json 2>/dev/null || true
		chmod 0640 /etc/sftpgo/sftpgo.json
		systemctl enable --now sftpgo
		echo "configured"
		exit 0
		;;

	status)
		# The route parses is-active + the bound webdavd port from this output.
		systemctl is-active sftpgo 2>/dev/null || echo "inactive"
		echo "webdav.address: 127.0.0.1"
		echo "webdav.port: ${WEBDAV_PORT}"
		# Phase 338 (PROTO-01) — the SFTP LAN binding, so the route/UAT can confirm it.
		echo "sftp.address: 0.0.0.0"
		echo "sftp.port: ${SFTP_PORT}"
		exit 0
		;;

	remove)
		# Disable + stop the daemon, then remove the package. The /etc/sftpgo config +
		# /var/lib/sftpgo data are left in place (harmless with the service down);
		# `install` + `configure` restore a working setup.
		systemctl disable --now sftpgo 2>/dev/null || true
		export DEBIAN_FRONTEND=noninteractive
		apt-get remove -y -qq sftpgo 2>/dev/null || true
		echo "removed"
		exit 0
		;;

	*)
		echo "[livos-webdav] invalid action: '${ACTION}' — expected one of: install configure status remove" >&2
		exit 2
		;;
esac
