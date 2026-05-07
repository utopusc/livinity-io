# Warmwind AI OS — Research Summary

**Date**: 2026-05-07
**Researcher**: technical-researcher subagent (Claude Sonnet 4.6)
**Repo HEAD verified**: N/A (closed-source product)

---

## 1. What is Warmwind?

Warmwind is a cloud-native "AI Operating System" built by **eva AG**, a ~10-person startup headquartered in Jena, Germany. The company exited stealth in July 2025 with a €1.5 million seed round (investors: bm-t Beteiligungsmanagement Thüringen, BRT Ventures, private angel) and entered closed beta with a 12,000+ person waitlist. The headline pitch: a fully autonomous "cloud employee" that performs repetitive office workflows visually — clicking, typing, reading screens, and navigating apps — without requiring API integrations. It is marketed toward SMEs as a low-code alternative to RPA tools like UiPath/Automation Anywhere, positioned as "the first AI OS from Germany."

---

## 2. Architecture (Best-Effort Reverse Engineering)

### How each "app" is rendered
Each authenticated user login triggers an orchestrator that spins up a **dedicated isolated container** running a custom minimal Linux distribution. Applications run inside this per-user container (a real desktop environment, not a browser sandbox or iframe). The container hosts a Wayland compositor that captures display output and streams it to the browser.

No evidence of sandboxed iframes or Chromium pixel-streaming found. This is closer to a **cloud desktop / VDI pattern** than a per-app stream.

### Streaming / transport tech
Publicly documented: **Wayland compositor + VNC protocol** to deliver GUI frames to the browser. The company describes it as "kind of like an HDMI cable to your web client." They also claim **adaptive bitrate streaming** — the compositor encodes frames into a video stream and adjusts quality in real time based on network conditions. The specific VNC variant (noVNC over WebSocket? a custom VNC-to-WebRTC bridge?) is **not disclosed publicly**. noVNC over WebSocket is the most common open-source approach for browser-delivered VNC, but Warmwind has not confirmed this. (speculative)

### User input forwarding
Mouse movements, clicks, keyboard strokes, and scroll events are captured in the browser client and sent back to the remote session with low-latency prioritization. The company claims "actions feel instant." The exact transport for input events (WebSocket alongside the stream, or piggybacked on the VNC channel) is **unverified**.

### Where AI lives in the stack
AI is **fully server-side**. Warmwind uses a proprietary **VTAM (Vision and Text-based Action Model)** combined with a **VLLM (Vision Large Language Model)** as the execution brain. The VTAM processes real-time screen captures (vision-based inputs), interprets UI elements (buttons, forms, dropdowns), and issues simulated mouse/keyboard actions. The AI does not run in the browser. All inference happens in the cloud container on German infrastructure. Warmwind explicitly states it does not use third-party AI APIs (no OpenAI, Anthropic, etc.) — the model is proprietary and self-hosted.

---

## 3. Core Features

| Feature | Detail |
|---|---|
| **App library / adding apps** | Integrated in-product app store; "one-click install" for pre-vetted apps. Works with Gmail, Google Docs, Excel, Slack, SAP, Salesforce, LinkedIn, WhatsApp, Shopify. No public details on adding custom/arbitrary URLs. |
| **Per-app streaming** | Not per-app — the entire desktop session is streamed. Apps run inside the shared container and appear in the streamed desktop. |
| **Teaching mode** | User performs a task live once (e.g., clicking through invoice processing in SAP); the AI observes and replicates the workflow. Described as "instruction tuning via demonstration." |
| **Prompting mode** | Natural language instruction ("Answer all my emails") triggers autonomous execution. |
| **AI autonomy** | Fully autonomous after initial training. Agents run 24/7, handle workload surges (claim: spin up 1 to 1,000 agents in minutes). |
| **Persistence** | Sessions persist server-side — tasks continue running even when the browser tab is closed. Cloud storage for files/preferences is "always available." Cross-device access implied (any browser can reconnect). |
| **Multi-tenancy / isolation** | Each user session runs in its own container with "strict permissions." Environments are completely isolated — no cross-contamination between users. |
| **Pricing** | Undisclosed as of closed beta (July 2025). Free during beta. Post-launch pricing expected to target enterprise tier. |
| **On-premise option** | Mentioned as a roadmap item — "modular architecture that also allows for on-premise deployment within corporate environments." |
| **Open-source SDK** | Referenced as a future plan; no repo published as of research date. |
| **Data sovereignty** | German servers, GDPR-compliant, end-to-end encryption claimed. |

---

## 4. Tech Stack Signals (Verified from Public Sources Only)

| Layer | Signal | Source Confidence |
|---|---|---|
| **Guest OS** | Custom minimal Linux distribution (Debian-based lineage implied) | High — company blog states this explicitly |
| **Display server** | Wayland compositor (custom, proprietary) | High — multiple official sources |
| **Streaming protocol** | VNC (variant unspecified) + adaptive bitrate encoding | High — official blog |
| **Transport to browser** | WebSocket assumed for VNC delivery; not confirmed | Low — speculative |
| **AI inference** | Proprietary VTAM + VLLM, self-hosted on German cloud | High — official sources |
| **Container runtime** | Unspecified (Docker/LXC/VM not named) | Unverified |
| **Container orchestration** | "Orchestrator" mentioned but tech unnamed (Kubernetes?) | Unverified |
| **Cloud provider** | German cloud; provider not named (Hetzner? OVH? Telekom?) | Unverified |
| **Frontend framework** | Not disclosed | Unverified |
| **Open-source components** | No specific repos named; future open-source SDK planned | Not yet available |

---

## 5. Three Patterns LivOS Could Borrow

1. **Teaching mode / workflow recording**: The pattern of letting a user demonstrate a task once in a running desktop session while an AI agent observes and records the action sequence — then replays it autonomously — is directly applicable to LivOS's agent loop. LivOS already has a computer-use capable agent (bytebot/MCP); adding a "record this session" toggle that feeds screenshots + actions into an agent memory store would replicate this UX.

2. **Per-user container spin-up on login**: Warmwind's orchestrator creates a dedicated isolated Linux container per authenticated user on login. LivOS v7.0 already has per-user Docker isolation for apps; extending that to spin up a full per-user agent workspace (with its own Wayland/VNC session) on login would enable the same "dedicated cloud desktop per user" model — relevant for LivOS's planned multi-user agent sharing.

3. **Background-persistent task execution with browser-agnostic reconnect**: The architecture where agent tasks continue running server-side after the browser tab closes, and any browser can reconnect to the live stream, solves a UX problem LivOS has today (if the chat tab closes, the agent stops). Decoupling agent execution lifecycle from the WebSocket connection lifetime — storing task state in Redis/Postgres and allowing reconnect — is the specific pattern to adopt.

---

## Sources

- [BGR — Warmwind AI OS: How It Works](https://www.bgr.com/tech/the-worlds-first-ai-operating-system-wants-to-automate-your-workflow/)
- [Warmwind Official Blog — We Built an OS for AI](https://about.warmwind.com/we-built-an-operating-system-for-ai-but-is-it-really-one/)
- [Warmwind Official Blog — Closed Beta Announcement](https://about.warmwind.com/warmwind-closed-beta/)
- [Warmwind Official Blog — Vision vs MCP Architecture](https://about.warmwind.com/vision-vs-mcp-the-architecture-war-shaping-autonomous-ai-agents/)
- [Geeky Gadgets — How Warmwind OS Works](https://www.geeky-gadgets.com/warmwind-os-ai-operating-system/)
- [Geeky Gadgets — Warmwind Autonomous Cloud Employees](https://www.geeky-gadgets.com/warmwind-os-autonomous-cloud-employees/)
- [Startbase — Warmwind exits stealth with €1.5M seed](https://www.startbase.com/news/warmwind-verlaesst-stealth-modus-mit-15-mio-euro-seed/)
- [AIWorld — Warmwind raises €1.5M](https://aiworld.eu/story/warmwind-raises-15m-to-launch-ai-native-operating-system-for-office-automation)
- [Medium / warmwind — OS for AI](https://medium.com/@warmwind/we-built-an-operating-system-for-ai-but-is-it-really-one-e4d9ef3fec97)
- [Medium / warmwind — Vision vs MCP](https://medium.com/@warmwind/vision-vs-mcp-the-architecture-war-shaping-autonomous-ai-agents-3ed4701314a4)
- [SK Tech — WarmWind OS](https://sktech.biz/blogs/2025/warmwind-os-the-ai-native-operating-system-redefining-work/)
- [DEV Community — Warmwind OS overview](https://dev.to/bhuvaneshm_dev/warmwind-os-2fo9)
