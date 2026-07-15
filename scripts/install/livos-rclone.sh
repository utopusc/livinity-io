#!/usr/bin/env bash
# scripts/install/livos-rclone.sh
# Phase 324 (FILES-03) — root-owned rclone (cloud-drive) install/mount wrapper.
#
# Deployed to /usr/local/lib/livos/livos-rclone.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-rclone) + update.sh (Step 7.10m). Invoked by
# livinityd's system routes (324-05) via the scoped sudoers grant
# (sudoers.d/livos-rclone):
#   sudo -n /usr/local/lib/livos/livos-rclone.sh <action> [args...]
#
# WHY A WRAPPER (clone of the Phase 329 livos-webdav.sh + Phase 325 livos-crypto.sh
# template): the privileged surface here is downloading + installing the rclone .deb,
# writing /etc/rclone/rclone.conf, and running `rclone mount` as root via a systemd
# unit. livinityd runs as the unprivileged desktop user. A raw NOPASSWD grant on
# apt-get / dpkg / rclone / systemctl would let any process that can call `sudo`
# inject arbitrary flags, package names, a poisoned .deb URL, an out-of-tree mount,
# or a config body. Instead the sudoers grant is on THIS ONE binary path (no glob,
# no argument wildcard) and the wrapper accepts ONLY a fixed action enum
# {install|authorize-start|config-write|mount|unmount|status|remove}. It builds the
# exact rclone download URL + filename, the sha256 pin, every apt/rclone/systemctl
# argv, and the entire systemd unit body ITSELF, so no caller-supplied string can
# ever reach a privileged command (T-324-10). To change a permitted operation, EDIT
# THIS WRAPPER — do NOT broaden the grant.
#
# SUPPLY-CHAIN PIN (T-324-09 / D-11): `install` downloads the PINNED rclone v1.74.4
# GitHub-Release .deb and sha256-verifies it against the LITERAL vendor digest BEFORE
# installing; a mismatch aborts (exit 2) and nothing is installed. The wrapper builds
# the URL/filename/digest from its own constants — never a caller string. It NEVER
# pulls the distro apt package and NEVER pipes a remote script into a shell.
#
# SECRET DISCIPLINE (T-324-16 / D-12 / D-14): OAuth token blobs arrive on STDIN
# (never argv) and are written to /etc/rclone/rclone.conf 0600 root-owned. If the
# config is encrypted, rclone reads RCLONE_CONFIG_PASS FROM THE ENVIRONMENT (the
# mount unit sources an optional EnvironmentFile; the config-write path inherits it
# from the caller's env) — it is NEVER a CLI argument (would be `ps`/journalctl
# visible) and is NEVER echoed or logged. The wrapper prints no tokens/pass to
# stdout/stderr.
#
# Args (the enum is the ONLY control input; anything else -> exit 2, nothing
# privileged runs; token blobs for config-write arrive on stdin, NOT in argv):
#   $1  action  — install | authorize-start | config-write | mount | unmount | status | remove
#   $2  backend — authorize-start: one of {drive|dropbox|onedrive}
#   $2  remote  — config-write/mount/unmount/status: rclone remote name (charset-guarded)
#   $3  mountpoint — mount: absolute cleartext mountpoint
#
# Exit codes: 2 = bad usage / unknown action / bad backend / bad remote-name /
#             invalid path / sha256 mismatch. Otherwise the underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-rclone] must run as root" >&2; exit 2; }

# ── Wrapper-owned constants (no caller string ever reaches these) ──
# Pinned rclone release + the vendor-published sha256 for the amd64 .deb
# (rclone/rclone v1.74.4 GitHub Release asset digest, D-11 — verified 2026-07-15).
readonly RCLONE_VERSION="1.74.4"
readonly RCLONE_DEB="rclone-v${RCLONE_VERSION}-linux-amd64.deb"
readonly RCLONE_URL="https://github.com/rclone/rclone/releases/download/v${RCLONE_VERSION}/${RCLONE_DEB}"
readonly RCLONE_SHA256="a9da2eaa70428c6dcc5acbb0b7eac0faec4c61643e0b468d9fe09ddf79b7e929"
# Root-owned config + the templated mount unit paths.
readonly RCLONE_CONF="/etc/rclone/rclone.conf"
readonly RCLONE_ENV_DIR="/etc/rclone"
readonly RCLONE_UNIT="/etc/systemd/system/rclone-mount@.service"

# rclone's built-in shared OAuth client_id backends we permit `authorize` for
# (D-13). Anything outside this closed allowlist -> exit 2 before rclone runs.
_validate_backend() {
    case "$1" in
        drive|dropbox|onedrive) : ;;
        *) echo "[livos-rclone] invalid backend: '$1' — expected one of: drive dropbox onedrive" >&2; exit 2 ;;
    esac
}

# A remote name reaches the systemd `%I` template + the rclone config section header,
# so it MUST be charset-guarded (defense in depth — the 324-05 mount-manager guards it
# too). Restrict to a conservative rclone-safe set; reject empty/anything else -> exit 2.
_validate_remote() {
    local _r="$1"
    [[ -n "$_r" && "$_r" =~ ^[A-Za-z0-9_-]{1,64}$ ]] \
        || { echo "[livos-rclone] invalid remote name: '${_r}' (allowed: A-Za-z0-9_- , max 64)" >&2; exit 2; }
}

# Validate a caller-supplied mountpoint: absolute, restricted charset, no '..'
# traversal — runs BEFORE the path reaches mkdir/the unit/fusermount. The /Cloud
# base-dir policy is enforced by the 324-05 mount-manager; here we defend the
# privileged boundary (charset + traversal) so no flag/space can be smuggled in.
_validate_path() {
    local _p="$1"
    [[ "$_p" =~ ^/[A-Za-z0-9._/-]+$ ]] \
        || { echo "[livos-rclone] invalid path: '${_p}'" >&2; exit 2; }
    case "$_p" in
        *..*) echo "[livos-rclone] path may not contain '..': '${_p}'" >&2; exit 2 ;;
    esac
}

# Write the single templated mount unit (idempotent). Instance (%i) = the rclone
# remote name; the per-remote mountpoint arrives via the sourced EnvironmentFile
# (RCLONE_MOUNTPOINT) so a single template serves every remote and no path is baked
# into the instance name. An OPTIONAL second EnvironmentFile ('-') carries
# RCLONE_CONFIG_PASS from the environment for an encrypted config (324-05 populates
# it) — the secret is therefore never in the unit body or any argv. --allow-other lets
# the Samba single-account daemon + Docker read the mount; --vfs-cache-mode writes
# gives correct write semantics on cloud backends.
_write_mount_unit() {
    mkdir -p /etc/systemd/system
    local _tmp
    _tmp="$(mktemp)"
    cat > "$_tmp" <<'EOF'
[Unit]
Description=LivOS rclone cloud mount (%i)
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
EnvironmentFile=/etc/rclone/mount-%i.env
EnvironmentFile=-/etc/rclone/rclone-pass.env
ExecStart=/usr/bin/rclone mount %i: ${RCLONE_MOUNTPOINT} \
    --config /etc/rclone/rclone.conf \
    --allow-other \
    --vfs-cache-mode writes
ExecStop=/bin/fusermount -u ${RCLONE_MOUNTPOINT}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    if [[ ! -f "$RCLONE_UNIT" ]] || ! cmp -s "$_tmp" "$RCLONE_UNIT"; then
        install -m 0644 -o root -g root "$_tmp" "$RCLONE_UNIT"
    fi
    rm -f "$_tmp"
}

ACTION="${1:-}"

case "$ACTION" in
    install)
        # Download the PINNED rclone .deb to a scratch dir, sha256-verify it against
        # the vendor-published digest, and ONLY THEN install it. The wrapper builds
        # the exact URL + filename itself — no caller string enters any command line
        # (T-324-09). A digest mismatch is a hard abort: never install an unverified
        # .deb, and never the distro package / a piped remote script.
        export DEBIAN_FRONTEND=noninteractive
        _rc_tmp="$(mktemp -d)"
        trap 'rm -rf "$_rc_tmp"' EXIT
        _rc_deb="${_rc_tmp}/${RCLONE_DEB}"
        curl -fsSL "$RCLONE_URL" -o "$_rc_deb"
        # Verify BEFORE install. `sha256sum -c` reads "<hex>  <path>" from stdin.
        if ! printf '%s  %s\n' "$RCLONE_SHA256" "$_rc_deb" | sha256sum -c - >/dev/null 2>&1; then
            echo "[livos-rclone] sha256 mismatch for ${RCLONE_DEB} — refusing to install (supply-chain guard)" >&2
            exit 2
        fi
        apt-get update -qq
        apt-get install -y -qq "$_rc_deb"
        # `user_allow_other` lets the Samba single-account daemon + Docker read the
        # cleartext rclone mount (mount uses --allow-other). Idempotent grep-append;
        # reused verbatim from livos-crypto.sh — a prior gocryptfs install may already
        # carry the line, so the grep-guard keeps this a no-op in that case.
        if [[ -f /etc/fuse.conf ]]; then
            grep -qE '^[[:space:]]*user_allow_other[[:space:]]*$' /etc/fuse.conf \
                || echo 'user_allow_other' >> /etc/fuse.conf
        else
            echo 'user_allow_other' > /etc/fuse.conf
            chmod 0644 /etc/fuse.conf
        fi
        echo installed
        exit 0
        ;;

    authorize-start)
        # authorize-start <backend> — run rclone's built-in interactive authorize flow
        # with its SHARED client_id (D-13, no per-user OAuth app) and surface the URL +
        # instructions on stdout. The copy-paste wizard that drives this + captures the
        # returned token blob lives in 324-05. --auth-no-open-browser keeps it headless
        # (the box has no browser). The backend is allowlist-checked before rclone runs.
        BACKEND="${2:-}"
        _validate_backend "$BACKEND"
        rclone authorize "$BACKEND" --auth-no-open-browser
        exit 0
        ;;

    config-write)
        # config-write <remote> — read the rclone token/remote blob from STDIN (never
        # argv) and append/replace it in /etc/rclone/rclone.conf 0600 root-owned. The
        # DEK token-at-rest layer + the section-merge logic land in 324-05; here we
        # persist the wrapper-owned config path with strict perms. RCLONE_CONFIG_PASS,
        # if the config is encrypted, is read by rclone from the ENVIRONMENT — never a
        # CLI arg. The blob is never echoed back.
        REMOTE="${2:-}"
        _validate_remote "$REMOTE"
        mkdir -p "$RCLONE_ENV_DIR"
        chmod 0700 "$RCLONE_ENV_DIR"
        _cfg_tmp="$(mktemp)"
        # Read the whole blob from stdin verbatim (fd 0). Never printed.
        cat > "$_cfg_tmp"
        install -m 0600 -o root -g root "$_cfg_tmp" "$RCLONE_CONF"
        rm -f "$_cfg_tmp"
        echo "config-written"
        exit 0
        ;;

    mount)
        # mount <remote> <mountpoint> — enable the templated rclone-mount@<remote>
        # unit for a validated remote + mountpoint. The mountpoint is passed to the
        # unit via a per-remote 0600 EnvironmentFile (RCLONE_MOUNTPOINT), never argv.
        REMOTE="${2:-}"
        MOUNTPOINT="${3:-}"
        [[ -n "$REMOTE" && -n "$MOUNTPOINT" ]] \
            || { echo "[livos-rclone] mount needs <remote> <mountpoint>" >&2; exit 2; }
        _validate_remote "$REMOTE"
        _validate_path "$MOUNTPOINT"
        mkdir -p "$MOUNTPOINT"
        mkdir -p "$RCLONE_ENV_DIR"
        chmod 0700 "$RCLONE_ENV_DIR"
        # Per-remote mountpoint env (consumed by the unit's EnvironmentFile). 0600.
        _env_tmp="$(mktemp)"
        printf 'RCLONE_MOUNTPOINT=%s\n' "$MOUNTPOINT" > "$_env_tmp"
        install -m 0600 -o root -g root "$_env_tmp" "${RCLONE_ENV_DIR}/mount-${REMOTE}.env"
        rm -f "$_env_tmp"
        _write_mount_unit
        systemctl daemon-reload
        systemctl enable --now "rclone-mount@${REMOTE}.service"
        echo "mounted"
        exit 0
        ;;

    unmount)
        # unmount <remote> [mountpoint] — disable the unit (ExecStop unmounts) and, as
        # belt-and-suspenders, fusermount the mountpoint directly. Both guarded so a
        # not-mounted / already-disabled state stays exit 0.
        REMOTE="${2:-}"
        MOUNTPOINT="${3:-}"
        _validate_remote "$REMOTE"
        systemctl disable --now "rclone-mount@${REMOTE}.service" 2>/dev/null || true
        if [[ -n "$MOUNTPOINT" ]]; then
            _validate_path "$MOUNTPOINT"
            fusermount -u "$MOUNTPOINT" 2>/dev/null || true
        fi
        echo "unmounted"
        exit 0
        ;;

    status)
        # status <remote> — read-only liveness probe. `set -e` is on, so each branch is
        # guarded to keep the compound exit 0.
        REMOTE="${2:-}"
        _validate_remote "$REMOTE"
        systemctl is-active "rclone-mount@${REMOTE}.service" 2>/dev/null || echo "inactive"
        rclone version 2>/dev/null | head -n 1 || echo "rclone: not installed"
        exit 0
        ;;

    remove)
        # remove — disable every rclone mount unit instance, then remove the package.
        # /etc/rclone (config + per-remote env) is left in place (harmless with the
        # service down); install + config-write + mount restore a working setup.
        for _u in $(systemctl list-units --type=service --all --no-legend 'rclone-mount@*.service' 2>/dev/null | awk '{print $1}'); do
            systemctl disable --now "$_u" 2>/dev/null || true
        done
        export DEBIAN_FRONTEND=noninteractive
        apt-get remove -y -qq rclone 2>/dev/null || true
        echo "removed"
        exit 0
        ;;

    *)
        echo "[livos-rclone] invalid action: '${ACTION}' — expected one of: install authorize-start config-write mount unmount status remove" >&2
        exit 2
        ;;
esac
