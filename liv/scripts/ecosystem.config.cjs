/**
 * PM2 Ecosystem Configuration for Nexus Services
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *
 * Note: Environment variables should be set in /opt/livos/.env
 * The start scripts source this file automatically.
 */
module.exports = {
  apps: [
    {
      name: 'nexus-core',
      script: '/opt/nexus/scripts/start-core.sh',
      interpreter: 'bash',
      cwd: '/opt/nexus/app',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'nexus-memory',
      script: '/opt/livos/nexus/scripts/start-memory.sh',
      interpreter: 'bash',
      cwd: '/opt/livos/nexus/packages/memory',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
