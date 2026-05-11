# Local LAN Access for LivOS — No Cloud Dependency

> Durum: Araştırma tamamlandı. Önerilen yol: Approach B (dnsmasq + Caddy internal CA). Faz 104–110 olarak planlanmaya hazır.

---

## 1. Goal Restatement and Non-Goals

### Goal

Enable a user who installs LivOS on a Mini PC at home to reach it from any device on the same LAN (laptop, phone, tablet) via a friendly HTTPS subdomain — e.g., `bruce.livinity.local` — without configuring any cloud service, public DNS record, port-forward, or inbound NAT entry.

The system must:
- Serve all users under wildcard subdomains (`<username>.livinity.local`)
- Serve valid HTTPS trusted by Chrome, Safari, Firefox, and Android Chrome
- Work with the existing Caddy-based multi-user routing in `caddy.ts`
- Survive headless operation (no monitor, no interactive setup per-device beyond one-time CA trust)

### Non-Goals (explicit)

- **Remote access from outside the home network.** Users who want that can layer Tailscale, Headscale, or WireGuard on top independently. This document does not design or block that.
- **Public DNS registration or ACME challenges against Let's Encrypt / ZeroSSL.** Those require reachability proofs this setup deliberately avoids.
- **Dropping multi-user mode.** The per-user container routing and `<username>.X.local` subdomains are preserved.
- **Mobile device management (MDM) or enterprise certificate deployment.** Enrollment is self-service manual, not MDM-automated.
- **Replacing the cloud `livinity.io` path.** The existing cloud-connected mode continues to work. Local mode is an alternative activation path.

---

## 2. The Four Hard Problems

### 2.1 Wildcard DNS for `<username>.X.local` on LAN Clients

**Constraint:** Every client (macOS, Windows, iOS, Android) must resolve `bruce.livinity.local`, `alice.livinity.local`, etc., to the Mini PC's LAN IP — without the user editing `/etc/hosts` on every device and without touching their router firmware.

**Candidate solutions:**

| Approach | Mechanism | Wildcard support | Router control needed |
|----------|-----------|-----------------|----------------------|
| mDNS / Avahi | Multicast UDP 5353, RFC 6762 | No — per-name only; `go-avahi-cname` offers reactive pseudo-wildcard but does NOT publish a true wildcard record | No |
| dnsmasq on Mini PC + DHCP option 6 | Unicast DNS; `address=/.livinity.local/<IP>` catches all subdomains | Yes — single rule, unlimited subdomains | Requires router to either (a) set DHCP option 6 to Mini PC IP, or (b) have clients manually point DNS at Mini PC |
| CoreDNS on Mini PC | Same as dnsmasq but with plugin chain | Yes | Same as dnsmasq |
| Router-level DNS override | Configure consumer router to forward `*.local` queries to Mini PC | Yes, if supported | Yes — user must access router admin UI |
| Client hosts file | Edit `/etc/hosts` per user per device | No wildcard — each hostname explicit | No |

**Key constraint for mDNS:** RFC 6762 and the mDNS spec explicitly do not define wildcard A-record responses. `go-avahi-cname` (github.com/grishy/go-avahi-cname) intercepts incoming `.local` queries reactively via the Avahi DBus API, but this only works if the querying client _already sends_ mDNS queries — Android Chrome before Android 12 does not (Google issue tracker #140786115), and Android "Private DNS" (DoT) overrides mDNS entirely. The reactive mode also has a reliability gap: the query must arrive before the timeout, which depends on OS resolver retry logic.

**Key advantage of dnsmasq:** `address=/.livinity.local/192.168.x.y` is a single line that covers every present and future subdomain. No per-user DNS update needed when a new user is created. DHCP option 6 (`dhcp-option=6,<mini-pc-ip>`) pushes this DNS server to every DHCP client on the network. No router firmware change required — only the router's DHCP server must be told to send option 6, which is possible on most consumer routers via the admin UI, or by running dnsmasq in DHCP mode and disabling the router's DHCP entirely.

### 2.2 TLS Certs Trusted by Browsers for `*.X.local`

**Constraint:** Browsers enforce strict trust validation. A self-signed cert for `*.livinity.local` will trigger certificate errors on all browsers unless the signing CA root is in the OS/browser trust store. Let's Encrypt will not issue certs for `.local` names (documented on community.letsencrypt.org). The ACME dns-01 challenge requires a public DNS provider API — unavailable for `.local`.

**Candidate solutions:**

| Approach | CA root origin | Wildcard cert possible | Browser trust without manual step |
|----------|---------------|----------------------|----------------------------------|
| Caddy `tls internal` (built-in CA) | Caddy auto-generates `Caddy Local Authority` root, stored in `data/pki/authorities/local/` | Yes — Caddy issues wildcard `*.livinity.local` via its internal ACME server | No — root must be enrolled per device via `caddy trust` (Linux) or manual import |
| step-ca (Smallstep) | Admin bootstraps a root CA; step-ca runs ACME server on LAN | Yes — dns-01 not needed; http-01 via internal ACME | No — root must be enrolled per device |
| mkcert | Developer CLI generates a root CA and issues leaf certs for listed names | Yes for named SANs; wildcard possible with `mkcert *.livinity.local` | No — root must be enrolled; no auto-renewal |
| IP-only self-signed | No CA hierarchy | N/A | No — always browser error; no cookie SameSite across origins |

**iOS Safari additional requirement:** Apple requires two steps for manually installed root certificates (support.apple.com/en-us/102390):  
1. Install the profile (Settings > General > VPN & Device Management > tap profile > Install)  
2. Enable full trust: Settings > General > About > Certificate Trust Settings > toggle on

Skipping step 2 causes Safari to reject the cert even though it appears in the trust store.

**Android additional requirement:** Android requires the cert to be in the System store for Chrome to trust it, not the User store. On non-rooted devices, user-installed CAs are trusted only by apps that opt in. Chrome on Android does NOT trust user-store CAs for HTTPS. This makes Android a structurally harder problem regardless of approach (see Section 6 for the open question).

**Recommended for LivOS:** Caddy's built-in `tls internal` issuer with a named custom CA (not the default `local` CA). Caddy already handles cert rotation internally. The CA root can be exported as `ca.crt` and served at a well-known HTTP URL (`http://<mini-pc-ip>/ca.crt`) so enrollment is a single URL visit followed by the OS-specific trust workflow.

### 2.3 Subdomain Routing in Caddy Without an External DNS Provider

**Constraint:** Today, `caddy.ts` calls `generateFullCaddyfile()` with the configured main domain, which produces named virtual-host blocks (`bruce.example.com { ... }`). Caddy obtains certs via ACME http-01/dns-01. In local mode there is no ACME challenge possible, and the domain is a `.local` name.

**What changes with `tls internal`:**

Caddy v2 supports a `pki` global block to define a custom named CA:

```
{
  pki {
    ca liv-local {
      name "LivOS Local CA"
      root {
        format pem
        file /opt/livos/data/pki/root.pem
        key /opt/livos/data/pki/root-key.pem
      }
    }
  }
}
```

Then in the wildcard virtual-host block:

```
*.livinity.local {
  tls {
    issuer internal {
      ca liv-local
    }
  }
  handle {
    reverse_proxy 127.0.0.1:8080
  }
}
```

This is a single wildcard block — Caddy issues one wildcard certificate for `*.livinity.local` and routes all subdomains to livinityd's app gateway (port 8080), which already handles per-user routing via `X-Real-IP` header inspection and the existing `routeCustomDomain` / multi-user logic.

**Key point:** `generateFullCaddyfile()` in `caddy.ts` already has a multi-user mode that routes all subdomains to `127.0.0.1:8080`. In local mode the domain string is `livinity.local` (or user-configured) and the TLS block changes from `tls` (ACME) to `tls { issuer internal { ca liv-local } }`. This is a targeted change — one new code path in `generateFullCaddyfile()` for `localMode = true`.

**Note on Caddy's `acme_server` directive:** Caddy v2 also embeds an ACME server (the `acme_server` directive). This would allow Caddy to act as its own ACME CA endpoint, with other clients using certbot or standard ACME to enroll. However, for LivOS this is unnecessary complexity — Caddy managing its own internal certs is simpler and has no external dependencies.

### 2.4 First-Run Install UX — Device CA Enrollment

**Constraint:** Every device that browses to `*.livinity.local` must have the LivOS local CA root in its trust store. On a headless Mini PC, there is no display to walk users through this. The enrollment flow must be:
1. Discoverable without a trusted domain (catch-22: first visit is via IP)
2. Completable on each device in under 2 minutes
3. Platform-specific instructions surfaced in the LivOS UI

**Proposed enrollment flow:**

```
1. User opens http://<mini-pc-ip>:8080  (IP access, HTTP — no cert needed)
2. LivOS UI detects "local mode, CA not yet enrolled" → shows enrollment wizard
3. Wizard provides:
   - Download link: GET /api/local/ca.crt  (DER-encoded CA root)
   - Platform-detect from User-Agent → show instructions for macOS/Windows/iOS/Android
   - QR code pointing to http://<mini-pc-ip>:8080/ca.crt for phone enrollment
4. After CA install, user configures local domain name (default: livinity.local)
5. dnsmasq starts serving *.livinity.local → mini-pc-ip
6. Caddy reloads with wildcard internal TLS block
7. Redirect to https://<username>.livinity.local
```

**Platform-specific CA enrollment commands:**

- **macOS:** `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca.crt` (or double-click → Keychain Access → always trust)
- **Windows:** `certutil -addstore -f "ROOT" ca.crt` (admin PowerShell) or double-click → Install Certificate → Local Machine → Trusted Root
- **Linux (Chromium/Chrome):** `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "LivOS Local CA" -i ca.crt`
- **iOS:** Download .crt → Settings > General > VPN & Device Management → Install → Settings > General > About > Certificate Trust Settings → Enable
- **Android:** See Section 6 open question; on Android 14+ the System CA store is locked; user-store CAs are not trusted by Chrome

---

## 3. Three Concrete Approaches

### Approach A: Pure mDNS / Avahi with Per-User Name Publication

**Architecture:**
```
Mini PC
├── Avahi daemon
│   ├── publishes: livos.local → <mini-pc-ip>  (standard hostname)
│   └── go-avahi-cname (subdomain reply mode):
│       listens for *.livos.local queries → answers with CNAME → livos.local
├── Caddy
│   ├── *.livos.local { tls internal { ... } }
│   └── routes all → 127.0.0.1:8080
└── livinityd (port 8080) — existing multi-user routing

Client (macOS/iOS)
└── mDNS resolver → asks 224.0.0.251:5353 → gets CNAME from go-avahi-cname
    → resolves livos.local → mini-pc-ip
    → sends HTTPS to mini-pc-ip with SNI=bruce.livos.local
    → CA must already be trusted
```

**DNS strategy:** Avahi publishes `livos.local`. `go-avahi-cname` in subdomain-reply mode intercepts queries matching `*.livos.local` and responds with a CNAME back to `livos.local`. This does NOT publish a true wildcard record — it responds reactively to queries it happens to observe on the multicast group.

**TLS strategy:** Caddy `tls internal` with a named CA. Same enrollment flow as described in 2.4.

**Multi-user routing:** Single wildcard block in Caddyfile routes everything to port 8080; livinityd's existing app-gateway logic handles per-user dispatch.

**Enrollment UX:** CA root download from `http://livos.local/ca.crt` (once mDNS resolves) or from `http://<ip>/ca.crt` as bootstrap.

**Pros:**
- Zero router configuration — truly zero-config for DNS on platforms that support mDNS
- No extra daemon besides avahi (already common on Ubuntu)
- Works immediately on macOS and iOS (both have NSS mDNS resolvers)

**Cons:**
- Android Chrome does not resolve `.local` unless Android 12+ _and_ Private DNS is off
- mDNS is link-local — it does not cross router-isolated VLANs or Wi-Fi/Ethernet bridges on some consumer gear
- `go-avahi-cname` reactive subdomain mode is experimental (GitHub issue #22 documents "subdomain mode not working" in some builds); there is no stable release for production use
- No true wildcard DNS record; each user's first query might get a mDNS timeout before go-avahi-cname responds
- `.local` is reserved for mDNS (RFC 6762), but obtaining a TLS cert for `*.local` from any public CA is impossible. The internal CA path works, but the reactive mDNS approach means first-query latency is unpredictable
- IoT devices that do not implement mDNS will not resolve

**Edge cases:**
- Apple TV and HomePod on the same network will publish their own `.local` names — namespace collision unlikely but possible
- Guest Wi-Fi networks typically block mDNS (AP isolation)
- iOS in low-power mode may stop responding to mDNS after screen lock

---

### Approach B: Self-Hosted dnsmasq + Caddy Internal CA (Recommended)

**Architecture:**
```
Mini PC
├── dnsmasq (port 53)
│   ├── address=/.livinity.local/192.168.x.y   ← wildcard catch-all
│   ├── dhcp-option=6,192.168.x.y               ← pushes self as DNS to LAN
│   └── server=1.1.1.1                          ← upstream for non-.local queries
├── Caddy (ports 80/443)
│   ├── Global PKI block: "liv-local" CA
│   │   root cert: /opt/livos/data/pki/root.pem
│   │   key:       /opt/livos/data/pki/root-key.pem
│   ├── *.livinity.local {
│   │     tls { issuer internal { ca liv-local } }
│   │     reverse_proxy 127.0.0.1:8080
│   │   }
│   └── http://livinity.local:80/ca.crt → serves root.pem  ← enrollment endpoint
└── livinityd (port 8080) — existing multi-user routing, unchanged

Router / DHCP
└── DHCP option 6 = 192.168.x.y  (either set on router OR dnsmasq takes over DHCP)

Client (any OS)
└── Gets DNS = 192.168.x.y via DHCP
    → queries dnsmasq → *.livinity.local resolves to mini-pc-ip
    → SNI TLS to Caddy → cert from internal CA
    → CA must be trusted (one-time enrollment)
```

**DNS strategy:** dnsmasq runs on the Mini PC, port 53. Single config line `address=/.livinity.local/<ip>` handles all present and future subdomains without any restart. `dhcp-option=6,<ip>` pushes the Mini PC as DNS server to all DHCP clients. Users who cannot or will not change their router's DHCP setting can instead manually point their device DNS to the Mini PC IP — this is the documented fallback in the enrollment wizard.

If the user's router runs dnsmasq natively (OpenWrt, pfSense, OPNsense, many ASUS routers via Merlin), an alternative is to push a single `address=/.livinity.local/<ip>` entry via the router's custom DNS entries UI — no dnsmasq on the Mini PC needed. This is an advanced option documented in the wizard.

**TLS strategy:** Caddy's `pki` block generates a named CA root on first start if `/opt/livos/data/pki/root.pem` does not exist. Alternatively, `step certificate create` or `openssl` can generate the root during install, and Caddy is pointed at it. The root cert is served at `http://livinity.local/ca.crt` (HTTP, not HTTPS — intentionally, to avoid the bootstrap CA-trust catch-22). Caddy issues a single `*.livinity.local` wildcard cert, renewed automatically.

**Multi-user routing in Caddy:** The existing `generateFullCaddyfile()` function in `caddy.ts` already has the right shape for multi-user mode (all subdomains → port 8080). A `localMode` flag adds:
1. Use `livinity.local` (or user-configured name) as `mainDomain`
2. Replace the TLS line with `tls { issuer internal { ca liv-local } }`
3. Add the `http://livinity.local:80 { ... }` block for CA cert download

**Enrollment UX:**
- Bootstrap: `http://<mini-pc-ip>:8080` — served by Caddy on :80 (no cert required)
- Enrollment wizard shows: QR code + platform-specific instructions + direct download link
- After CA install, users visit `https://livinity.local` (main page) then navigate to their subdomain
- Admin UI generates per-user subdomains in the existing users module

**Pros:**
- Works on all major platforms including Android Chrome (DNS resolution is independent of mDNS)
- No router firmware change required — only DHCP option 6, which is configurable on nearly all consumer routers
- True wildcard DNS — no per-user DNS updates needed
- Caddy's internal CA auto-renews certs without any intervention
- Minimal dnsmasq config: 3 lines
- Compatible with existing `caddy.ts` code with a targeted new code path

**Cons:**
- Android Chrome will not trust user-installed CAs regardless of DNS (rooted devices or system-image modifications aside) — documented separately in Section 6
- Running a DNS server on the Mini PC creates a potential single point of failure for all LAN DNS; dnsmasq's `server=<upstream>` mitigates non-local queries but if Mini PC is offline, all LAN devices lose DNS until they time out and fall back to their secondary
- Users must change their DHCP DNS setting (router admin UI) or manually set DNS on each device if they want the wildcard to work without per-device hosts-file entries
- dnsmasq port 53 may conflict with `systemd-resolved` on Ubuntu 24.04 (Mini PC OS) — requires `DNSStubListener=no` in resolved.conf

**Ubuntu 24.04 systemd-resolved conflict fix:**
```ini
# /etc/systemd/resolved.conf.d/no-stub.conf
[Resolve]
DNSStubListener=no
```
Then `systemctl restart systemd-resolved` before starting dnsmasq.

**Edge cases:**
- Some ISP-provided routers lock DHCP option 6 (e.g., BT Hub, some Comcast gateways) — fallback: dnsmasq takes over DHCP entirely (configure as authoritative DHCP, disable router DHCP)
- Consumer routers that run their own dnsmasq may intercept port 53 and refuse to forward `.local` queries to an upstream — LivOS wizard should detect this and suggest per-device DNS override
- VPN clients on the laptop (Tailscale, corporate VPN) may override the system DNS resolver — out of scope for LivOS to handle

---

### Approach C: mDNS for Gateway + Host-File Push on First Login

**Architecture:**
```
Mini PC
├── Avahi: publishes livinity.local → <mini-pc-ip>
├── livinityd: on first login, sends Set-Cookie + injects JS
│   └── JS fetches /api/local/hosts-snippet → returns per-user hosts entries
│   └── Extension / Android app shows "add to hosts" prompt
└── Caddy: wildcard block with internal CA (same as Approach B)

Client
└── mDNS resolves livinity.local → mini-pc-ip  (macOS/iOS only)
    → Logs in at http://livinity.local
    → JS injection suggests hosts-file entries for all user subdomains
    → Subsequent visits to bruce.livinity.local work IF hosts file was edited
```

**Analysis of feasibility:** This hybrid approach is fundamentally broken for the wildcard requirement. Browsers execute JavaScript in the page context, but they cannot write to the OS `/etc/hosts` file from a web page — that would be a critical security violation. The "injection" step requires either:
- A native companion app (significant additional engineering)
- Manual user action (eliminates the "seamless" goal)
- A browser extension with elevated permissions (complex, platform-specific, not available on iOS)

For iOS Safari there is no path at all: the hosts file is not user-editable without jailbreak.

**Verdict:** This approach does not solve the wildcard DNS problem. It is not recommended. It may be worth documenting as a "developer quick-start" where the developer manually adds one hosts entry and uses a path-based router instead of subdomains.

**Alternative within this approach — path-based routing instead of subdomains:** Use `livinity.local/<username>/` as the URL structure instead of `<username>.livinity.local`. This eliminates the DNS wildcard requirement entirely — a single mDNS record for `livinity.local` suffices. The tradeoff is that path-based routing requires significant changes to the multi-user app architecture (cookie scoping, iframe origins, Docker networking). Not recommended for the current architecture.

---

### Other Approaches Considered

**Tailscale / Headscale MagicDNS:** Tailscale's MagicDNS automatically issues `<device>.<tailnet>.ts.net` names with trusted HTTPS (via Let's Encrypt for ts.net). Headscale is a self-hosted control plane compatible with the official Tailscale clients. This "cheating but works" path solves DNS, TLS, and enrollment in one install — but it introduces a new dependency (Tailscale daemon on every client device), re-introduces cloud if using Tailscale SaaS, and is a networking overlay rather than a LAN-native solution. It is the right answer for the remote-access use case (non-goal), not for pure LAN-local.

**IP-only access with self-signed cert:** `https://192.168.x.y` with a self-signed cert. Works as a lowest-common-denominator fallback and requires no DNS infrastructure. The browser will show a persistent certificate warning that most users will not know how to bypass. Cookie SameSite/Secure restrictions make multi-user JWT handling fragile on IP-only HTTPS. Not suitable as the primary experience but useful as an emergency fallback if both dnsmasq and mDNS fail.

**`.test` TLD (RFC 6761):** RFC 6761 reserves `.test` for testing DNS implementations. Browsers have no special behavior for it — it behaves like an unknown TLD and will be sent to the configured DNS resolver. Using `livinity.test` instead of `livinity.local` avoids the mDNS namespace conflict (RFC 6762 reserves `.local` for mDNS exclusively) and avoids the RFC 8375 `home.arpa` verbosity. However, it provides no advantage over a `.local` name when used with dnsmasq, and some OS stub resolvers may try to look up `.test` on the public DNS root (resulting in NXDOMAIN delays before falling back to the configured resolver). `.internal` (no RFC reservation, but widely used in enterprise) or a fictional second-level domain like `livos.home` under `home.arpa` (RFC 8375) are both cleaner options.

**RFC 8375 `home.arpa`:** The IETF reserved `*.home.arpa` in RFC 8375 (2018) specifically for residential home network naming. `bruce.livinity.home.arpa` is technically correct but ugly. Consumer routers do not automatically handle `home.arpa` queries. Not recommended for UX reasons.

**Recommended TLD choice:** Use `livinity.local` as the default (familiar, short, mDNS-collision is tolerable since we're using dnsmasq which overrides mDNS for this name). Allow the admin to configure a custom name (e.g., `livos.home`, `myhome.local`) at first-run.

---

## 4. Recommendation

**Implement Approach B: dnsmasq + Caddy `pki` internal CA.**

### Justification against the four hard problems

**DNS:** dnsmasq with `address=/.livinity.local/<ip>` plus DHCP option 6 provides true wildcard resolution on all platforms including Android. No per-user DNS update needed. The Mini PC becoming the LAN DNS server is the correct architectural role — it already knows which users exist.

**TLS:** Caddy's `pki` block with a custom named CA produces a root certificate that can be exported, served over HTTP, and enrolled on any device. Caddy auto-renews the wildcard leaf cert. No external service. No renewal failures.

**Caddy routing:** The change to `caddy.ts` is minimal — a `localMode` flag triggers: (1) use `.local` domain, (2) swap TLS directive to `issuer internal`. The existing multi-user wildcard routing (`all subdomains → 8080`) is already built and tested.

**Enrollment UX:** A single well-known HTTP endpoint (`http://livinity.local/ca.crt`) plus a platform-aware wizard in the LivOS UI covers macOS, Windows, Linux, and iOS. Android remains a problem (see Section 6), but for Android 14+ there is a documented workaround via the Private Network Access API and the upcoming Android system CA trust path.

### Acknowledged trade-offs

- Users must change their router's DHCP DNS setting or manually configure DNS on each device. This is a one-time action, but it requires some technical comfort. The wizard must walk them through it with router-specific screenshots.
- Android Chrome on non-rooted devices will get a certificate error regardless of DNS resolution. This is a browser security policy, not an architecture failure. The enrollment wizard must acknowledge this and offer either: (a) IP-based access with a persistent bypass, or (b) instruction to use the Android Firefox browser (which respects user-installed CAs).
- dnsmasq port 53 conflicts with Ubuntu 24.04's `systemd-resolved` stub listener — a one-line config fix documented above.

---

## 5. Concrete Implementation Outline

The following phases extend the current LivOS phase numbering (last used: 103).

---

### Phase 104: dnsmasq Service — Install, Configure, systemd

**Deliverable:** dnsmasq running on the Mini PC, serving `*.livinity.local → <mini-pc-ip>` and acting as a pass-through DNS for all other queries.

**Files/services touched:**
- New: `livos/packages/livinityd/source/modules/local-dns/` (dnsmasq config generator, service manager)
- New: `scripts/install-dnsmasq.sh` — installs dnsmasq, writes `/etc/systemd/resolved.conf.d/no-stub.conf`, enables service
- Modified: `livos/packages/livinityd/source/modules/domain/routes.ts` — add `localDns.enable` / `localDns.disable` tRPC mutations

**Acceptance test:**
1. After running install script on Mini PC: `dig @localhost bruce.livinity.local` returns the Mini PC's LAN IP.
2. `dig @localhost google.com` still resolves via upstream (1.1.1.1).

---

### Phase 105: Caddy Local PKI CA Generation

**Deliverable:** Caddy configured with a named custom CA (`liv-local`). Root cert and key generated on first run, stored at `/opt/livos/data/pki/`. Root cert served at `http://<ip>:80/ca.crt`.

**Files/services touched:**
- Modified: `livos/packages/livinityd/source/modules/domain/caddy.ts` — `generateFullCaddyfile()` gains `localMode: boolean` parameter; emits `pki { ca liv-local { ... } }` global block and `tls { issuer internal { ca liv-local } }` leaf directive
- Modified: `/etc/caddy/Caddyfile` generation path — new `localMode` branch in `applyCaddyConfig()`
- New: `livos/packages/livinityd/source/modules/local-dns/pki.ts` — CA root generation (openssl or step-ca CLI wrapper), path constants

**Acceptance test:**
1. `curl -k https://bruce.livinity.local` returns 200 (cert untrusted expected at this stage).
2. `openssl x509 -in /opt/livos/data/pki/root.pem -noout -subject` shows `CN=LivOS Local CA`.

---

### Phase 106: Caddy Wildcard Virtual Host for Local Mode

**Deliverable:** Caddyfile generated with a single `*.livinity.local` block using the `liv-local` internal issuer. All subdomains route to livinityd port 8080.

**Files/services touched:**
- Modified: `livos/packages/livinityd/source/modules/domain/caddy.ts` — new `generateLocalCaddyfile(localDomain: string): string` function
- Modified: `livos/packages/livinityd/source/modules/domain/routes.ts` — new `local.activate` tRPC mutation that (a) writes local Caddyfile, (b) reloads Caddy, (c) writes `livos:domain:local_mode=true` to Redis
- Modified: `livos/packages/config/src/domains.ts` — add `local` domain resolution path used by UI

**Acceptance test:**
1. After `local.activate` mutation: `cat /etc/caddy/Caddyfile` contains `*.livinity.local` and `issuer internal`.
2. `curl --cacert /opt/livos/data/pki/root.pem https://bruce.livinity.local` returns 200 with no certificate errors.

---

### Phase 107: CA Enrollment Endpoint + Enrollment Wizard UI

**Deliverable:** `GET /api/local/ca.crt` endpoint serves the DER-encoded CA root. New "Local Setup" wizard screen in the UI (Settings > Network > Local Access) with QR code, platform-detect instructions, and download button.

**Files/services touched:**
- Modified: `livos/packages/livinityd/source/modules/server/index.ts` — add public route `/api/local/ca.crt` that reads `/opt/livos/data/pki/root.pem` and returns with `Content-Type: application/x-509-ca-cert`
- New: `livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx` — step-by-step wizard (platform detection, QR code, instructions, DNS config guide)
- Modified: Settings menu routing to include LocalSetupWizard

**Acceptance test:**
1. `curl http://<mini-pc-ip>:8080/api/local/ca.crt` returns binary DER data with correct MIME type.
2. Wizard renders all four platform tabs (macOS, Windows, iOS, Android) with correct instructions when navigated to in the UI.

---

### Phase 108: DHCP Option 6 Guide + DNS Detection in Wizard

**Deliverable:** Wizard step that auto-detects whether the LAN DNS is already pointing at the Mini PC. If not, shows router-specific DHCP option 6 configuration instructions (with screenshots for common brands: ASUS, TP-Link, Netgear, Synology Router, OpenWrt). Includes "Manual DNS" fallback instructions for per-device configuration.

**Files/services touched:**
- New: `livos/packages/livinityd/source/modules/local-dns/detect.ts` — queries a known LAN hostname via the client's resolver and checks if it returns the Mini PC IP; exposes `GET /api/local/dns-status`
- Modified: `livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx` — DNS status polling step

**Acceptance test:**
1. `GET /api/local/dns-status` returns `{ "wildcard": true, "mini_pc_is_dns": true }` when client DNS is pointed at Mini PC.
2. Wizard shows a green checkmark when DNS is correctly configured.

---

### Phase 109: livinityd Mode Persistence + Boot Behavior

**Deliverable:** livinityd detects on startup whether `livos:domain:local_mode=true` in Redis and, if so, (a) ensures dnsmasq is running and config is correct, (b) regenerates the local Caddyfile if it does not exist, (c) does not attempt Let's Encrypt or Cloudflare DNS challenges.

**Files/services touched:**
- Modified: `livos/packages/livinityd/source/index.ts` — startup sequence: check `local_mode`, call `ensureLocalDnsRunning()` and `ensureLocalCaddyfile()`
- Modified: `livos/packages/livinityd/source/modules/domain/routes.ts` — `local.getStatus` query returns `{ mode: 'local' | 'cloud', domain, caInstalled, dnsOk }`

**Acceptance test:**
1. After Mini PC reboot, `https://bruce.livinity.local` loads without manual Caddy reload.
2. `trpc.domain.local.getStatus` returns `{ mode: 'local', dnsOk: true }`.

---

### Phase 110: Android Firefox Fallback + IP Bypass Mode

**Deliverable:** UI banner for Android users noting Chrome limitation, linking to Firefox download. IP-based HTTPS access (`https://<ip>:443`) with a persistent self-signed bypass serves as an emergency fallback with a user-visible cert warning acknowledgment stored in localStorage.

**Files/services touched:**
- Modified: `livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx` — Android tab includes Firefox recommendation
- Modified: `livos/packages/livinityd/source/modules/domain/caddy.ts` — `generateLocalCaddyfile()` adds an IP block with self-signed cert for direct IP access
- New: `livos/packages/ui/src/features/cert-bypass/CertBypassBanner.tsx` — shown when `window.location.hostname` is an IP address

**Acceptance test:**
1. `https://192.168.x.y` shows a LivOS-branded cert-warning acknowledgment page rather than a raw browser error.
2. After acknowledging, the full LivOS UI loads.

---

## 6. Open Questions

### Q1: Android system CA store on non-rooted Android 14+

Android 14 moved the system CA store to an APEX module (`com.android.conscrypt`), which is read-only even with root. Chrome on Android trusts only this system store. The only known paths for non-rooted Android are: (a) use Firefox which has its own NSS trust store and respects user-installed CAs; (b) the device is enrolled in an enterprise MDM which can push to the system store; (c) Android 14 Private Space feature (limited to specific enterprise scenarios). **Question to resolve before Phase 110:** Is there a reliable non-MDM path for Chrome on Android 14+ to trust a user-installed CA? Track Android issue tracker #140786115 and Chromium bug #405925. If no path exists, Firefox becomes the canonical recommendation for Android.

### Q2: dnsmasq DHCP conflict on Mini PC when router also runs DHCP

If the user's router runs DHCP and the Mini PC also runs dnsmasq with a DHCP range, clients may get conflicting DHCP offers. The safe default is to run dnsmasq in DNS-only mode (no `dhcp-range` in config) and rely on the router's DHCP option 6 setting for DNS distribution. However, if the router does not support option 6 (some ISP-provided routers), the only path without per-device manual configuration is for dnsmasq to take over DHCP entirely. **Question to resolve before Phase 104 implementation:** What is the correct detection heuristic for "router supports DHCP option 6"? Should LivOS default to DNS-only mode and require router configuration, or should it attempt to negotiate with the router?

### Q3: mDNS conflict when both Avahi and dnsmasq serve `.local`

Running dnsmasq alongside Avahi creates a race: a `.local` query may be answered by dnsmasq (unicast) or by Avahi (multicast). On macOS/iOS, the system resolver sends `.local` queries only via mDNS (RFC 6762 §3), ignoring the configured unicast DNS for `.local`. This means dnsmasq's `address=/.livinity.local/` rules will be bypassed by macOS/iOS even if the Mini PC is set as their DNS server. **Question to resolve before Phase 104:** Does `address=/.livinity.local/` in dnsmasq actually reach macOS/iOS clients, or does the OS mDNS resolver intercept all `.local` queries before forwarding to the configured DNS? If the latter, should LivOS use `.livos.home` or `.internal` instead of `.livinity.local`? Testing on macOS 14 Sonoma and iOS 17 is required. See also: dnsmasq `local=/livinity.local/` option which marks the domain as local-only and prevents forwarding to upstream — behavior on macOS clients when DNS option 6 is set needs empirical verification.

### Q4: mDNS reliability across Wi-Fi/Ethernet bridge on consumer routers

mDNS multicast packets (224.0.0.251) are not forwarded by default across VLAN boundaries or between wired and wireless segments on consumer routers. Most home routers bridge Wi-Fi and Ethernet into a single broadcast domain, so mDNS works. But routers with "AP isolation" enabled (common on guest networks) and routers that implement separate SSIDs as separate VLANs (some Netgear, Eero, Google Nest routers) will silently drop mDNS. dnsmasq as the unicast DNS resolver is immune to this problem since it uses standard UDP/TCP. **Question to resolve:** Should the enrollment wizard include a test that detects AP isolation and warns the user? What is the correct behavioral flag in the wizard for this case?

### Q5: Caddy `pki` block persistence across Caddyfile regeneration

Every call to `generateFullCaddyfile()` in `caddy.ts` currently produces a fresh Caddyfile string. The global `pki` block referencing `/opt/livos/data/pki/root.pem` must be present in every regeneration or Caddy will fall back to its default local CA (a different root, breaking existing enrolled clients). The existing code in `caddy.ts` does not have a concept of "global options block" — it only builds virtual-host blocks. **Question to resolve before Phase 106:** Should the PKI global block be injected at the top of every `generateFullCaddyfile()` call when local mode is active? Or should a separate `/etc/caddy/pki-global.conf` be included via Caddy's `import` directive? The `import` approach is cleaner and reduces the risk of the PKI block being accidentally omitted during regeneration.

---

## References

- RFC 6762 — Multicast DNS: https://datatracker.ietf.org/doc/html/rfc6762
- RFC 6761 — Special-Use Domain Names: https://www.rfc-editor.org/rfc/rfc6761.html
- RFC 8375 — Special-Use Domain `home.arpa.`: https://www.rfc-editor.org/rfc/rfc8375.html
- Caddy Automatic HTTPS docs: https://caddyserver.com/docs/automatic-https
- Caddy `tls` directive: https://caddyserver.com/docs/caddyfile/directives/tls
- Caddy global options (pki block): https://caddyserver.com/docs/caddyfile/options
- Smallstep step-ca private ACME server: https://smallstep.com/blog/private-acme-server/
- go-avahi-cname: https://github.com/grishy/go-avahi-cname
- Apple iOS certificate trust settings: https://support.apple.com/en-us/102390
- Android mDNS support (esper.io): https://www.esper.io/blog/android-dessert-bites-26-mdns-local-47912385
- Android issue tracker — mDNS .local resolution: https://issuetracker.google.com/issues/140786115
- Chromium bug — .local Android Chrome: https://bugs.chromium.org/p/chromium/issues/detail?id=405925
- Let's Encrypt — no .local certs: https://community.letsencrypt.org/t/certificates-for-devices-only-reachable-via-local/22908
- dnsmasq man page: https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html
