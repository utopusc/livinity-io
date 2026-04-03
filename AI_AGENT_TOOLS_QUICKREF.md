# AI Agent Tools - Quick Reference for Livinity Integration

## Top 10 Tools Summary (March 2026)

### 1. CrewAI — Multi-Agent Orchestration Framework
- **Category:** Framework (Python)
- **Self-Hosted:** Yes (open source) + enterprise factory option
- **Cost:** Free (OSS) / Commercial (Factory/AMP)
- **LLM Support:** Claude, GPT, local models, any provider
- **Key Strength:** De-facto standard, 1.4B automations globally, role-based agents
- **Livinity Integration:** HIGH — Could power core agent orchestration
- **GitHub:** [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)

---

### 2. n8n — Workflow Automation Platform
- **Category:** Platform (Node.js/TypeScript)
- **Self-Hosted:** Yes (Docker, Kubernetes)
- **Cost:** Free self-hosted / $50+/mo cloud
- **Integration Count:** 400+
- **Key Strength:** Visual builder + 400 integrations, fair-code license
- **Livinity Integration:** HIGH — Ship as native Livinity app
- **GitHub:** [n8n-io/n8n](https://github.com/n8n-io/n8n)

---

### 3. Langflow — Low-Code AI Workflow Builder
- **Category:** Platform (Python)
- **Self-Hosted:** Yes (Docker)
- **Cost:** Free (open source)
- **LLM Support:** Any LLM (Claude, GPT, local)
- **Key Strength:** Visual builder for AI/LLM workflows, RAG templates
- **Livinity Integration:** EXCELLENT — Perfect for non-technical users
- **GitHub:** [FlowiseAI/Langflow](https://www.langflow.org/)

---

### 4. Skyvern — Browser Automation via AI
- **Category:** Platform (Python)
- **Self-Hosted:** Yes (Docker Compose)
- **Cost:** Free (open source)
- **Strength:** Form-filling, RPA, web scraping, vision-based
- **Livinity Integration:** HIGH — Enable user RPA automation
- **GitHub:** [Skyvern-AI/skyvern](https://github.com/Skyvern-AI/skyvern)

---

### 5. Claude Cowork — Enterprise AI Agent System
- **Category:** Platform (SaaS/proprietary)
- **Self-Hosted:** No (cloud only)
- **Cost:** Enterprise (no public pricing)
- **Key Strength:** Anthropic's "GSD for non-developers", 10+ plugins (Feb 2026)
- **Livinity Integration:** LOW — Cloud only, closed source, but MCP compatible
- **Official:** [Claude Agents](https://claude.com/solutions/agents)

---

### 6. Zapier AI Agents — No-Code Automation
- **Category:** Platform (SaaS only)
- **Self-Hosted:** No
- **Cost:** Paid (per task)
- **Integration Count:** 8,000+
- **Key Strength:** Broadest ecosystem of integrations
- **Livinity Integration:** MODERATE — Use as external service only
- **Official:** [Zapier Agents](https://zapier.com/blog/zapier-agents-guide/)

---

### 7. OpenClaw — Personal AI Agent Framework
- **Category:** Framework (Python/multi-language)
- **Self-Hosted:** Yes
- **Cost:** Free (open source)
- **Tool Integration:** 860+ via MCP
- **Key Strength:** Very powerful, 24/7 automation, messaging integration
- **Livinity Integration:** MODERATE (security concerns) — Adapt for multi-user
- **GitHub:** [openclaw/openclaw](https://github.com/openclaw/openclaw)
- **⚠️ WARNING:** Security vulnerabilities, not suitable for sensitive business workflows without hardening

---

### 8. Nextcloud AI Assistant — Self-Hosted Collaboration + AI
- **Category:** Platform (PHP, built into Nextcloud)
- **Self-Hosted:** Yes (within Nextcloud)
- **Cost:** Free (open source) + optional cloud
- **Key Strength:** Integrated within collaboration suite (files, calendar, contacts)
- **Livinity Integration:** HIGH — Complementary to Livinity's mission
- **Official:** [Nextcloud AI Assistant](https://nextcloud.com/assistant/)

---

### 9. Leon AI — Privacy-First Personal Assistant
- **Category:** Framework (Node.js + Python)
- **Self-Hosted:** Yes
- **Cost:** Free (MIT license)
- **Strength:** Voice + text, privacy-first, modular
- **Livinity Integration:** MODERATE — Early-stage, good for voice UI
- **GitHub:** [leon-ai/leon](https://github.com/leon-ai/leon)

---

### 10. Model Context Protocol (MCP) — Tool Integration Standard
- **Category:** Standard (Anthropic)
- **Status:** Industry de-facto (OpenAI adopted March 2025)
- **Key Strength:** Open standard, 1000+ community servers, future-proof
- **Livinity Integration:** CRITICAL — Already using nexus-mcp, expand coverage
- **Official:** [Model Context Protocol](https://modelcontextprotocol.io/)

---

## Quick Decision Tree

### "I need to automate business workflows"
→ **n8n** (self-hosted, 400+ integrations) or **Langflow** (AI-first)

### "I need multi-agent orchestration"
→ **CrewAI** (industry standard, role-based teams)

### "I need to automate web forms/RPA"
→ **Skyvern** (browser automation, AI vision)

### "I need AI agents in my platform"
→ **CrewAI** (framework) + **Langflow** (visual builder) + **MCP** (tool integration)

### "I need personal automation without cloud"
→ **OpenClaw** (but security review needed) or **Leon** (lighter, privacy-focused)

### "I want cloud but broadest integrations"
→ **Zapier Agents** (8,000+ apps, no self-hosting)

### "I want collaboration + AI together"
→ **Nextcloud AI Assistant** (files + calendar + AI)

---

## Integration Complexity Comparison

| Tool | Integration Complexity | Setup Time | Learning Curve |
|------|----------------------|-----------|-----------------|
| n8n | Low (visual builder) | 15 min | Easy |
| Langflow | Low (visual builder) | 15 min | Easy |
| CrewAI | Medium (code-based) | 30 min | Medium |
| Skyvern | Medium (Docker) | 15 min | Medium |
| OpenClaw | Medium (multi-component) | 30 min | Hard |
| Leon | Medium (Node.js + Python) | 30 min | Hard |
| MCP | High (custom servers) | 1-2 hrs | Hard |
| Zapier | Very Low (UI only) | 5 min | Very Easy |
| Nextcloud | Low (installed within NC) | 5 min | Easy |

---

## Self-Hosting Comparison

| Platform | Docker | Kubernetes | VPS | On-Prem | RAM | Storage |
|----------|--------|-----------|-----|---------|-----|---------|
| **n8n** | ✅ | ✅ | ✅ | ✅ | 1GB+ | 5GB+ |
| **Langflow** | ✅ | ✅ | ✅ | ✅ | 2GB+ | 5GB+ |
| **CrewAI** | ✅ | ✅ | ✅ | ✅ | 2GB+ | 2GB+ |
| **Skyvern** | ✅ | ✅ | ✅ | ✅ | 4GB+ | 10GB+ |
| **OpenClaw** | ✅ | ~  | ✅ | ✅ | 2GB+ | 5GB+ |
| **Leon** | ✅ | ~  | ✅ | ✅ | 1GB+ | 3GB+ |
| **Nextcloud** | ✅ | ✅ | ✅ | ✅ | 2GB+ | 20GB+ |
| **Zapier** | ❌ | ❌ | ❌ | ❌ | N/A | N/A |

---

## LLM Provider Support

| Tool | Claude | OpenAI | Local | Kimi | Azure | Gemini |
|------|--------|--------|-------|------|-------|--------|
| CrewAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| n8n | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Langflow | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Skyvern | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OpenClaw | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leon | ✅ | ✅ | ✅ | ~ | ✅ | ~ |
| Nextcloud | ✅ | ✅ | ✅ | ~ | ✅ | ✅ |

---

## Livinity Integration Priority Matrix

```
HIGH VALUE + EASY INTEGRATION:
  ├─ n8n (workflow automation, 400+ integrations)
  ├─ Langflow (visual AI builder, no-code for users)
  └─ Skyvern (RPA/browser automation)

HIGH VALUE + MEDIUM INTEGRATION:
  ├─ CrewAI (multi-agent orchestration)
  └─ MCP servers (expose Livinity apps to Claude/GPT)

MEDIUM VALUE + EASY INTEGRATION:
  └─ Nextcloud AI (complementary collaboration)

INTERESTING + NEEDS SECURITY WORK:
  └─ OpenClaw (powerful but security review needed)

REFERENCE/INSPIRATION ONLY:
  ├─ Claude Cowork (cloud only, closed source)
  └─ Zapier Agents (cloud only, good integration example)
```

---

## 2025-2026 Market Insights

### What's Working
- Multi-agent frameworks (CrewAI, LangGraph)
- Self-hosted automation (n8n, Langflow)
- Vision-based RPA (Skyvern)
- Human-in-the-loop workflows (Relay.app)
- MCP as integration standard

### What's Hype (Be Skeptical)
- "AI agents" labels on simple automation workflows
- Full autonomous agents without human oversight (80-90% fail)
- Broad permission models (OpenClaw pattern)
- Cloud-only solutions (lock-in risk)

### Market Gaps Livinity Could Fill
1. **Self-hosted + multi-user** — Most self-hosted tools are single-user
2. **Home/family automation** — Most tools focus on enterprise workflows
3. **Privacy + power** — Need to balance control + ease-of-use
4. **Extensibility marketplace** — Users can share custom agents/workflows

---

## Recommended Implementation Plan

### Phase 1 (v7.5): Foundations
- [ ] Expand nexus-mcp coverage (file ops, app control, etc.)
- [ ] Document MCP server creation for power users
- [ ] Add MCP explorer in Livinity UI (show available tools)

### Phase 2 (v8.0): Visual Builders
- [ ] Integrate Langflow as native Livinity app
- [ ] Allow users to build no-code automation flows
- [ ] Connect Langflow workflows to Livinity apps via MCP

### Phase 3 (v8.5): RPA Capability
- [ ] Deploy Skyvern within Livinity
- [ ] "Web Automation" app for form-filling, scraping, workflows
- [ ] Pre-built templates (invoice automation, signup automation, etc.)

### Phase 4 (v9.0): Multi-Agent Orchestration
- [ ] CrewAI integration for advanced workflows
- [ ] "Livinity Agents" marketplace concept
- [ ] Per-user agent sandboxing and cost controls

### Phase 5 (v10.0): Enterprise Features
- [ ] Human-in-the-loop approval gates
- [ ] Agent audit trails + compliance logging
- [ ] Voice interface (Leon-style)

---

## Key Files for Reference

**Full Research:** `/AI_AGENT_TOOLS_RESEARCH.md` (comprehensive 5000+ word analysis)
**This Document:** Quick decision tree + comparison matrices

---

Last Updated: March 28, 2026
Research Quality: Sources from ProductHunt, HackerNews, GitHub, DigitalOcean, Official Docs
