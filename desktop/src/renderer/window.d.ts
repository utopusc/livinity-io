/**
 * src/renderer/window.d.ts
 *
 * The ONE place `window.api`'s type is declared for the renderer. Widens the
 * Phase-1 `ShellApi & DevSpikeApi` surface to also include `AuthApi` (Plan
 * 01/04), `CfApi` (Phase 3 Cloudflare wizard), and `WslApi` (Phase 4 WSL2
 * provisioning) -- every renderer file (App.tsx, screens/, components/)
 * imports from this ambient declaration instead of redeclaring `Window.api`
 * per file (which would conflict at compile time). The CF screens
 * (CfToken/DomainPicker/...) compile against the 03-01 CfApi contract, and
 * the WSL screens (WslEnable/BiosDeadEnd/...) compile against the 04-01
 * WslApi contract, through this one widening.
 */

/// <reference types="vite/client" />

import type { ShellApi, DevSpikeApi, AuthApi, CfApi, WslApi } from '../../shared/ipc-contract';

declare global {
  interface Window {
    api: ShellApi & DevSpikeApi & AuthApi & CfApi & WslApi;
  }
}

export {};
