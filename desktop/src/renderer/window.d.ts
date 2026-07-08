/**
 * src/renderer/window.d.ts
 *
 * The ONE place `window.api`'s type is declared for the renderer. Widens the
 * Phase-1 `ShellApi & DevSpikeApi` surface to also include `AuthApi` (Plan
 * 01/04) -- every renderer file (App.tsx, screens/, components/) imports
 * from this ambient declaration instead of redeclaring `Window.api` per file
 * (which would conflict at compile time).
 */

/// <reference types="vite/client" />

import type { ShellApi, DevSpikeApi, AuthApi } from '../../shared/ipc-contract';

declare global {
  interface Window {
    api: ShellApi & DevSpikeApi & AuthApi;
  }
}

export {};
