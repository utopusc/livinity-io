#!/usr/bin/env bash
# Phase 259 (round 2) — privileged helper for the native-installer `apt-repo`
# install method. Adds a 3rd-party APT repo + its signing key, then refreshes the
# apt cache. This is the ONLY root-capable step the installer needs for repo apps
# (Brave, Signal, Spotify, …); it is allow-listed in /etc/sudoers.d/livos-native
# so the unprivileged `bruce` user can run exactly this (and nothing broader).
#
# Usage (invoked by livinityd as: sudo -n /usr/local/lib/livos/livos-add-apt-repo.sh <name> <keyUrl> <repoLine>):
#   $1 name     — [a-z0-9-] slug; names the keyring + sources.list.d files
#   $2 keyUrl   — https URL to the signing key (armored .asc OR binary .gpg)
#   $3 repoLine — "<https-url> <suite> [components...]" e.g. "https://repo/ stable main"
#
# Deploy:
#   sudo install -m 0755 -o root -g root livos-add-apt-repo.sh /usr/local/lib/livos/livos-add-apt-repo.sh
set -euo pipefail

name="${1:-}"
keyUrl="${2:-}"
repoLine="${3:-}"

# --- Input validation (defense in depth; the caller validates too) ----------
[[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "livos-add-apt-repo: invalid name '$name'" >&2; exit 2; }
[[ "$keyUrl" =~ ^https:// ]]          || { echo "livos-add-apt-repo: key URL must be https" >&2; exit 2; }
[[ "$repoLine" =~ ^https?://[^[:space:]]+[[:space:]]+[^[:space:]]+ ]] || {
	echo "livos-add-apt-repo: repoLine must be '<url> <suite> [components]'" >&2; exit 2; }

keyring="/usr/share/keyrings/livos-${name}.gpg"
listfile="/etc/apt/sources.list.d/livos-${name}.list"

tmpkey="$(mktemp)"
trap 'rm -f "$tmpkey"' EXIT

# --- Fetch + normalize the signing key --------------------------------------
curl -fsSL --proto '=https' "$keyUrl" -o "$tmpkey"
if head -c 64 "$tmpkey" | grep -q 'BEGIN PGP'; then
	# Armored key — dearmor to the binary form `signed-by` expects.
	gpg --dearmor < "$tmpkey" > "$keyring"
else
	# Already a binary keyring.
	install -m 0644 "$tmpkey" "$keyring"
fi
chmod 0644 "$keyring"

# --- Write the sources entry (pinned to this keyring) -----------------------
printf 'deb [arch=amd64 signed-by=%s] %s\n' "$keyring" "$repoLine" > "$listfile"
chmod 0644 "$listfile"

# --- Refresh so the new packages resolve ------------------------------------
DEBIAN_FRONTEND=noninteractive apt-get update
