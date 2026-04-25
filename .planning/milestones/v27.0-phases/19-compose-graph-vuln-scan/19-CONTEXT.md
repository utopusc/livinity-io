# Phase 19: Compose Graph Viewer + Vulnerability Scanning - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

Two visual/security upgrades to the Stacks and Images tabs:
1. **Compose Graph Viewer** — parse compose YAML and render service dependency graph with React Flow showing depends_on, networks, port mappings
2. **Image Vulnerability Scanning** — on-demand Trivy scan inside Docker container with SHA256-keyed Redis cache showing CRITICAL/HIGH/MEDIUM/LOW CVE badges

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- React Flow (`reactflow` npm) — already a popular React library, install if not present
- js-yaml for compose parse — likely already installed (used elsewhere)
- Trivy via Docker: `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image <ref> --format json --severity CRITICAL,HIGH,MEDIUM,LOW`
- Cache JSON results in Redis at `nexus:vuln:<sha256>` (TTL: 7 days, allow manual refresh)
- Scan returns: count by severity + array of {id, severity, cvss, fixedVersion, packageName, description}

</decisions>

<specifics>
## Specific Ideas

**Plans (target 2):**
- Plan 19-01: Compose Graph Viewer — parse + React Flow render, "Graph" tab in stack detail
- Plan 19-02: Vulnerability Scanning — Trivy backend + tRPC route + UI Scan button + severity badges

</specifics>

<deferred>
## Deferred Ideas

- Auto-scan on image pull — Phase 20 scheduler
- SBOM generation — v28.0
- License scan — v28.0
- Grype as alternative scanner — v28.0

</deferred>
