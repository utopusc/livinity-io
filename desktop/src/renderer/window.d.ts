/**
 * src/renderer/window.d.ts
 *
 * The ONE place `window.api`'s type is declared for the renderer. Widens the
 * Phase-1 `ShellApi & DevSpikeApi` surface to also include `AuthApi` (Plan
 * 01/04) and `CfApi` (Phase 3 Cloudflare wizard) -- every renderer file
 * (App.tsx, screens/, components/) imports from this ambient declaration
 * instead of redeclaring `Window.api` per file (which would conflict at
 * compile time). The CF screens (CfToken/DomainPicker/...) compile against
 * the 03-01 CfApi contract through this widening.
 */

/// <reference types="vite/client" />

import type { ShellApi, DevSpikeApi, AuthApi, CfApi } from '../../shared/ipc-contract';

declare global {
  interface Window {
    api: ShellApi & DevSpikeApi & AuthApi & CfApi;
  }
}

export {};
