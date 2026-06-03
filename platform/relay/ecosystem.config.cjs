module.exports = {
  apps: [
    {
      name: 'relay',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: '/opt/platform/relay',
      env: {
        NODE_ENV: 'production',
        RELAY_PORT: 4000,
        RELAY_HOST: 'livinity.io',
        // LIVOS-021: read DB/Redis URLs from the PM2 process environment / env
        // file — never commit live platform credentials to the repo.
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
      },
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
}
