#!/usr/bin/env bash
# scripts/install/livos-crypto.sh
# Phase 325 (STOR-01) — root-owned gocryptfs per-folder encryption wrapper.
#
# Deployed to /usr/local/lib/livos/livos-crypto.sh (mode 0755, root-owned) by
# deploy-livinityd.sh (block 2a/2b-crypto) + update.sh (Step 7.10f). Invoked by
# livinityd's system routes (325-05) via the scoped sudoers grant
# (sudoers.d/livos-crypto):
#   sudo -n /usr/local/lib/livos/livos-crypto.sh <action> [paths...]
#
# WHY A WRAPPER (clone of the Phase 313 livos-smartctl.sh + Phase 316
# livos-gpu-install.sh + Phase 326 livos-os-patch.sh / livos-ups.sh HIGH-01
# template): the privileged surface here is `apt-get install gocryptfs`, editing
# /etc/fuse.conf, and running gocryptfs / fusermount as root to init/mount/unmount
# encrypted folders. livinityd runs as the unprivileged desktop user. A raw
# NOPASSWD grant on gocryptfs / apt-get / fusermount would let any process that can
# call `sudo` inject arbitrary flags, mount over arbitrary paths, or read another
# folder's ciphertext. Instead the sudoers grant is on THIS ONE binary path (no
# glob, no argument wildcard) and the wrapper accepts ONLY a fixed action enum
# {install|create|unlock|lock|status}. It regex-validates every path arg and
# anchors it under the LivOS files data root (/opt/livos/data) BEFORE the path
# reaches any privileged command, and it builds every gocryptfs/fusermount/apt argv
# ITSELF, so no caller-supplied string can escape into a flag or an out-of-root
# mount. To change a permitted operation, EDIT THIS WRAPPER — do NOT broaden the
# grant.
#
# PASSPHRASE DISCIPLINE (T-325-05 / D-02 / D-03): the folder passphrase is the SOLE
# unlock factor — gocryptfs runs its own scrypt KDF; we do NOT wrap it with the
# box-global DEK (secrets/dek.ts), which would make "passphrase-locked" cosmetic.
# The passphrase reaches gocryptfs via `-extpass` reading it out of a PRIVATE
# environment variable (_CRYPTO_PASS) that the wrapper populates by reading ONE
# line from stdin (fd 0), which the never-throw route helper writes to the child's
# stdin. The passphrase is therefore NEVER a positional/argv element (would be
# `ps`-visible via /proc/<pid>/cmdline), is NEVER echoed, NEVER logged, and NEVER
# written to a persistent passfile. `-extpass printenv -extpass _CRYPTO_PASS` runs
# `printenv _CRYPTO_PASS`: only the variable NAME appears in the extpass argv, never
# its value. The var is unset the moment gocryptfs returns.
#
# `create` prints gocryptfs's one-time master recovery key to stdout so the route
# can surface it to the user ONCE ("save this") — it is never stored or logged here.
# Default folder state after reboot is LOCKED (no auto-unlock daemon); mount state
# is derived on demand from `mountpoint -q <plaindir>`.
#
# Args (the enum is the ONLY control input; anything else -> exit 2, nothing
# privileged runs; the passphrase for create/unlock arrives on stdin, NOT in argv):
#   $1  action    — install | create | unlock | lock | status
#   $2  cipherdir — create/unlock: encrypted (ciphertext) directory
#   $3  plaindir  — create/unlock: cleartext mountpoint; lock/status: the mountpoint
#
# Exit codes: 2 = bad usage / unknown action / invalid path / empty passphrase.
#             1 = operation failed (e.g. lock while files still open). Otherwise the
#             underlying command's status.

set -euo pipefail

# Must run as root (invoked via sudo by livinityd, or directly at install-test).
[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "[livos-crypto] must run as root" >&2; exit 2; }

# Validate a caller-supplied path: absolute, restricted charset, no '..' traversal,
# and ANCHORED under the LivOS files data root. Encrypted folders live under
# /opt/livos/data/users/<username>/... (files.ts per-user tree) — refusing anything
# outside /opt/livos/data means a compromised caller can never mount/gocryptfs-init
# over an arbitrary system path (T-325-04). Runs BEFORE any privileged use of $_p.
_validate_path() {
    local _p="$1"
    [[ "$_p" =~ ^/[A-Za-z0-9._/-]+$ ]] \
        || { echo "[livos-crypto] invalid path: '${_p}'" >&2; exit 2; }
    case "$_p" in
        *..*) echo "[livos-crypto] path may not contain '..': '${_p}'" >&2; exit 2 ;;
    esac
    case "$_p" in
        /opt/livos/data/*) : ;;
        *) echo "[livos-crypto] path outside data root (/opt/livos/data): '${_p}'" >&2; exit 2 ;;
    esac
}

# Read the passphrase from stdin (fd 0) into a PRIVATE env var. The route helper
# writes it to the child's stdin; it never appears in argv. `|| true` guards the
# EOF-without-newline case under `set -e`. Reject an empty passphrase (exit 2)
# before it can reach gocryptfs.
_read_passphrase() {
    IFS= read -r _CRYPTO_PASS || true
    [[ -n "${_CRYPTO_PASS:-}" ]] \
        || { echo "[livos-crypto] no passphrase on stdin" >&2; exit 2; }
    export _CRYPTO_PASS
}

ACTION="${1:-}"

case "$ACTION" in
    install)
        # gocryptfs userspace FUSE encryption (D-01). The wrapper builds the exact
        # apt argv itself — no caller string enters any command line.
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq gocryptfs
        # `user_allow_other` lets the Samba single-account daemon + Docker read the
        # cleartext mount (unlock uses -allow_other). Idempotent grep-append; a
        # locked folder still presents as empty ciphertext over SMB (acceptable).
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

    create)
        # create <cipherdir> <plaindir> — initialise a NEW encrypted folder. The
        # passphrase (sole KDF factor) arrives on stdin, never argv. gocryptfs -init
        # prints the one-time master recovery key to stdout; we let it through so the
        # route can surface it ONCE. We never persist/log the passphrase or the key.
        CIPHERDIR="${2:-}"
        PLAINDIR="${3:-}"
        [[ -n "$CIPHERDIR" && -n "$PLAINDIR" ]] \
            || { echo "[livos-crypto] create needs <cipherdir> <plaindir>" >&2; exit 2; }
        _validate_path "$CIPHERDIR"
        _validate_path "$PLAINDIR"
        _read_passphrase
        mkdir -p "$CIPHERDIR"
        # -extpass runs `printenv _CRYPTO_PASS` → passphrase to gocryptfs stdin-side,
        # never in an argv. Only the var NAME is visible in the extpass process argv.
        gocryptfs -init -extpass printenv -extpass _CRYPTO_PASS "$CIPHERDIR"
        unset _CRYPTO_PASS
        mkdir -p "$PLAINDIR"
        exit 0
        ;;

    unlock)
        # unlock <cipherdir> <plaindir> — mount an existing encrypted folder. Same
        # fd-not-argv passphrase discipline. -allow_other so Samba/Docker can read.
        CIPHERDIR="${2:-}"
        PLAINDIR="${3:-}"
        [[ -n "$CIPHERDIR" && -n "$PLAINDIR" ]] \
            || { echo "[livos-crypto] unlock needs <cipherdir> <plaindir>" >&2; exit 2; }
        _validate_path "$CIPHERDIR"
        _validate_path "$PLAINDIR"
        _read_passphrase
        mkdir -p "$PLAINDIR"
        gocryptfs -q -extpass printenv -extpass _CRYPTO_PASS -allow_other "$CIPHERDIR" "$PLAINDIR"
        unset _CRYPTO_PASS
        echo unlocked
        exit 0
        ;;

    lock)
        # lock <plaindir> — unmount. On EBUSY (files still open) fusermount fails; we
        # do NOT force (-z would hide an in-use folder from the user) — exit non-zero
        # so the route can report "files still open".
        PLAINDIR="${2:-}"
        [[ -n "$PLAINDIR" ]] || { echo "[livos-crypto] lock needs <plaindir>" >&2; exit 2; }
        _validate_path "$PLAINDIR"
        if fusermount -u "$PLAINDIR"; then
            echo locked
            exit 0
        else
            echo "[livos-crypto] lock failed for '${PLAINDIR}' (files still open?)" >&2
            exit 1
        fi
        ;;

    status)
        # status <plaindir> — read-only mount probe. `set -e` is on, so the no-mount
        # path is guarded (the `||` branch keeps the compound exit 0).
        PLAINDIR="${2:-}"
        [[ -n "$PLAINDIR" ]] || { echo "[livos-crypto] status needs <plaindir>" >&2; exit 2; }
        _validate_path "$PLAINDIR"
        mountpoint -q "$PLAINDIR" && echo mounted || echo locked
        exit 0
        ;;

    *)
        echo "[livos-crypto] invalid action: '${ACTION}' — expected one of: install create unlock lock status" >&2
        exit 2
        ;;
esac
