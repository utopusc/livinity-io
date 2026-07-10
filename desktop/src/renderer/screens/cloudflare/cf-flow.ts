/**
 * src/renderer/screens/cloudflare/cf-flow.ts
 *
 * Pure, React-free routing helpers for the App.tsx Cloudflare wizard sub-router
 * (03-10). Extracted so the sub-router's step-transition decisions and its
 * copy mappings are unit-testable in the node vitest environment WITHOUT a
 * DOM/render harness — the repo has no jsdom/RTL infra and this plan adds no
 * new dependency. App.tsx consumes these; tests/cf-flow.test.ts pins them.
 *
 * Nothing here touches window.api, electron, or React — plain in / plain out.
 */

import type {
  CfProvisionResult,
  CfProvisionUpdate,
  CfScopeRow,
} from '../../../../shared/ipc-contract';

/**
 * The CF wizard sub-router steps: Screen 1 -> 2 -> [3 nameservers] ->
 * [4 collision] -> provisioning -> 5 ready -> terminal handoff (D-17).
 */
export type CfStep =
  | 'cf-token'
  | 'cf-domain'
  | 'cf-nameservers'
  | 'cf-collision'
  | 'cf-provisioning'
  | 'cf-ready'
  | 'cf-handoff';

/** The display summary carried by a successful provision (mirrors CfReady's prop). */
export interface CfReadySummary {
  address: string;
  tunnelName: string;
  recordsLabel: string;
}

/**
 * What the sub-router should do next once a cfProvision() call resolves.
 * A WRITE-level 403 ('scope-missing') NEVER becomes a generic failure — it
 * routes back to the token screen with the precise per-scope rows so the inline
 * per-scope banner can name exactly which permission is missing (D-04).
 */
export type ProvisionOutcome =
  | { step: 'cf-ready'; summary: CfReadySummary }
  | { step: 'cf-collision' }
  | { step: 'cf-token'; rows: CfScopeRow[]; writeStep: 'tunnel' | 'ingress' | 'dns' }
  | { step: 'cf-provisioning'; error: 'error' | 'network' };

/** Maps a raw cfProvision result to the sub-router's next move. */
export function provisionResultToOutcome(r: CfProvisionResult): ProvisionOutcome {
  switch (r.kind) {
    case 'ready':
      return { step: 'cf-ready', summary: r.summary };
    case 'collision':
      return { step: 'cf-collision' };
    case 'scope-missing':
      // D-04 / UI-SPEC provisioning-403: back to the token screen, per-scope.
      return { step: 'cf-token', rows: r.rows, writeStep: r.step };
    case 'network':
      return { step: 'cf-provisioning', error: 'network' };
    case 'error':
    default:
      return { step: 'cf-provisioning', error: 'error' };
  }
}

/** UI-SPEC provisioning-progress copy (D-14 tunnel / D-15 ingress / DNS). */
export function provisionPhaseCopy(phase: CfProvisionUpdate['phase'] | null): string {
  switch (phase) {
    case 'ingress':
      return 'Connecting your address…';
    case 'dns':
      return 'Creating your address…';
    case 'tunnel':
    default:
      return 'Setting up your secure tunnel…';
  }
}

/**
 * The human phrase for a write-level 403's failing step, filling the
 * UI-SPEC provisioning-403 template "Livinity couldn't {phrase} — …".
 */
export function provisionStepPhrase(writeStep: 'tunnel' | 'ingress' | 'dns'): string {
  switch (writeStep) {
    case 'ingress':
      return 'connect your address';
    case 'dns':
      return 'update your DNS';
    case 'tunnel':
    default:
      return 'create the tunnel';
  }
}

/** The `{sub}.{zone}` apex host the Collision screen shows (empty-safe). */
export function apexHostFrom(subLabel: string, zoneName: string): string {
  if (!subLabel || !zoneName) return '';
  return `${subLabel}.${zoneName}`;
}
