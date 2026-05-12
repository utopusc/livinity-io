# LivOS Local UAT Container

End-to-end UAT environment for Phase 104 `install.sh` modes (local-lan / hybrid / cloud).
See: `.planning/phases/104-local-install-and-docker-uat/` for full context.

## Prerequisites

- Windows: WSL 2.5.1+ (cgroup v2 default) + Docker Desktop, OR
- Linux: Docker 20.10+ with cgroup v2 (default on Ubuntu 22.04+)
- Verify cgroup v2: `grep '^0::' /proc/self/cgroup` must print a line on the host
- ~3GB disk for the image (Ubuntu base + Chrome + Caddy + Postgres)

## One-command run

```sh
cd docker/local-uat
docker compose up --build
```

Expected behavior:
- Container boots systemd as PID 1
- After ~10s: `[livos-uat] READY: noVNC http://<host>:6080/vnc.html, CDP http://<host>:9223`
- Host can open http://localhost:6080/vnc.html — see fluxbox desktop + Chrome window
- Host can `curl http://localhost:9223/json/version` — returns Chrome CDP metadata

## Ports

| Port | Purpose |
|------|---------|
| 80, 443 | Caddy (after install.sh runs) |
| 53/udp | dnsmasq (local-lan mode only) |
| 6080 | noVNC HTML5 (human escape hatch) |
| 9223 | Chrome DevTools Protocol (host MCP connects here) |

## Known limitations

- macOS resolution of custom TLDs (.livinity.local) cannot be tested inside a Linux container.
  See research §Q3-RESOLVED for the macOS interception story.
- `--mode cloud` regression test lives in `docker/cloud-regression/` (separate compose).
- The container is `--privileged` — do NOT publish the image to any registry.

## Troubleshooting

- **Container exits within seconds**: cgroup v1 — upgrade WSL or add cgroup_no_v1 to .wslconfig.
- **`docker exec ... curl localhost:9223` works but host curl fails**:
  Chrome CDP bind address wrong — verify `--remote-debugging-address=0.0.0.0` in entrypoint.sh.
- **noVNC blank**: Xvfb not started — check `docker logs livos-uat | grep Xvfb`.
