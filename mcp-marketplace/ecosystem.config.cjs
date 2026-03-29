module.exports = {
  apps: [
    {
      name: 'marketplace',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: '/opt/platform/marketplace',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '256M',
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
}
