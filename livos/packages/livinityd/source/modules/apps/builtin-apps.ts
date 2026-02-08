/**
 * LivOS Built-in Apps
 * 10 Priority apps with official Docker images
 */
export interface BuiltinAppManifest {
  id: string
  name: string
  tagline: string
  version: string
  category: string
  port: number
  description: string
  website: string
  developer: string
  icon: string
  docker: {
    image: string
    environment?: Record<string, string>
    volumes?: string[]
  }
  installOptions?: {
    subdomain?: string
    environmentOverrides?: Array<{
      name: string
      label: string
      type: 'string' | 'password'
      default?: string
      required?: boolean
    }>
  }
}

export const BUILTIN_APPS: BuiltinAppManifest[] = [
  {
    id: 'n8n',
    name: 'n8n',
    tagline: 'Workflow automation tool',
    version: '1.0.0',
    category: 'automation',
    port: 5678,
    description: 'n8n is an extendable workflow automation tool. With a fair-code distribution model, n8n will always have visible source code, be available to self-host, and allow you to add your own custom functions, logic and apps.',
    website: 'https://n8n.io',
    developer: 'n8n GmbH',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/n8n/icon.svg',
    docker: {
      image: 'n8nio/n8n:latest',
      environment: {
        N8N_BASIC_AUTH_ACTIVE: 'true',
        GENERIC_TIMEZONE: 'Europe/Istanbul',
      },
      volumes: ['/home/node/.n8n'],
    },
    installOptions: {
      subdomain: 'n8n',
      environmentOverrides: [
        { name: 'N8N_BASIC_AUTH_USER', label: 'Admin Username', type: 'string', default: 'admin', required: true },
        { name: 'N8N_BASIC_AUTH_PASSWORD', label: 'Admin Password', type: 'password', required: true },
      ],
    },
  },
  {
    id: 'portainer',
    name: 'Portainer',
    tagline: 'Container management made easy',
    version: '2.19.0',
    category: 'developer-tools',
    port: 9000,
    description: 'Portainer is a lightweight management UI which allows you to easily manage your Docker environments.',
    website: 'https://www.portainer.io',
    developer: 'Portainer.io',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/portainer/icon.svg',
    docker: {
      image: 'portainer/portainer-ce:latest',
      volumes: ['/data', '/var/run/docker.sock:/var/run/docker.sock'],
    },
    installOptions: { subdomain: 'portainer' },
  },
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    tagline: 'Open source home automation',
    version: '2024.1.0',
    category: 'automation',
    port: 8123,
    description: 'Home Assistant is a free and open-source software for home automation designed to be a central control system for smart home devices.',
    website: 'https://www.home-assistant.io',
    developer: 'Home Assistant',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/home-assistant/icon.svg',
    docker: {
      image: 'homeassistant/home-assistant:stable',
      environment: { TZ: 'Europe/Istanbul' },
      volumes: ['/config'],
    },
    installOptions: { subdomain: 'home' },
  },
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    tagline: 'The Free Software Media System',
    version: '10.8.0',
    category: 'media',
    port: 8096,
    description: 'Jellyfin is a Free Software Media System that puts you in control of managing and streaming your media.',
    website: 'https://jellyfin.org',
    developer: 'Jellyfin Contributors',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/jellyfin/icon.svg',
    docker: {
      image: 'jellyfin/jellyfin:latest',
      volumes: ['/config', '/cache', '/media'],
    },
    installOptions: { subdomain: 'media' },
  },
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    tagline: 'A safe home for all your data',
    version: '28.0.0',
    category: 'files',
    port: 8080,
    description: 'Nextcloud Hub is the industry-leading, fully open-source, on-premises content collaboration platform.',
    website: 'https://nextcloud.com',
    developer: 'Nextcloud GmbH',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/nextcloud/icon.svg',
    docker: {
      image: 'nextcloud:latest',
      volumes: ['/var/www/html'],
    },
    installOptions: {
      subdomain: 'cloud',
      environmentOverrides: [
        { name: 'NEXTCLOUD_ADMIN_USER', label: 'Admin Username', type: 'string', default: 'admin', required: true },
        { name: 'NEXTCLOUD_ADMIN_PASSWORD', label: 'Admin Password', type: 'password', required: true },
      ],
    },
  },
  {
    id: 'code-server',
    name: 'Code Server',
    tagline: 'VS Code in the browser',
    version: '4.20.0',
    category: 'developer-tools',
    port: 8081,
    description: 'Run VS Code on any machine anywhere and access it in the browser.',
    website: 'https://coder.com',
    developer: 'Coder',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/code-server/icon.svg',
    docker: {
      image: 'codercom/code-server:latest',
      volumes: ['/home/coder/.config', '/home/coder/project'],
    },
    installOptions: {
      subdomain: 'code',
      environmentOverrides: [
        { name: 'PASSWORD', label: 'Access Password', type: 'password', required: true },
      ],
    },
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    tagline: 'Self-hosted monitoring tool',
    version: '1.23.0',
    category: 'monitoring',
    port: 3001,
    description: 'Uptime Kuma is a fancy self-hosted monitoring tool like "Uptime Robot".',
    website: 'https://uptime.kuma.pet',
    developer: 'Louis Lam',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/uptime-kuma/icon.svg',
    docker: {
      image: 'louislam/uptime-kuma:latest',
      volumes: ['/app/data'],
    },
    installOptions: { subdomain: 'status' },
  },
  {
    id: 'gitea',
    name: 'Gitea',
    tagline: 'Git with a cup of tea',
    version: '1.21.0',
    category: 'developer-tools',
    port: 3000,
    description: 'Gitea is a painless self-hosted Git service similar to GitHub, Bitbucket, and GitLab.',
    website: 'https://gitea.io',
    developer: 'Gitea',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/gitea/icon.svg',
    docker: {
      image: 'gitea/gitea:latest',
      environment: { USER_UID: '1000', USER_GID: '1000' },
      volumes: ['/data'],
    },
    installOptions: { subdomain: 'git' },
  },
  {
    id: 'grafana',
    name: 'Grafana',
    tagline: 'The open observability platform',
    version: '10.2.0',
    category: 'monitoring',
    port: 3002,
    description: 'Grafana allows you to query, visualize, alert on and understand your metrics.',
    website: 'https://grafana.com',
    developer: 'Grafana Labs',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/grafana/icon.svg',
    docker: {
      image: 'grafana/grafana:latest',
      volumes: ['/var/lib/grafana'],
    },
    installOptions: {
      subdomain: 'grafana',
      environmentOverrides: [
        { name: 'GF_SECURITY_ADMIN_USER', label: 'Admin Username', type: 'string', default: 'admin', required: true },
        { name: 'GF_SECURITY_ADMIN_PASSWORD', label: 'Admin Password', type: 'password', required: true },
      ],
    },
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    tagline: 'Advanced Open Source Database',
    version: '16.0',
    category: 'database',
    port: 5432,
    description: 'PostgreSQL is a powerful, open source object-relational database system.',
    website: 'https://www.postgresql.org',
    developer: 'PostgreSQL Global Development Group',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/postgresql/icon.svg',
    docker: {
      image: 'postgres:16',
      volumes: ['/var/lib/postgresql/data'],
    },
    installOptions: {
      environmentOverrides: [
        { name: 'POSTGRES_USER', label: 'Username', type: 'string', default: 'postgres', required: true },
        { name: 'POSTGRES_PASSWORD', label: 'Password', type: 'password', required: true },
        { name: 'POSTGRES_DB', label: 'Database Name', type: 'string', default: 'postgres', required: true },
      ],
    },
  },
  {
    id: 'chromium',
    name: 'Chrome',
    tagline: 'Persistent web browser with AI control',
    version: '1.0.0',
    category: 'networking',
    port: 3000,
    description: 'A persistent Chromium browser running in Docker with Selkies web viewer. Sessions survive restarts — stay logged into Google, Facebook, and other sites. Includes Playwright MCP for AI-powered browser automation via LivOS. Anti-detection flags prevent automation fingerprinting.',
    website: 'https://www.chromium.org/Home/',
    developer: 'Livinity',
    icon: 'https://raw.githubusercontent.com/alrra/browser-logos/main/src/chrome/chrome.svg',
    docker: {
      image: 'lscr.io/linuxserver/chromium:latest',
      environment: {
        CUSTOM_USER: '',
        PASSWORD: '',
        PROXY_URL: '',
        TZ: 'Europe/Istanbul',
      },
      volumes: ['/config'],
    },
    installOptions: {
      subdomain: 'chrome',
      environmentOverrides: [
        { name: 'CUSTOM_USER', label: 'Username', type: 'string', required: true },
        { name: 'PASSWORD', label: 'Password', type: 'password', required: true },
        { name: 'PROXY_URL', label: 'Proxy URL (e.g. socks5://host:port)', type: 'string', default: '', required: false },
      ],
    },
  },
]

export function getBuiltinApp(appId: string): BuiltinAppManifest | undefined {
  return BUILTIN_APPS.find(app => app.id === appId)
}

export function getBuiltinAppsByCategory(category: string): BuiltinAppManifest[] {
  if (category === 'all') return BUILTIN_APPS
  return BUILTIN_APPS.filter(app => app.category === category)
}

export function searchBuiltinApps(query: string): BuiltinAppManifest[] {
  const q = query.toLowerCase()
  return BUILTIN_APPS.filter(app =>
    app.name.toLowerCase().includes(q) ||
    app.tagline.toLowerCase().includes(q) ||
    app.description.toLowerCase().includes(q)
  )
}
