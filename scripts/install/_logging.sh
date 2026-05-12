# scripts/install/_logging.sh
# Sourced by scripts/install.sh and all mode-*.sh helpers.
# Provides: info() ok() warn() fail() step() set_livos_redis_key()
# Source: livos/install.sh lines 19-47 (color + helper idiom).

# Color codes (NO_COLOR env disables; stderr-only output keeps stdout clean for
# any future piping consumer)
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 2 ]]; then
    _C_RED='\033[0;31m'
    _C_GREEN='\033[0;32m'
    _C_YELLOW='\033[1;33m'
    _C_BLUE='\033[0;34m'
    _C_CYAN='\033[0;36m'
    _C_NC='\033[0m'
else
    _C_RED=''; _C_GREEN=''; _C_YELLOW=''; _C_BLUE=''; _C_CYAN=''; _C_NC=''
fi

info() { echo -e "${_C_BLUE}[INFO]${_C_NC}  $*" >&2; }
ok()   { echo -e "${_C_GREEN}[OK]${_C_NC}    $*" >&2; }
warn() { echo -e "${_C_YELLOW}[WARN]${_C_NC}  $*" >&2; }
fail() { echo -e "${_C_RED}[FAIL]${_C_NC}  $*" >&2; exit "${2:-1}"; }
step() { echo -e "\n${_C_CYAN}=== $* ===${_C_NC}" >&2; }

# set_livos_redis_key KEY VALUE
# Writes to Redis if reachable; otherwise queues to a deferred file consumed by
# livinityd on boot (livinityd is not yet running at install.sh time — Redis
# may not be reachable inside the UAT container either).
#
# The pending file is line-keyed: re-running install.sh with the same arguments
# overwrites the prior KEY=VALUE line rather than appending duplicates — this
# is the contract that AC-104-2 (idempotency diff) depends on.
set_livos_redis_key() {
    local key="$1" value="$2"
    if command -v redis-cli &>/dev/null && redis-cli ping 2>/dev/null | grep -q '^PONG$'; then
        redis-cli set "$key" "$value" >/dev/null && ok "Redis: ${key}=${value}"
    else
        local pending="/var/lib/livos/install-pending-redis-keys.txt"
        mkdir -p "$(dirname "$pending")"
        # Idempotent: remove any prior line for this key, then append
        if [[ -f "$pending" ]]; then
            grep -v "^${key}=" "$pending" > "${pending}.new" || true
            mv -f "${pending}.new" "$pending"
        fi
        echo "${key}=${value}" >> "$pending"
        ok "Redis queued: ${key}=${value} (will apply on livinityd boot)"
    fi
}
