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
        DATABASE_URL: 'postgresql://platform:LivPlatform2024@127.0.0.1:5432/platform',
        REDIS_URL: 'redis://:680542add448464d754a6303418580ecf678ab8be15e2625@localhost:6379',
      },
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
}
