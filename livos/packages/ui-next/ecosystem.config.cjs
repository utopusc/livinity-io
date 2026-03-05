module.exports = {
  apps: [
    {
      name: 'ui-next',
      script: '.next/standalone/packages/ui-next/server.js',
      cwd: '/opt/livos/livos/packages/ui-next',
      env: {
        PORT: 3002,
        HOSTNAME: '0.0.0.0',
        NODE_ENV: 'production',
        NEXT_PUBLIC_BACKEND_URL: 'http://localhost:80',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
    },
  ],
};
