module.exports = {
  apps: [
    {
      name: 'web',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/opt/platform/web',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DATABASE_URL: 'postgresql://platform:LivPlatform2024@127.0.0.1:5432/platform',
        NEXT_PUBLIC_BASE_URL: 'https://livinity.io',
      },
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
}
