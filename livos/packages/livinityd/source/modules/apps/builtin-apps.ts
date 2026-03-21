/**
 * LivOS Built-in Apps
 * 11 Priority apps with official Docker images and native compose definitions
 */

export interface ComposeServiceDef {
  image: string
  restart: string
  container_name?: string
  environment?: Record<string, string>
  volumes?: string[]
  ports?: string[]
  healthcheck?: {
    test: string[]
    interval: string
    timeout: string
    retries: number
    start_period?: string
  }
  network_mode?: string
  privileged?: boolean
  devices?: string[]
  depends_on?: string[]
  command?: string[]
}

export interface ComposeDefinition {
  mainService: string
  services: Record<string, ComposeServiceDef>
}

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
  compose: ComposeDefinition
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'n8nio/n8n:latest',
          restart: 'unless-stopped',
          environment: {
            N8N_BASIC_AUTH_ACTIVE: 'true',
            GENERIC_TIMEZONE: 'Europe/Istanbul',
          },
          volumes: ['${APP_DATA_DIR}/data:/home/node/.n8n'],
          ports: ['127.0.0.1:5678:5678'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:5678/healthz || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
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
    compose: {
      mainService: 'portainer',
      services: {
        docker: {
          image: 'docker:dind',
          restart: 'unless-stopped',
          environment: {
            DOCKER_TLS_CERTDIR: '',
          },
          volumes: ['${APP_DATA_DIR}/docker-data:/var/lib/docker'],
          network_mode: 'host',
          privileged: true,
        },
        portainer: {
          image: 'portainer/portainer-ce:latest',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/data:/data', '/var/run/docker.sock:/var/run/docker.sock'],
          ports: ['127.0.0.1:9000:9000'],
        },
      },
    },
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'homeassistant/home-assistant:stable',
          restart: 'unless-stopped',
          environment: {
            TZ: 'Europe/Istanbul',
          },
          volumes: ['${APP_DATA_DIR}/config:/config'],
          ports: ['127.0.0.1:8123:8123'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:8123/api/ || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '60s',
          },
        },
      },
    },
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'jellyfin/jellyfin:latest',
          restart: 'unless-stopped',
          volumes: [
            '${APP_DATA_DIR}/config:/config',
            '${APP_DATA_DIR}/cache:/cache',
            '${APP_DATA_DIR}/media:/media',
          ],
          ports: ['127.0.0.1:8096:8096'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:8096/health || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
    },
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'nextcloud:latest',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/html:/var/www/html'],
          ports: ['127.0.0.1:8080:80'],
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost:80/status.php || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '60s',
          },
        },
      },
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'codercom/code-server:latest',
          restart: 'unless-stopped',
          volumes: [
            '${APP_DATA_DIR}/config:/home/coder/.config',
            '${APP_DATA_DIR}/project:/home/coder/project',
          ],
          ports: ['127.0.0.1:8081:8080'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:8080/healthz || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'louislam/uptime-kuma:latest',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/data:/app/data'],
          ports: ['127.0.0.1:3001:3001'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:3001/ || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
    },
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'gitea/gitea:latest',
          restart: 'unless-stopped',
          environment: {
            USER_UID: '1000',
            USER_GID: '1000',
          },
          volumes: ['${APP_DATA_DIR}/data:/data'],
          ports: ['127.0.0.1:3000:3000'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:3000/api/v1/version || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
    },
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'grafana/grafana:latest',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/data:/var/lib/grafana'],
          ports: ['127.0.0.1:3002:3000'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:3000/api/health || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'postgres:16',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/data:/var/lib/postgresql/data'],
          ports: ['127.0.0.1:5432:5432'],
          healthcheck: {
            test: ['CMD-SHELL', 'pg_isready -U postgres || exit 1'],
            interval: '10s',
            timeout: '5s',
            retries: 5,
            start_period: '30s',
          },
        },
      },
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
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'lscr.io/linuxserver/chromium:latest',
          restart: 'unless-stopped',
          environment: {
            CUSTOM_USER: '',
            PASSWORD: '',
            PROXY_URL: '',
            TZ: 'Europe/Istanbul',
          },
          volumes: ['${APP_DATA_DIR}/config:/config'],
          ports: ['127.0.0.1:3000:3000'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:3000/ || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
    },
  },
  {
    id: 'ollama',
    name: 'Ollama',
    tagline: 'Run any LLM locally with one command',
    version: '0.6.0',
    category: 'ai',
    port: 11434,
    description: 'Run large language models locally — Llama 3, Mistral, Gemma, Phi, and more. REST API compatible with OpenAI format. GPU acceleration with NVIDIA and AMD. One command to pull and run any model.',
    website: 'https://ollama.com',
    developer: 'Ollama',
    icon: 'https://ollama.com/public/ollama.png',
    docker: {
      image: 'ollama/ollama:latest',
      volumes: ['/root/.ollama'],
    },
    installOptions: {subdomain: 'ollama'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'ollama/ollama:latest',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/models:/root/.ollama'],
          ports: ['127.0.0.1:11434:11434'],
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost:11434/ || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
    },
  },
  {
    id: 'open-webui',
    name: 'Open WebUI',
    tagline: 'ChatGPT-style UI for your local AI models',
    version: '0.6.0',
    category: 'ai',
    port: 3100,
    description: 'Beautiful ChatGPT-like interface for Ollama and any OpenAI-compatible API. Multi-user support, RAG pipeline with document ingestion, conversation history, and model management. Connect to your local Ollama instance or external APIs.',
    website: 'https://openwebui.com',
    developer: 'Open WebUI',
    icon: 'https://docs.openwebui.com/img/logo.png',
    docker: {
      image: 'ghcr.io/open-webui/open-webui:main',
      environment: {
        OLLAMA_BASE_URL: 'http://host.docker.internal:11434',
      },
      volumes: ['/app/backend/data'],
    },
    installOptions: {
      subdomain: 'chat',
      environmentOverrides: [
        {name: 'OLLAMA_BASE_URL', label: 'Ollama API URL', type: 'string', default: 'http://host.docker.internal:11434', required: false},
        {name: 'OPENAI_API_KEY', label: 'OpenAI API Key (optional)', type: 'password', default: '', required: false},
      ],
    },
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'ghcr.io/open-webui/open-webui:main',
          restart: 'unless-stopped',
          environment: {
            OLLAMA_BASE_URL: 'http://host.docker.internal:11434',
          },
          volumes: ['${APP_DATA_DIR}/data:/app/backend/data'],
          ports: ['127.0.0.1:3100:8080'],
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost:8080/ || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '60s',
          },
        },
      },
    },
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    tagline: 'Lightweight Bitwarden-compatible password manager',
    version: '1.32.0',
    category: 'security',
    port: 8180,
    description: 'Self-hosted password manager compatible with all Bitwarden clients (browser, mobile, desktop). Written in Rust — uses only 10MB RAM. Supports TOTP, WebAuthn, emergency access, and organizations. Your passwords never leave your server.',
    website: 'https://github.com/dani-garcia/vaultwarden',
    developer: 'dani-garcia',
    icon: 'https://raw.githubusercontent.com/dani-garcia/vaultwarden/main/resources/vaultwarden-icon.svg',
    docker: {
      image: 'vaultwarden/server:latest',
      volumes: ['/data'],
    },
    installOptions: {subdomain: 'vault'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'vaultwarden/server:latest',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/data:/data'],
          ports: ['127.0.0.1:8180:80'],
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost:80/alive || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '15s',
          },
        },
      },
    },
  },
  {
    id: 'immich',
    name: 'Immich',
    tagline: 'High-performance Google Photos alternative',
    version: '1.127.0',
    category: 'photography',
    port: 2283,
    description: 'Self-hosted photo and video management solution with mobile backup apps for iOS and Android. AI-powered face recognition, object detection, timeline and album views, partner sharing, and hardware-transcoded video playback.',
    website: 'https://immich.app',
    developer: 'Immich',
    icon: 'https://raw.githubusercontent.com/immich-app/immich/main/docs/static/img/favicon.png',
    docker: {
      image: 'ghcr.io/imagegenius/immich:latest',
      volumes: ['/config', '/photos'],
    },
    installOptions: {subdomain: 'photos'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'ghcr.io/imagegenius/immich:latest',
          restart: 'unless-stopped',
          environment: {
            PUID: '1000',
            PGID: '1000',
            TZ: 'UTC',
            DB_DATA_LOCATION: '/config/db',
          },
          volumes: ['${APP_DATA_DIR}/config:/config', '${APP_DATA_DIR}/photos:/photos'],
          ports: ['127.0.0.1:2283:8080'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:8080/api/server/ping || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '60s',
          },
        },
      },
    },
  },
  {
    id: 'syncthing',
    name: 'Syncthing',
    tagline: 'Continuous peer-to-peer file sync without any cloud',
    version: '1.28.0',
    category: 'files',
    port: 8384,
    description: 'Continuous file synchronization program that synchronizes files between two or more computers in real time. End-to-end encrypted, works across LAN and internet, no cloud needed. Selective sync and file versioning.',
    website: 'https://syncthing.net',
    developer: 'Syncthing Foundation',
    icon: 'https://raw.githubusercontent.com/syncthing/syncthing/main/assets/logo-text-128.png',
    docker: {
      image: 'syncthing/syncthing:latest',
      volumes: ['/var/syncthing'],
    },
    installOptions: {subdomain: 'sync'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'syncthing/syncthing:latest',
          restart: 'unless-stopped',
          environment: {
            PUID: '1000',
            PGID: '1000',
          },
          volumes: ['${APP_DATA_DIR}/config:/var/syncthing/config', '${APP_DATA_DIR}/data:/var/syncthing/data'],
          ports: ['127.0.0.1:8384:8384', '22000:22000/tcp', '22000:22000/udp', '21027:21027/udp'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:8384/rest/noauth/health || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '15s',
          },
        },
      },
    },
  },
  {
    id: 'filebrowser',
    name: 'File Browser',
    tagline: 'Browse and manage files on your server from any browser',
    version: '2.31.0',
    category: 'files',
    port: 8070,
    description: 'Web-based file manager for your server. Upload, download, rename, delete, and archive files. Multi-user with per-user scoped directories. In-browser text and image preview, share links with expiry.',
    website: 'https://filebrowser.org',
    developer: 'FileBrowser',
    icon: 'https://raw.githubusercontent.com/filebrowser/logo/master/icon_raw.svg',
    docker: {
      image: 'filebrowser/filebrowser:latest',
      volumes: ['/srv', '/database', '/config'],
    },
    installOptions: {subdomain: 'files'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'filebrowser/filebrowser:latest',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/srv:/srv', '${APP_DATA_DIR}/database:/database', '${APP_DATA_DIR}/config:/config'],
          ports: ['127.0.0.1:8070:80'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:80/health || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '10s',
          },
        },
      },
    },
  },
  {
    id: 'paperless-ngx',
    name: 'Paperless-ngx',
    tagline: 'OCR-powered document management — go paperless',
    version: '2.14.0',
    category: 'productivity',
    port: 8000,
    description: 'Document management system that transforms your physical documents into a searchable online archive. OCR-powered auto-tagging, full-text search, email import, and folder watching. Never lose a document again.',
    website: 'https://docs.paperless-ngx.com',
    developer: 'Paperless-ngx',
    icon: 'https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/resources/logo/web/svg/Color%20logo%20-%20no%20background.svg',
    docker: {
      image: 'lscr.io/linuxserver/paperless-ngx:latest',
      volumes: ['/config', '/data'],
    },
    installOptions: {subdomain: 'docs'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'lscr.io/linuxserver/paperless-ngx:latest',
          restart: 'unless-stopped',
          environment: {
            PUID: '1000',
            PGID: '1000',
            TZ: 'UTC',
          },
          volumes: ['${APP_DATA_DIR}/config:/config', '${APP_DATA_DIR}/data:/data'],
          ports: ['127.0.0.1:8000:8000'],
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost:8000/ || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '60s',
          },
        },
      },
    },
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    tagline: 'Autonomous AI agent that runs on your machine',
    version: '1.0.0',
    category: 'ai',
    port: 18789,
    description: 'Free and open-source autonomous AI agent. Connects to WhatsApp, Telegram, Slack, Discord, Signal, and more. Manages files, controls browsers, sends messages, automates workflows. Supports any LLM including local models via Ollama. MIT licensed.',
    website: 'https://openclaws.io',
    developer: 'OpenClaw',
    icon: 'https://raw.githubusercontent.com/openclaw/openclaw/main/docs/static/img/logo.png',
    docker: {
      image: 'alpine/openclaw:latest',
      volumes: ['/data'],
    },
    installOptions: {subdomain: 'agent'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'alpine/openclaw:latest',
          restart: 'unless-stopped',
          environment: {
            OPENCLAW_MODE: 'gateway',
            OPENCLAW_HOST: '0.0.0.0',
          },
          volumes: ['${APP_DATA_DIR}/data:/home/node/.openclaw', '${APP_DATA_DIR}/workspace:/workspace'],
          ports: ['127.0.0.1:18789:18789'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:18789/healthz || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
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
