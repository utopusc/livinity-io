#!/usr/bin/env bash
#
# Phase 204-02 — provider-key-management bootstrap.
#
# Idempotent one-shot script that prepares the Mini PC for the
# /settings → Providers tab:
#
#   1. Installs /etc/sudoers.d/livos-claw-gateway (narrow NOPASSWD grant
#      so livinityd as `bruce` can restart liv-claw-gateway). visudo -c
#      validates before commit; rollback on parse failure.
#
#   2. Creates /opt/livos/etc owned bruce:bruce mode 0700 (EACCES fallback
#      target for the env-file writer per D-204-05).
#
#   3. Patches /etc/systemd/system/liv-claw-gateway.service to add
#      `EnvironmentFile=-/opt/livos/etc/liv-claw-gateway.env` (so the
#      gateway picks up the fallback path when livinityd can't write to
#      /etc/default/). Idempotent — skips if the line is already present.
#
# Re-running the script is safe (no-ops on already-converged state).
#
# Usage on Mini PC (one-shot):
#   sudo bash /opt/livos/scripts/install/204-provider-bootstrap.sh
#
# Or via the next `bash /opt/livos/update.sh` run if that script is
# patched to include the bootstrap (preferred long-term — operator does
# one less manual step).

set -euo pipefail

readonly REPO_ROOT="${REPO_ROOT:-/opt/livos}"
readonly SUDOERS_SRC="${REPO_ROOT}/scripts/install/sudoers.d/livos-claw-gateway"
readonly SUDOERS_DEST="/etc/sudoers.d/livos-claw-gateway"
readonly FALLBACK_DIR="/opt/livos/etc"
readonly FALLBACK_FILE="${FALLBACK_DIR}/liv-claw-gateway.env"
readonly UNIT_PATH="/etc/systemd/system/liv-claw-gateway.service"
readonly FALLBACK_ENV_LINE="EnvironmentFile=-/opt/livos/etc/liv-claw-gateway.env"

log() {
	printf '[Phase 204-02] %s\n' "$*"
}

# ── 1. Sudoers drop-in ────────────────────────────────────────────────────

if [ ! -f "$SUDOERS_SRC" ]; then
	log "ERROR: source file missing: $SUDOERS_SRC" >&2
	exit 1
fi

# Skip if the destination is byte-identical to the source (idempotent re-run).
if [ -f "$SUDOERS_DEST" ] && cmp -s "$SUDOERS_SRC" "$SUDOERS_DEST"; then
	log "sudoers drop-in already current — skipping"
else
	log "installing sudoers drop-in to $SUDOERS_DEST"
	install -m 0440 -o root -g root "$SUDOERS_SRC" "$SUDOERS_DEST"
	# Validate. If visudo refuses, rollback by removing the file (better to
	# break the restart hook than to brick all sudo via a bad drop-in).
	if ! visudo -c -f "$SUDOERS_DEST"; then
		log "ERROR: visudo rejected $SUDOERS_DEST — rolling back" >&2
		rm -f "$SUDOERS_DEST"
		exit 1
	fi
	log "sudoers drop-in installed + validated"
fi

# ── 2. Fallback env-file directory ────────────────────────────────────────

if [ ! -d "$FALLBACK_DIR" ]; then
	log "creating fallback env dir $FALLBACK_DIR (bruce:bruce 0700)"
	mkdir -p "$FALLBACK_DIR"
fi
# Always re-assert ownership + mode. Cheap, defends against accidental
# chmod/chown by other install steps.
chown bruce:bruce "$FALLBACK_DIR"
chmod 0700 "$FALLBACK_DIR"

# Touch the file if missing so livinityd doesn't see ENOENT on first read
# from a cold deploy. Empty file is fine — liv-claw-gateway.service uses
# `EnvironmentFile=-` so missing/empty is harmless.
if [ ! -f "$FALLBACK_FILE" ]; then
	log "creating empty fallback env file $FALLBACK_FILE (bruce:bruce 0600)"
	touch "$FALLBACK_FILE"
	chown bruce:bruce "$FALLBACK_FILE"
	chmod 0600 "$FALLBACK_FILE"
fi

# ── 3. Patch the systemd unit ─────────────────────────────────────────────

if [ ! -f "$UNIT_PATH" ]; then
	log "WARNING: $UNIT_PATH does not exist yet — Plan 203-03 unit must be installed first; skipping unit patch"
elif grep -qF "$FALLBACK_ENV_LINE" "$UNIT_PATH"; then
	log "systemd unit already references the fallback env file — skipping patch"
else
	log "patching $UNIT_PATH with $FALLBACK_ENV_LINE"
	# Insert the fallback line immediately after the existing primary
	# EnvironmentFile=- line. If that anchor is missing, append before
	# [Install].
	if grep -q '^EnvironmentFile=-/etc/default/liv-claw-gateway' "$UNIT_PATH"; then
		# sed -i with a portable anchor. The `a` append uses GNU sed syntax
		# (Mini PC = Ubuntu 24.04). On macOS this would need -i ''.
		sed -i "/^EnvironmentFile=-\/etc\/default\/liv-claw-gateway/a ${FALLBACK_ENV_LINE}" "$UNIT_PATH"
	else
		# No primary anchor — append before [Install] or to end of [Service].
		if grep -q '^\[Install\]' "$UNIT_PATH"; then
			sed -i "/^\[Install\]/i ${FALLBACK_ENV_LINE}\n" "$UNIT_PATH"
		else
			printf '\n%s\n' "$FALLBACK_ENV_LINE" >>"$UNIT_PATH"
		fi
	fi
	log "reloading systemd to pick up unit changes"
	systemctl daemon-reload
fi

log "bootstrap complete. To verify:"
log "  sudo -n -u bruce sudo /bin/systemctl status liv-claw-gateway >/dev/null && echo 'sudoers OK'"
log "  stat -c '%a %U' /opt/livos/etc"
