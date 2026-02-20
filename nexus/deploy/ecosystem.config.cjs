// PM2 Ecosystem config for Nexus
module.exports = {
  apps: [
    {
      name: 'nexus-core',
      script: 'packages/core/dist/index.js',
      cwd: '/opt/nexus/app',
      env: {
        NODE_ENV: 'production',
        DAEMON_INTERVAL_MS: '30000',
      },
      autorestart: true,
      max_memory_restart: '500M',
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      listen_timeout: 10000,
      log_file: '/opt/nexus/logs/core.log',
      error_file: '/opt/nexus/logs/core-error.log',
    },
    {
      name: 'nexus-mcp',
      script: 'packages/mcp-server/dist/index.js',
      cwd: '/opt/nexus/app',
      env: {
        NODE_ENV: 'production',
        MCP_PORT: '3100',
      },
      max_memory_restart: '300M',
      log_file: '/opt/nexus/logs/mcp.log',
      error_file: '/opt/nexus/logs/mcp-error.log',
    },
    {
      name: 'nexus-whatsapp',
      script: 'packages/whatsapp/dist/index.js',
      cwd: '/opt/nexus/app',
      env: {
        NODE_ENV: 'production',
        WHATSAPP_ENABLED: 'true',
      },
      max_memory_restart: '300M',
      log_file: '/opt/nexus/logs/whatsapp.log',
      error_file: '/opt/nexus/logs/whatsapp-error.log',
    },
    {
      name: 'nexus-worker',
      script: 'packages/worker/dist/index.js',
      cwd: '/opt/nexus/app',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      log_file: '/opt/nexus/logs/worker.log',
      error_file: '/opt/nexus/logs/worker-error.log',
    },
    {
      name: 'nexus-memory',
      interpreter: '/opt/nexus/venv/bin/python3',
      script: 'packages/memory/src/server.py',
      cwd: '/opt/nexus/app',
      env: {
        MEMORY_PORT: '3300',
      },
      max_memory_restart: '500M',
      log_file: '/opt/nexus/logs/memory.log',
      error_file: '/opt/nexus/logs/memory-error.log',
    },
  ],
};
