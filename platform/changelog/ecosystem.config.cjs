module.exports = {
  apps: [
    {
      name: 'changelog',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3002',
      cwd: '/opt/platform/changelog',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
  ],
}
