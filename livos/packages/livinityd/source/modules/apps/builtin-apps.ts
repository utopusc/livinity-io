/**
 * LivOS Built-in Apps
 * 28 Built-in apps with official Docker images and native compose definitions
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
  user?: string
  shm_size?: string
  security_opt?: string[]
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
  repo?: string
  // Phase 43.3: when true, propagated into livinity-app.yml manifest so
  // apps.ts:install() Phase 43.2 inject auto-adds 5 broker env vars +
  // extra_hosts to this app's compose at install time. App container then
  // reaches the user's Claude subscription via livinity-broker without any
  // LLM-key prompt inside the app's UI.
  requiresAiProvider?: boolean
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
  defaultUsername?: string
  defaultPassword?: string
  deterministicPassword?: boolean
  native?: boolean          // true = managed via systemd, not Docker
  nativePort?: number       // the noVNC/streaming port (for Caddy proxy)
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
    defaultUsername: 'admin',
    deterministicPassword: true,
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
    port: 8085,
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
          ports: ['127.0.0.1:8085:80'],
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
            test: ['CMD-SHELL', 'node -e "const h=require(\'http\');h.get(\'http://localhost:3001\',r=>{process.exit(r.statusCode===200||r.statusCode===302?0:1)}).on(\'error\',()=>process.exit(1))"'],
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
    defaultUsername: 'admin',
    defaultPassword: 'admin',
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
    icon: 'https://raw.githubusercontent.com/open-webui/open-webui/main/static/favicon.png',
    // Phase 43.5: opt into broker auto-injection so install via the BUILTIN
    // path also gets `OPENAI_API_BASE_URL=http://livinity-broker:.../v1`
    // (Phase 43.2 inject only fires when this flag is true on the manifest
    // resolved at install time). Without the flag, Open WebUI starts with
    // OPENAI_API_BASE_URL='https://api.openai.com/v1' and never reaches the
    // user's Claude subscription.
    requiresAiProvider: true,
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
    defaultUsername: 'admin',
    defaultPassword: 'admin',
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
          environment: {
            PUID: '0',
            PGID: '0',
          },
          volumes: ['${APP_DATA_DIR}/srv:/srv', '${APP_DATA_DIR}/database.db:/database.db', '${APP_DATA_DIR}/filebrowser.json:/.filebrowser.json'],
          ports: ['127.0.0.1:8070:80'],
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
    id: 'adguard-home',
    name: 'AdGuard Home',
    tagline: 'Network-wide ad and tracker blocking DNS server',
    version: '0.107.0',
    category: 'privacy',
    port: 3003,
    description: 'AdGuard Home is a network-wide software for blocking ads and tracking. After you set it up, it covers ALL your home devices without needing any client-side software. DNS-over-HTTPS, DNS-over-TLS, DHCP server, query log, and parental controls.',
    website: 'https://adguard.com/adguard-home.html',
    developer: 'AdGuard',
    icon: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/client/public/assets/favicon.png',
    docker: {
      image: 'adguard/adguardhome:latest',
      volumes: ['/opt/adguardhome/work', '/opt/adguardhome/conf'],
    },
    installOptions: {subdomain: 'adguard'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'adguard/adguardhome:latest',
          restart: 'unless-stopped',
          volumes: [
            '${APP_DATA_DIR}/work:/opt/adguardhome/work',
            '${APP_DATA_DIR}/conf:/opt/adguardhome/conf',
          ],
          ports: ['127.0.0.1:3003:3000'],
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
    id: 'wireguard-easy',
    name: 'WireGuard Easy',
    tagline: 'Simple WireGuard VPN server with web UI',
    version: '14',
    category: 'privacy',
    port: 51821,
    description: 'WireGuard Easy provides a simple web interface to manage your WireGuard VPN server. Create and manage clients with QR codes, view transfer statistics, and enable/disable clients — all from a beautiful web UI.',
    website: 'https://github.com/wg-easy/wg-easy',
    developer: 'wg-easy',
    icon: 'https://raw.githubusercontent.com/wg-easy/wg-easy/master/src/www/img/logo.png',
    docker: {
      image: 'ghcr.io/wg-easy/wg-easy:latest',
      environment: {
        LANG: 'en',
      },
      volumes: ['/etc/wireguard'],
    },
    installOptions: {
      subdomain: 'vpn',
      environmentOverrides: [
        {name: 'WG_HOST', label: 'Server Public IP or Domain', type: 'string', required: true},
        {name: 'PASSWORD_HASH', label: 'Admin Password (bcrypt hash)', type: 'password', required: true},
      ],
    },
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'ghcr.io/wg-easy/wg-easy:latest',
          restart: 'unless-stopped',
          environment: {
            LANG: 'en',
          },
          volumes: ['${APP_DATA_DIR}/config:/etc/wireguard'],
          ports: ['127.0.0.1:51821:51821', '51820:51820/udp'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:51821/ || exit 1'],
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
    id: 'navidrome',
    name: 'Navidrome',
    tagline: 'Modern music server and streamer',
    version: '0.53.0',
    category: 'media',
    port: 4533,
    description: 'Navidrome is an open source web-based music collection server and streamer. It gives you freedom to listen to your music collection from any browser or mobile device. Compatible with Subsonic/Airsonic clients.',
    website: 'https://www.navidrome.org',
    developer: 'Navidrome',
    icon: 'https://raw.githubusercontent.com/navidrome/navidrome/master/resources/logo-192x192.png',
    docker: {
      image: 'deluan/navidrome:latest',
      environment: {
        ND_SCANSCHEDULE: '1h',
        ND_LOGLEVEL: 'info',
      },
      volumes: ['/data', '/music'],
    },
    installOptions: {subdomain: 'music'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'deluan/navidrome:latest',
          restart: 'unless-stopped',
          environment: {
            ND_SCANSCHEDULE: '1h',
            ND_LOGLEVEL: 'info',
          },
          volumes: [
            '${APP_DATA_DIR}/data:/data',
            '${APP_DATA_DIR}/music:/music',
          ],
          ports: ['127.0.0.1:4533:4533'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:4533/ping || exit 1'],
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
    id: 'calibre-web',
    name: 'Calibre-web',
    tagline: 'Web-based ebook library manager and reader',
    version: '0.6.0',
    category: 'media',
    port: 8083,
    description: 'Calibre-web is a web app providing a clean interface for browsing, reading, and downloading eBooks. Based on Calibre, it supports OPDS feed, user management, Kobo/Kindle sync, and in-browser reading of EPUB, PDF, and more.',
    website: 'https://github.com/janeczku/calibre-web',
    developer: 'janeczku',
    icon: 'https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/calibre-web-icon.png',
    docker: {
      image: 'lscr.io/linuxserver/calibre-web:latest',
      environment: {
        PUID: '1000',
        PGID: '1000',
        TZ: 'UTC',
      },
      volumes: ['/config', '/books'],
    },
    defaultUsername: 'admin',
    defaultPassword: 'admin123',
    installOptions: {subdomain: 'books'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'lscr.io/linuxserver/calibre-web:latest',
          restart: 'unless-stopped',
          environment: {
            PUID: '1000',
            PGID: '1000',
            TZ: 'UTC',
          },
          volumes: [
            '${APP_DATA_DIR}/config:/config',
            '${APP_DATA_DIR}/books:/books',
          ],
          ports: ['127.0.0.1:8083:8083'],
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost:8083/ || exit 1'],
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
    id: 'homarr',
    name: 'Homarr',
    tagline: 'Customizable dashboard for your server',
    version: '1.0.0',
    category: 'productivity',
    port: 7575,
    description: 'Homarr is a modern, sleek dashboard for your home server. Organize your links, monitor services, and manage your Docker containers with a drag-and-drop interface. Integrates with popular self-hosted apps.',
    website: 'https://homarr.dev',
    developer: 'Homarr',
    icon: 'https://raw.githubusercontent.com/homarr-labs/homarr/dev/public/imgs/logo/logo-color.png',
    docker: {
      image: 'ghcr.io/homarr-labs/homarr:latest',
      volumes: ['/appdata'],
    },
    installOptions: {subdomain: 'dash'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'ghcr.io/homarr-labs/homarr:latest',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/data:/appdata'],
          ports: ['127.0.0.1:7575:7575'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:7575/ || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '30s',
          },
        },
      },
    },
  },

  // --- Wave 2: Plan 03 apps (Wiki.js, Linkwarden, Element Web, Hoppscotch, Stirling PDF) ---

  {
    id: 'wikijs',
    name: 'Wiki.js',
    tagline: 'Powerful and extensible open source wiki',
    version: '2',
    category: 'productivity',
    port: 3006,
    description: 'Wiki.js is a powerful open-source wiki app built on Node.js. Beautiful and intuitive interface with Markdown and WYSIWYG editors. Supports SQLite for zero-config storage, full-text search, diagrams, and media assets management.',
    website: 'https://js.wiki',
    developer: 'Requarks',
    icon: 'https://raw.githubusercontent.com/requarks/wiki/main/assets/svg/logo.svg',
    docker: {
      image: 'ghcr.io/requarks/wiki:2',
      environment: {
        DB_TYPE: 'sqlite',
        DB_FILEPATH: '/wiki/data/db.sqlite',
      },
      volumes: ['/wiki/data'],
    },
    installOptions: {subdomain: 'wiki'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'ghcr.io/requarks/wiki:2',
          restart: 'unless-stopped',
          environment: {
            DB_TYPE: 'sqlite',
            DB_FILEPATH: '/wiki/data/db.sqlite',
          },
          volumes: ['${APP_DATA_DIR}/data:/wiki/data'],
          ports: ['127.0.0.1:3006:3000'],
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost:3000/ || exit 1'],
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
    id: 'linkwarden',
    name: 'Linkwarden',
    tagline: 'Collaborative bookmark manager and archive',
    version: '2.8.0',
    category: 'productivity',
    port: 3004,
    description: 'Linkwarden is a self-hosted, open-source collaborative bookmark manager to collect, organize, and preserve webpages. Auto-captures screenshots and archives pages. Tag-based organization with collections and sharing.',
    website: 'https://linkwarden.app',
    developer: 'Linkwarden',
    icon: 'https://raw.githubusercontent.com/linkwarden/linkwarden/main/assets/logo.png',
    docker: {
      image: 'ghcr.io/linkwarden/linkwarden:latest',
      environment: {
        NEXTAUTH_SECRET: '',
        NEXTAUTH_URL: 'http://localhost:3004',
      },
      volumes: ['/data/data'],
    },
    installOptions: {
      subdomain: 'links',
      environmentOverrides: [
        {name: 'NEXTAUTH_SECRET', label: 'Auth Secret (random string)', type: 'password', required: true},
      ],
    },
    deterministicPassword: true,
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'ghcr.io/linkwarden/linkwarden:latest',
          restart: 'unless-stopped',
          environment: {
            NEXTAUTH_SECRET: '',
            NEXTAUTH_URL: 'http://localhost:3004',
          },
          volumes: ['${APP_DATA_DIR}/data:/data/data'],
          ports: ['127.0.0.1:3004:3000'],
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
    id: 'element-web',
    name: 'Element Web',
    tagline: 'Matrix chat client for decentralized communication',
    version: '1.11.0',
    category: 'communication',
    port: 8087,
    description: 'Element is a Matrix-based end-to-end encrypted messenger and secure collaboration app. Connect to any Matrix homeserver (default: matrix.org). Supports rooms, spaces, voice/video calls, file sharing, and bridges to other platforms.',
    website: 'https://element.io',
    developer: 'Element',
    icon: 'https://raw.githubusercontent.com/nicehash/element-web/develop/res/themes/element/img/logos/element-logo.svg',
    docker: {
      image: 'vectorim/element-web:latest',
      volumes: [],
    },
    installOptions: {subdomain: 'element'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'vectorim/element-web:latest',
          restart: 'unless-stopped',
          ports: ['127.0.0.1:8087:80'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:80/ || exit 1'],
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
    id: 'hoppscotch',
    name: 'Hoppscotch',
    tagline: 'Open-source API development ecosystem',
    version: '2024.12.0',
    category: 'developer-tools',
    port: 3005,
    description: 'Hoppscotch is an open source API development ecosystem. Test REST, GraphQL, WebSocket, SSE, and Socket.IO APIs with a beautiful interface. Collections, environments, pre-request scripts, and team collaboration.',
    website: 'https://hoppscotch.io',
    developer: 'Hoppscotch',
    icon: 'https://raw.githubusercontent.com/hoppscotch/hoppscotch/main/packages/hoppscotch-common/public/icon.png',
    docker: {
      image: 'hoppscotch/hoppscotch:latest',
      volumes: [],
    },
    installOptions: {subdomain: 'api'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'hoppscotch/hoppscotch:latest',
          restart: 'unless-stopped',
          ports: ['127.0.0.1:3005:3000'],
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
    id: 'stirling-pdf',
    name: 'Stirling PDF',
    tagline: 'All-in-one PDF manipulation toolkit',
    version: '0.36.0',
    category: 'developer-tools',
    port: 8085,
    description: 'Stirling PDF is a self-hosted web-based PDF manipulation tool. Split, merge, convert, compress, rotate, watermark, and OCR your PDFs. Supports dark mode, custom download options, parallel file processing, and API access.',
    website: 'https://stirlingpdf.io',
    developer: 'Stirling-Tools',
    icon: 'https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling.png',
    docker: {
      image: 'frooodle/s-pdf:latest',
      environment: {
        DOCKER_ENABLE_SECURITY: 'false',
      },
      volumes: ['/usr/share/tessdata', '/configs'],
    },
    installOptions: {subdomain: 'pdf'},
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'frooodle/s-pdf:latest',
          restart: 'unless-stopped',
          environment: {
            DOCKER_ENABLE_SECURITY: 'false',
          },
          volumes: [
            '${APP_DATA_DIR}/data:/usr/share/tessdata',
            '${APP_DATA_DIR}/config:/configs',
          ],
          ports: ['127.0.0.1:8085:8080'],
          healthcheck: {
            test: ['CMD-SHELL', 'wget -q --spider http://localhost:8080/ || exit 1'],
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
    id: 'mirofish',
    name: 'MiroFish',
    tagline: 'Swarm intelligence engine — predict trends with multi-agent simulations',
    version: '0.1.0',
    category: 'ai',
    port: 3000,
    description: 'MiroFish is a swarm intelligence engine that uses multi-agent LLM simulations to predict social trends, financial forecasts, and public opinion. The LLM is auto-configured to use your Claude subscription via Livinity Broker — no LLM API key prompt inside the app.\n\nSetup: Get a free ZEP Cloud API key at https://app.getzep.com/ (memory engine, ~30s signup) and paste it during install.\n\nFirst simulation may take 2-5 min as the engine warms up. AGPL-3.0 licensed.',
    website: 'https://mirofish.ai',
    developer: '666ghj',
    icon: 'https://raw.githubusercontent.com/666ghj/MiroFish/main/static/logo.svg',
    repo: 'https://github.com/666ghj/MiroFish',
    requiresAiProvider: true,
    docker: {
      image: 'ghcr.io/666ghj/mirofish:latest',
      environment: {
        LLM_API_KEY: 'livinity-broker-managed',
        LLM_MODEL_NAME: 'claude-sonnet-4-6',
      },
      volumes: ['/app/backend/uploads'],
    },
    installOptions: {
      subdomain: 'mirofish',
      environmentOverrides: [
        { name: 'ZEP_API_KEY', label: 'ZEP Cloud API Key (free tier OK — get at app.getzep.com)', type: 'password', required: true },
        { name: 'LLM_MODEL_NAME', label: 'Claude model (default: claude-sonnet-4-6)', type: 'string', default: 'claude-sonnet-4-6', required: false },
      ],
    },
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'ghcr.io/666ghj/mirofish:latest',
          restart: 'unless-stopped',
          environment: {
            // Sentinel — broker ignores key, validates by source IP + URL path
            LLM_API_KEY: 'livinity-broker-managed',
            LLM_MODEL_NAME: 'claude-sonnet-4-6',
            // ZEP_API_KEY filled by installOptions.environmentOverrides at install time
            // LLM_BASE_URL, OPENAI_API_BASE_URL, OPENAI_API_KEY, ANTHROPIC_BASE_URL,
            // ANTHROPIC_REVERSE_PROXY + extra_hosts auto-injected by Phase 43.2
            // (apps.ts:install) when manifest.requiresAiProvider === true.
          },
          volumes: ['${APP_DATA_DIR}/uploads:/app/backend/uploads'],
          ports: ['127.0.0.1:3000:3000'],
        },
      },
    },
  },
  {
    id: 'bolt-diy',
    name: 'Bolt.diy',
    tagline: 'AI-powered web app builder — your Claude subscription, no API key needed',
    version: '0.0.7',
    category: 'developer',
    port: 5173,
    description: 'Bolt.diy is an open-source AI app builder (community fork of bolt.new by StackBlitz Labs) that lets you describe apps in natural language and watch them get built in your browser. The LLM backend is auto-configured to use your Claude subscription via Livinity Broker — no LLM API key prompt inside the app.\n\nWhen prompted to choose a provider, select **OpenAI-Like** in Bolt.diy\'s provider menu (the broker speaks OpenAI Chat Completions format). Then pick any Claude model name (e.g. `claude-sonnet-4-6`, `claude-opus-4-7`). Anthropic provider is currently NOT broker-routable upstream — see Bolt.diy issue tracker for ANTHROPIC_BASE_URL support.\n\nMIT licensed.',
    website: 'https://stackblitz-labs.github.io/bolt.diy/',
    developer: 'StackBlitz Labs',
    icon: 'https://stackblitz-labs.github.io/bolt.diy/assets/logo.svg',
    repo: 'https://github.com/stackblitz-labs/bolt.diy',
    requiresAiProvider: true,
    docker: {
      image: 'ghcr.io/stackblitz-labs/bolt.diy:latest',
      environment: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '5173',
        RUNNING_IN_DOCKER: 'true',
      },
      volumes: ['/app/data'],
    },
    installOptions: {
      subdomain: 'bolt',
      // No environmentOverrides — user requested "install and connect to broker
      // automatically with zero questions". Broker env vars auto-injected by
      // Phase 43.2 inject step (apps.ts:install). Optional dev tokens (GitHub,
      // Vercel, Supabase) can be configured later via Bolt.diy's own Settings UI.
    },
    compose: {
      mainService: 'server',
      services: {
        server: {
          image: 'ghcr.io/stackblitz-labs/bolt.diy:latest',
          // Phase 57 (v29.5 post-deploy hot-fix) — upstream image strips
          // wrangler (devDependency) via `pnpm prune --prod --ignore-scripts`,
          // but the dockerstart script needs wrangler in PATH. Container
          // restart-loops with `sh: 1: wrangler: not found` until wrangler is
          // installed at runtime. Idempotent install at first start; PATH check
          // short-circuits subsequent restarts.
          command: ['sh', '-c', 'command -v wrangler >/dev/null 2>&1 || npm install -g wrangler@latest; pnpm run dockerstart'],
          restart: 'unless-stopped',
          environment: {
            NODE_ENV: 'production',
            HOST: '0.0.0.0',
            PORT: '5173',
            RUNNING_IN_DOCKER: 'true',
            // OPENAI_API_KEY, OPENAI_API_BASE_URL, OPENAI_LIKE_API_BASE_URL,
            // ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_REVERSE_PROXY,
            // LLM_BASE_URL + extra_hosts auto-injected by Phase 43.2 inject
            // when manifest.requiresAiProvider === true. Bolt.diy reads
            // OPENAI_LIKE_API_BASE_URL specifically for its "OpenAI-Like"
            // provider entry, which is the broker-routable path.
          },
          volumes: ['${APP_DATA_DIR}/data:/app/data'],
          ports: ['127.0.0.1:5173:5173'],
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost:5173/ || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            // 90s start_period accommodates one-time wrangler install on first start.
            start_period: '90s',
          },
        },
      },
    },
  },
  {
    // v30.5 — Suna AI agent platform (Manus-alternative, autonomous agents)
    // Mimari notu: Suna normalde bundled Supabase ile gelir (heavy stack).
    // Mini PC'yi koruyacak şekilde EXTERNAL Supabase Cloud (free tier) kullanıyoruz —
    // user install sırasında supabase.com'da proje açıp 3 değer giriyor.
    // OpenCode runtime'ı sayesinde Anthropic baseURL config'iyle broker'a yönlendirilebilir.
    //
    // VERIFICATION TODO (SSH dönünce):
    //   1. ghcr.io/suna-ai/suna-backend image'inın expose ettiği port (3000? 8000?)
    //   2. Frontend image referansı (suna-frontend? veya monorepo'da aynı image mi?)
    //   3. Worker servisi backend imageını mı kullanıyor?
    //   4. Auto-migration entrypoint'te yapılıyor mu yoksa elle mi?
    //   5. OpenCode config dosya yolu (/root/.config/opencode/config.json?)
    //   6. Health endpoint path
    id: 'suna',
    name: 'Suna AI',
    tagline: 'Autonomous AI agents — your Claude subscription, your own sandbox',
    version: '0.8.44',
    category: 'developer',
    port: 3000,
    description: 'Suna is an open-source autonomous agent platform (Manus alternative) — agents run 24/7 in isolated Docker sandboxes with shared filesystem, credentials, and history. 60+ skills, 3000+ integrations.\n\n**Setup requires a free Supabase Cloud project** (managed Postgres + Auth, no extra Mini PC services). Visit supabase.com → New Project → Settings → API → copy the 3 values into the install form below.\n\nLLM backend auto-configured to use your Claude subscription via Livinity Broker — no LLM API key prompt.\n\nApache 2.0 licensed.',
    website: 'https://kortix.com',
    developer: 'Kortix AI',
    icon: 'https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/suna/icon.svg',
    repo: 'https://github.com/kortix-ai/suna',
    requiresAiProvider: true,  // Phase 43.2 → broker env auto-injection
    docker: {
      image: 'ghcr.io/suna-ai/suna-backend:latest',
      environment: {
        NODE_ENV: 'production',
      },
      volumes: ['/data'],
    },
    installOptions: {
      subdomain: 'suna',
      // User-provided fields — shown in install dialog. Inject docs link in label
      // so users know where to obtain each value.
      environmentOverrides: [
        {
          name: 'NEXT_PUBLIC_SUPABASE_URL',
          label: 'Supabase Project URL (from supabase.com → Settings → API)',
          type: 'string',
          required: true,
        },
        {
          name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
          label: 'Supabase Anon Key (public — same Settings → API page)',
          type: 'string',
          required: true,
        },
        {
          name: 'SUPABASE_SERVICE_ROLE_KEY',
          label: 'Supabase Service Role Key (secret — same Settings → API page)',
          type: 'password',
          required: true,
        },
      ],
    },
    compose: {
      mainService: 'frontend',  // Caddy reverse-proxy hedefi + env override target
      services: {
        // Frontend — Next.js UI, public-facing on subdomain
        frontend: {
          image: 'ghcr.io/suna-ai/suna-frontend:latest',  // VERIFY image name on SSH
          restart: 'unless-stopped',
          environment: {
            // Supabase — environmentOverrides patches these values into the mainService;
            // backend service reads SAME values via Docker Compose ${VAR} interpolation
            // from the compose dir's .env file (livinityd writes one when overrides apply).
            NEXT_PUBLIC_SUPABASE_URL: '${NEXT_PUBLIC_SUPABASE_URL}',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: '${NEXT_PUBLIC_SUPABASE_ANON_KEY}',
            // Backend URL for client-side fetches (internal docker network)
            NEXT_PUBLIC_BACKEND_URL: 'http://backend:8000',
            // LLM provider — auto-injected by Phase 43.2 (requiresAiProvider: true)
            // Suna's OpenCode runtime reads from a config file, NOT directly env;
            // we will need a small init container or volume-mounted config.json.
            // VERIFICATION TODO: confirm whether OpenCode honors ANTHROPIC_BASE_URL env
            // alongside its config.json, or if config.json mount is mandatory.
          },
          ports: ['127.0.0.1:3000:3000'],
          depends_on: ['backend', 'redis'],
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost:3000/ || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '60s',
          },
        },
        // Backend — FastAPI/Python API server, talks to external Supabase + Redis + spawns sandboxes
        backend: {
          image: 'ghcr.io/suna-ai/suna-backend:latest',
          restart: 'unless-stopped',
          environment: {
            SUPABASE_URL: '${NEXT_PUBLIC_SUPABASE_URL}',
            SUPABASE_SERVICE_ROLE_KEY: '${SUPABASE_SERVICE_ROLE_KEY}',
            SUPABASE_ANON_KEY: '${NEXT_PUBLIC_SUPABASE_ANON_KEY}',
            REDIS_URL: 'redis://redis:6379',
            // Sandbox per-agent runner — needs Docker socket. Phase 43.2 should NOT
            // inject host-gateway here (sandbox containers don't need broker access
            // through it; they speak to backend which proxies to broker).
            // VERIFICATION TODO: does Suna spawn sandbox containers via host docker.sock,
            // or via Daytona / a remote orchestrator?
          },
          volumes: [
            '${APP_DATA_DIR}/backend-data:/app/data',
            '/var/run/docker.sock:/var/run/docker.sock',  // for sandbox spawning
          ],
          depends_on: ['redis'],
        },
        // Worker — background tasks (probably same image, different command)
        worker: {
          image: 'ghcr.io/suna-ai/suna-backend:latest',
          restart: 'unless-stopped',
          // VERIFICATION TODO: confirm worker command — likely `python -m worker`
          // or similar; current image entrypoint may be uvicorn.
          // command: ['python', '-m', 'kortix.worker'],
          environment: {
            SUPABASE_URL: '${NEXT_PUBLIC_SUPABASE_URL}',
            SUPABASE_SERVICE_ROLE_KEY: '${SUPABASE_SERVICE_ROLE_KEY}',
            SUPABASE_ANON_KEY: '${NEXT_PUBLIC_SUPABASE_ANON_KEY}',
            REDIS_URL: 'redis://redis:6379',
          },
          volumes: ['${APP_DATA_DIR}/backend-data:/app/data'],
          depends_on: ['redis'],
        },
        // Redis — local cache/queue (lightweight, stays on Mini PC)
        redis: {
          image: 'redis:7-alpine',
          restart: 'unless-stopped',
          volumes: ['${APP_DATA_DIR}/redis-data:/data'],
          healthcheck: {
            test: ['CMD', 'redis-cli', 'ping'],
            interval: '30s',
            timeout: '5s',
            retries: 3,
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
