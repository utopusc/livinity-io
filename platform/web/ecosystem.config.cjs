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
        // LIVOS-021: read DATABASE_URL from the PM2 process environment / env file
        // — never commit the live platform DB credential to the repo.
        DATABASE_URL: process.env.DATABASE_URL,
        NEXT_PUBLIC_BASE_URL: 'https://livinity.io',
      },
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
}
