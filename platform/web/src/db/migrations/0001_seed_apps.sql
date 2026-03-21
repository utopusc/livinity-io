-- Migration: 0001_seed_apps.sql
-- Purpose: Seed 8 curated app templates into the apps catalog
-- Apps: n8n, Nextcloud, Jellyfin, Portainer, Uptime Kuma, Code Server, Immich, Grafana

BEGIN;

-- Idempotency: remove existing seed data before re-inserting
DELETE FROM apps WHERE name IN ('n8n', 'Nextcloud', 'Jellyfin', 'Portainer', 'Uptime Kuma', 'Code Server', 'Immich', 'Grafana');

-- App 1: n8n — Workflow automation
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'n8n',
  'Workflow automation for technical people',
  'n8n is a free and source-available workflow automation tool. Connect anything to everything with 400+ integrations, build complex automations, and run them on your own server for full data privacy.',
  'automation',
  '1.76.1',
  $$version: "3.8"
services:
  n8n:
    image: n8nio/n8n:1.76.1
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
    volumes:
      - n8n_data:/home/node/.n8n
volumes:
  n8n_data:
$$,
  '{"port": 5678, "subdomain": "n8n", "env": [{"name": "N8N_BASIC_AUTH_USER", "label": "Admin Username", "type": "string", "default": "admin", "required": true}, {"name": "N8N_BASIC_AUTH_PASSWORD", "label": "Admin Password", "type": "password", "required": true}]}'::jsonb,
  'https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png',
  true,
  true
);

-- App 2: Nextcloud — Self-hosted productivity
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Nextcloud',
  'Self-hosted productivity platform',
  'Nextcloud is a suite of client-server software for creating and using file hosting services. It offers functionality similar to Dropbox, with file sync, calendars, contacts, mail, and collaborative editing.',
  'cloud-storage',
  '29.0.10',
  $$version: "3.8"
services:
  nextcloud:
    image: lscr.io/linuxserver/nextcloud:29.0.10
    container_name: nextcloud
    restart: unless-stopped
    ports:
      - "8081:443"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
    volumes:
      - nextcloud_config:/config
      - nextcloud_data:/data
volumes:
  nextcloud_config:
  nextcloud_data:
$$,
  '{"port": 8081, "subdomain": "nextcloud", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/nextcloud/promo/master/nextcloud-icon.svg',
  false,
  true
);

-- App 3: Jellyfin — Free software media system
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Jellyfin',
  'Free software media system',
  'Jellyfin is a free and open-source media server and suite of multimedia applications. Stream movies, TV shows, music, and photos to any device from your own server with no subscriptions and no tracking.',
  'media',
  '10.10.6',
  $$version: "3.8"
services:
  jellyfin:
    image: lscr.io/linuxserver/jellyfin:10.10.6
    container_name: jellyfin
    restart: unless-stopped
    ports:
      - "8096:8096"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
    volumes:
      - jellyfin_config:/config
      - jellyfin_tvshows:/data/tvshows
      - jellyfin_movies:/data/movies
      - jellyfin_music:/data/music
volumes:
  jellyfin_config:
  jellyfin_tvshows:
  jellyfin_movies:
  jellyfin_music:
$$,
  '{"port": 8096, "subdomain": "jellyfin", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/SVG/icon-transparent.svg',
  true,
  true
);

-- App 4: Portainer — Container management (uses Docker socket proxy)
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Portainer',
  'Container management made easy',
  'Portainer is a lightweight management UI for Docker environments. Visualize and manage containers, images, volumes, and networks through an intuitive web interface. Uses a filtered Docker socket proxy for secure API access.',
  'management',
  '2.24.1',
  $$version: "3.8"
services:
  portainer:
    image: portainer/portainer-ce:2.24.1
    container_name: portainer
    restart: unless-stopped
    ports:
      - "9000:9000"
    environment:
      - DOCKER_HOST=tcp://livinity_docker_proxy:2375
    volumes:
      - portainer_data:/data
    networks:
      - default
      - livinity_apps
networks:
  livinity_apps:
    external: true
volumes:
  portainer_data:
$$,
  '{"port": 9000, "subdomain": "portainer", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/portainer/portainer/develop/app/assets/ico/logomark.svg',
  false,
  true
);

-- App 5: Uptime Kuma — Self-hosted monitoring
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Uptime Kuma',
  'Self-hosted monitoring tool',
  'Uptime Kuma is a self-hosted monitoring tool like Uptime Robot. Monitor HTTP, TCP, DNS, and more with a beautiful reactive dashboard. Get notified via Telegram, Discord, Slack, email, and 90+ notification services.',
  'monitoring',
  '1.23.16',
  $$version: "3.8"
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1.23.16
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - uptime_kuma_data:/app/data
volumes:
  uptime_kuma_data:
$$,
  '{"port": 3001, "subdomain": "uptime-kuma", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/louislam/uptime-kuma/master/public/icon.svg',
  false,
  true
);

-- App 6: Code Server — VS Code in the browser
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Code Server',
  'VS Code in the browser',
  'Code Server runs Visual Studio Code on a remote server, accessible through the browser. Write code from any device with a consistent development environment, extensions, and terminal access.',
  'development',
  '4.96.4',
  $$version: "3.8"
services:
  code-server:
    image: lscr.io/linuxserver/code-server:4.96.4
    container_name: code-server
    restart: unless-stopped
    ports:
      - "8081:8443"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
      - DEFAULT_WORKSPACE=/config/workspace
    volumes:
      - code_server_config:/config
volumes:
  code_server_config:
$$,
  '{"port": 8081, "subdomain": "code-server", "env": [{"name": "PASSWORD", "label": "Access Password", "type": "password", "required": true}, {"name": "SUDO_PASSWORD", "label": "Sudo Password", "type": "password", "required": false}]}'::jsonb,
  'https://raw.githubusercontent.com/coder/code-server/main/src/browser/media/favicon.svg',
  false,
  true
);

-- App 7: Immich — Self-hosted photo and video management (multi-service)
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Immich',
  'Self-hosted photo and video management',
  'Immich is a high-performance self-hosted photo and video management solution. Features automatic backup from your phone, AI-powered search, facial recognition, and shared albums. Includes dedicated machine learning, Redis cache, and PostgreSQL database services.',
  'photography',
  'v1.127.0',
  $$version: "3.8"
services:
  immich-server:
    image: ghcr.io/immich-app/immich-server:v1.127.0
    container_name: immich-server
    restart: unless-stopped
    ports:
      - "2283:2283"
    environment:
      - DB_HOSTNAME=immich-postgres
      - DB_USERNAME=postgres
      - DB_PASSWORD=postgres
      - DB_DATABASE_NAME=immich
      - REDIS_HOSTNAME=immich-redis
    volumes:
      - immich_upload:/usr/src/app/upload
    depends_on:
      - immich-redis
      - immich-postgres

  immich-machine-learning:
    image: ghcr.io/immich-app/immich-machine-learning:v1.127.0
    container_name: immich-machine-learning
    restart: unless-stopped
    volumes:
      - immich_model_cache:/cache

  immich-redis:
    image: redis:6.2-alpine
    container_name: immich-redis
    restart: unless-stopped
    healthcheck:
      test: redis-cli ping || exit 1

  immich-postgres:
    image: tensorchord/pgvecto-rs:pg14-v0.2.0
    container_name: immich-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_USER=postgres
      - POSTGRES_DB=immich
      - POSTGRES_INITDB_ARGS=--data-checksums
    volumes:
      - immich_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: pg_isready --dbname=immich --username=postgres || exit 1
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  immich_upload:
  immich_model_cache:
  immich_pgdata:
$$,
  '{"port": 2283, "subdomain": "immich", "env": [], "services": [{"name": "immich-server", "role": "Main application server handling API requests and web UI", "port": 2283}, {"name": "immich-machine-learning", "role": "AI/ML service for facial recognition, smart search, and image classification"}, {"name": "immich-redis", "role": "In-memory cache for session management and job queues"}, {"name": "immich-postgres", "role": "PostgreSQL database with pgvecto-rs extension for vector similarity search"}]}'::jsonb,
  'https://raw.githubusercontent.com/immich-app/immich/main/docs/static/img/favicon.png',
  true,
  true
);

-- App 8: Grafana — Observability dashboards and alerting
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Grafana',
  'Observability dashboards and alerting',
  'Grafana is an open-source analytics and interactive visualization platform. Create rich dashboards with panels for metrics, logs, and traces from Prometheus, InfluxDB, Loki, and dozens of other data sources.',
  'dashboards',
  '11.5.2',
  $$version: "3.8"
services:
  grafana:
    image: grafana/grafana-oss:11.5.2
    container_name: grafana
    restart: unless-stopped
    ports:
      - "3002:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_SERVER_HTTP_PORT=3000
    volumes:
      - grafana_data:/var/lib/grafana
volumes:
  grafana_data:
$$,
  '{"port": 3002, "subdomain": "grafana", "env": [{"name": "GF_SECURITY_ADMIN_PASSWORD", "label": "Admin Password", "type": "password", "default": "admin", "required": true}]}'::jsonb,
  'https://raw.githubusercontent.com/grafana/grafana/main/public/img/grafana_icon.svg',
  false,
  true
);

COMMIT;
