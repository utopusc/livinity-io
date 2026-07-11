/**
 * src/renderer/window.d.ts
 *
 * The ONE place `window.api`'s type is declared for the renderer. Widens the
 * Phase-1 `ShellApi & DevSpikeApi` surface to also include `AuthApi` (Plan
 * 01/04), `CfApi` (Phase 3 Cloudflare wizard), `WslApi` (Phase 4 WSL2
 * provisioning), and `FlowApi` (Phase 5 install orchestration) -- every
 * renderer file (App.tsx, screens/, components/) imports from this ambient
 * declaration instead of redeclaring `Window.api` per file (which would
 * conflict at compile time). The CF screens (CfToken/DomainPicker/...)
 * compile against the 03-01 CfApi contract, the WSL screens
 * (WslEnable/BiosDeadEnd/...) compile against the 04-01 WslApi contract, and
 * the Phase-5 orchestrator screens compile against the 05-01 FlowApi
 * contract, through this one widening.
 */

/// <reference types="vite/client" />

import type { ShellApi, DevSpikeApi, AuthApi, CfApi, WslApi, FlowApi } from '../../shared/ipc-contract';

declare global {
  interface Window {
    api: ShellApi & DevSpikeApi & AuthApi & CfApi & WslApi & FlowApi;
  }
}

export {};
