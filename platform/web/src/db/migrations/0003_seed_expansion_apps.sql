-- Migration: 0003_seed_expansion_apps.sql
-- Purpose: Seed 10 new expansion apps into the apps catalog
-- Apps: AdGuard Home, WireGuard Easy, Navidrome, Calibre-web, Homarr, Wiki.js, Linkwarden, Element Web, Hoppscotch, Stirling PDF

BEGIN;

-- Idempotency: remove existing seed data before re-inserting
DELETE FROM apps WHERE name IN ('AdGuard Home', 'WireGuard Easy', 'Navidrome', 'Calibre-web', 'Homarr', 'Wiki.js', 'Linkwarden', 'Element Web', 'Hoppscotch', 'Stirling PDF');

-- App 1: AdGuard Home — Network-wide ad blocking
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'AdGuard Home',
  'Network-wide ad and tracker blocking DNS server',
  'AdGuard Home is a network-wide software for blocking ads and tracking. After you set it up, it covers ALL your home devices without needing any client-side software. DNS-over-HTTPS, DNS-over-TLS, DHCP server, query log, and parental controls.',
  'privacy',
  '0.107.0',
  $$version: "3.8"
services:
  adguard-home:
    image: adguard/adguardhome:0.107.0
    container_name: adguard-home
    restart: unless-stopped
    ports:
      - "3003:3000"
    volumes:
      - adguard_work:/opt/adguardhome/work
      - adguard_conf:/opt/adguardhome/conf
volumes:
  adguard_work:
  adguard_conf:
$$,
  '{"port": 3003, "subdomain": "adguard", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/client/public/assets/favicon.png',
  false,
  true
);

-- App 2: WireGuard Easy — Simple VPN server
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'WireGuard Easy',
  'Simple WireGuard VPN server with web UI',
  'WireGuard Easy provides a simple web interface to manage your WireGuard VPN server. Create and manage clients with QR codes, view transfer statistics, and enable/disable clients from a beautiful web UI.',
  'privacy',
  '14',
  $$version: "3.8"
services:
  wg-easy:
    image: ghcr.io/wg-easy/wg-easy:14
    container_name: wg-easy
    restart: unless-stopped
    ports:
      - "51821:51821"
      - "51820:51820/udp"
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
      - net.ipv4.ip_forward=1
    volumes:
      - wg_easy_data:/etc/wireguard
volumes:
  wg_easy_data:
$$,
  '{"port": 51821, "subdomain": "vpn", "env": [{"name": "WG_HOST", "label": "Server Public IP or Domain", "type": "string", "required": true}, {"name": "PASSWORD_HASH", "label": "Admin Password (bcrypt hash)", "type": "password", "required": true}]}'::jsonb,
  'https://raw.githubusercontent.com/wg-easy/wg-easy/master/src/www/img/logo.png',
  false,
  true
);

-- App 3: Navidrome — Music server and streamer
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Navidrome',
  'Modern music server and streamer',
  'Navidrome is an open source web-based music collection server and streamer. It gives you freedom to listen to your music collection from any browser or mobile device. Compatible with Subsonic/Airsonic clients.',
  'media',
  '0.53.0',
  $$version: "3.8"
services:
  navidrome:
    image: deluan/navidrome:0.53.0
    container_name: navidrome
    restart: unless-stopped
    ports:
      - "4533:4533"
    environment:
      - ND_SCANSCHEDULE=1h
      - ND_LOGLEVEL=info
    volumes:
      - navidrome_data:/data
      - navidrome_music:/music
volumes:
  navidrome_data:
  navidrome_music:
$$,
  '{"port": 4533, "subdomain": "music", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/navidrome/navidrome/master/resources/logo-192x192.png',
  false,
  true
);

-- App 4: Calibre-web — Ebook library manager
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Calibre-web',
  'Web-based ebook library manager and reader',
  'Calibre-web is a web app providing a clean interface for browsing, reading, and downloading eBooks. Based on Calibre, it supports OPDS feed, user management, Kobo/Kindle sync, and in-browser reading of EPUB, PDF, and more.',
  'media',
  '0.6.0',
  $$version: "3.8"
services:
  calibre-web:
    image: lscr.io/linuxserver/calibre-web:0.6.0
    container_name: calibre-web
    restart: unless-stopped
    ports:
      - "8083:8083"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
    volumes:
      - calibre_config:/config
      - calibre_books:/books
volumes:
  calibre_config:
  calibre_books:
$$,
  '{"port": 8083, "subdomain": "books", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/calibre-web-icon.png',
  false,
  true
);

-- App 5: Homarr — Server dashboard
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Homarr',
  'Customizable dashboard for your server',
  'Homarr is a modern, sleek dashboard for your home server. Organize your links, monitor services, and manage your Docker containers with a drag-and-drop interface. Integrates with popular self-hosted apps.',
  'productivity',
  '1.0.0',
  $$version: "3.8"
services:
  homarr:
    image: ghcr.io/homarr-labs/homarr:1.0.0
    container_name: homarr
    restart: unless-stopped
    ports:
      - "7575:7575"
    volumes:
      - homarr_appdata:/appdata
volumes:
  homarr_appdata:
$$,
  '{"port": 7575, "subdomain": "dash", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/homarr-labs/homarr/dev/public/imgs/logo/logo-color.png',
  false,
  true
);

-- App 6: Wiki.js — Open source wiki
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Wiki.js',
  'Powerful and extensible open source wiki',
  'Wiki.js is a powerful open-source wiki app built on Node.js. Beautiful and intuitive interface with Markdown and WYSIWYG editors. Supports SQLite for zero-config storage, full-text search, diagrams, and media assets management.',
  'productivity',
  '2',
  $$version: "3.8"
services:
  wiki:
    image: ghcr.io/requarks/wiki:2
    container_name: wiki
    restart: unless-stopped
    ports:
      - "3006:3000"
    environment:
      - DB_TYPE=sqlite
      - DB_FILEPATH=/wiki/data/db.sqlite
    volumes:
      - wiki_data:/wiki/data
volumes:
  wiki_data:
$$,
  '{"port": 3006, "subdomain": "wiki", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/requarks/wiki/main/assets/svg/logo.svg',
  false,
  true
);

-- App 7: Linkwarden — Bookmark manager
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Linkwarden',
  'Collaborative bookmark manager and archive',
  'Linkwarden is a self-hosted, open-source collaborative bookmark manager to collect, organize, and preserve webpages. Auto-captures screenshots and archives pages. Tag-based organization with collections and sharing.',
  'productivity',
  '2.8.0',
  $$version: "3.8"
services:
  linkwarden:
    image: ghcr.io/linkwarden/linkwarden:v2.8.0
    container_name: linkwarden
    restart: unless-stopped
    ports:
      - "3004:3000"
    environment:
      - NEXTAUTH_SECRET=changeme
      - NEXTAUTH_URL=http://localhost:3004
    volumes:
      - linkwarden_data:/data/data
volumes:
  linkwarden_data:
$$,
  '{"port": 3004, "subdomain": "links", "env": [{"name": "NEXTAUTH_SECRET", "label": "Auth Secret (random string)", "type": "password", "required": true}]}'::jsonb,
  'https://raw.githubusercontent.com/linkwarden/linkwarden/main/assets/logo.png',
  false,
  true
);

-- App 8: Element Web — Matrix chat client
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Element Web',
  'Matrix chat client for decentralized communication',
  'Element is a Matrix-based end-to-end encrypted messenger and secure collaboration app. Connect to any Matrix homeserver (default: matrix.org). Supports rooms, spaces, voice/video calls, file sharing, and bridges to other platforms.',
  'communication',
  '1.11.0',
  $$version: "3.8"
services:
  element-web:
    image: vectorim/element-web:v1.11.0
    container_name: element-web
    restart: unless-stopped
    ports:
      - "8087:80"
volumes: {}
$$,
  '{"port": 8087, "subdomain": "chat", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/nicehash/element-web/develop/res/themes/element/img/logos/element-logo.svg',
  false,
  true
);

-- App 9: Hoppscotch — API development ecosystem
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Hoppscotch',
  'Open-source API development ecosystem',
  'Hoppscotch is an open source API development ecosystem. Test REST, GraphQL, WebSocket, SSE, and Socket.IO APIs with a beautiful interface. Collections, environments, pre-request scripts, and team collaboration.',
  'developer-tools',
  '2024.12.0',
  $$version: "3.8"
services:
  hoppscotch:
    image: hoppscotch/hoppscotch:2024.12.0
    container_name: hoppscotch
    restart: unless-stopped
    ports:
      - "3005:3000"
volumes: {}
$$,
  '{"port": 3005, "subdomain": "api", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/hoppscotch/hoppscotch/main/packages/hoppscotch-common/public/icon.png',
  false,
  true
);

-- App 10: Stirling PDF — PDF manipulation toolkit
INSERT INTO apps (name, tagline, description, category, version, docker_compose, manifest, icon_url, featured, verified)
VALUES (
  'Stirling PDF',
  'All-in-one PDF manipulation toolkit',
  'Stirling PDF is a self-hosted web-based PDF manipulation tool. Split, merge, convert, compress, rotate, watermark, and OCR your PDFs. Supports dark mode, custom download options, parallel file processing, and API access.',
  'developer-tools',
  '0.36.0',
  $$version: "3.8"
services:
  stirling-pdf:
    image: frooodle/s-pdf:0.36.0
    container_name: stirling-pdf
    restart: unless-stopped
    ports:
      - "8085:8080"
    environment:
      - DOCKER_ENABLE_SECURITY=false
    volumes:
      - stirling_data:/usr/share/tessdata
      - stirling_config:/configs
volumes:
  stirling_data:
  stirling_config:
$$,
  '{"port": 8085, "subdomain": "pdf", "env": []}'::jsonb,
  'https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling.png',
  false,
  true
);

COMMIT;
