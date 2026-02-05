// PM2 Ecosystem config for LivOS (unified — 6 services)
// Path configuration via environment variables with sensible defaults
const LIVOS_BASE = process.env.LIVOS_BASE_DIR || '/opt/livos';
const LIVOS_DATA = process.env.LIVOS_DATA_DIR || `${LIVOS_BASE}/data`;
const LIVOS_LOGS = process.env.LIVOS_LOGS_DIR || `${LIVOS_BASE}/logs`;

module.exports = {
  apps: [
    // ── LivOS daemon ──────────────────────────────────────
    {
      name: 'livos',
      script: 'source/cli.ts',
      interpreter: 'tsx',
      cwd: `${LIVOS_BASE}/packages/livinityd`,
      args: `--data-directory ${LIVOS_DATA} --port 8080`,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      log_file: `${LIVOS_LOGS}/livos.log`,
      error_file: `${LIVOS_LOGS}/livos-error.log`,
      out_file: `${LIVOS_LOGS}/livos-out.log`,
    },

    // ── Liv AI Core ─────────────────────────────────────
    {
      name: 'liv-core',
      script: 'packages/core/dist/index.js',
      cwd: `${LIVOS_BASE}/packages/liv`,
      env: {
        NODE_ENV: 'production',
        DAEMON_INTERVAL_MS: '30000',
      },
      max_memory_restart: '500M',
      log_file: `${LIVOS_LOGS}/liv-core.log`,
      error_file: `${LIVOS_LOGS}/liv-core-error.log`,
    },

    // ── Liv MCP Server ──────────────────────────────────

    // ── Liv Worker ──────────────────────────────────────
    {
      name: 'liv-worker',
      script: 'packages/worker/dist/index.js',
      cwd: `${LIVOS_BASE}/packages/liv`,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      log_file: `${LIVOS_LOGS}/liv-worker.log`,
      error_file: `${LIVOS_LOGS}/liv-worker-error.log`,
    },

    // ── Liv Memory (Python) ─────────────────────────────
    {
      name: 'liv-memory',
      interpreter: `${LIVOS_BASE}/packages/liv/packages/memory/venv/bin/python3`,
      script: 'packages/memory/src/server.py',
      cwd: `${LIVOS_BASE}/packages/liv`,
      env: {
        MEMORY_PORT: '3300',
      },
      max_memory_restart: '500M',
      log_file: `${LIVOS_LOGS}/liv-memory.log`,
      error_file: `${LIVOS_LOGS}/liv-memory-error.log`,
    },
  ],
};
