# Security & Pitfalls: Remote PC Control Agent (v14.0)

**Domain:** Cross-platform remote PC control with AI-driven operations
**Researched:** 2026-03-23
**Confidence:** HIGH

## Security Model Comparison: E2EE vs TLS+Token

### Option A: TLS + Token Auth (RECOMMENDED for v14.0)

**How it works:**
- Agent <-> Relay: WSS (TLS 1.3) + device JWT token
- LivOS <-> Relay: WSS (TLS 1.3) + API key (existing)
- Relay can see message content (but relay is self-hosted/trusted)

**Pros:**
- Simple implementation — JWT validation, standard TLS
- Relay can inspect/log messages for debugging
- Works with existing relay code patterns
- Can add E2EE later as an upgrade

**Cons:**
- Relay is a trust point — compromised relay = compromised commands
- If relay is hacked, attacker can send commands to agents

**Mitigations:**
- Relay runs on Server5 (user-controlled VPS, not shared hosting)
- Short-lived device tokens (24h, auto-refresh)
- Rate limiting on relay
- Agent-side command allowlist

### Option B: End-to-End Encryption (E2EE)

**How it works:**
- Agent and LivOS exchange public keys during device registration
- All tool_call/tool_result messages encrypted with NaCl box (X25519 + XSalsa20-Poly1305)
- Relay only sees encrypted blobs, cannot read content

**Pros:**
- Relay compromise doesn't expose commands
- Zero-trust architecture
- Forward secrecy with key rotation

**Cons:**
- Complex key exchange during registration
- Key storage on both sides (secure keychain vs file)
- Debugging harder (can't inspect traffic at relay)
- Key rotation requires coordinated protocol
- More code = more attack surface

### RECOMMENDATION: TLS+Token for v14.0, E2EE optional for v15.0

TLS+Token is sufficient because:
1. The relay is self-hosted (Server5) — user controls it
2. Traffic is already encrypted in transit (WSS/TLS 1.3)
3. Implementation complexity of E2EE delays shipping
4. E2EE can be layered on top later without protocol changes

## Critical Security Pitfalls

### 1. Device Token Theft (HIGH RISK)
**Attack:** Stolen device token allows attacker to impersonate agent
**Mitigation:**
- Tokens stored encrypted at rest (OS keychain: Windows DPAPI, macOS Keychain, Linux libsecret)
- Token bound to device fingerprint (hostname + OS + MAC hash)
- Token rotation every 24h
- Revoke token from livinity.io dashboard

### 2. Relay Server Compromise (HIGH RISK)
**Attack:** Attacker gains access to relay, sends malicious commands
**Mitigation:**
- Agent-side command allowlist (only execute known tool names)
- Agent requires valid request signatures (HMAC with shared secret)
- Rate limiting: max 10 commands/second per device
- All commands logged on agent side for forensic analysis

### 3. AI Command Injection (HIGH RISK)
**Attack:** Malicious prompt causes AI to execute dangerous commands on PC
**Mitigation:**
- Per-device permission matrix (shell: allowed/denied, files: path-restricted)
- Dangerous command blocklist (rm -rf /, format, registry delete, etc.)
- Confirmation required for destructive operations (sent back to user)
- AI operates with principle of least privilege

### 4. Man-in-the-Middle on Agent Install (MEDIUM RISK)
**Attack:** Tampered agent binary during download
**Mitigation:**
- Code signing (Windows: Authenticode, macOS: codesign, Linux: GPG)
- SHA256 checksum verification
- Download over HTTPS only

### 5. Privilege Escalation (MEDIUM RISK)
**Attack:** Agent runs as root/SYSTEM, AI commands have unlimited access
**Mitigation:**
- Agent runs as the logged-in user by default (NOT root/SYSTEM)
- Elevated mode is opt-in with explicit warning
- sudo/admin commands require per-operation confirmation

### 6. Cross-Platform Shell Injection (MEDIUM RISK)
**Attack:** Crafted command with shell metacharacters
**Mitigation:**
- Use array-based spawn (not shell string)
- Sanitize inputs on agent side before execution
- Log raw commands for audit

## Maximum Security Checklist

- [ ] TLS 1.3 for all transport (no fallback)
- [ ] Device tokens: JWT with 24h expiry, auto-refresh, device-bound
- [ ] Token storage: OS keychain (DPAPI/Keychain/libsecret)
- [ ] Agent binary: code-signed + SHA256 checksum
- [ ] Command allowlist on agent side
- [ ] Dangerous command blocklist
- [ ] Rate limiting: 10 cmd/s per device
- [ ] Audit log: every command with timestamp, user, result
- [ ] Per-device permissions configurable from UI
- [ ] Agent runs as user (not root/SYSTEM) by default
- [ ] Uninstall revokes token
- [ ] Terminal output sanitized before browser rendering

---
*Security research for: Remote PC Control Agent (v14.0)*
*Researched: 2026-03-23*
